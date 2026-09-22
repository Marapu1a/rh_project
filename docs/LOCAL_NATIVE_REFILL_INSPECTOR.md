# Read-only native refill inspector

22.09.2026. Диагностика локального coordinator journal без его изменения.
[Модель funding](LOCAL_NATIVE_REFILL.md), [проверенные отказы](LOCAL_NATIVE_REFILL_RECOVERY.md).

## Запуск

```powershell
node scripts/inspect-local-native-refill.cjs --state D:/runtime/coordinator.json --expected D:/runtime/approved-refill.json --rpc http://127.0.0.1:8545
```

Expected JSON содержит:

```js
{
  configHash: "<trusted coordinator config hash>",
  refill: { ops, source, policy, protectedAddresses }
}
```

Это структура, не готовый файл с параметрами. ops/source/policy — те же структуры, что у
planner. protectedAddresses должен включать полный нормализованный набор coordinator:
prize vault, FeeRouter, active converter и явно добавленные адреса. Domain вычисляется
refillDomainHash, а не берётся на веру из проверяемого journal. configHash — hash канонической
одобренной coordinator configuration, НЕ checksum state-файла. Значения должны приходить
из независимо проверенной конфигурации развёртывания; копирование hash из подозрительного
state не является проверкой. Manifest exporter описан ниже.

Функция для программного вызова:
`inspectNativeRefill({statePath, expected, provider})` в local-native-refill-inspector.cjs.
CLI принимает только loopback HTTP RPC. Network проверяется при запросах pending-транзакции;
при отсутствии pending отчёт не является проверкой доступности сети или готовности draw.
RPC request timeout 5 s, общий CLI deadline 15 s. Выход — один JSON report.

## Гарантии и границы

- Нет withState/save, создания или удаления lock, signer, broadcast, reset pending.
- Читаются checksum/schema/config identity, funding domain/history и pending binding.
- Lock выводится как metadata. Существующий lock не объявляется устаревшим по PID/mtime.
- Source latest/pending nonce — только evidence (`isRetryProof=false`).
- Для hashless всегда требуется независимый поиск исходной транзакции; `safeToRetry` не выдаётся.
- Проверки transaction identity/fee envelope и projected receipt accounting переиспользуют
  существующие чистые recordNativeRefillHash/finalizeNativeRefill на копиях. Ничего не сохраняется.
- `projectedAccounting.persisted=false`: это будущий результат штатной finalization, не уже
  выполненная запись. Success и revert учитывают ту же математику, что executor.
- В конце повторно читаются state bytes и lock metadata. Изменение даёт snapshotChanged,
  projectedAccounting удаляется. Это best-effort обнаружение конкурентной записи, не lock/lease:
  изменение с восстановлением прежнего содержимого между чтениями может остаться незамеченным.
- Отчёт не заменяет revalidation в executor, не снимает runtime остановки, не доказывает
  production finality и не защищает от оператора, подменяющего state и доверенный expected файл.

## Как читать результат

| status | Значение и следующий шаг |
|---|---|
| noPending | Нет refill pending; это не общая готовность coordinator/draw |
| pendingReceipt | Исходный receipt не найден; ждать и повторить проверку, не отправку |
| recoverableReceipt | Evidence проходит проверку; штатный coordinator может учесть исходный receipt после установления exclusive ownership |
| manualTransactionSearchRequired | Hash неизвестен; нужен поиск по независимым данным, nonce не разрешает retry |
| policyMismatch | Fee policy нарушена или сохранён halt; требуется разбор signer, без автоматического сброса |
| evidenceConflict | RPC и intent/receipt/block не согласуются; выяснить причину до исполнения |
| invalidState | Ошибка expected config/checksum/domain/history; не обнулять историю |
| rpcUnavailable | Восстановить RPC и повторить диагностику |
| snapshotChanged | State/lock менялись во время чтения; предыдущий вывод не использовать |
| unsupportedPending | Pending принадлежит другому worker; нужен его recovery путь |

