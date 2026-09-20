# Текущий контекст

Обновлено 21.09.2026 после диагностики scheduler/CLI lock.

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

Добавлена opt-in lock trace (`LOCAL_STATE_LOCK_TRACE=1`) и bounded metadata при EEXIST.
CLI-тесты проверяют отсутствие lock на границе parent/child. Lifecycle/recovery не менялись;
не считать intermittent failure исправленным. Детали — [coordinator](LOCAL_PROMO_COORDINATOR.md).


Исправлена глобальная зависимость от gas bound неиспользуемых методов: лимит блока
проверяется для текущего действия и ненулевых remaining obligations. Чужой convert
больше не блокирует завершение Short. 39/39 targeted tests (518 s): budget, coordinator, scheduler. Полный набор не запускался.
Scheduler 10/10; lock failure не повторился, причина остаётся открытой. Дополнительный
probe прошёл 500 циклов overlap/release/exception/reacquire; lock code не менялся.

[Execution budget](LOCAL_EXECUTION_BUDGET.md): opt-in `--ops FILE` для coordinator.
Считаются remaining process/finish всех frozen draws и текущая подготовка/кандидат;
RNG funding отдельно. Один native balance на адрес, buffer без дублирования ролей.
Дорогой gas/нехватка средств дают waiting до intent. Draw-first/frozen-first защищает
completion forecast от необязательного collect. Более высокие estimates повышают
сохраняемые gasObservations и не блокируют навсегда работу по старой калибровке.

Network/deployment identity и именные signer roles отделены от polling/timeout/gas
threshold. Переход со старого state проверяется по точному hash и запрещён при pending;
policy snapshot незавершённой отправки сохраняется. Без ops — unbudgetedLegacy режим.
Пример: [local profile](examples/local-execution-budget.json).

Предыдущая проверка 2026-09-20: 50/50 targeted tests, 0 failures (554 s): budget, coordinator,
transaction classifier, scheduler и executor stability. Полный набор не запускался.
Solidity и призовая математика не менялись.

## Ближайший кусок

Калибровка модели на предельных допустимых chunks/participants/prizes и общей нагрузке
Short/Monthly; сопоставить оценку и измеренный gas, проверить рост расходов после freeze.
Затем отдельный дизайн native funding/refill из bootstrap/свободной доли проекта.
Сейчас модель проверяет баланс, но не покупает native и не оплачивает claims за победителей.
Полный порядок — [ROADMAP](ROADMAP.md).

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

## Результат lock диагностики

Проверки 21.09.2026: первый targeted CLI run 2/2 (107 s); повтор с обеими
процессными трассами и helper tests 5/5. В повторной трассе 27 acquired / 27 released,
10 PID, 0 releaseError, 0 оставшихся путей после release. Все pre/post handoff assertions
прошли. Полный набор не запускался; intermittent failure не воспроизведён и не закрыт.
