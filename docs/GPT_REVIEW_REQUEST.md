# Текущий запрос GPT: approved allocation guard + read-only market quote

28.09.2026. Продолжение d99ac18.90/5/5 явно принято пользователем; вечную
окупаемость газа не доказываем. Дорогой gas/нехватка ETH → wait/top-up/resume,
prize frozen/claimable не трогаем. Public sends закрыты.

## Хвост review закрыт

`inspectDeployment` для public-launch независимо сравнивает actual policy.bps и
fundingJob.bps с9000/500/500. Совпадающий config+chain с ошибочными долями даёт
approvedCreatorAllocation. Проверку НЕ добавляли в validateDeploymentProfile,
который нужен старым obligations и reconciliation: оба frozen draws/claims
продолжаются через прежний obligations-only. Локальные31337 profiles не менялись.
Runtime fixture4663 переведена на90/5/5, ожидаемые reserve amounts поправлены.

Это admission worker, не новая неизменяемость owner policy в контракте. Будущее
изменение принятого распределения требует нового решения и изменения guard.

## Read-only quote вместо trial swap

[Описание](OPS_MARKET_QUOTE.md), scripts/ops-market-quote.cjs,
config/ops-market-robinhood.json, test/ops-market-quote.test.cjs.
В официальном infinity-periphery/script/config/robinhood-mainnet.json найден
CLQuoter0x6b3E15009681869FCF6AE2F3bBf6e33B2D0C590e. Проверили runtime hash и
poolManager binding. quoteExactInputSingle работает через eth_call без allowance.
Не нужен подбор minOut серией проб и не нужен state-changing trial.

Все asset/pool/quote reads на одном blockTag, pins и poolId проверяются. Full и1%
input дают ограничение impact; это НЕ независимый oracle против смещённой цены
всего рынка. minOut в swap и unwrap, recipient=source. Проверяем USDG/оба allowances
и expiry, gas cap, exact router eth_call и eth_estimateGas, native reserve, затем
повторяем hash/age/deadline. Неподдерживаемый historical estimate не заменяем latest.

Модуль read-only: prepared содержит transaction и authorizationToSend:false.
Привязка вызывающего source к реальному slot1 и повторная свежесть перед send —
обязанность следующего executor. Никакого approve/send из quote module нет.
extraFeeWei и gas bounds явные; Hardhat fee не называем тарифом Nitro.

## Проверки и границы

15 быстрых quote cases: prepared exact payload/один block, stale/reorg, liquidity,
impact, ERC20/Permit2/expiry, expensive gas, bounds/ETH, simulation/RPC/pin failures.
Два интеграционных recovery cases: согласованно неверные доли не дают новых операций,
но оба frozen завершаются с claims; source/BUY outage прежний recovery сохраняет.
Соседний runtime suite и catalog — результаты в CURRENT_CONTEXT.

Новый fork на74786338:10USDG → quote3718445305557211wei → actual столько же.
Точная prepared.transaction отправлена только на fork, negative minOut сохранён.
[Evidence](../research/ops-funding/quoter-fork-2026-09-28.json). Artificial USDG/native
и локальная gas модель явно обозначены. Полный suite/public sends не запускались.

## Что проверить

1. Не блокирует ли новый allocation guard reconciliation/старые obligations?
2. Нет ли перепутанных quote/minOut/deadline/allowance units или незакрытого stale пути?
3. Достаточен ли этот read-only API для следующего bounded sender, без ненужного
   общего framework? Отделяем impact от fair-market oracle, не обещаем лишнего.
4. Следующий пакет — durable approve/Permit2/swap в одном ops nonce/journal с refill;
   unknown sends сначала reconcile, затем actual native output. Source/immutable
   audit и реальные deployment caps всё ещё prerequisites, не закрыты этим proof.

Не пересматривайте принятые90/5/5 без конкретного нового основания. Не превращайте
обычный ETH shortage в остановку старых призовых обязательств или требование
доказать бесконечную самоокупаемость. Обсуждаем конкретные execution defects.
