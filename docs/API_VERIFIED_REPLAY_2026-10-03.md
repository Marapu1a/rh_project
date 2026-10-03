# API: независимая проверка добавленной истории, 03.10.2026

Локальный пакет поверх `da558c8`. Формат файлов, writer, readSnapshot координатора,
контракты и правила начисления не менялись. Ускорен живущий API reader/его worker.

## Граница доверия

`scripts/verified-buy-replay.cjs` хранит только собственный результат полного BUY
replay и checkpoint в памяти. Сохранённые writer ledger/checkpoint не импортируются.
Для каждого блока сохраняется SHA-256 от всего JSON evidence, включая tx/receipt/logs
и дополнительные доказательства маршрута. При обновлении снимка сравнивается весь
прежний prefix, а не только hashes заголовков. Порядок JSON-полей влияет лишь на
попадание в cache: при отличии выполняется полный replay.

При том же manifest и неизменном prefix проверяется новый suffix существующим
replayWithCheckpoint: provenance, последовательность, повтор tx и carry проверяются.
Rollback, изменение старого evidence, policy или непоследовательная доставка требуют
полного replay. Ошибка BUY очищает checkpoint. Возвращаемый ledger клонируется:
его изменение вызывающим кодом не меняет частный проверенный результат.

`createReplayAttempts` использует этот verifier; lifecycle по-прежнему пересчитывается
полностью из событий, включая freeze/consume/epochs. Обычный `replayAttempts` сохранён
без cache. API после расчёта по-прежнему сверяет ledger hash/head, checksum/config,
admitted policy, reward projection и состояние файла. При любой ошибке API очищает
и представление, и проверенный BUY prefix. Перезапуск начинает с полного replay.
Worker timeout/freshness, перегрузка, 503 и защита от смены файла сохранены.

Это **не O(1)**: чтение/JSON/checksum, сравнение prefix, ledger hash, копии, lifecycle
и reward/public projection остаются линейными. Нового долговременного доверенного
checkpoint или разрешения на выплаты нет. Координатор/readSnapshot всё ещё выполняет
прежнюю независимую полную проверку; формат хранения — отдельный пакет.

## Проверки

36 уникальных адресных тестов PASS в совокупности двух запусков; не полный RC baseline.

```powershell
node --test test/verified-buy-replay.test.cjs test/user-status-cache.test.cjs test/attempt-lifecycle.test.cjs test/attempt-lifecycle-dual.test.cjs test/attempt-lifecycle-events.test.cjs test/public-status.test.cjs
node --test test/verified-buy-replay.test.cjs test/user-status-cache.test.cjs
```

Первый запуск34/34, затем добавлены две регрессии и затронутые файлы14/14.
Логи: `.local/logs/api-verified-replay-tests-20261003.log`, `api-proof-regressions-20261003.log`.
Новый файл включён в full/replay/shared-index profiles.
Проверены carry/idle/append, изменение возвращённого ledger, rollback, policy,
подмена старого receipt с тем же block hash, плохой suffix, дубли доставки,
freeze/consume обоих видов, неверные lifecycle-события, checksum/config/ledger/rewards,
HTTP burst/outage, worker timeout и замена файла при ответе.

## Сравнение

Новый `scripts/benchmark-api-refresh.cjs` измеряет именно обновление одного живого
reader, а не только запуск нового процесса. До/после один workload: synthetic admitted
Pons curve, BUY в каждом блоке, 100 кошельков, cold → опубликованный idle → append BUY.
Каждая фаза сверяет все балансы и carry. Runtime/policy/RPC синтетические; нет HTTP,
нагруженного lifecycle с draws и public reserves. Контрольные функциональные tests
lifecycle не превращают нагрузочный fixture в нагрузку на розыгрыши.

```powershell
node scripts/benchmark-api-refresh.cjs .local/logs/NEW_DIRECTORY
```

Сырые снимки и отчёты: `.local/logs/api-refresh-before-20261003` и
`.local/logs/api-refresh-after-20261003`. [Сводное evidence](evidence/API_VERIFIED_REPLAY_2026-10-03.json).
Первый after1000 замер частично пересекался с короткими адресными тестами; большие
сценарии выполнялись без них. Это одиночные локальные измерения, не SLA.

| Покупок | Cold до → после, ms | Idle refresh до → после, ms | Append refresh до → после, ms |
|---:|---:|---:|---:|
| 1000 | 593 → 740 | 600 → 115 | 610 → 199 |
| 5000 | 2877 → 3069 | 3309 → 488 | 2933 → 938 |
| 10000 | 5538 → 6287 | 5537 → 988 | 5612 → 1885 |

В after idle `replayedBlocks=0`, append `replayedBlocks=1`; результаты балансов
совпали с независимым расчётом. Все18 фаз benchmark завершились (9 before +9 after).
На10000 скорость обновления после BUY выросла примерно в3 раза. Холодный старт
подорожал примерно на14%: построение частного checkpoint и копирование результата.
Peak RSS процесса до → после:1000 —330→310MiB,5000 —906→1010MiB,
10000 —1473→1500MiB. RSS включает генерацию двух mock-цепочек, writer и consumer;
его нельзя считать памятью изолированного API. Существенного снижения памяти нет.

Ориентир менее1s для append-refresh на10000 пока не достигнут. Следующий пакет —
снижение стоимости чтения/хеширования/хранения и проверка общего consumer-пути,
затем смешанный workload с draws и полный backup/restore. Не расширять доверие
к writer ради ускорения и не увеличивать таймауты. A4 остаётся открытым.
