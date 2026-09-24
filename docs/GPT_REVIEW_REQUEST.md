# GPT: реальный source collect/claim → FeeRouter на fresh fork

24.09.2026. После 3e0502f завершён ещё один ограниченный integration slice.
Ответ перезапиши в GPT_REVIEW_RESPONSE.md; код самостоятельно не меняй.

Сначала прочитай [FEE_SOURCE_INTEGRATION](FEE_SOURCE_INTEGRATION.md), затем
scripts/fee-source-integration.cjs и изменение permit-buy-fork.cjs (--source).
FeeRouter.sol и остальные product modules не менялись.

## Что исполнили

На свежем local fork reference TOKEN/USDG проверили vault runtime continuity,
project/mode/epoch/recipients, ownerOf и registered position/pool/quote.
Исходный recipient чужой — FeeRouter.bindSource правильно отклонён.
После настоящего BUY за 100 USDG keeper сделал collectFees; claim обоих assets
выполнен от исходного recipient с локальной impersonation. Due точно равен delta.

Далее явно условная часть: LOCAL impersonation policyController и настоящий вызов
transitionFeeSharingAtomic([router],[10000]). Source epoch 1→2, bindSource успешен.
Никаких storage/code overrides vault/LP/handler. Это НЕ публичные права нашего проекта,
НЕ доказанная процедура launch/migration, НЕ проверка полномочий верхнего registry.

Новый BUY → keeper collect/harvest дал router 700000 raw USDG, TOKEN due=0.
Повтор harvest без нового дохода не изменил received. Ещё BUY оставлен несобранным,
по 17 raw assets переведены напрямую, затем rollCampaign собрал и закрыл старую
кампанию. Старые credits сохранились и были выплачены после rollover. По 23 raw,
поступившие после перехода, остались в новой кампании; stale rollover отклонён.

100% одному test EOA — fixture policy, не наша продуктовая доля. Генерировали BUY,
не SELL: earned TOKEN harvest после bind не доказан положительной суммой. У исходного
recipient положительный TOKEN claim был. У source две позиции, router привязывает
только TOKEN/USDG; полная поддержка второй позиции/другого quote не заявлена.

## Evidence и проверки

research/fee-source-integration-success-2026-09-24.json: stage=complete, exit0,
raw tx/receipts 19 source/router операций плюс BUY observations, getters/hashes,
claims/accounting. Upstream Blockreq: 326 requests, 3 retries, 0 errors.

Предыдущие попытки сохранены честно: официальный RPC403 при reset; затем успешный
collect, но BrowserProvider.getSigner потребовал eth_requestAccounts. Исправлен
только harness: JsonRpcSigner для impersonated адреса, как в прежнем economics fork.

Адресная проверка 4/4, 22.84 s с compile: новая offline receipt/accounting regression,
старые atomic rollover + external collect failure + source epoch drift tests.
Full suite не запускали; публичных транзакций нет. Точные команды/границы в документе.

Предыдущий Permit2→admission→dataset пакет в PERMIT_BUY_INTEGRATION.md также готов;
его можно проверить вместе, но не считать два отдельных forks одним deployment.

## Вопросы

1. Есть ли реальный пробел между evidence и заявленным результатом? Особенно важно
   не смешать исполнение source API и наши production-полномочия на его настройку.
2. Не скрывает ли setup проблему с epoch/custody, приписыванием TOKEN от другой позиции
   или сохранением старых credits? Отличай проверенную одну позицию от всего vault.
3. Есть ли основания менять FeeRouter прямо сейчас? Пока execution прошёл без фиксов.
4. Следующий кусок предлагаем посвятить реальному TOKEN→USDG converter с venue и
   price/slippage guard. Какие prerequisites здесь действительно блокирующие?

Не предлагай admin обходы, proxy, изъятие призов или автоматический rebind.
