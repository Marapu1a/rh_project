# Автоматический локальный prize flow

20.09.2026. [Worker](../scripts/local-prize-flow.cjs), [тесты](../test/local-prize-flow.test.cjs).
Только chainId 31337 и loopback CLI. Solidity, доли и математика prize reserves не менялись.
Старые USDG jobs продолжают работать по старому API; для converter используется отдельная schema.

## Порядок прохода

1. Проверить весь job на одном pinned head до первой записи: chain/router/assets,
   current campaign/policy, source position/epoch, converter/vault/adapter и параметры,
   bounded legacy entries с доказательством присутствия в указанной historical policy.
2. Признать direct USDG в перечисленных vaults, sync router, выплатить USDG и TOKEN credits.
   USDG сначала; quote converter доставляется в его immutable vault через forwardQuote.
   TOKEN prize share разрешён converter, а не USDG-only vault. Project recipients получают
   оба policy assets; это их уже выделенная доля, её worker не конвертирует.
3. Один collect при совпадении source epoch; harvest claimable USDG, затем TOKEN.
   Epoch drift запрещает collect, но допускает старые bound-epoch claims.
4. Повторить распределение: свежий USDG доходит до vault прежде swap.
5. Не более одной convert-порции на каждый converter, затем forward полученного USDG.
   При definite forward failure в этом pass не продаём дополнительный TOKEN этого converter.

Каждая tx отдельная: late failure не откатывает прежние успешные операции. USDG не ждёт
успешного swap. Пустой collect по-прежнему может расходовать gas.

## Job / запуск

```js
{
  schema: 'local-prize-flow-v1', chainId: '31337',
  router, token, quote, campaignId: '1',
  recipients: [converter, zeroAddress, project], bps: [8000, 0, 2000], // TEST ONLY
  active: {
    kind: 'converter', address: converter, vault, adapter,
    floorNumerator: '2', floorDenominator: '1', // TEST raw-unit floor, NOT a market price
    maxInput: '1000', maxHorizon: '300', swapLimit: '1000', deadlineSeconds: '120'
  },
  legacy: [],
  source: {vault: pairVault, positionId: '123', epoch: '1'},
  distribution: 'GENERAL', pollSeconds: 300, maxGasPrice: '1000000000000'
}
```

Это схема с символическими адресами, не deploy-ready JSON. Доли и raw-unit параметры
примера не являются production экономикой. Job должен содержать параметры именно своего
converter; изменением JSON нельзя ослабить on-chain floor или переназначить vault.

`npm run local:prize -- --job .local/prize-flow.json --rpc http://127.0.0.1:8545 --executor 1 --watch`

Watch ждёт pollSeconds после pass (включая yielded/degraded). При error выходит с кодом 1.
Последняя строка JSON — prizeFlowPass: status, failures, unsafeDebt, steps, при завершении
remainingInventory. Unknown error включает action/target/asset/recipient где известны,
message/code/stage/transactionHash. Нет автоматического retry неизвестного intent.

## Legacy recipients

Максимум восемь entries; active обрабатывается первым, затем текущие project recipients,
затем legacy. История не сканируется без границ. Каждый legacy содержит address,
campaignId < current и slot; router.policy должен подтверждать этот адрес.

- `converter`: historical slot 0, остальные поля как active; pay TOKEN/USDG, forward,
  одна optional conversion при наличии TOKEN.
- `usdgVault`: historical slot 0; pay только USDG и syncUSDG. TOKEN credit остаётся
  unpaid и включается в unsafeDebt с суммой и причиной.
- `project`: historical slot 1/2 с положительной долей; pay обоих активов.

Повторяющиеся адреса, legacy текущего recipient и несовместимые role/slot отвергаются.
Сохранившемуся current recipient старые долги платятся по общему credit, без отдельной
legacy записи. Один адрес не получает выдуманный campaign-specific P&L.

Список legacy задаётся конфигурацией: worker обслуживает перечисленное, но НЕ доказывает
полноту истории старых получателей. Неуказанный долг не исчезает и не обслуживается сам.
Проверка bindings/getters — не bytecode attestation. Job и классификация получателей
доверенные; до production нужен deployment manifest и проверка реальных implementations.

**Unsafe report не является on-chain карантином.** Другой caller всё ещё способен вызвать
публичный FeeRouter.pay(TOKEN, oldVault). Worker лишь не совершает этот опасный платёж сам.
Уже застрявшие TOKEN не возвращаются. Новый deployment обязан сразу использовать converter.

## Отказы и пределы

Общий private skip на весь pass: action/target/asset, для pay также recipient. Definite
отказ отдельного pay/forward/swap/collect/harvest не блокирует независимую работу; повтор
адресу/операции — в следующем pass. Ошибка router accounting/sync или неверные bindings
останавливают pass. Для unknown исхода send/receipt нет catch-and-continue.

Перед каждой tx: gas cap, pending nonce, сохранность anchor hash, current campaign, signal.
Это preflight, не finality и не блокировка policy от изменения до inclusion.
Слишком дорогой gas, pending tx, отсутствующий signer дают waiting; abort — stopped.

Default maxSteps=128 (считает попытки tx, включая estimation reverts), hard maximum=256.
При достижении — yielded, без следующей записи. Малые maxSteps предназначены для тестов:
нет persistent phase cursor, поэтому слишком маленький лимит в повторных pass может
постоянно обрывать работу до swap. CLI использует default; лимит не вынесен в job/watch.
Конечный список и один swap/адрес ограничивают штатный проход без бесконечного drain-loop.
Оставшийся TOKEN после одной порции даёт yielded; failures или unsafe debt дают degraded.

SwapLimit — лимит нашего pass, а maxInput — одной tx. Это не on-chain rate limit: публичный
caller может делать другие convert вызовы. Fixed local floor не имеет рыночной freshness.
Real DEX/price policy, MEV, journal/supervisor, ops refill и finality не реализованы.

## Проверка

Новый набор: 11/11 (~74 s), включая полный CLI pass. Есть conservation/repeat, broken
swap и forward, old converter rollover, unsafe legacy vault debt, два неисправных legacy
recipients, реальные pending forward/convert и их однократное продолжение после mining,
preflight mismatch, step/portion/gas/abort и source epoch drift. MockPairVault revenue
вносится явно, а не рассчитывается из реальных AMM swap fees.

Команда: `node --test test/local-prize-flow.test.cjs`.
Лог: `.local/logs/local-prize-flow-tests.log` (ignored).

## Итог проверок текущего шага

- Новый prize-flow набор: **11/11**, ~74 s.
- `node --test --test-concurrency=1 test/local-usdg-funding.test.cjs test/local-prize-converter.test.cjs test/local-transaction.test.cjs test/local-buy-cycle.test.cjs`: **35/35**, ~228 s.
- Итого **46** уникальных проверок; основной набор теперь **232**, полного запуска 232 не было.

Регрессионный BUY-cycle продолжает проверять прежний USDG профиль; новый converter flow
проверен отдельным source→collect→harvest→pay→convert→forward тестом и реальным CLI,
а не выдан за уже встроенный в BUY fixture профиль. Contract converter tests дополнительно
проверяют сохранность frozen reserve. Реальный PAIR/DEX не использовался.
Логи (ignored): `.local/logs/local-prize-flow-tests.log`, `.local/logs/local-prize-flow-regressions.log`.
