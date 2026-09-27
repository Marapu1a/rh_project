# Infinity worker: bounded pass, journal и watch

27.09.2026. [Worker](../scripts/infinity-worker.cjs) и
[CLI](../scripts/run-infinity-worker.cjs) для InfinityCollector. Контракты и V2 worker
не менялись. Используются существующие withState (exclusive lock/checksum/fsync),
sendLocalTransaction/withTransactionBoundary и runWatch.

## Один проход

1. Проверяет chain31337, единый provider контрактов/signer, identity job+executor.
2. Проверяет deployment anchor; при pending сначала reconciles исходную транзакцию.
   Без hash не повторяет send. С hash сверяет receipt, canonical block, tx hash,
   sender/nonce/target/calldata; затем фиксирует resolved status и очищает pending.
3. На одном head проверяет runtime collector, TOKEN/USDG/Promo/source bindings,
   закреплённый sourceFingerprint, campaign id и recipients/bps. Legacy recipients
   требуют witness исторической campaign/slot, максимум8. История не сканируется целиком.
4. Проверяет solvency и делает static pull. Если есть claimable или прямые USDG,
   выполняет настоящий pull; пустой no-op не отправляет.
5. Выплачивает положительные credits всем уникальным текущим/legacy recipients.
   Pay в PromoVault уже атомарно делает GENERAL sync внутри collector.

Static pull исполняет тот же contract source check, включая обе policy/counters.
Source drift, definite pull rejection или временная source read error дают degraded
pass: нового учёта нет, старые credits всё ещё выплачиваются. Ошибка одного pay с
доказанным revert не мешает остальным только после повторной проверки solvency.
Дефицит, возникший между precheck и estimate последнего pay, возвращает error,
а не payRejected/degraded. Deficit блокирует весь проход. Unknown send
всегда останавливает последующие действия. Callback/onStep error не считается
безопасным основанием повторно отправить транзакцию.

Worker не делает rollover и не изменяет bps/recipients. После owner rollover нужен
новый job с актуальной campaign и witnesses старых unpaid recipients. Изменение job
при существующем state identity отвергается: сначала завершить pending на старой
конфигурации, затем явно создать новый state для нового job. Не удалять pending state
ради обхода блокировки. Автоматическая миграция job/history в этом пакете не добавлена.

Лимит восьми legacy witnesses не ограничивает сохранность on-chain credits, но
не гарантирует автоматическую выплату всем историческим получателям. Прямой pay
остаётся доступен. До релиза нужны ограниченный обход долгов с durable cursor
и безопасное обновление job после rollover либо явно проверяемое ограничение
набора получателей. Ни один из вариантов пока не реализован; watch не является
непрерывной production автоматизацией через произвольное число campaigns.

## Gas и надёжность

Перед estimate — gas price cap, модельный gasUnits[action], nativeFloor, pending nonce;
после estimate до intent — проверка фактической оценки и того же nativeFloor. Нехватка
ETH → waiting/nativeFunding, перегрев → waiting/gasPrice. Призовые USDG не используются
на gas; auto-refill/обмен в ETH здесь отсутствуют. Пополнение ETH позволяет следующему
проходу продолжиться. Это локальный reserve floor, не расчёт gas obligations всех draws.

До broadcast сохраняется intent, после ответа — hash/nonce, после canonical receipt —
resolved. Потерянный hash требует отдельной reconciliation, не слепого retry. Known
hash timeout возвращает pendingReceipt: watch опрашивает его, не отправляя замену.
Retryable confirmation reads проходят тот же journal на следующем проходе. Semantic,
storage, lock и непроверенные receipt errors не превращаются в бесконечные resend.

Требуются один writer и exclusive signer, локальный non-synced runtime volume.
Не использовать этот signer параллельно в другом coordinator. Stale EEXIST lock не
удаляется автоматически. Выключение worker не отменяет уже отправленную транзакцию.

## Job и CLI

