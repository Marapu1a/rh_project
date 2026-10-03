# Индексатор: контрольная точка replay и компактный снимок

02.10.2026. Рабочее дерево поверх `2038a57` и локального
[пакета ограниченного cache](INDEXER_HISTORY_SCALING_2026-10-02.md).
[Измерения, hashes и проверки](evidence/INDEXER_CHECKPOINTS_2026-10-02.json).
Только тестовый контур, без production deployment и новых правил допуска.

## Изменение и границы

1. `direct-buy.cjs`: полный и incremental replay используют одну логику проверки
   транзакций, событий, регистрации и начисления. `replayWithCheckpoint` переносит
   предыдущий ledger и множество canonical tx hashes. Повтор tx из старого prefix
   отвергается; carry продолжается, а не начисляется повторно.
2. `persistent-buy-indexer.cjs`: при той же manifest/replay revision и неизменном
   canonical prefix пересчитывается только suffix. Reorg, смена manifest/движка,
   отсутствующая контрольная точка и explicit audit используют
   полный replay. Старый engine при первом чтении перестраивает checkpoint из
   сохранённых доказательств, не запрашивая все receipts заново.
3. Снимок индексатора записывается компактным JSON, с контрольной суммой
   `sha256-v1:<digest>` от canonical payload. Native SHA-256 заменяет дорогое
   вычисление Keccak большого файла в JS. Старый checksum принимается при чтении.
   ConfigHash, ledgerHash и все протокольные commitments остались прежними.
4. `user-status-api.cjs` и `readSnapshot` читают оба варианта checksum.
   **API/координатор по-прежнему проверяют полную evidence-историю**; checkpoint
   индексатора не становится доказательством для выплаты или источником open attempts.

Контрольная точка — локальный производный cache, защищённый общей проверкой файла,
а не независимое криптографическое доказательство истории. Она проверяется на
совпадение manifest/head/ledger hash. В ней хранятся tx hashes для проверки дубликатов,
но сами blocks/receipts не удаляются. Повреждённая используемая checkpoint останавливает
продолжение; audit позволяет пересчитать из целой сохранённой evidence-истории.

`replayedBlocks=1` означает, что заново проверен/декодирован один блок. Это **не O(1)**
для всего прохода: копирование решений, tx hash set, проверка ledger hash и запись
полного JSON всё ещё зависят от накопленных данных. Публичная проекция и lifecycle
в benchmark не измерялись. WAL/chunk store/новая БД этим пакетом не вводятся.

## Совместимость и восстановление

`withState` включает новый формат только при явном `indexerFormat:true` и kind
`persistent-buy-indexer-v1`. По умолчанию денежные scheduler/signer journals сохраняют
прежний формат. Lock, checksum/config identity, fsync временного файла и atomic rename
остаются прежними. Ошибка публикации не заменяет прошлый хороший файл.

Все readers индексатора нужно обновлять вместе с writer: старый код не понимает
новый checksum и должен отказаться от файла. Новый код читает старый файл и мигрирует
его при записи. Для отката к старому коду нужен сохранённый старый snapshot либо
отдельная пересборка read-only индекса; не править вручную checksum. При backup по-прежнему
копируется один опубликованный STATE вместе с соответствующим config; `.tmp` не backup.
Эти правила не разрешают сбрасывать денежные журналы или frozen обязательства.

При обычном idle reuse сохранённого ledger остаётся; audit проверяет всю историю,
а не только checksum. Новые метрики: `replayMode=full|checkpoint|reused` и число
фактически replayedBlocks. Полный audit выполняется прежним CLI режимом `audit`.

## Результат на той же synthetic истории

Один BUY на10 блоков, local mock RPC, свежий OS-процесс на каждый проход.
До — предыдущий bounded-cache пакет, после — текущий код.

| Сценарий | До, ms | После, ms | Peak RSS до → после, MiB |
|---|---:|---:|---:|
| 5000 blocks, idle | 639 | 217 | 307 → 168 |
| 5001 blocks, append BUY | 889 | 272 | 370 → 170 |
| 5001 blocks, restart | 595 | 183 | 307 → 167 |

Снимок5001 blocks: 4404611 → 3271707 bytes. Append: replay5001 → replay1.
Все12 ledger hashes/wallets/RPC counters before/after совпали. Миграция старого
5001-block файла:746ms, полный replay, тот же ledger hash, новая checksum.
Это одиночные локальные замеры, не гарантированный throughput mainnet.
Peak RSS включает fixture и вспомогательные структуры процесса.

Команда: `node scripts/benchmark-indexer-history.cjs .local/logs/NEW_DIRECTORY`.
Исходный after прошлого пакета сохранён; новые raw state/report находятся в
`.local/logs/indexer-checkpoint-after`, migration — `indexer-checkpoint-migration`.

## Проверки

**112 уникальных адресных тестов PASS** в совокупности перечисленных запусков;
не полный suite и не единый release baseline. Evidence содержит названия и лог
последнего результата каждого теста. Команды:

```powershell
node --test test/pons-persistent-indexer.test.cjs test/persistent-buy-indexer.test.cjs test/pons-policy-indexer.test.cjs test/pons-batch-integration.test.cjs
node --test test/direct-buy.test.cjs test/pons-persistent-indexer.test.cjs test/user-status-cache.test.cjs test/public-status.test.cjs test/local-state-lock.test.cjs test/indexer-service.test.cjs test/attempt-lifecycle.test.cjs test/attempt-lifecycle-dual.test.cjs test/attempt-lifecycle-events.test.cjs test/pons-curve-buy.test.cjs test/pons-v4-buy.test.cjs test/infinity-buy.test.cjs
node --test test/direct-buy.test.cjs test/local-state-lock.test.cjs
node --test test/pons-batch-integration.test.cjs test/pons-v4-buy.test.cjs
node --test test/pons-persistent-indexer.test.cjs
```

Во втором запуске один новый тест ожидал ошибку checkpoint policy после заведомо
невалидного изменения порога. Валидатор правильно отказал раньше. Тест исправлен
на изменение допустимого runtime hash; соответствующие файлы повторно прошли.
Это не скрытый PASS всего первоначального запуска: он был94/95, корректирующий37/37.

Покрытие: legacy replay на каждой границе блока, Pons curve/pool carry60+40,
admitted synthetic batch continuation, отсутствие изменения prior, duplicate tx,
неверная ветка/manifest/ledger, migration, audit, engine revision, rollback/cache miss,
ошибки записи, коррупция, locks, API/rewards/lifecycle и отказ старого reader.
Исходные golden ledger/artifact hashes сохранились. Новые тесты добавлены в существующие
test files, уже включённые в профили; новая инфраструктура тестирования не нужна.

## Дальше

В пределах этого пакета убран повторный decode старой истории и снижена стоимость
файла. A4 остаётся открытым: нужны целевой объём/бюджет, admitted lifecycle/API замер,
затем решение о сегментированном хранении. Не заявляем поддержку неограниченной
истории; не увеличиваем freshness timeout, чтобы скрыть рост времени обработки.

После замера добавлен guard отсутствующей checkpoint на idle: полный rebuild вместо
повторного использования неполного состояния. Pons persistent tests повторно PASS;
в evidence отдельно сохранены hashes замеренного и окончательного кода.