Каждый отчёт содержит `nextAction`, при lock также `lockAction` и `ownershipUnresolved`.
Даже recoverableReceipt при существующем lock НЕ разрешает его удаление или запуск второго писателя.
Exit 0: noPending/recoverableReceipt без обнаруженного lock; это не разрешение новой отправки.
Exit 2: pendingReceipt без lock. Exit 1: conflict/unknown/lock/halt, неправильный input или timeout.

## Проверки

Включены success/revert projected expense, hashless и равные nonce, receipt outage, stale-looking
lock, fee-policy mismatch, conflicting RPC evidence, invalid config/history/checksum, конкурентное
изменение state/lock и реальный CLI JSON/exit с разрешёнными только read RPC методами.
Inspector дополнительно запущен на пяти реальных Hardhat process-death checkpoints.
Файлы остаются побайтно прежними; количество send не увеличивается. Full npm test/fork не запускались.

```powershell
node --test --test-concurrency=1 test/local-native-refill-inspector.test.cjs test/local-native-refill-process.test.cjs test/local-native-refill-state.test.cjs test/local-state-lock.test.cjs
```

Тесты добавлены в npm test и test:local:refill. Актуальный прогон: `npm run test:local:refill` — 67/67 (22.09, 15.8 s).
Лог — `.local/logs/manifest-refill-final.log`.


## Deployment manifest (22.09.2026)

`scripts/local-coordinator-identity.cjs` — общий pure builder runtime identity и
manifest. Вход exporter — отдельный проверенный JSON с schema
`local-coordinator-deployment-v1`, полями `prizeJob`, `schedulerConfig`, абсолютным
`schedulerState`, `roles: {prizeExecutor, executor, publisher}`, `ops`,
`nativeRefill: {source, policy, protectedAddresses?}`. Это те же job/config/roles,
которые используются coordinator. Signer и private key не включать; publisher при
отсутствии задаётся null. Регистр role addresses сохраняется как в runtime.
Scheduler state path является частью identity; файл по нему не читается.

```powershell
node scripts/inspection-manifest.cjs export --deployment deployment.json --out inspection.json
node scripts/inspection-manifest.cjs verify --deployment deployment.json --manifest inspection.json
node scripts/inspect-local-native-refill.cjs --state coordinator.json --expected inspection.json --deployment deployment.json --rpc http://127.0.0.1:8545
```

Export записывает только новый output через exclusive create; существующий файл не
перезаписывает. Verify не пишет файлы и не обращается к RPC. Manifest содержит
configHash, полную coordinatorConfig, refill с обязательными protected addresses
(vault/router/active converter), deploymentHash, commit/dirty/time и checksum.
Verifier пересобирает всё из отдельного deployment input и сравнивает полный payload.
Checksum и commit фиксируют целостность/происхождение, но не доказывают одобрение:
подмена одновременно deployment и manifest не обнаруживается без внешнего trusted source.
Это экспорт переданной конфигурации, а не аттестация реально развёрнутого кода.
Legacy expected JSON поддерживается; manifest в CLI требует --deployment.

Nonce latest/pending — дополнительное best-effort evidence: его RPC failure не
скрывает доступный known receipt. Hashless intent по-прежнему требует поиска исходной
транзакции; совпадение nonce не разрешает повторную отправку. Сеть проверяется обязательно.

Тестовые native-refill suites сами создают `.local` в свежем checkout.


Дополнительно 22.09: coordinator + native-refill suites — 70/70; финальный
`node --test --test-name-pattern="inspection manifest" test/local-coordinator.test.cjs`
— 1/1. Проверены совпадение с реальным runtime state, прежние legacy/budget hashes,
подмены с пересчитанным checksum, CLI export/verify/no-overwrite и inspector CLI.
Логи: `.local/logs/manifest-tests.log`, `.local/logs/manifest-final-integration.log`.
Наборы пересекаются; не складывать их как число уникальных тестов.

В отдельном новом temp cwd без `.local`: 16/16 state/executor tests, с
`HARDHAT_CONFIG=D:\sites\rh_project\hardhat.config.cjs` и абсолютными путями тестов.
Без явного config запуск из постороннего cwd дал HH9; после указания config прошёл.
Это проверка создания каталога при существующих зависимостях, не свежая установка npm.
Лог `.local/logs/refill-clean-cwd.log`. Full npm test и fork не запускались.
