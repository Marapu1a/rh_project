# GPT: реальный V4 swap, simulation quote и автоматическое исполнение

25.09.2026. После de41afb закрываем следующий пакет. Прочитай
[V4_MARKET_EXECUTION](V4_MARKET_EXECUTION.md) и [CONVERSION_TRIGGER](CONVERSION_TRIGGER.md).
Ответ перезапиши в GPT_REVIEW_RESPONSE.md; код самостоятельно не меняй.

## Решение пользователя

Простая порционная продажа без trading bot и обязательного исторического oracle.
Executor доверенно выбирает minOut; publisher может объявлять замену adapter.
Лимиты TOKEN и immutable prize destination сохраняются. Short target не gate продажи;
GENERAL накапливается постепенно. Не переоткрывай вопрос oracle без конкретной ошибки.

## Реализация

LocalV4PrizeAdapter: один ERC20/ERC20 PoolKey, router/manager/Permit2, hashes зависимостей,
commands0x10/actions060b0e, exact input, empty hookData, caller получает USDG.
Нет произвольного calldata/recipient/route. Approvals ERC20 и Permit2 сбрасываются.
Runtime hashes не доказывают честность или immutable proxy dependencies.
Router poolManager getter проверяется; PERMIT2 getter в этой версии отсутствует.
Это обнаружено первым fork, неудача сохранена, предположение исправлено.

LocalMarketPrizeConverter.convert теперь возвращает actual USDG delta для eth_call.
Селектор и события прежние. v4-market-quote.cjs симулирует именно этот путь на pinned
block с minOut=1 (ТОЛЬКО simulation). Проверяет code/assets/executor/version, сравнивает
несколько порций с малой baseline, уменьшает amount при большом relative impact.
Считает eth_estimateGas и native cap с margin. Это не независимая цена, не расчёт
окупаемости в USDG и не гарантия публичной L2 fee. Reference тоже имеет impact/rounding.
Реальная tx получает minOut со slippage и deadline не дольше свежести quote.

marketQuote в converter descriptor автоматически создаёт provider в existing worker.
CLI/coordinator используют этот путь без injected callback; policy входит в job identity.
Программный injected callback остаётся явно доверенным override, не CLI-настройкой.
Без доступной quote TOKEN ждёт, USDG forwarding и accounting продолжаются.
Роли, bucket, notice, frozen/claimable и prize math не менялись.

## Evidence

research/v4-market-fork-success-2026-09-25.json: local fork chain31337,
upstream block0x44b4d1d, 255 reads / 3 transport retries / 0 RPC errors.
Настоящий BUY приобрёл TOKEN; начальный USDG капитал искусственный. Router/pool/token/
Permit2 не подменялись. Fee source mock, draw authority inert; это не source/RNG proof.

Выбор порции отклонил три больших варианта по impact; выбранный input
5184293990765350578091788 raw TOKEN дал expected=actual 7258891 raw USDG.
Vault: Short3629446 + Current2419630 + Next1209815 =7258891, все raw USDG.
Один реальный manager Swap нужного poolId. Approvals zero. Quote не изменила inventory.
Невозможный minOut отвергнут eth_call, не заявляем mined негативный fork tx.
Swap gasUsed365441, estimate433248; forward отдельно217566. Не deployment cost promise.

Адресно: prize-flow 24/24 (135.90s с compile), coordinator market→draw→repeat 1/1
(38.89s), offline evidence regression1/1 (18.99s). Full не запускался.
Runtime converter6813B, adapter4034B. Coordinator/CLI unit на synthetic venue;
настоящий рынок проверен отдельным fork. Команды/логи/источники в документе модуля.

## Что проверить

1. Котируем ли действительно ту же операцию, которую исполняем? Проверь ABI,
   exactInput tuple, SETTLE payer, TAKE recipient, amount bounds и allowance cleanup.
2. Не обходим ли quote/version/hash/deadline или gas/impact cap через runtime state?
   Отличай недоверенный RPC/доверенный executor от ошибок нашей реализации.
3. Правильно ли ограничены baseline rounding, подбор меньшей порции и количество RPC?
   Есть ли обычный сценарий, где функция ненужно залипает, или расход зависит от размера?
4. Не потеряли ли existing receipt/budget/identity guarantees при автоматическом provider?
5. Какой следующий небольшой пакет рациональнее для релиза: recovery роли executor,
   deployment profile/preflight или другой конкретный незакрытый участок?

Не предлагай full audit или новый oracle framework просто на всякий случай.
Наш TOKEN/pool/ликвидность и launch параметры пока не существуют/не утверждены.
Не обещай переносимость на любой Universal Router release: сейчас подтверждён один.
