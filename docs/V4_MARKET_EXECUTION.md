# V4 TOKEN → USDG: adapter, симуляция и fork

25.09.2026. Реализован узкий локальный маршрут через существующий Universal Router
и Permit2. Это следующий шаг после [market converter](CONVERSION_TRIGGER.md),
не публичный deployment и не выбор параметров нашего ещё не выпущенного токена.

## Исполнение

`LocalV4PrizeAdapter` закрепляет TOKEN/USDG, router, manager, Permit2, PoolKey и
runtime hashes router/manager/Permit2/hook. Один exact-input swap, фиксированные
commands 0x10 / actions 0x060b0e, пустой hookData. Нет произвольных calldata, маршрутов,
получателей, native assets или multi-hop. Получатель USDG — вызывающий converter.
Adapter сначала получает ровно amount TOKEN от caller, временно выдаёт ERC20 и
Permit2 allowance, после swap обнуляет оба и проверяет отсутствие остатка новой порции.
Converter проверяет свой debit/credit/minOut. Предыдущие прямые TOKEN на adapter
не используются для подмены input; rescue/withdraw нет.

У router проверяется poolManager(); публичного PERMIT2() в установленном ABI нет.
Первый fork выявил неверное предположение о getter, исправлено. Permit2 address
подтверждается deployment evidence и успешным исполнением. Runtime hash не подтверждает
сам по себе качество кода и не закрепляет изменяемые внешние зависимости/proxy.
Смена самого adapter по notice остаётся полномочием publisher, не скрытым oracle.

Форма swap tuple содержит minHopPriceX36. Первичные материалы:
[IV4Router](https://raw.githubusercontent.com/Uniswap/v4-periphery/main/src/interfaces/IV4Router.sol),
[ABI установленного router](https://sourcify.dev/server/v2/contract/4663/0x8876789976decbfcbbbe364623c63652db8c0904?fields=abi).
Main upstream может отличаться от deployment; фактический маршрут проверен fork.

## Котировка без отдельного oracle

`LocalMarketPrizeConverter.convert` теперь возвращает фактический amountOut, вычисленный
по balance delta; селектор и event не изменены. `v4-market-quote.cjs` симулирует именно
convert → adapter → router на закреплённом block через eth_call от executor. Изменения
состояния симуляции отбрасываются. minOut=1 применяется ТОЛЬКО внутри симуляции;
реальная транзакция получает minimum из полученной quote с заданным slippage.
Это текущая рыночная котировка, не защита от предварительной манипуляции ценой.

Сначала симулируется небольшая reference-порция, затем максимальная разрешённая.
Если удельный выход хуже reference сверх maxImpactBps — порция делится пополам,
число кандидатов ограничено 1–8. Callback может вернуть null. Sample тоже влияет
на цену и имеет rounding, поэтому относительное сравнение не является точным spot
impact. minSampleOutput не позволяет оценивать глубину по почти нулевому raw output.

Проверяются pinned converter/adapter hashes, assets, executor, version и block binding.
Adapter отдельно проверяет hashes зависимостей. Для выбранной порции выполняется
eth_estimateGas на том же block; gasPrice с margin сравнивается с maxGasCostWei.
Это native cap для swap, не перевод расходов в USDG и не гарантия окупаемости.
minUSDG ограничивает минимальный USDG output. Стоимость collect/forward и всего
draw-контура остаётся в существующем ops budgeting. Fork gas не равен финальной цене
транзакции в публичной L2 (включая возможные дополнительные fees).

## Подключение автоматики

В converter descriptor market-v1 добавить marketQuote:

- kind: v4-simulation-v1;
- converterHash, adapterHash: runtime выбранного deployment;
- sampleInput, minSampleOutput: положительные raw integer strings;
- maxImpactBps, maxCandidates;
- maxGasCostWei: positive integer string; gasMarginBps: 10000–30000.

Прежние executor/version/minUSDG/slippageBps/deadline/maxQuoteAge/limits сохраняются.
Worker сам создаёт quote provider из job, если callback не передан явно. CLI и
coordinator пользуются тем же worker; внешних новых daemon/ключей/API не появилось.
Quote policy входит в job, а значит в identity coordinator. Изменение policy при
pending не обходится незаметной заменой runtime-функции в CLI.
В программном API injected callback остаётся доверенным override для тестов/интеграций.
Отсутствие policy/callback, плохая quote или превышенный gas cap оставляют TOKEN ждать;
USDG forwarding не блокируется. Привязка deployment/quote policy — обязанность запуска,
не доказательство того, что произвольный указанный hash принадлежит проверенному коду.

## Проверенный fork

Команда: RH_RPC_URL=https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public,
`node scripts/permit-buy-fork.cjs NEW_OUTPUT.json --market`.
[Evidence](../research/v4-market-fork-success-2026-09-25.json), block 0x44b4d1d,
hash 0x62076ff7bc6f5cde5660dae9cb300176d130feaf2204606dc96ccd316c277462.
Upstream допускает только read-only RPC, изменения происходят на local chain31337.
255 upstream requests, 3 transport retries, 0 RPC errors. Исходная неудача сохранена
[отдельно](../research/v4-market-fork-2026-09-25.json), stage market-route-deploy.

Настоящий BUY за 100 USDG приобрёл TOKEN. Исходный USDG wallet capital искусственный;
TOKEN/пул/router/Permit2 не подменялись. Далее новый adapter/converter и обычный worker
продали TOKEN через настоящий reference pool. Fee source mock, draw authority инертная
local configuration; этот шаг не доказывает source authority или draw/RNG integration.
100% test recipient — не продуктовый fee split.

Три крупные порции дали отказ priceImpact. Выбранный input:
5184293990765350578091788 raw TOKEN. Expected и actual output совпали: 7258891 raw USDG.
В vault поступило 7.258891 USDG, распределено:

| Резерв | USDG |
| --- | ---: |
| Short | 3.629446 |
| Current | 2.419630 |
| Next | 1.209815 |

Сумма равна фактическому output; actual swap event привязан к заданному poolId.
Проверены нулевые converter→adapter, adapter→Permit2, Permit2→router allowances.
Симуляция не изменила inventory. Заведомо завышенный minOut отвергнут в eth_call;
это отрицательная simulation-проверка, не отдельный mined revert на публичной сети.
Swap receipt gasUsed=365441; estimate=433248. Forward gasUsed=217566 — отдельная
транзакция. Эти цифры — конкретный локальный fork, не обещание расходов deployment.

## Проверки и остаток

Адресный prize-flow suite 24/24, 135.90 s с compile; CLI market и legacy,
уменьшение порции, gas cap, runtime mismatch, unknown receipts и соседние сценарии.
.local/logs/test-run-AAdl6U/result.json. Coordinator market→draw→repeat 1/1,
38.89 s с compile, .local/logs/test-run-HB75zT/result.json. Coordinator/CLI unit используют
синтетический venue; настоящий router доказан отдельным fork.
Runtime: converter 6813 bytes, adapter 4034 bytes. Full suite не запускался.

Остаток до запуска: наш deployed TOKEN/pool/code bindings, реальная ликвидность,
параметры impact/sample/объём/gas, operational executor и его восстановление,
проверка публичной RPC/finality/fee модели. Нет обязательного oracle или trading bot.
Не нужно снова проектировать price oracle, чтобы продолжить этот путь.

Offline regression сохранённых Swap/Converted/GENERAL receipts: 1/1,
18.99 s с compile, .local/logs/test-run-IXB8MN/result.json.
