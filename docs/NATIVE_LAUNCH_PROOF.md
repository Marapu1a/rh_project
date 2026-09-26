# Native PAIR launch → FeeRouter → USDG reserves

26.09.2026. Завершён локальный fork-пакет после review `98e6302`.
Не публичный deployment и не production readiness.

## Результат

Обычный creator вызвал действующий публичный `launchV2Token`, создал новый
TOKEN/USDG mode1 проект с нашим FeeRouter единственным recipient. Затем обычный
покупатель приобрёл TOKEN через Universal Router и настоящий native V4 pool.
Новая LP-позиция дала комиссию, прошедшую collect → claim → FeeRouter credit/pay →
LocalMarketPrizeConverter.forwardQuote → GENERAL reserves PromoVault.

| Проверка | Результат |
| --- | --- |
| Upstream | Chain4663, block73063908 / 0x45adde4; execution chain31337 |
| PAIR release | Registry/coordinator/handler5/factory/hook и implementation launchpad совпали с pins |
| USDG | enabled=true, decimals6; USDG/ETH feeds прошли freshness/round/answer checks |
| Launch | fee0.0005ETH, developer buy0; protection5blocks соблюдена до обычного BUY |
| Новый pool | TOKEN/USDG, fee10000, tick200, native hook; position3309547 |
| Покупка | 100 USDG → 27088707.408333353294898595 TOKEN |
| Наш новый доход | 0 TOKEN и **0.699999 USDG** после LP и 70/30 rounding |
| Резервы | Short0.350000 + Current0.233333 + Next0.116666 =0.699999 USDG |

Для проверки весь внутренний доход FeeRouter направлен в промо. **100% promo —
параметр стенда, не утверждение коммерческих долей проекта.** Внешнее PAIR деление
70/30 проверено по NativeFeesAllocated и фактическим Transfers, а не оценке UI.
TOKEN fees от этой USDG-input покупки не возникли: не создавали искусственный
TOKEN inventory, чтобы имитировать конверсию. Реальный TOKEN→USDG swap ранее проверен
отдельно в [V4_MARKET_EXECUTION](V4_MARKET_EXECUTION.md).

## Bootstrap без временного получателя

1. Factory.predictTokenAddress подтверждает локально найденный creator/salt с suffix5555.
   На предсказанном адресе до launch нет кода.
2. У отдельного deployer фиксируем nonce и будущий адрес converter (nonce+3).
3. Deployer создаёт FeeRouter: предсказанный TOKEN и будущий converter как recipient.
4. Другой signer — creator — вызывает настоящий PAIR launch, mode config содержит FeeRouter.
5. Тот же deployer последовательно создаёт adapter, PromoVault, converter. Проверяем
   совпадение фактического converter с заранее записанным адресом.
6. Только после проверки всей связки наш скрипт вызывает bind/harvest/pay.

Нет временного EOA-получателя, изменения campaign policy или impersonation PAIR owner.
Это nonce-зависимая последовательность: отдельный deployment signer не должен отправлять
другие транзакции между этими deploy. При ошибке будущего адреса нужно остановиться,
а не платить в него. Это не атомарное развёртывание всех контрактов одной транзакцией.
Permissionless harvest/pay не запрещают чужой вызов до появления converter; активы
на корректном будущем адресе доступны после его развёртывания. Production runbook
должен сохранять nonce-план и обеспечивать возможность довести deployment до конца.

Signer addresses — стандартные локальные Hardhat accounts, не гарантированно новые
адреса в upstream. Слово «fresh creator» в исходном saved assumptions означает новый
проект, не доказанную пустую историю EOA; в harness формулировка уточнена до ordinary.

## Защита необратимого bind

[FeeRouter](../contracts/FeeRouter.sol) до сохранения source проверяет:
- positionId ненулевой и зарегистрирован в native vault;
- quote позиции совпадает с immutable quoteToken, poolId ненулевой;
- ownerOf NFT через positionManager vault равен самому vault.

