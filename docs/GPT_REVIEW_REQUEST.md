# Review: автоматический Short до USDG в кошельке

27.09.2026. Пакет после `5e1f348`; мнение review — вспомогательные данные, не новая policy.
[Описание API, порядка и границ](SHORT_AUTOMATION.md).

## Реализация

Новый local-only `short-automation.cjs`/CLI соединяет существующие workers с одним
exclusive signer=Short publisher. Старый V2 coordinator и Solidity не менялись.
Перед любыми sends reconciles собственный pending и оба child journals. Funding/drand
сохранили свои journals и получили reconcileOnly/transactionGuard; scheduler получил
kinds и allowNewJobs. Defaults прежних workers сохраняют их поведение.

Очередь выплат читается из canonical Short AttemptsConsumed с bounded cursor от genesis.
Terminal/resultHash/winners проверяются, reward0 пропускается. Claim фиксированному
winner проходит existing transaction boundary, intent/hash/receipt и gas limits.
Unknown hash блокирует весь signer, known hash сверяется до продолжения. Отказ одного
claim оставляет долг и не мешает другим; повторные попытки вращаются между проходами.
No-win и самостоятельный claim не создают лишнюю отправку. Старые долги не зависят от
того, остался ли draw последним scheduler job.

Порядок: old claims → Short drand → started settlement → claims → funding → new Short.
Source drift не блокирует старые призы. Общий gas guard действует внутри child sends,
а перед seal проверяется модель денег на prove/deliver/chunks/finish/максимальные prizes
и известные unpaid claims. Frozen/claimable USDG не участвуют в бюджете газа.

## Новый continuous fork

`infinity-launch-fork.cjs --automation`:9проходов одного programmatic runWatch.
Все действия — pull/pay/begin/publish/seal/prove/deliver/processShort/finishShort/claim —
выполнил coordinator. Harness не вызывал RNG delivery или claim.
11.934252USDG fees =0.999999выплата+10.934253остаток. Queue/pending пусты, rerun0tx.
2Short consumed,2Monthly open; live drand round20996799. Evidence сохранён в research,
offline тест проверяет lifecycle replay, реальные ModeFeeAccrued и Transfer выплаты.

Ограничения прежние: local31337, Short constructor clock override в памяти только
для fork, lead60s/test odds/budget5USDG/100%Promo, storage-funded buyer, local miner.
Не production bytecode/timing/finality proof. Standalone CLI аргументы проверены,
сам fork вызывает тот же runWatch программно, не subprocess CLI. Monthly не запускается.

## Проверки

Новые5/5 +2/2 +1/1 отдельными запусками: payout, claim timeout/unknown, no-win,
native wait и самостоятельный claim, недостаток полного pre-seal бюджета,
failed claim retry, scheduler timeout reconciliation. Обычные unit fixtures без
constructor override. Соседние funding/drand6/6, default Short/Monthly scheduler1/1.
CLI/profile2/2, saved evidence2/2. Full suite не запускался.

## Что прошу проверить

1. Нет ли обхода global stop через child journal/guard или повторной отправки после
   restart на любой из трёх границ journal?
2. Не теряется ли старый reward при cursor advance, частичном обходе, неудачном claim
   или самостоятельном получении? Подтверждённый reorg останавливает, не autorewinds.
3. Корректны ли full Short gas forecast перед seal и per-operation wait для продолжения?
4. Есть ли существенный blocker перед отдельным Monthly e2e? Не расширять пакет
   до mainnet keys/admission/refill, пока не ясно, что действительно нужно исправить.

Exclusive signer — операционное требование: нельзя запускать другой coordinator или
standalone worker с тем же кошельком/другим state. Local lock не network-wide wallet lock.
ETH auto-refill, безопасное обновление campaign jobs, production параметры и mainnet
admission ещё отдельно. Новых admin/reset/reroll/rescue/proxy нет.
