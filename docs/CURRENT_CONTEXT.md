# Текущий контекст

Обновлено 20.09.2026 после самопроверки кода 571c068.

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

[Coordinator](LOCAL_PROMO_COORDINATOR.md) последовательно запускает prize-flow и draws.
Pending intent сохраняется до broadcast, hash после ответа RPC. Unknown останавливает
оба контура и обычный restart. Известный hash проверяется по receipt; hashless/stale lock
требуют диагностики. Один state path и эксклюзивное использование signers обязательны.

`npm test` на шаге coordinator: 244/247 (~1142 s), все прежние 240/240 прошли.
Три новых restart сценария обнаружили undefined metadata/checksum mismatch.
После исправления отдельный coordinator suite: 7/7, fail 0 (~144 s).
Полный набор после локальной правки не повторяли. Это не единый чистый прогон 247/247.

Текущая [самопроверка и переносимость](LOCAL_REVIEW_AND_PORTABILITY.md) отделяет
подтверждённое поведение от открытых границ. Runtime в документационном review не менялся.
Повторная узкая проверка tx classifier в review: 11/11; это не повтор всех интеграций.

## Ближайший кусок

Project gas budget/readiness: учитывать RNG fee и остаток gas исполнителя на завершение
уже начатого draw, проверять запас перед новым freeze, пережидать дорогой gas.
Перед этим компактно определить network/deployment identity и изменяемые ops settings:
сейчас весь job входит в state configHash, включая polling/gas caps.
Не добавлять сразу auto-swap/project treasury controller и production framework.
Критерии и порядок — [ROADMAP](ROADMAP.md).

## Основные ограничения

- Local guards не снимать для запуска в другой сети. Источник комиссий, BUY decoder,
  block identities, fee model, DEX/RNG и compiler target проверяются для каждого профиля.
- FeeRouter ещё напрямую связан с PAIR API. Новая сеть/площадка — независимый deployment;
  старые prize balances/credits не переносятся и не выводятся.
- Fixed floor не заменяет market price guard. Legacy USDG-only TOKEN debt лишь
  диагностируется; публичный pay остаётся возможным. Полнота legacy list доверена config.
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
