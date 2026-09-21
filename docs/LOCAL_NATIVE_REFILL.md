# Local native refill planner

21.09.2026. Чистая функция `planNativeRefill(input)` в scripts/local-native-refill.cjs.
Нет RPC, подписания, переводов, резервирования средств и изменения funding history.
Это реализованный расчёт для следующего executor-пакета, не включённое автопополнение.

## API

```js
planNativeRefill({
  ops, source, policy, protectedAddresses,
  anchor, head, gasPrice, balances, obligations, gasObservations,
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
- history: `{domainHash, pending, windowStart, spent, lastRefillAt}` обязательна даже
  при первом использовании: spent='0', lastRefillAt=null, windowStart=floor(timestamp/period)*period.
  domainHash строит refillDomainHash из network/source/policy/protectedAddresses.

Изменение static policy/source/network не сбрасывает историю: несовпадение hash блокирует
план. Mutable ops settings имеют отдельный settingsHash. Pending funding запрещает новый
план перевода. windowStart должен быть границей периода, не из будущего; cooldown действует
и через смену периода. Все supplied данные — доверенный input model, не доказательство ledger.

## Решение

1. evaluateBudget даёт required по адресу (с текущим signer buffer и gas safety).
2. effective low = max(required, lowWatermark), target = max(required, configured target).
   Если balance >= low, лишнего перевода нет.
3. Дефициты current obligations приоритетнее накопления запаса. Пока таких адресов
   несколько, выбранному покрывается только required shortfall. Последний дефицитный
   адрес можно пополнить до target; затем очередь доходит до optional buffers.
   Равный приоритет разрешается лексикографически по нормализованному адресу.
4. Только один transfer за план; после его receipt всё рассчитывается заново.
5. gasReserve = existing transactionCost(network, transferGas): reserve gas price,
   extraFeePerTx и safetyBps. Из источника нельзя потратить minimumBalance.
6. maxPerRefill и maxPerPeriod ограничивают СУММУ value + gasReserve, не только перевод.
   Подтверждённый ledger позже должен учитывать фактические value + fee; pending intent
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

Проверки 21.09: 39/39 (2.4 s) planner/budget/lock/transaction tests и 3/3 (61 s)
coordinator regressions: hashless unknown, concurrent/refusal/abort, CLI handoff.
Полный npm test не запускался.

```powershell
node --test --test-concurrency=1 test/local-native-refill.test.cjs test/local-state-lock.test.cjs test/local-execution-budget.test.cjs test/local-transaction.test.cjs
node --test --test-name-pattern='CLI runs both workers|hashless broadcast failure|known recipient refusal' test/local-coordinator.test.cjs
```
