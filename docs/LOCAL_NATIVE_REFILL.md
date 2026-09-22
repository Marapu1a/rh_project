# Local native refill planner

21.09.2026. Чистая функция `planNativeRefill(input)` в scripts/local-native-refill.cjs.
Нет RPC, подписания, переводов, резервирования средств и изменения funding history.
Planner остаётся чистым. Local executor описан ниже; автоматический сбор obligations подключён к coordinator.

## API

```js
planNativeRefill({
  ops, source, policy, protectedAddresses,
  anchor, head, gasPrice, balances, committedObligations, candidateObligations, gasObservations,
  history
})
// status: ready | waitExpensiveGas | needsRefill | blocked
```

- ops — существующий local-execution-budget-v1. Только chainId31337.
- source — `{kind, address, minimumBalance, transferGas}`. kind: BOOTSTRAP_NATIVE или
  PROJECT_NATIVE, уже имеющий native отдельный ops account. Он не может быть payer/RNG
  account из obligations, целевым адресом или адресом prize custody. TOKEN/USDG не принимаются.
- protectedAddresses — непустой список prize custody из доверенного deployment manifest.
  Проверяется конфигурация; planner сам не доказывает происхождение средств/тип контракта.
- policy — `{targets, maxPerRefill, maxPerPeriod, periodSeconds, cooldownSeconds}`.
  targets: `{address, lowWatermark, target}`. Все native/time/count величины — целые
  десятичные строки. Targets уникальны по фактическому адресу, порядок незначим.
- balances — native balances по адресам. obligations — формат evaluateBudget: id,
  publisher/executor, counts, отдельные RNG fee/floor. Роли одного payer суммируются.
- gasObservations повышают исходные gasUnits, но не снижают base. Монотонность между
  вызовами обязан обеспечивать persisted coordinator state; чистая функция не помнит историю.
- anchor/head: `{number, hash, timestamp}` одного подтверждённого caller snapshot.
  Различие даёт staleAnchor. Проверку RPC/финальности делает будущий adapter, не planner.
- history: `{domainHash, pending, windowStart, spent, lastAttemptAt}` обязательна даже
  при первом использовании: spent='0', lastAttemptAt=null, windowStart=floor(timestamp/period)*period.
  domainHash строит refillDomainHash из network/source/policy/protectedAddresses.

Изменение static policy/source/network не сбрасывает историю: несовпадение hash блокирует
план. Mutable ops settings имеют отдельный settingsHash. Pending funding запрещает новый
план перевода. windowStart должен быть границей периода, не из будущего; cooldown действует
и через смену периода. Все supplied данные — доверенный input model, не доказательство ledger.

## Решение

1. Evaluate committed obligations and combined committed + candidate obligations separately.
   Both arrays are required; legacy flat obligations is rejected. Duplicate IDs are rejected.
   Shared payers have one buffer in the combined forecast.
2. Strict tiers: committed (frozen) → candidate (unfrozen) → optional buffer.
3. Cover only the selected tier deficit, never fill its target ahead of another tier.
   Ties within a tier use normalized address order. Recalculate after every receipt.
4. Только один transfer за план; после его receipt всё рассчитывается заново.
5. gasReserve = existing transactionCost(network, transferGas): reserve gas price,
   extraFeePerTx и safetyBps. Из источника нельзя потратить minimumBalance.
6. maxPerRefill и maxPerPeriod ограничивают СУММУ value + gasReserve, не только перевод.
   Ledger учитывает фактические value + fee (при revert только fee); pending intent
   резервирует максимальную сумму и блокирует следующий расход до reconciliation.
7. Если caps/source не покрывают даже gas, transfer отсутствует. Иначе разрешена частичная
   сумма; fundingReadyAfter=false, пока хотя бы одно required не покрыто.

Результат содержит accounts/current/required/shortfall/target, fundingReady, window,
remainingPeriod, domain/settings hashes. Для needsRefill добавляются transfer
`{from,to,value,gasReserve,maxSourceDebit}`, fundingReadyAfter и decisionKey.
DecisionKey — fingerprint решения, не durable idempotency guard и не nonce.

`ready` означает отсутствие необходимости пополнять по этой политике. fundingReady —
только покрытие native liabilities. Дорогой gas при необходимом refill даёт waitExpensiveGas;
при отсутствии нужды в refill planner не решает, можно ли отправлять draw transaction.
blocked из-за optional buffer/caps не означает автоматическую остановку уже обеспеченного
фrozen draw. Исполнитель должен отдельно вызвать актуальные readiness/budget проверки.

