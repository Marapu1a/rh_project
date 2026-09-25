# Автоматическая порционная конвертация

Принято пользователем 25.09.2026: конвертировать без торговой стратегии и обязательного
исторического oracle. Назначенный автоматический executor задаёт minOut; это явное
доверие к цене исполнения. Предыдущее условие «одна продажа закрывает Short target»
отменено. Небольшие продажи постепенно пополняют GENERAL, даже если Short уже наполнен.
Призы обеспечиваются фактическим USDG и существующими draw gates, не котировкой.

## Локальная реализация

`LocalMarketPrizeConverter` — отдельное local-only поколение (chain31337).
Старые converter не изменены, их inventory автоматически не мигрирует.
convert(amount,minOut,deadline,expectedVersion) разрешён только immutable executor.
minOut положительный; exact TOKEN debit, minimum USDG delta, allowance reset и
ReentrancyGuard обязательны. forwardQuote permissionless, направляет USDG только
в immutable vault с syncUSDG. Событие Converted публикует amountIn/actualOut/minimumOut/version.

Adapter меняется через прежний announce/cancel/permissionless activate с notice,
codeHash/assets checks и stale id/version guards. Activation не вызывает старый adapter
и не восстанавливает лимит продаж. Publisher выбирает код маршрута — это полномочие,
а не доказательство честности adapter; proxy/dependency риски hash не устраняет.

Лимит TOKEN: maxInput на вызов плюс token bucket capacity/refillSeconds.
Начальный запас capacity; расход уменьшает запас, время восстанавливает линейно,
максимум capacity. За интервал dt расход ограничен capacity + capacity*dt/refillSeconds
(с округлением восстановления вниз). Это НЕ строгий cap capacity на любое скользящее
окно refillSeconds. Нет удвоения запаса при смене календарного периода. Revert откатывает
расход лимита. Неудачные попытки не расходуют bucket; расходы газа им не ограничены.
Числа fixture — тестовые raw units, не параметры deployment.

## Существующий worker

`local-prize-flow.cjs` поддерживает opt-in execution=market-v1 в converter descriptor:
executor, version, capacity, refillSeconds, maxQuoteAge, slippageBps, minUSDG,
плюс прежние maxInput/maxHorizon/swapLimit/deadlineSeconds и bindings.
Он использует тот же sendLocalTransaction, gas/pending checks и receipt boundary.

Вызов runPrizeFlow получает доверенную функцию getSwapQuote(request). Request содержит
converter/adapter/token/quote, максимальный amountIn, version и block. Результат:
{blockHash,adapter,version,amountIn,amountOut}; суммы/version bigint, amountIn положительный
и не больше запроса. Меньшая порция разрешена для ограничения impact. amountOut — net
исполнимая quote, не spot * amount. Проверки hash/возраста/размера/version не доказывают
качество котировки. Callback должен применять venue/impact/cost policy и вернуть null,
если продажа неуместна. Worker вычисляет minOut с ceil и ограничивает deadline возрастом
quote; minUSDG отсекает слишком маленький результат. Это не расчёт газа в USDG.

Без callback/при его ошибке/null TOKEN ждёт; сбор комиссий и forward USDG продолжаются.
Malformed binding даёт error без продажи. Истёкшая quote ждёт. Bucket уменьшает порцию.
Неизвестный receipt останавливает проход; hash сохраняется для существующего recovery,
повторная продажа до выяснения результата не является разрешённым retry.
CLI/coordinator пока не поставляют production callback: в market-режиме будут ждать quote.
В тестах callback и venue искусственные. Не объявлять это готовым рыночным исполнением.

`short-conversion-trigger.cjs` сохранён как чистый прогноз GENERAL Short-доли;
target/freeShort больше не запрещают продажу. Worker от него не зависит.
Фактический USDG, GENERAL rounding, frozen/claimable и правила draw не менялись.

## Границы и следующий шаг

Executor может выбрать плохой minOut, publisher — плохой adapter. Лимиты ограничивают
объём TOKEN, не денежный ущерб навсегда. Цена может быть сдвинута до quote; oracle-защиты
нет. Ключ executor пока immutable: его потеря останавливает TOKEN-продажи, USDG forwarding
остаётся доступен. Это открытая deployment граница; rotation/rescue не добавлены.

Следующий пакет — конкретный узкий venue adapter и реальный quote provider с impact/cost
проверкой, затем wiring CLI/coordinator и fork. Не вводить фиктивные production котировки.
Сайт должен читать фактические события/receipts; frontend этим шагом не менялся.

Проверки 25.09: финальная адресная выборка prize-flow + forecast 25/25,
122.36 s включая compile 16.26 s; .local/logs/test-run-cR6rc8/result.json.
Команда: runTests({profile:'market-final-flow',selection:{compile:true,
files:['test/local-prize-flow.test.cjs','test/short-conversion-trigger.test.cjs']}}).
До финальной правки sender старые converter scenarios прошли 9/9 в адресном пакете
27/27 (.local/logs/test-run-VNgo0Z/result.json). Каталог тестов 1/1, links/diff OK.
Промежуточный market receipt failure был estimate без from в signer wrapper;
worker теперь указывает from, финальные unknown receipt сценарии проходят.
Runtime LocalMarketPrizeConverter 6797 bytes. Full/fork/public sends не запускались.
