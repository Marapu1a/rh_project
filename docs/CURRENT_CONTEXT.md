# Текущий контекст

Обновлено 21.09.2026 после local native refill planner.

## Где находимся

Локальный сквозной MVP: meme TOKEN + добровольное Promo, Short раз в 6 часов и
месячный jackpot, денежные призы USDG. Публичного deployment нет.

Работают две соединённые coordinator цепочки:
- BUY → replay/builders → сохранённые jobs → Short/Monthly → awards/claim → следующий цикл;
- source collect/harvest TOKEN+USDG → FeeRouter credits/pay → converter → USDG reserves;
  отдельная доля проекта не поступает в призовую custody.

Это chainId 31337, упрощённый venue, fixed swap fixture и управляемый тестовый RNG.
Реальные DEX/RNG, production finality и автоматическое эксплуатационное финансирование
ещё не готовы. Локальный скелет связан, production-продукт не завершён.

## Последний результат и проверки

[Native refill planner](LOCAL_NATIVE_REFILL.md) реализован как чистый расчёт: отдельный
native ops source, общий payer/RNG forecast, low/target, source floor, gas перевода,
лимиты периода/операции, cooldown, stale/pending stop. Один план — один перевод,
current deficits важнее buffers. fundingReady не подменяет draw readiness.

Переводов/RPC/автоматического исполнения пока нет. TOKEN/USDG не конвертируются,
project share не утверждается, призовые buckets не являются источником ops.
State policy/source/network hash не позволяет тихо сбросить funding history при смене config.

Двойные lock failures теперь сохраняют primary error и cleanupErrors вместе с
классификацией исходной транзакции. Runtime state/lock должен быть на постоянном локальном
volume без фоновой синхронизации checkout; lock не является distributed lease.

Предыдущая [калибровка](LOCAL_EXECUTION_CALIBRATION.md): N100/1k/10k, 10/64 места,
два seed и 34 clean child handoffs. Это sampled envelope, не доказанный worst-case.


Проверки 21.09: 39/39 (2.4 s) planner/budget/lock/transaction tests и 3/3 (61 s)
coordinator regressions: hashless unknown, concurrent/refusal/abort, CLI handoff.
Полный npm test не запускался.

## Ближайший кусок

Подключить bounded bootstrap-native executor к planner: явный source signer/binding,
перепроверка snapshot/estimate, durable intent/hash/nonce/receipt, period ledger и остановка
при unknown send. Реальный swap/project-share conversion пока отдельно. Не превращать
повтор неизвестного перевода в retry. Полный порядок — [ROADMAP](ROADMAP.md).

## Основные ограничения

- Local guards не снимать для запуска в другой сети. Источник комиссий, BUY decoder,
  block identities, fee model, DEX/RNG и compiler target проверяются для каждого профиля.
- FeeRouter ещё напрямую связан с PAIR API. Новая сеть/площадка — независимый deployment;
  старые prize balances/credits не переносятся и не выводятся.
- Fixed floor не заменяет market price guard. Legacy USDG-only TOKEN debt лишь
  диагностируется; публичный pay остаётся возможным. Полнота legacy list доверена config.
- Budget — off-chain forecast, не escrow и не запрет прямого seal вне coordinator.
  Fixture estimates не доказаны для всех возможных данных/seed; требуется калибровка.
- Seed/finality, publisher trust, durable recovery и incremental indexer не завершены.

## Не пересматривать случайно

Frozen/claimable не финансируют эксплуатацию. External funding не создаёт project fee.
Creator/project shares ещё не утверждены; fixture percentages не продуктовая экономика.
Campaign boundary — успешный rollover; endsAt только плановое время.
Текущие денежные призы USDG, Luck удалён, sponsor layer отдельно. Нет admin prize withdrawal,
proxy, reroll/reset или подмены random. Immutable destination старого converter сохраняется.

[Продуктовые решения](PRODUCT_SPEC.md), [карта реализации](IMPLEMENTATION_STATUS.md),
[исторический снимок статусов](archive/snapshots/PROJECT_PROGRESS_BEFORE_REVIEW_2026-09-20.md).
Ответ GPT — вспомогательное мнение, не автоматическое задание.
