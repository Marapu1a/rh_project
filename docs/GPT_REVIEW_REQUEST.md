# GPT: Drand adapter и операционная граница свежести

27.09.2026. Владелец прямо принял: для MVP worker проверяет свежесть/состояние сети,
при сомнениях откладывает новый draw; это НЕ on-chain гарантия finality. Один
round/result без reroll. Конкретные lead/thresholds и публичный deployment не утверждены.

## Пакет для review

[DRAND_ADAPTER](DRAND_ADAPTER.md) — API, assumptions, source pins, проверки.
`contracts/DrandRandomAdapter.sol` реализует прежний asynchronous transport:
immutable два consumer, request(context) атомарен с seal, pinned evmnet BLS,
раздельные permissionless prove/deliver, повтор успешной доставки no-op,
callback revert сохраняет proof. Нет owner, отмены/замены round, prize custody,
withdraw или платы провайдеру. Gas prove/deliver всё равно оплачивается executor.

Worker preflight проверяет chain timestamps/latest/finalized, BLS свежего beacon,
наблюдаемый запас; проблемы → wait перед freeze. Уже frozen draws не получают
новый target. Проверка не препятствует прямому permissionless seal в обход worker;
это явно записанная граница, а не криптографическая гарантия свежести.

## Evidence и ограничения

Adapter+timing6/6; preflight дополнен и прошёл1/1; integration Short/Monthly→real
historical signature→settlement→claim1/1; no-win1/1; соседний scheduler1/1.
Integration сначала падал на неверных тестовых настройках100% и времени до schedule;
исправлены только fixtures. Новые сценарии запускались адресно с reuse compiled
artifact. Единого full baseline нет, новый fork не запускали.

Runtime adapter10957bytes, local prove214696gas/deliver86794gas на consumer fixture;
это не полный gas budget draws. BLS vendor скопирован byte-identical с MIT license
из прежней проверенной research версии; источник/commit/SHA сохранены.

В controller integration synthetic participants, MockToken, historical time, test
вероятности; не Infinity scan и не live drand round. Контроллеры остаются31337.
Production randomness core есть, но доставка пока тестом/permissionless API:
постоянного relayer ещё нет. Следующий пакет — existing journal/gas/known-hash
recovery + exact-round fetch/prove/deliver worker, затем единый Infinity→RNG→payout.

## Вопросы

1. Есть ли конкретная возможность заменить request/round/context/seed либо повторить payout?
2. Корректны ли proof-cache и callback-revert/reentrancy границы?
3. Не выдаём ли операционную readiness за on-chain защиту или уже production готовность?
4. Какие именно проверки нужны следующему delivery worker, чтобы не плодить второй
   journal и не блокировать старые proven requests из-за проблем новых freeze?

OpenVRF рассмотрен, но не импортирован: upstream9fb960c использует2–4s fast mode,
не решающий наше finality допущение, плюс дополнительные owner/authorization.
Не предлагаем новый общий RNG framework или fallback seed.
