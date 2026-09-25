# GPT: локальная порционная market-конвертация после решения пользователя

25.09.2026. Пользователь выбрал простую конвертацию без торговой стратегии и без
обязательного исторического oracle. Обсудили и приняли доверенного executor,
который выбирает minOut. Следующий запрос review — этот локальный пакет.
Ответ перезапиши в GPT_REVIEW_RESPONSE.md; код самостоятельно не меняй.

## Что изменилось

[CONVERSION_TRIGGER](CONVERSION_TRIGGER.md) описывает актуальную модель.
LocalMarketPrizeConverter — отдельное local-only поколение, старые контракты сохранены.
Executor immutable, выбирает amount/minOut/deadline/version. Контракт проверяет exact
TOKEN debit, minimum USDG credit, нулевой allowance после success и фиксированный vault.
forwardQuote permissionless. Adapter announce/cancel/activate с notice и code/assets checks.
Никакого priceSource, proxy, rescue, arbitrary execute или изменения prize destination.

Общий лимит — token bucket: capacity burst + линейный refill, maxInput на вызов.
Это не строгий cap capacity за любое скользящее окно: за dt предел capacity + rate*dt.
Округление refill вниз, failed swap откатывает расход, смена adapter bucket не сбрасывает.
Потеря immutable executor пока останавливает TOKEN-продажи; forwarding USDG независим.

Существующий local-prize-flow поддерживает execution=market-v1; не создавали новый daemon.
getSwapQuote — явно доверенная injected функция с snapshot/amount/adapter/version binding.
Может выбрать меньшую порцию или null; worker ограничивает deadline свежестью quote,
считает ceil minOut и отсеивает слишком малый USDG. Подбор impact/gas economics должен
делать конкретный provider: сейчас он НЕ реализован для публичного venue.
CLI/coordinator не поставляют quote callback, поэтому без него market-режим ждёт.
Используется прежний sendLocalTransaction/receipt boundary/gas/pending path.
from executor теперь явно указан и при estimateGas: важно для runner wrappers.

Short target/freeShort больше не gate продажи. GENERAL пополняется порциями даже
при наполненном Short; прежний planner остаётся прогнозом, worker от него не зависит.
Нового frontend нет: actual amount/minOut/version в events, transaction hash в worker.
Тесты используют funded exchange и синтетическую quote, не реальный рынок.

## Что проверить

1. Может ли series convert превысить bucket bound, в том числе при смене adapter,
   fractional refill и revert? Не перепутать token cap с гарантией USDG-ущерба.
2. Достаточны ли sender/version/deadline/quote bindings нового worker? Старый legacy
   путь и unknown receipt recovery должны оставаться рабочими.
3. Что реально закрыть следующим одним пакетом для узкого venue adapter + quote provider
   и wiring автоматизации? Не предлагать новый oracle framework.
4. Не преувеличили ли trust guarantees? Executor может назначить плохой minOut,
   publisher — выбрать вредный adapter; hash/notice не делают их честными.
5. Стоит ли менять immutable executor до deployment ради восстановления, и какой
   минимальный отдельный выбор пользователя для этого нужен? Сейчас rotation не добавлена.

Сначала локальная реализация, затем настоящее venue/fork. Не объявлять текущий callback
production pricing, не запускать full suite только ради review; адресно по затронутым путям.

Проверки пакета: финальные prize-flow+forecast 25/25 (122.36 s с compile),
старые converter 9/9 в первом адресном прогоне, profile catalog 1/1.
Промежуточный unknown receipt test обнаружил отсутствие from в estimate runner wrapper;
исправлен worker, финальные market receipt cases проходят. Full/fork не запускались.
