# Сквозной Pons coordinator с сохранённым индексом

Прогон выполняется локально флагом `--indexed-automation` у
`scripts/pons-collector-fork.cjs`. Он включает обычный automation rehearsal,
разворачивает BuyPolicySource с instanceId lifecycle и передаёт индексатору
точный конфиг `schedulerConfigFor`. Перед проходами индекс обновляется отдельно.

Проверяются отставание индекса без начала новых розыгрышей, восстановление после
догоняющего чтения, обычная публикация cutoff через FINALIZED_CHECKPOINT,
Short/Monthly, live drand, остановка после prove и продолжение по журналу,
выплаты и повторный проход без отправок. Итоговое состояние билетов сверяется
с независимым полным replay.

Границы: все отправки в локальную ветку Hardhat; публичный RPC только читается.
Синтетическое финансирование, impersonated оператор Pons, локальный ArbSys,
сдвинутые constructor clocks и lead60s остаются тестовыми допущениями.
Finalized фиксируется на локальном блоке до начала proposals, затем движется
вместе с latest локальной цепочки. Это контролируемая модель, а не проверка
финальности Robinhood. Индекс обновляется между
проходами, поэтому это ещё не проверка systemd/watch при конкурентной нагрузке.

Предыдущий шаг: [допуск snapshot](PONS_INDEXED_COORDINATOR.md).

Для воспроизведения сначала собрать обычный artifact, затем передать абсолютный
RH_TEST_ARTIFACT и его SHA256 через RH_TEST_ARTIFACT_SHA256. Rehearsal отдельно
компилирует вариант constructor clocks в памяти; workers используют проверенный
обычный artifact. Иначе compile на каждом проходе может сделать тестовый
finalized устаревшим и корректно вызвать `rng:finalityLag,insufficientObservedHeadroom`.
Первый прогон `pons-indexed-cycle-20261001-a` остановлен именно на таком ожидании;
он не является PASS. Защита RNG и публичные timing параметры не менялись.

Прогон `b` убрал повторную компиляцию, но подтвердил отдельную проблему модели:
закрепление finalized на весь проход несовместимо с проверкой свежести RNG при
работающем interval mining. В `c` после появления proposals finalized движется
вместе с local latest. Cutoff сохранённых datasets не меняется, RNG guards
не отключаются. Это допущение стенда; реальные задержки finality требуют
отдельной проверки перед запуском.

Прогон c завершился FAILED до проходов coordinator: ошибочное имя метода activeDraw в тестовом стенде. В d исправлено на существующий activeProposal. Это ошибка harness, не подтверждение сбоя deployed контракта.

## Результат01.10.2026

PONS_INDEXED_AUTOMATION_PASSED на fork77469814, 13 проходов. Выплачено 107.337115 USDG; reserved/claimable в конце нулевые.86 consumed и1 OPEN каждого вида. Остановка после prove и продолжение, финальный повтор без отправок.21 адресная проверка PASS, не full suite.

[Компактное evidence](evidence/PONS_INDEXED_CYCLE_2026-10-01.json); полный локальный отчёт: .local/logs/pons-indexed-cycle-20261001-d.json. Команда: `node scripts/pons-collector-fork.cjs .local/logs/pons-indexed-cycle-20261001-d.json --indexed-automation` с указанным выше обычным artifact и RH_FORK_RPC_URL.
