# Pons UI routing — 01.10.2026

Статус: read-only проверка доставленного браузеру JS. Прямые BUY совпадают
с локальным профилем, но весь интерфейс Pons этим профилем НЕ покрыт.
Кошелёк не подключали, подписи/транзакции не отправляли. Это не live BUY proof.

Продолжение01.10: наш отдельный [local direct BUY planner](PONS_DIRECT_PURCHASE.md)
прошёл fork77402505 с approvals, quote/minOut и4 учитываемыми покупками.
Это не расширяет поддержку произвольных маршрутов интерфейса Pons.

## Источники

Открыты [launchpad](https://www.ponsfamily.com/launchpad) и страница существующего
V2 токена. Точные URL четырёх клиентских chunks, SHA-256 и время получения —
[evidence](evidence/PONS_UI_ROUTING_2026-10-01.json). Локальные исходные загрузки:
`.local/logs/pons-ui-*.js`; временный browser capture — `pons-detail-inspect.cjs`.
Документация [Pons V2](https://docs.ponsfamily.com/v2) не заменяет проверку
реального frontend routing. Доставка новых chunks может изменить результаты.

## Что обнаружено

| Ветка | Доставленный frontend | Наш текущий профиль |
| --- | --- | --- |
| Curve, платёж парным активом | `buy(quoteIn,minTokensOut,account)`, отдельный approve при необходимости | Совпадает при прямом top-level вызове, USDG и подтверждённых bindings/receipt |
| Pool, direct | Router `0x8876789976dEcBfCbBbe364623C63652db8C0904`, execute command `0x10`, actions `0x060c0f` | Формат уже поддержан |
| Pool, best route | Сравнивает direct и 0x; выбирает 0x при улучшении >=10 bps или отсутствии direct quote | Aggregator не поддержан; конкретный receipt требует отдельной проверки |
| Несколько wallet calls | `sendCalls`, при выбранных ошибках поддержки — последовательные `sendTransaction` | Прямой sequential swap поддержан; обёртка smart account/batch не допущена |
| Покупка другим активом | Перед trade добавляются funding conversion calls | Не доказано для всей цепочки; нельзя обещать учёт по одному названию UI |

`buildPonsV2TradePlan` находится в chunk `42myse99zr3ep.js`.
Для v4 tuple включает `minHopPriceX36=0`, `hookData=0x`; SETTLE_ALL
содержит currencyIn/amountIn, TAKE_ALL — currencyOut/minimum. ERC20 approve
на Permit2 и Permit2 approve на Router добавляются отдельными calls по allowance.
Это соответствует `scripts/pons-v4-buy.cjs`, включая шестое поле tuple.

`pickPonsBestRoute` и обработчик trade в `1o7nuc0r25-tr.js` могут вместо
этого плана запросить `requestZeroExQuote` и отправить его transaction.to/data.
Наличие этой ветки не доказывает, что 0x сейчас котирует именно наш будущий токен.

`sendWalletCallBundle` в `2ag-ww6xlt2tl.js` отправляет один call напрямую;
несколько — сначала через wallet sendCalls. Фактический on-chain envelope зависит
от кошелька. Нельзя считать любой sendCalls обязательно wrapper-транзакцией,
но нельзя и приравнять его к отдельному прямому swap без receipt.

## Вывод и следующий ограниченный шаг

Не расширять decoder на произвольные wrappers по совпадению Transfer/Swap:
теряется доказательство payer/recipient. Призовые правила и runtime не менялись.
Проверка UI admission остаётся ЧАСТИЧНОЙ, persistent indexer идёт после неё.

Следующий шаг: локально подготовить и проверить наш управляемый маршрут
USDG → direct curve/router, с последовательными approvals и проверкой calldata
перед подписью. Затем подтвердить тот же unsigned payload через wallet harness
и локальный fork. Это позволит дать точную инструкцию участия независимо от
автовыбора Pons. Поддержка 0x и smart-account wrappers — отдельные адаптеры,
если понадобятся; запуск через Pons от этого не отменяется.

Новые продуктовые тесты не запускались: изменены только docs/evidence.
Проверены JSON, локальные ссылки и diff. Ранее пройденные BUY/fork тесты
не считаются проверкой новых UI веток.