## Границы модели

- Здесь source имеет выделенный адрес, native и заранее разрешённую authority. Реальная
  связь PROJECT_NATIVE с долей проекта и конверсия TOKEN/USDG ещё не реализованы.
- Нет нового процента комиссий, withdrawal призовой казны, proxy или governance.
- Executor выполняет anchor/balance/estimate checks и проверку source signer;
  durable history/nonce/hash/receipt описаны ниже. Автосбор obligations включён в coordinator.
  TransferGas — вход модели; это не гарантия, что произвольный contract receive уложится.
- Не добавлен общий MAX_N или новый unsupportedEnvelope gate. Расчёт потребляет переданные
  bounds; он не доказывает их достаточность или физическую возможность выполнения.
- state/lock будущего worker — на постоянном локальном runtime volume, без фоновой
  синхронизации checkout и второго писателя. /tmp годится для тестов, не durable pending.
- Snapshot commit/tool versions/full generator hashes для calibration evidence остаётся
  отдельным незакрытым улучшением provenance; старые measurements не переобъявлены baseline.

## Проверки

Тестируются priority/target, общий payer и отдельный RNG, source floor и gas, partial refill,
period/cooldown, stale/pending/domain mismatch, custody exclusions, deterministic decision,
confirmed расход и сохранение source balance. Lock suite дополнен двойными отказами:
AggregateError сохраняет cause, cleanupErrors и primary code/stage/hash/definiteRejection.
Точные результаты шага — CURRENT_CONTEXT.

## Receipt ledger update — 2026-09-21

Domain now includes native-refill-v2: old history requires explicit migration, never silent reset.
committedFundingReady / committedFundingReadyAfter distinguish frozen coverage from total
fundingReady / fundingReadyAfter. Neither proves full draw readiness.

scripts/local-native-refill-state.cjs exports pure transitions returning a cloned coordinator state:
- stageNativeRefill(state, input, nonce): plan and prepare intent; reject other pending.
- recordNativeRefillHash(state, transaction): bind chain/from/to/value/nonce/data/hash.
- finalizeNativeRefill(state, {transaction, receipt, block}): account actual expense and clear pending.

Persist the returned state in ONE atomic save under the existing coordinator lock. No second journal.
nativeRefillHistory adds lastNonce and lastSuccessAt (initially null). lastAttemptAt advances for
both success and mined revert: success consumes value + gas, revert consumes gas only and cooldown.
Receipt block timestamp determines the expense period. Actual overspend is recorded with
lastResolved.budgetExceeded, never discarded. Duplicate finalization and stale nonce reject.
Unknown sends retain pending. Changed history, mismatched tx/hash/block and old receipt reject.

Normalized evidence uses decimal strings for chainId/nonce/value/block/time/gas and numeric
receipt.status 0/1; receipt.hash is the transaction hash. An adapter must verify RPC evidence and
canonicality/finality. Helpers do not do this. Only LOCAL_EIP1559 / chainId31337 / data=0x is supported;
fee=gasUsed*gasPrice. EXTRA fee profile is rejected before staging.

Coordinator dispatches nativeRefill pending to typed receipt recovery before prize/draw work.
Unknown hash or absent receipt stops the pass. Generic recovery never clears a refill marker.
No migration resets caps or cooldown. Project-share conversion remains separate.

## Local bootstrap executor — 21.09.2026

scripts/local-native-refill-executor.cjs:

```js
executeNativeRefill({provider, signer, state, save, input, signal})
reconcileNativeRefill({provider, state, save})
```

Caller must hold the EXISTING coordinator withState lock and supply its state/save callback.
The module does not acquire another lock or open another journal. Do not run it with an independent
state file for the same source signer. save is synchronous atomic persistence; memory advances
only after save succeeds. Exactly one transfer or one recovery per call; no retry loop.

input supplies ops/source/policy/protectedAddresses, committedObligations, candidateObligations
and optional gasObservations. The coordinator now builds obligations using the shared budget
collector. obligationsAnchor binds their block to the executor balance snapshot; a changed head
returns staleSnapshot before intent. Standalone executor callers remain responsible for correct
obligations. allowedTiers restricts which funding tier may execute in this call.

Only BOOTSTRAP_NATIVE, local chain31337, LOCAL_EIP1559. Signer must have the exact shared provider
and configured source address. Source must be dedicated/exclusively owned; other pending nonce
blocks funding. Initial history is created only when absent, and persisted together with first
intent; existing domain mismatch blocks. No policy/source migration or deletion of ledger.

