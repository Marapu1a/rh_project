# Совместный Pons BUY/index/API/draw rehearsal

Дата: 03.10.2026. Статус: сценарий подготовлен, сквозной прогон заблокирован
недоступностью исторического состояния внешних RPC. PASS не заявлен.

## Что проверяем

`pons-collector-fork.cjs --joint-load` расширяет существующий restore drill:
128 дополнительных тестовых кошельков покупают по 60+40+1 USDG через настоящий
pinned Universal Router/Permit2 и созданный на fork Pons pool. Вместе с исходным
покупателем ожидаются 129 участников каждого draw. Четыре дополнительных кошелька
покупают ещё по 99 USDG после freeze. Для них ожидается по одному OPEN билету
каждого вида и нулевой carry; для остальных — OPEN0 и carry1 USDG. Для всех новых
кошельков ожидается по одному использованному билету каждого вида.

Сохраняются проверки реального Pons automation, persistent index, drand BLS,
денежных инвариантов vault, idle и восстановления старых файлов после выплат
без повторных отправок. API сверяется для каждого кошелька; дополнительно —
16 параллельных HTTP запросов, stale с сохранением известных балансов и
недоступный файл с HTTP503/balances=null. BUY ledger пересчитывается независимо
от сохранённого checkpoint.

## Допущения и границы

- Только локальный Hardhat fork; внешние RPC доступны через read-only proxy.
- Impersonated кошельки, синтетические ETH/USDG, тестовое `minOut=1`.
  Это не рекомендуемая настройка slippage для пользователя.
- Сохраняются прежние тестовые часы, local ArbSys, управляемая finality,
  явное донорское пополнение и локальная роль Pons conversion operator.
- Прямые curve/pool покупки; не совместная нагрузка self-batch/0x/EntryPoint.
- Это репрезентативная связка компонентов, не замер mainnet TPS и не проверка
  production deployment, внешнего оператора или независимого RPC failover.

## Команда

```powershell
$env:RH_TEST_ARTIFACT=(Resolve-Path .local/logs/verified-draw-compiled.json).Path
$env:RH_TEST_ARTIFACT_SHA256=(Get-FileHash -LiteralPath $env:RH_TEST_ARTIFACT -Algorithm SHA256).Hash.ToLower()
$env:RH_FORK_RPC_URL='https://rpc.mainnet.chain.robinhood.com'
node scripts/pons-collector-fork.cjs .local/logs/pons-joint-128-c.json --joint-load
```

Имя выходного файла должно быть новым. `RH_JOINT_WALLETS` позволяет адресный
smoke на 4..128 дополнительных кошельках; default128.

## Внешние сбои при подготовке

Краткие ошибки, якоря и SHA-256 локальных логов сохранены в
[evidence](evidence/PONS_JOINT_BLOCKED_2026-10-03.json).

1. `pons-joint-128.json`: официальный RPC не предоставил historical state для
   `eth_getProof`; сценарий не начался.
2. `pons-joint-128-b.log`: Blockreq public подготовил fork79052653, но при
   дальнейших storage reads отказал: доступно лишь последнее окно1024 блоков.
   EDR завершился с ошибкой. Это не успешная проверка сценария.
3. `pons-joint-128-c.log`: официальный RPC сначала успешно отдал fresh historical
   proofs/storage. Повтор на fork79054476 дошёл до graduation, затем не отдал
   исторический storage PoolManager `0x8366a39cc670b4001a1121b8f6a443a643e40951`:
   `historical state 10c968c8d0e582c5c074ad1a65863a9669ea151e7e72b0b2b12cc70d8fad4250 is not available`.
   EDR завершился с ошибкой. Массовые покупки и новые assertions ещё не исполнены.

`node --check` для трёх изменённых скриптов и `git diff --check` прошли.
Это только синтаксическая проверка, не подтверждение правильности нового сценария.
Runtime приложения и контрактов не менялся. Следующее действие — повтор через
RPC с доступной архивной историей, затем исправление возможных ошибок самого
стенда и фиксация фактических результатов. Не считать 129 участников, ожидаемые
балансы и HTTP проверки уже подтверждёнными результатами.

Длинный fork требует доступной истории состояния. Успешный локальный restore
не доказывает архивную доступность внешнего RPC. Не подменять отсутствующее
состояние нулями и не снимать проверки ради прохождения стенда.