Schema `local-infinity-worker-v1`: chainId31337, collector/token/quote/promo/source,
collectorCodeHash, sourceFingerprint, anchor{number,hash}, campaignId, recipients[3],
bps[3], legacy[{recipient,campaignId,slot}], maxGasPrice, nativeFloor,
gasUnits{pull,pay}, pollSeconds60..86400. Monetary/gas integer values можно задавать
десятичными строками. Адреса/hex нормализуются в identity; job не меняется во время watch.

```powershell
node scripts/run-infinity-worker.cjs --job PATH_TO_JOB.json --state .local/runtime/infinity.json --rpc http://127.0.0.1:8545 --executor 1 --watch
```

Без watch выполняется один bounded pass (не более1pull +11уникальных pay). CLI требует
loopback HTTP и локальные unlocked accounts, сетевые запросы ограничены timeout20s.
Обработка SIGINT/SIGTERM прекращает новые действия, не отменяя broadcast.
Это реальный исполняющий local/fork worker, **не включённый mainnet daemon**.
Mainnet manifest admission/keys/finality, shared execution budget и coordinator wiring
остаются отдельным deployment пакетом; chain4663 сознательно отвергается.

Пример job сохранён как `worker.job` в fork evidence, но его адреса относятся к
завершившемуся in-process fork и не являются готовым deployment config для другого узла.

## Проверки 27.09

Первый запуск выявил syntax error в новом тестовом файле;17соседних transaction/watch
тестов прошли. После исправления worker7/7 (`test-run-bKTkh4`,38.32s с compile),
добавленные source timeout/failed pay и CLI2/2 (`test-run-oLh6v5`,21.78s).
После усиления reconciliation повторно проверены known hash и deployment mismatch;
2/2 (`test-run-y0kpVs`,23.18s с compile). Saved evidence1/1.
Full suite не запускался; результат адресный, не единый общий baseline.

Проверены GENERAL/idempotent rerun, drift/pay isolation, native wait/top-up, gas cap,
unknown hash no-resend (tx уже mined), known hash receipt recovery, runtime/config
mismatch, deficit, historical recipients, transient source read, один failed pay,
CLI отказ public RPC/duplicate arguments. Worker использует прежний lock/journal;
не добавляет собственную эвристику stale PID или обход неизвестных транзакций.

```powershell
node -e "require('./scripts/test-launcher.cjs').runTests({profile:'infinity-worker',selection:{compile:true,files:['test/infinity-worker.test.cjs']}}).then(r=>process.exitCode=r.exitCode)"
node scripts/infinity-launch-fork.cjs NEW_OUTPUT.json --worker
node --test test/infinity-worker-evidence.test.cjs
```

[Новый fork evidence](../research/infinity-source-audit/worker-fork-2026-09-27.json):
новый TOKEN/USDG с3%, полный collector proof, затем дополнительный BUY. Worker сам
pull/pay переводит3USDG в GENERAL. Reserves после него:
Short4.467135 /Current2.978090 /Next1.489045USDG (сумма8.934270).
Повторный проход0tx, nonce не изменился, journal resolved и без pending.
Fork381upstream requests/6retries/0errors. 100% Promo — fixture, не production policy;
прочие price/slippage/artificial funding/draw limitations исходного proof сохраняются.

Следующий продуктовый пакет — Infinity BUY decoder и новый genesis без registration,
после отдельного решения о базе100USDG/entry. Worker не создаёт билеты и не доказывает
готовность RNG/draw/payout.

### Исправление после review 27.09

Повторная solvency после definite pay rejection: адресно **2/2**, включая новый
реальный burn между precheck и estimate последнего recipient и соседний сценарий
source timeout/failed recipient с успешной выплатой другому адресу.
Команда: `node -e "require('./scripts/test-launcher.cjs').runTests({profile:'infinity-worker-review',pattern:'last recipient|transient source read',selection:{compile:true,files:['test/infinity-worker.test.cjs']}}).then(r=>process.exitCode=r.exitCode)"`.
24.54s с одной компиляцией; `.local/logs/test-run-Ev7smF/result.json`.
Контракты не менялись; full suite и новый fork для этой правки не запускались.
