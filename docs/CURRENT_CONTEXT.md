# Текущий контекст

Обновлено 20.09.2026 после provider-binding fix по review f222a8c.

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

После review f222a8c закрыт provider binding: все publisher/executor и переданные
router/Short/Monthly проверяются до state и использования runners. Требуется тот же
provider object, даже если другой показывает тот же chainId. Это wiring check, не
attestation произвольных JS wrappers.

[Coordinator](LOCAL_PROMO_COORDINATOR.md) сохраняет pending до broadcast. Успешное
сохранение prepared intent фиксирует текущую попытку: более поздний abort допускает
одну отправку, сохраняет hash и запрещает следующие. Hashless/stale lock по-прежнему
требуют диагностики; force-clear/cancel не добавляли.

`node --test --test-concurrency=1 test/local-coordinator.test.cjs test/local-transaction.test.cjs`:
**20/20**, fail 0 (~151 s), в том числе 9 coordinator integrations и 11 tx checks.
Две новые интеграции: неверные/malformed signers/contracts и abort на persisted intent
с успешным restart без дублирования денег. Полный набор теперь 249, в этом шаге не запускался.

GPT в ответе f222a8c сообщил чистый полный **247/247** для предыдущего кода.
Это его независимая проверка, не новый полный запуск Codex.
Solidity, денежная математика и runtime-семантика abort в текущем fix не менялись.
[Самопроверка и переносимость](LOCAL_REVIEW_AND_PORTABILITY.md) остаётся основанием плана.

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
