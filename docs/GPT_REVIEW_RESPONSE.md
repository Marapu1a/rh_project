# Постоянный ответ GPT — bootstrap ETH refill

28.09.2026. Независимое ревью `5874bfe`. Прочитал refill, общий guard, child workers, handoff и сценарии. Лично запустил `node --test test/promo-refill-accounting.test.cjs` (**4/4**) и адресно `--test-name-pattern='partial refill|refill for a Ready monthly job' test/promo-native-refill.test.cjs` (**2/2**). Полный дорогой профиль и повторную диагностику lock не проводил.

## Что подтверждается

Refill не берёт ETH из prize custody и не выбирает произвольного получателя: отдельный EOA переводит только executor. Конфиг содержит минимальный остаток источника, cap одной попытки и периода с газом, cooldown; main identity фиксирует политику. Перед переводом проверяются код адресов, signer/provider, nonce, gas и сеть. Intent сохраняется до send; unknown hash блокирует весь проход. После receipt проверяются canonical block, исходная tx/nonce/value/fee envelope; revert списывает только газ, перелимит учитывается и закрывает следующие refill. `save(next)` предшествует изменению памяти: тест disk failure подтвердил сохранение исходного pending. Handoff переносит историю и запрещает незаметную замену уже включённой политики. Public sends остаются закрыты.

Приоритет старых обязательств в guard устроен корректнее, чем я сперва прочитал: `OBLIGATION_ACTIONS` **исключены** из требования сразу держать весь прогнозный запас. Refill целится сначала в общий `committed`, но после частичного перевода старое `process/claim` повторно проверяется по собственной стоимости и может идти порциями. Для новых действий полный запас остаётся условием. Мой первоначальный вывод о блокировке старых действий из-за полного резерва был ошибочным; в репозиторий его не отправлял.

## Один конфигурационный риск живучести

Общий guard считает `transactionCost(ops, units) + ops.nativeFloor`, а child funding/RNG budget отдельно требует `units * request.maxFeePerGas + fundingJob.nativeFloor` либо `deliveryJob.nativeFloor`. `reserveGasPrice >= maxGasPrice` и `safetyBps >= 10000` страхуют стоимость газа, **но нет проверки, что `ops.nativeFloor` не меньше двух child floors**. Если, например, `ops.nativeFloor=0`, а `deliveryJob.nativeFloor=1 ETH`, refill доведёт баланс до общего порога, после чего guard сочтёт его достаточным и больше не пополнит; child будет каждый раз ждать `nativeFunding`. Это liveness при неправильном, но формально допустимом профиле, не потеря ETH.

Перед эксплуатацией стоит добавить простой invariant при `prepareRuntime`: общий `ops.nativeFloor` покрывает оба child floors (или учитывать их максимум в guard), и адресный тест «нулевой executor → refill → funding/RNG при большем child floor». Это ограниченная конфигурационная проверка, не новая архитектура. Других очевидных обходов journal/cap в просмотренных путях не нашёл.

Экономика ещё не утверждена: source заранее пополнен ETH, creator allocation и USDG→ETH отсутствуют, fixture gas не цена Nitro. После конфигурационного invariant следующий содержательный результат — archive RPC/реальные deployment и BUY pins плюс экономический профиль пополнения.
