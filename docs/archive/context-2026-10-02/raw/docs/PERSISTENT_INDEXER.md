# Постоянное накопление BUY history

[Pons: допуск политики и чтение сохранённого индекса](PONS_INDEXED_COORDINATOR.md) — локальная связка проверена; полный indexed draw cycle следующий.

01.10: добавлен cache фиксированных eth_call для исторических Pons bindings.
[Pons restart/reorg/fork proof и границы](PONS_PERSISTENT_INDEXER.md).

29.09.2026. `scripts/persistent-buy-indexer.cjs` — отдельный read-only процесс.
Подключается к scheduler явно через config.indexer; сам не отправляет транзакции. Это слой накопления,
не готовый production indexer или новый источник полномочий на freeze.

## Исполнение

```powershell
$env:RH_RPC_URL=(Get-Content -LiteralPath .local/rpc-url.txt -Raw).Trim()
node scripts/persistent-buy-indexer.cjs CONFIG.json .local/indexer.json once
node scripts/persistent-buy-indexer.cjs CONFIG.json .local/indexer.json watch
```

CONFIG содержит manifest, buyPolicy и при необходимости lifecycle существующего
BUY policy runtime. Реальный deployment ещё отсутствует: запуск проекта на mainnet
по выдуманному manifest не выполнялся. Явный buyPolicyMode=unadmitted остаётся только
исследовательским режимом и маркируется в результате; не превращается в admission.

Один проход обрабатывает до100 новых блоков до finalized; watch при catchingUp сразу
переходит к следующей порции, при caughtUp/ошибке ждёт10s. Это не обещание успевать
за любой нагрузкой: фактическую скорость ещё предстоит измерять.
Программный API допускает batchSize1..1000 и reorgLimit0..10000 (по умолчанию128).
Сеть, anchor и policy проверяются заново. Старые full blocks, receipts и code reads
берутся из сохранённого cache только после проверки каноничности хвоста. Для новой
ветки cache после общего предка отбрасывается. Существующие scanWithRpc и replay
всё ещё выполняют проверку доказательств и единственную математику начисления.

Снимок содержит исходные блоки, разрешённый manifest, решения по покупкам, minted
Short/Monthly attempts и carry, ledgerHash и policyStatus. Это начисленные попытки,
не остаток после участия в draws: расход остаётся задачей attempt-lifecycle/scheduler.
Статусы caughtUp/catchingUp/waiting показывают обработанную и целевую высоту;
waiting сохраняет последний хороший снимок. Подробная ошибка доступна вызывающему
API; CLI намеренно не печатает произвольный ответ RPC, который может содержать ключ.

Используется существующий withState: один writer, checksum, fsync+rename, config
identity. При EEXIST lock не удаляется автоматически. Повреждение state/смена config
останавливает чтение; потерю журнала нельзя маскировать нулевыми билетами.
RPC outage не публикует частичный ledger. Anchor mismatch, уменьшившийся finalized
или reorg глубже лимита требуют проверки, не автоматического сброса.

## Границы

- Кеш сокращает сетевое чтение истории, но CPU replay и запись одного JSON пока
  линейны по накопленной истории; не заявляем масштабируемую базу данных.
- Подтверждение worker не контрактная финальность. Reorg здесь пересчитывает только
  read-only снимок; существующие frozen datasets/claims не редактируются.
- [API покупок/билетов](USER_STATUS_API.md) добавлен локально; [supervisor/runbook](INDEXER_SERVICE.md) добавлен; установка на сервер ещё впереди. Без config.indexer scheduler сохраняет
  прежнее независимое чтение; для реального подключения нужны точные deployment pins.
- Тесты cache используют сохранённую legacy BUY ветку и mock RPC/code; соседние
  Infinity decoder tests проверяют нынешнюю математику. Admitted Infinity end-to-end
  и restart отдельного OS процесса с реальным deployment пока не доказаны.

## Проверки

`node --test test/persistent-buy-indexer.test.cjs test/infinity-buy.test.cjs`:
8/8 passed,29.09. Проверены повтор без receipts/дубликатов, bounded catch-up,
RPC outage/resume, checksum/config refusal, branch rollback с удалением BUY и carry,
слишком глубокий reorg. Это адресные проверки, не full/fork/live proof.