The executor reads block-anchored native balances for source/targets and current fee quote,
runs planner, estimates the transfer and requires estimate <= configured transferGas <= block gas
limit. TransferGas is a configurable admission bound, not a universal 21000 constant. EIP1559
maxFeePerGas <= configured threshold <= reserveGasPrice; priority fee is zero in this local profile.
A changed latest head or pending nonce stops before intent. Abort before intent sends nothing.
After intent persistence the attempt is committed; later abort stops waiting, not the transaction.

Persistence order: prepared intent → send with explicit nonce/value/gas/fee cap → bound hash →
original receipt lookup → atomic actual expense + clear pending. Failure to save intent sends
nothing. Send error or failed hash persistence leaves prepared/unknown and cannot auto-retry.
Failed finalization leaves known hash; next recovery records expense once. Timeout does not cancel.
Replaced transactions are not accepted as original receipts. Recovery verifies receipt and intent
anchor against local canonical blocks, then uses the same pure finalizer, including status=0.
These are local canonicality checks, not production finality or reorg recovery guarantees.

## Предыдущие проверки executor

21.09.2026: 56/56 planner/ledger/executor/budget/lock/transaction tests (8.3 s),
4/4 targeted coordinator regressions (88.1 s). Final executor-only rerun: 7/7 (5.8 s).
Real Hardhat transfers, timeout/restart, mined revert, unknown send, source binding, gas/floor gates,
stale snapshot, pending nonce, abort, failed intent/hash/finalization persistence are covered.
Full npm test and fork not run. Local fixtures are not production network evidence.

```powershell
node --test --test-concurrency=1 test/local-native-refill.test.cjs test/local-native-refill-state.test.cjs test/local-native-refill-executor.test.cjs test/local-state-lock.test.cjs test/local-execution-budget.test.cjs test/local-transaction.test.cjs
node --test --test-name-pattern='CLI runs both workers|hashless broadcast failure|known recipient refusal|native refill pending' test/local-coordinator.test.cjs
```

## Fee policy binding — 21.09.2026

Prepared intent now records feeEnvelope: type=2, gasLimit, maxFeePerGas and
maxPriorityFeePerGas=0. Staging validates the fee ceiling against the current threshold.
Both returned and RPC transactions are compared exactly against these fields. A fee-policy
mismatch keeps the known hash as broadcastPolicyMismatch; the original receipt still accounts
actual expense and clears pending atomically. The same save records durable nativeRefillHalt.
Executor rejects further funding; coordinator stops automation and reports the policy violation.
There is no automatic reset or retry. Missing envelope on legacy pending is treated as a mismatch,
not silently approved; known receipts can still be accounted. Hashless intents remain unresolved.

Detection is after possible broadcast: this does NOT prevent the first overspend by a faulty
signer. Caps/floor require a signer that honours the submitted request. The alarm prevents silent
continuation and preserves evidence; it cannot recover money already spent. Signature-before-
broadcast verification would be a separate design change, not claimed by this executor.

58/58 focused planner/ledger/executor/budget/lock/transaction tests passed (7.9 s), including
real mutated-fee send with timeout/restart, actual overspend accounting and no second send.
Full npm test/fork not run. Historical coordinator results recorded in CURRENT_CONTEXT.

Проверка fee-policy fix: 4/4 targeted coordinator (82.1 s); финальный тест typed recovery +
durable halt повторно 1/1 (43.9 s), state suite 7/7. Команды coordinator — в LOCAL_NATIVE_REFILL.

## Automatic coordinator funding — 21.09.2026

runCoordinator accepts optional nativeRefill={signer,source,policy,protectedAddresses?} with ops.
Only a dedicated BOOTSTRAP_NATIVE signer on the shared provider is accepted. Source cannot be
an execution signer or Short/Monthly controller. Prize vault/router/converter addresses are
included in protectedAddresses automatically. Funding domain/source are part of coordinator
config identity. Enabling from previous config is allowed only without pending; policy changes
cannot silently reset the ledger. Disabling/change of configured funding is not an implicit migration.

collectExecutionObligations is shared with checkExecutionBudget. It reads both lifecycles at one
block: frozen settlements → committed, current candidate operation → candidate. Other unfrozen
proposals are not committed liabilities. An operation outside a draw is represented separately.
Mutable gas observations apply to the planner without changing the immutable base funding domain.