Native vault проверяет PoolKey при registerPosition; launch harness дополнительно
сверяет actual PoolKey, currencies, hook, fee/tick, poolId и launch receipt event.
Администратор по-прежнему должен выбрать настоящий проверенный vault/manager:
эти getters не превращают произвольный злонамеренный source в доверенный.
Сбор комиссий при bind не происходит. Полномочия, одноразовость, ReentrancyGuard,
математика credits и атомарная граница rollover не менялись.

Negative tests покрывают нулевой/неизвестный ID, незарегистрированность, другой quote
и другого владельца NFT; rejected bind оставляет source пустым и позволяет затем
правильно привязаться. Повторный bind запрещён. На реальном fork также отвергнуты
нулевая и несуществующая позиции до успешной привязки.

## Воспроизведение и evidence

`node scripts/native-launch-fork.cjs NEW_OUTPUT.json`

По умолчанию Blockreq public RPC; можно задать RH_RPC_URL. Скрипт запускает только
in-process Hardhat, требует upstream chain4663/local31337 и использует read-only proxy,
не пропускающий публичные writes. Берёт свежий upstream block и проверяет pins;
при изменении release или непригодных feeds прекращает работу, не подменяет PAIR state.

Кошелёк покупателя получает искусственные 1000 USDG только локально. Local signers
имеют sandbox ETH; стоимость запуска в реальных долларах не моделируется. Probe
storage для USDG откатывается после неудачной попытки; balances не означают mint provenance.
PoolManager, PAIR registry/vault/hook/TOKEN и их права не подменяются.
BUY minOut=1 — параметр локального probe с искусственным капиталом, не live slippage policy.

[Успешный полный evidence](../research/native-launch/fork-success-2026-09-26.json)
содержит raw transactions/receipts, preflight, роли, nonce-план и итоговые balances.
[ABI публичного entrypoint](../research/native-launch/launch-entry-abi.json)
связан с проверенным implementation/hash. Proxy390requests/7retries/0errors.
Первый run дошёл до нового launch/bind, но test funding probe не обработал пустой
proxy return при пробе чужого storage-slot. Исправлена обработка с rollback;
первый failure сохранён локально `.local/logs/native-launch-2026-09-26-first.json`.
Второй новый run прошёл; ни один failure не объявлен успехом.

Адресная проверка через compile-once launcher:

```powershell
node -e "require('./scripts/test-launcher.cjs').runTests({profile:'source-binding-targeted',selection:{compile:true,files:['test/fee-router.test.cjs','test/local-prize-flow.test.cjs']}}).then(r=>process.exitCode=r.exitCode)"
node --test test/native-launch-evidence.test.cjs
```

45/45 (FeeRouter + prize-flow), compilation19.03s, tests150.20s, total169.24s;
report `.local/logs/test-run-XTjG1q/result.json`. Дополнительно saved evidence2/2,
~0.16s: bootstrap/launch calldata/registered position, 70/30, harvest/pay/transfers
и GENERAL reserve conservation. Offline checks не являются независимой аутентификацией
публичной истории. Полный suite не запускался.

## Что ещё не закрыто

- Покупка доказана через Universal Router напрямую в новый native pool, **не**
  через UI/AUTO aggregator PAIR. Admission/ledger для этого direct native route теперь проверены отдельным
  [расширением](DIRECT_BUY_REPLAY.md), с действующим registration gate.
- Draw authority в этом funding proof — inert adapter, как в предыдущем market fork.
  Настоящие Short/Monthly/RNG, automatic eligibility/payout и production версии отдельно.
- Конкретный deployment profile ещё требует решения; успешный fork показывает
  техническую совместимость, не утверждает параметры экономики или mainnet readiness.
- CTO, immutable sourceEpoch и recovery остаются внешней/локальной границей из
  [PAIR_DEPENDENCY_BOUNDARY](PAIR_DEPENDENCY_BOUNDARY.md).
- Ближайший bounded шаг: source read failure isolation в worker, сохранив stop
  при asset deficit, policy mismatch и unknown transaction. Новый универсальный
  source rebind не добавлялся.
