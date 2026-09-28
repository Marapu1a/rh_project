# Read-only USDG→ETH quote и точная симуляция

28.09.2026. Реализован `scripts/ops-market-quote.cjs`; pins в
[профиле](../config/ops-market-robinhood.json). Модуль не подписывает, не выдаёт
allowance и не отправляет транзакций. Результат prepared НЕ разрешение отправки:
`authorizationToSend:false`. Следующий executor обязан привязать source к slot1,
повторить свежую проверку перед send и сохранять intent/hash/receipt.

## Источник котировки

[Официальный Robinhood config PancakeSwap](https://github.com/pancakeswap/infinity-periphery/blob/main/script/config/robinhood-mainnet.json)
указывает CLQuoter0x6b3E15009681869FCF6AE2F3bBf6e33B2D0C590e.
[CLQuoter source](https://github.com/pancakeswap/infinity-periphery/blob/main/src/pool-cl/lens/CLQuoter.sol)
поддерживает quoteExactInputSingle и public poolManager binding. Читаем функцию через
eth_call (несмотря на non-view ABI): в сеть не отправляется транзакция.
Runtime hash quoter и остальных компонентов закреплены, poolManager сверяется,
pool key пересчитывается в ожидаемый id. Адреса/token/venue не произвольные.
Это квалификация одного маршрута4663, не универсальный агрегатор или source audit.

## prepareSwap

Вход: source EOA, amountRaw и явные slippageBps/maxImpactBps, maxAgeSeconds,
deadlineSeconds, maxGasPrice/maxGasUnits/nativeFloor/extraFeeWei. Значения не
выбираются автоматически из будущей доходности. Профиль рынка фиксирован, лимиты
ещё нужно выбрать для эксплуатации. Котировка с другого source сама по себе
не разрешает тратить operations: привязка к slot1 — обязанность будущего executor.

1. Проверить chain4663 (либо явно localFork31337 с hardhat fork chain4663), свежесть
   блока, runtime pins, EOA и pool/quoter bindings. Все state calls на одном blockTag.
2. Проверить ненулевую liquidity; запросить полный input и1%input у quoter.
   Слишком плохое отношение full к малой котировке → priceImpact. Это оценка влияния
   объёма, НЕ независимый oracle и не защита от уже смещённой цены всего рынка.
3. Рассчитать minOut, собрать exact-input+settle+take+unwrap, recipient=source,
   без ALLOW_REVERT. Нулевой output/minOut отвергается.
4. Проверить USDG баланс и оба allowances. Недостающий либо истекающий Permit2
   allowance → allowanceRequired с котировкой, без simulation/approval/send.
5. Проверить текущий gas price; eth_call точного router.execute и estimateGas этого
   calldata на том же blockTag. Quoter gasEstimate не используется вместо router gas.
6. Проверить configured gas bound и ETH reserve с extraFeeWei/nativeFloor, затем
   повторить hash исходного блока и свежесть/deadline. При изменении ветки/старении
   → staleQuote. Новые обычные блоки допускаются в пределах age; minOut не гарантирует
   успех будущей транзакции. Будущий sender перепроверяет условия непосредственно перед send.

Возвращаются prepared с transaction/наблюдением/quote/minOut либо waiting с причиной:
marketPinMismatch, quoterBindingMismatch, poolKeyMismatch, insufficientLiquidity,
priceImpact, insufficientUSDG, allowanceRequired, expensiveGas, gasBound,
sourceNeedsETH, staleQuote, simulationRejected/quoteRejected/readRejected/rpcUnavailable.
Ошибочные входные bounds — ошибка конфигурации, а не вечное ожидание.
RPC без estimateGas на заданном blockTag не получает fallback на другой блок.
Gas reserve — явный cap+extra, не гарантия учёта всех Nitro data fees.

## Новый fork proof

[Evidence](../research/ops-funding/quoter-fork-2026-09-28.json).
`node scripts/ops-market-fork.cjs .local/logs/ops-quoter-fork.json`.
Block74786338:10USDG → quoted3718445305557211wei → actual3718445305557211wei.
Симулированный calldata отправлен без изменения и прошёл swap+unwrap; estimate226310gas.
Завышенный minOut отклонён. Quote использует только reads — snapshot/trial swap
для котировки больше нет. Artificial USDG funding всё ещё использует локальную
storage fixture; native Hardhat тестовый. Public sends нет, gas cost не тариф Nitro.

Тесты модуля используют synthetic RPC/hash fixtures:15/15, точное calldata,
один blockTag, stale/reorg, liquidity/impact, оба allowances и expiry, дорогой gas,
gas/native bounds, simulation/RPC failure, pin mismatch. Не выдают mocks за живой proof.
Команда: `node --test test/ops-market-quote.test.cjs`; профиль launcher:ops-market.

## Следующий пакет

Journaled approve/Permit2/swap под тем же operations signer/nonce, что refill.
Перед отправкой fresh prepareSwap, после receipt — фактический output и refill.
Unknown send, остаточные allowances и crash между шагами требуют явного recovery;
их текущий read-only модуль не решает. 90/5/5 не пересматриваются, призы не тратятся.

## Проверки соседнего admission/runtime

28.09: `node --test --test-name-pattern="matching but unapproved|source and BUY policy outage" test/robinhood-recovery.test.cjs` —2/2.
`node --test test/robinhood-runtime.test.cjs` —9/9 (~192s).
`node --test --test-name-pattern="profile catalog" test/test-launcher.test.cjs` —1/1.
С15quote cases это26 разных продуктовых сценариев +1catalog, отдельными запусками,
не full baseline. Контракты и prize math не менялись.
