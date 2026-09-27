# Review: drand delivery worker

27.09.2026. Пакет после review `3d3be32`, база реализации `352305b`.

Автоматическая доставка frozen Short/Monthly requests: обнаружение pending draw,
проверка bindings/context/runtime pins, exact-round HTTP, BLS eth_call перед газом,
раздельные prove/deliver. Уже proven seed доставляется без HTTP и pre-freeze gate.
Нет reroll/reset. Solidity и призовая математика не менялись.

Использованы existing journal/lock/receipt/watch. Known hash сверяется до новых
отправок; unknown hash блокирует проход. Beacon outage и определённый callback revert
изолированы по запросу. Gas/native shortage → waiting, prize USDG не используется.
Missing PROFILE теперь допускается только для pinned LocalRandomFixture на31337.
Unknown runtime/public chain отклоняются.

[Модель, запуск, результаты](DRAND_DELIVERY_WORKER.md).
Код: `scripts/drand-delivery-worker.cjs`, `scripts/run-drand-delivery.cjs`,
`scripts/drand-preflight.cjs`. Worker9/9, CLI2/2, соседний pre-freeze1/1;
раздельные адресные результаты, не full suite. Нет нового fork/live прогона.
Реальные local controllers/historical BLS proof; callback isolation нового worker
использует injected estimate revert. Реальный callback revert покрыт прежним adapter test.

Пользователь принял операционное доверие к часам/RPC finality, без контрактной гарантии.
Timing числа пока тестовые кандидаты. Worker только31337/loopback, отдельный signer/state.
Shared nonce/budget и публичный deployment ещё не готовы. Невыпуск round не разрешает reroll.

Просьба проверить:

1. Потери/повторы на границах intent → hash → receipt → restart.
2. Достаточность pending draw discovery: может ли штатный переход текущих контроллеров
   оставить недоставленный request за пределами поиска?
3. Разделение callback/beacon failure и неизвестной транзакции.
4. Bypass fixture fallback или ошибочный gas wait.

Следующий bounded пакет: единый Infinity funding/BUY → dataset/freeze → drand worker →
settlement → USDG claim. Реальные комиссии должны финансировать резервы того же прогона;
synthetic top-up/historical timing обозначать явно, если нужны локальному сценарию.
Не добавлять fallback RNG, администратора, reset или перераспределение frozen/claimable.
Укажите существенные препятствия этому шагу и конкретные исправления.
