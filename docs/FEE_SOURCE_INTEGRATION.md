# Reference source → FeeRouter: fresh local fork

## Обновление 26.09

Новый [native launch proof](NATIVE_LAUNCH_PROOF.md) прошёл без impersonation PAIR owner:
новый TOKEN/USDG с FeeRouter recipient и поступлением в reserves. Описание ниже —
предыдущий reference fork с явно указанной локальной подменой полномочий.

24.09.2026. Проверка существующего PAIR native TOKEN/USDG vault и FeeRouter.
Production-контракты не менялись. [Текущий контекст](CURRENT_CONTEXT.md).

## Воспроизведение и данные

```powershell
$env:RH_RPC_URL='https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public'
node scripts/permit-buy-fork.cjs NEW_OUTPUT.json --source
```

Новый флаг запускает fee-source-integration.cjs после подготовки real router/Permit2
и локального тестового USDG wallet. Старые single BUY и --integration режимы сохранены.
Все send/deploy выполняются в in-process Hardhat chain31337; upstream read-only proxy.
Output не перезаписывается. Local Cancun, не аттестация Nitro-specific execution.

- [Первый отказ: официальный RPC HTTP 403](../research/fee-source-integration-2026-09-24.json).
- [Вторая попытка: collect прошёл, ошибка signer harness](../research/fee-source-integration-blockreq-2026-09-24.json).
- [Успешный полный сценарий](../research/fee-source-integration-success-2026-09-24.json).

Первый запуск остановился при fork reset: 147 запросов, 30 retries, 9 errors.
Blockreq прошёл чтение и collect; BrowserProvider.getSigner для impersonated recipient
пытался вызвать неподдерживаемый eth_requestAccounts. Исправлено на JsonRpcSigner,
как в историческом economics-fork.cjs. Это не ошибка claim/FeeRouter.
Финальный run: исходный блок 0x440c4df, stage=complete, exit0, 326 requests,
3 retries, 0 errors; лог .local/logs/fee-source-integration-final.log.

## Что проверено без изменения настроек source

Reference vault 0xDCD7B60c8FeF290936533da7c21B5Be97839e580, positionId 2466182.
На свежем fork сверены projectToken, mode=1, epoch=1, recipients=1/10000 bps,
LP ownerOf, registered position quote/poolId и runtime hash vault с прежним evidence.
Vault runtime hash 0x4a2a9450932c1af0bbc455eefa7cd8545b86d5b9d92fd1025a95bc7210540859.
Это runtime continuity, не новая независимая перекомпиляция исходников vault.

FeeRouter.bindSource на исходном vault отклонён: recipient чужой, не router.
Через настоящий router/Permit2 выполнен BUY за 100 USDG; collectFees вызван keeper.
От имени исходного recipient **только локально** выполнен claim:

| Asset | Claimable raw = получено raw |
|---|---:|
| TOKEN | 1098088640571932425497463 |
| USDG | 2297883 |

В суммах есть ранее накопленные комиссии; это не доход исключительно от тестового BUY.
После claim долг равен нулю, balance delta точно равна due.

## Условная связка с нашим FeeRouter

Публичных полномочий над этим vault у нас нет. Для следующей части **на fork**
impersonated policyController 0x34b34D3f409C562Ff2d16f211f516e30695b3809;
штатный transitionFeeSharingAtomic назначил router единственным recipient новой epoch=2.
Код/storage vault, PoolManager, LP и handler не подменялись. Impersonation остановлена
после вызова. Подмена авторизованного caller — явное тестовое допущение, не публичная
процедура migration/permission и не доказательство, что launch назначит нашего router.

После перехода bindSource успешен. Тестовая FeeRouter policy — 100% одному EOA,
а не утверждённый project/promo split. Остальные действия выполнялись обычными local signers:

1. Новый BUY за 100 USDG → permissionless collect/harvest: router получил 700000 raw
   USDG; TOKEN due=0. Повторный harvest не увеличил accounting.
2. Ещё BUY оставлен без collect, по 17 raw TOKEN/USDG отправлены напрямую в router.
3. После endsAt rollCampaign выполнил final collect/harvest и учёл всё в campaign1.
4. Старые unpaid credits сохранены, campaign2 открылась с нулевым received.
5. По 23 raw обоих assets поступили после rollover и были учтены в campaign2.
6. Старые credits выплачены permissionless после rollover; новые остались целы.
   Stale rollover отклонён.

| Asset | campaign1 received = old paid | campaign2 received = оставшийся accounted |
|---|---:|---:|
| TOKEN | 17 | 23 |
| USDG | 1400016 | 23 |

USDG final collect дал положительный дополнительный доход сверх 17 raw transfer.
Разница в raw fee amounts между swaps не подменяется обещанием фиксированного процента.
Положительный TOKEN claim доказан у исходного recipient; в bound epoch TOKEN revenue
не генерировали SELL, поэтому эта часть проверяет zero-due harvest и direct TOKEN.

## Границы

У source две LP positions; router собирает выбранную TOKEN/USDG. Не объявляем полный
охват второй позиции/другого quote. Штатная source transition сама может собирать все
зарегистрированные позиции, поэтому старые source epochs не равны нашим campaigns.
Смена source epoch после bind по-прежнему блокирует rollover; автоматического rebind нет.

Искусственный USDG balance только у trading wallet, native balance — у impersonated
test actors. Тестовые получатели — EOA: PromoVault distribution, conversion, RNG,
claims призов и production keeper тут не запускались. Failure/reentrancy/rounding
защиты не переопределялись, их unit coverage остаётся самостоятельным доказательством.

Следующая отдельная интеграция — TOKEN→USDG converter с реальным venue и guard,
не расширение полномочий существующего FeeRouter. До публичного deployment всё ещё
нужны правильные launch bindings, единственный recipient и согласованная source policy.

## Адресные проверки

```js
// scripts/test-launcher.cjs
runTests({profile:'fee-source-fork-regression',
 pattern:'saved reference fork|rollover sweeps|failed external collection|epoch drift blocks',
 selection:{compile:true,files:['test/fee-router.test.cjs']}})
```

4/4, exit0; 22.84 s включая compile 17.39 s. Лог .local/logs/test-run-y6xpTV/result.json.
Новая offline regression сверяет claim transfers и received/credited/paid по raw
receipts сохранённого fork. Три соседних unit scenarios проверяют atomic rollover,
external collection failure и source epoch drift. Это не полный baseline; full suite
не запускался. Syntax, локальные ссылки и diff проверены.