## Alchemy

Robinhood4663 подтверждён. Первый probe:62requests/1HTTP403; повтор65requests/0ошибок,
три блока повторились, historical code/call/storage доступны до864000blocks глубины.
Точный ранее отказавший eth_call затем прошёл3/3. Причина403 не установлена.
[Отчёты](../research/operational-profile/alchemy-history-repeat.json) содержат только
origin без API key. Это sampled availability, не SLA и не реальный BUY replay.

## Подключение к scheduler (29.09)

В scheduler CONFIG добавить `indexer: {statePath: ABSOLUTE_PATH, maxAgeSeconds: 120}`.
120 — пример операционного лимита, не принятое значение для production. Допускается1..3600.
Индексер запускается с тем же полным CONFIG: checksum/config identity должны совпасть.
Требуются admitted BUY policy и FINALIZED_CHECKPOINT. Добавление настройки меняет
runtime identity; нельзя редактировать уже работающий journal вместо проверенного handoff.
Public execution/handoff всё ещё закрыты. Существующий legacy путь без indexer не удалён.

Consumer читает атомарно опубликованный снимок, проверяет checksum/config, admitted
status, возраст, покрытие cutoff, соответствие manifest history на cutoff и текущий
block hash. CatchingUp допустим только когда нужный cutoff уже покрыт; waiting не допустим.
Далее существующие replayAttempts/buildFromHistory считают открытые Short/Monthly
попытки с учётом terminal draws. Cached minted ledger не используется как баланс.

Недоступность/устаревание/отставание/неверная policy → отдельный INDEXER_WAIT без
подстановки нулей и без fallback на неподтверждённые данные. Уже frozen путь не требует
cache: продолжается существующее исполнение. Независимая публичная проверка по RPC
остаётся доступной и не заменяется checksum нашего локального файла.

Проверки интеграции: оба draw созданы через admitted cache, при удалённом cache оба
frozen завершаются; после следующего интервала lifecycle возвращает empty, старые
attempts не участвуют повторно. Отдельно consumer отказывает unadmitted/waiting/stale/
behind/policy/branch mismatch; прежний scheduler без cache проверен соседним сценарием.
Fixtures local31337/mock, не live/fork. CPU/диск по-прежнему растут линейно; интеграция
не превращает JSON в production database.

Команды29.09: `node --test --test-name-pattern="persistent indexer feeds|catch-up delay" test/cutoff-scheduler.test.cjs test/persistent-buy-indexer.test.cjs` (2passed,33.9s);
`node --test test/persistent-buy-indexer.test.cjs` (6passed,1.9s);
`node --test --test-name-pattern="finalized checkpoint scheduler waits without proposals" test/cutoff-scheduler.test.cjs` (1passed,30.9s).
Итого8 различных сценариев (delay повторён). Для контрактных fixtures использован
существующий compiled artifact с RH_TEST_ARTIFACT/SHA256; Solidity не менялась.

29.09: index.observedAt фиксирует время последнего успешного снимка. Обновление waiting
не делает старые данные свежими для API.

29.09: [Reward accounting](USER_STATUS_API.md) продолжает проверенный checkpoint.
При reorg полный пересчёт; режим audit принудительно проверяет весь storage на высоте
обработанной порции. Остальной BUY/JSON replay не стал инкрементальным по CPU.


## Измерения прохода (29.09)

Успешный status.metrics сохраняет lagBlocks (target−processed), historyBlocks,
scanMs, replayMs, rewardMs (включая финальную branch проверку), beforeSaveMs.
Возвращаемый/печатаемый CLI status дополнительно содержит saveMs, totalMs и stateBytes
после записи. Эти последние поля не сохраняются вторым write только ради измерения.
Длительности локальные wall-clock, total включает чтение state/lock; lag — относительно
прочитанного finalized target, не текущего chain tip. Waiting сохраняет прежний index,
но не выдаёт старые успешные metrics за новый проход. Метрики не меняют admission,
freshness, RPC retry или призовые правила. Полный JSON/replay остаётся линейным.

Постоянный запуск indexer/API: [service/runbook](INDEXER_SERVICE.md). Успешный return indexOnce дополнительно отдаёт observedAt/policyMode/processedTimestamp для health; записанный snapshot и правила admission не менялись.
