# Ревью двух фиксированных контроллеров

17.09.2026. Выбрали вариант Short + Monthly + общая казна с раздельными immutable
полномочиями. Реализовали ограниченный локальный шаг; production RNG ещё не выбран.

Начать с [DUAL_CONTROLLER_ARCHITECTURE.md](DUAL_CONTROLLER_ARCHITECTURE.md), затем:

- `contracts/DualControllerPromoVault.sol` и три узких policy hooks в `PromoVault.sol`;
- `contracts/MonthlySettlement.sol`, существующий `ShortSettlement.sol`;
- `test/dual-controller.test.cjs`, `test/attempt-lifecycle-dual.test.cjs`;
- `scripts/dual-bindings.cjs`, lifecycle v3 в `scripts/attempt-lifecycle.cjs`;
- [измерения](../research/controller-size/dual-check.json) и воспроизводимый
  `node scripts/dual-controller-check.cjs`.

Runtime под стандартным лимитом 24 576, без viaIR: Short + research RNG/roles
21 866; Monthly + research RNG/roles 13 753; vault 8 331. Проверено реальным локальным
deployment. Это проверка переносимости, не утверждение лимита Robinhood в 24 KiB.
Конкретные chain limits проверим отдельно перед запуском.

Short может резервировать только Short и finalize его generic draws; Monthly может
только start/settle jackpot. Общий namespace drawId. Generic reserve и TOKEN prizes
в новом vault запрещены. Прямой TOKEN здесь застрянет: conversion нужен до funding.
Все старые USDG credits, rounding и direct GENERAL sync сохранены. Старый single-
controller PromoVault не удалён и не изменил default-поведение.

MonthlySettlement — внутренний компонент, с параметризованным immutable interval/q,
публичной публикацией chunks, одним seed, permissionless process/finish, atomic
settle/consume. Test fixtures с ручным seed и research wrappers с mock provider
не выдаём за production. Алгоритм — capped admission, затем минимальный uniform rank,
один winner или no-win. Production значения не утверждали.

Просим проверить конкретные вопросы:

1. Есть ли обход capability matrix через унаследованный API, generic draw kind,
   sync или комбинацию двух controllers? Особенно важно не расширить права Short.
2. Не нарушает ли одновременное исполнение обоих draws бухгалтерию Next/Current,
   старые claimable, direct transfers и независимые attempts/clocks?
3. Достаточны ли domain и reverse-binding проверки lifecycle v3 для двух sources?
   Где локальный verifier может принять несовместимый deployment или пропустить events?
4. Есть ли практический путь заморозить корректно опубликованный Monthly dataset,
   который нельзя закончить после единственного валидного seed? Отличайте внутренний
   баг от недоставленного RNG, недостоверного publisher и внешнего USDG deficit.
5. Какой **один следующий ограниченный этап** выбрать для реальной RNG/readiness
   интеграции, учитывая оставшиеся 2.7 KiB Short и автоматизацию без ручного оператора?

Не предлагаем proxy, заменяемые controllers, вывод призов или универсальный reset.
Не просим перепроектировать всю механику. Приоритет — конкретный воспроизводимый
пробел в текущем коде и минимальное исправление. Ответ по-прежнему в GPT_REVIEW_RESPONSE.md.
