# Local native refill planner

21.09.2026. Чистая функция `planNativeRefill(input)` в scripts/local-native-refill.cjs.
Нет RPC, подписания, переводов, резервирования средств и изменения funding history.
Это реализованный расчёт для следующего executor-пакета, не включённое автопополнение.

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

## Границы следующего шага

- Здесь source имеет выделенный адрес, native и заранее разрешённую authority. Реальная
  связь PROJECT_NATIVE с долей проекта и конверсия TOKEN/USDG ещё не реализованы.
- Нет нового процента комиссий, withdrawal призовой казны, proxy или governance.
- Перед intent нужны повторные anchor/balance/estimate checks, проверка source signer,
  receiver и профиля, durable history/nonce/hash/receipt и unknown-send reconciliation.
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

Coordinator blocks nativeRefill pending with nativeRefillExecutorNotEnabled until typed executor
integration: generic receipt recovery MUST NOT clear pending without expense accounting.
No actual transfer executor, RPC or automatic refill is enabled. Signer binding, live revalidation,
bootstrap/migration policy and durable unknown-send recovery remain the next package.

Current verification: 49/49 planner/ledger/budget/lock/transaction tests, including failed atomic save
and reload. 4/4 targeted coordinator regressions also pass (86.5 s). No full npm test or fork run for this patch.

```powershell
node --test --test-concurrency=1 test/local-native-refill.test.cjs test/local-native-refill-state.test.cjs test/local-state-lock.test.cjs test/local-execution-budget.test.cjs test/local-transaction.test.cjs
```

```powershell
node --test --test-name-pattern='CLI runs both workers|hashless broadcast failure|known recipient refusal|native refill pending' test/local-coordinator.test.cjs
```
