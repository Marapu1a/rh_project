# Сквозной Pons coordinator с сохранённым индексом

> Актуализация02.10: это модуль с датированными этапами/evidence, а не текущая очередь работ. Подтверждённые curve/pool self-batches теперь подключены к index/API новым genesis v2; scanner читает новый suffix, idle replay устранён. [Текущая матрица](PONS_CHANNEL_COVERAGE.md), [аудит](PONS_AUDIT_2026-10-02.md), [план](ROADMAP.md).

Текущий конфиг writer/API: [общий indexConfig](SHARED_INDEX_CONFIG.md). Описанный ниже исторический прогон предшествует G02.

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

## Контрольная точка HTTP — 02.10.2026

`node scripts/verify-pons-wallet-api.cjs .local/logs/pons-indexed-cycle-20261001-d.json .local/logs/pons-cycle-http-20261002.json` — PONS_SAVED_CYCLE_HTTP_PASSED. [Результат](evidence/PONS_CYCLE_HTTP_2026-10-02.json). Проверен исходный сохранённый snapshot без обновления observedAt/configHash: historical read валиден, текущий HTTP ответ stale. Балансы и rewards совпадают с ledger и между двумя запусками настоящего HTTP server/worker; проверены pagination, 400 на неверный limit, 405 на POST. Snapshot побайтово не изменён.

Проверка добавлена в конец scripts/pons-automation-rehearsal.cjs для будущих indexed runs с текущим shared indexConfig. Именно эта новая связка на свежем fork пока НЕ запускалась; сохранённый snapshot использует историческую scheduler identity. Синтаксис обоих scripts проверен. Повреждение snapshots покрыто существующими user-status-cache tests, в этом пакете повторно не запускались. Это не browser rendering, не mainnet finality и не batch admission.

Согласованный размер следующих пакетов: (1) единый допуск и сквозной учёт штатных Pons routes, включая batch если он требуется терминалом; (2) deployment config и подключение UI/API; (3) общий release rehearsal. Не продолжать размножение standalone shape inspectors. Не объявлять G10 закрытым по этой HTTP проверке.