Pass order:
1. Recover existing pending. A recovered refill ends the enabled pass, including reverted receipts.
2. A persisted policy violation reports requiresOperatorAction=true, requiresReconciliation=false.
   Unresolved transactions continue to report requiresReconciliation=true.
3. Read committed obligations; fund at most one committed deficit, then end the pass.
4. Run funded draw work first. At a native budget shortfall the worker yields to the coordinator;
   no refill occurs inside its nested transaction boundary. Candidate funding is deferred while
   committed work exists and is covered. After one actual refill, always end the pass.
5. Optional buffers are considered after workers, only when no frozen work remains. A buffer
   wait never prevents already-funded work. Source pending nonce is checked only for needed sends.

Confirmed/reverted refill returns progress. Normal source-floor/cap/cooldown/gas/stale waits
return waiting, so --watch polls again. Unknown transaction or policy violation returns blocked;
watch exits for reconciliation/operator action. No hidden multi-transfer loop within a pass.

CLI adds --native-refill FILE --refill-signer INDEX (both required together, plus --ops):
FILE contains source, policy, optional protectedAddresses; the signer comes from the local RPC.
Use a persistent local runtime state directory and exclusive source signer, as before.

Validation: 59/59 focused planner/ledger/executor/budget/lock/transaction tests passed (8.1 s).
Automatic candidate and committed scenarios passed locally. Coordinator/CLI final results are
in CURRENT_CONTEXT. Full npm test and fork not run. The network, venue, RNG and gas model remain
local fixtures, not production integration.

Дополнение к проверкам интеграции: 2/2 automatic coordinator scenarios (60.0 s),
4/4 ранее выбранных recovery/CLI/refusal regressions прошли в общем запуске;
первоначальная проверка «freeze ровно на втором pass» заменена проверкой возобновления и
ограниченного продвижения двух candidates. Short начинает работу на следующем pass; Monthly
может запросить собственное пополнение, каждый раз не более одного transfer/pass.

Финальные проверки интеграции 21.09: 59/59 профильных тестов; 12 различных coordinator
regressions прошли отдельными выборками: 4 recovery/CLI/refusal, 6 budget/RNG/frozen/config
(171 s), 2 auto-refill (60 s). Финальная CLI-проверка дополнена source-floor wait → пополнение
источника → resume в том же state, 1/1 (41 s). Полный npm test/fork не запускались.

```powershell
node --test --test-name-pattern='automatic .*refill|CLI runs both workers|hashless broadcast failure|known recipient refusal|native refill pending' test/local-coordinator.test.cjs
node --test --test-name-pattern='budgeted profile waits|one shared budget|RNG controller funding|frozen Monthly gets|budget profile upgrades' test/local-coordinator.test.cjs
```

## Config admission fix — 22.09.2026

Before entering withState, coordinator validates funding targets cover every supplied execution
signer and both Short/Monthly native controller accounts. This applies even when there are no
current obligations and even for a fresh state file. Accounts are compared case-insensitively.

For an allowed legacy/budget upgrade, withState now invokes optional validateMigration(copy)
under its existing lock, after checksum/legacy/pending checks and BEFORE assigning or saving the
new configHash. The guard throws to reject; it receives a detached state copy, no save callback.
A rejected guard cannot change persisted identity/history through this API. No additional journal.

The refill guard requires existing nativeRefillHistory to match the proposed domain and have
pending=false. Absent history is allowed; malformed/null history is not silently treated as absent.
A rejected admission leaves the existing state file byte-for-byte unchanged. Correct compatible
configuration can then be retried. Accepted migration preserves spend, lastAttemptAt,
lastSuccessAt, lastNonce and other history; it does not reset limits or cooldown.
Already accepted non-legacy config changes remain forbidden. Pending still forbids migration.
This prevents NEW failed admissions from pinning a bad identity; it does not provide a reset or
repair command for state already pinned by an older version.

22.09 checks: 25/25 state-lock/refill-state/refill-executor tests (11.4 s). Coordinator admission/upgrade/pending/automatic funding: 5/5 (112 s), including
incomplete targets, incompatible domain, byte-unchanged rejection and compatible retry.

```powershell
node --test --test-concurrency=1 test/local-state-lock.test.cjs test/local-native-refill-state.test.cjs test/local-native-refill-executor.test.cjs
node --test --test-name-pattern='refill admission|automatic .*refill|budget profile upgrades|enabling budget cannot' test/local-coordinator.test.cjs
```
