# Постоянный ответ GPT

Обновлено: 22.09.2026.

Это независимое review-мнение, не задание на автоматическое исполнение. При следующем
обращении файл следует полностью перезаписать.

Просмотрен HEAD `6a068ec2bb93d1c4a7ac219bae3045f998c9411c` —
`test: verify native refill recovery across process death and RPC outages`.
Проверен весь диапазон после прошлого ответа: `459fc38..6a068ec`, включая runtime fix
`edd27d5 fix: validate refill admission before persisting config migration`.

## Короткий вердикт

Предыдущий config-admission defect закрыт по правильной границе. Funding targets
валидируются до открытия/создания state, а совместимость существующего
`nativeRefillHistory` проверяется под тем же lock до сохранения нового `configHash`.
Rejected migration не меняет state; повтор с правильной конфигурацией сохраняет
spend/cooldown/lastNonce и принимается.

Process-death/RPC evidence соответствует заявленным выводам. Тесты действительно убивают
отдельный Node process в пяти точках штатного `executeNativeRefill + withState`, а не
симулируют restart новым объектом в том же процессе. Hashless исход не повторяется, known
hash восстанавливается по original receipt, expense учитывается ровно один раз, а уже
финализированный state остаётся неизменным.

Подтверждённых runtime-блокеров в этом диапазоне не нашёл. Локальный сквозной skeleton
можно считать собранным и переходить к замене внешних fixture-границ и укреплению
эксплуатации. Это всё ещё не заявление о production readiness.

## Config admission fix

Исправление сохраняет нужные инварианты:

- target coverage включает prize executor, draw publisher/executor и оба controller/RNG
  accounts до вызова `withState`;
- неправильный target set не создаёт новый state-файл и не меняет существующий;
- `validateMigration` выполняется после checksum/config/legacy/pending checks, под
  захваченным lock, но до записи новой identity;
- callback получает `structuredClone(stored)`, поэтому не может незаметно изменить
  сохраняемый объект;
- incompatible history и `history.pending=true` отвергаются до persistence;
- pending marker по-прежнему имеет приоритет и даже не вызывает migration callback;
- принятая migration сохраняет funding history без обнуления.

Regression проверяет отсутствующий по очереди target каждого execution/controller address,
несовместимый domain, byte-identical rejected state, отсутствие source send и успешный
повтор с history-compatible config. Отдельный state-lock test подтверждает, что guard
держит lock и не оставляет temporary file после отказа.

Замечание к формулировке request: tip commit с process tests действительно не меняет runtime,
но диапазон после предыдущего GPT review включает runtime-изменения `edd27d5`. Они были
проверены отдельно и приняты.

## Process-death evidence

Checkpoint-ы стоят в осмысленных местах:

1. `prepared`: intent сохранён, send ещё не вызван;
2. `sent`: RPC send завершён, но transaction response ещё не вернулся executor-у и hash
   не сохранён;
3. `hashed`: original hash сохранён;
4. `receipt`: final state вычислен после чтения receipt, но ещё не записан;
5. `finalized`: atomic final save завершён, process всё ещё держит lock.

После SIGKILL первый restart упирается в оставшийся lock и не меняет файл. Test harness
снимает только lock собственного завершившегося child после проверки абсолютного private
path и PID. Это корректная тестовая механика, а не скрытый runtime force-clear.

После контролируемого снятия fixture lock:

- `prepared` до send остаётся hashless stop без отправки;
- send-before-hash остаётся hashless stop, хотя перевод физически прошёл;
- known hash после `hashed` или `receipt` находит original receipt и финализируется;
- `finalized` возвращает ready без повторного accounting;
- число `eth_sendTransaction` не превышает одного;
- balance delta source совпадает с persisted `nativeRefillHistory.spent`;
- повторный запуск не меняет финализированный state.

Receipt RPC outage после process death также fail-closed: known pending и файл остаются
побайтно прежними, нового send нет; после восстановления RPC свежий process учитывает
исходную транзакцию один раз. Coordinator regression дополнительно подтверждает, что такая
ошибка не запускает draw/prize workers и обычный finally освобождает живой lock.

## Что эти тесты не доказывают

- Не проверяются power loss, disk cache и directory fsync durability.
- Hardhat/RPC и chain state переживают смерть client process.
- Kill-сценарии используют automining; отдельные mempool timeout/revert paths покрываются
  прежними тестами, но не этим harness.
- Не доказаны production finality/reorg/replacement recovery.
- Не убивается весь coordinator внутри каждого draw/prize send.
- PID в lock сам по себе не является достаточным разрешением на удаление: namespace/reuse
  и неизвестный исход транзакции требуют операторской проверки.

Документация эти ограничения не маскирует.

## Один следующий bounded step

Следующим разумным шагом считаю **read-only native-refill recovery inspector**, а не
автоматический repair:

- входы: coordinator state path, ожидаемый config и RPC;
- без save, broadcast, pending reset и lock deletion;
- проверка checksum/config/domain/history;
- вывод lock metadata, pending stage/hash/from/to/value/nonce/fee envelope;
- для known hash — RPC transaction/receipt/block identity и классификация
  `pendingReceipt | recoverableReceipt | policyMismatch | evidenceConflict`;
- для hashless — явный `manualTransactionSearchRequired`, никогда не `safeToRetry`;
- source latest/pending nonce показывать как evidence, но не использовать как доказательство,
  что send не было;
- результат — машинно читаемый report и ненулевой exit для conflict/unknown.

Тесты inspector-а должны доказывать byte-identical state и ноль send для stale lock,
hashless, known pending, receipt outage, mined success/revert и conflicting RPC evidence.
Оператор после этого принимает отдельное решение; inspector ничего не «чинит».

## Выполненные проверки

- `npm run test:local:refill` в рабочем checkout — **56/56**, fail 0;
- targeted coordinator в рабочем checkout сначала дал 2/3 из-за воскресшего
  `.local/...state.json.lock` в синхронизируемой среде;
- тот же targeted coordinator в чистом `/tmp` checkout — **3/3**, fail 0;
- полный `npm test` в чистом checkout — **318/318**, fail 0, 664.2 s;
- process death checkpoints — 5/5; receipt-outage recovery — 1/1;
- `git diff --check dc6b3f3..6a068ec` — чисто;
- полный fork/live-network test не запускался;
- пользовательский `docs/INDEPENDENT_AUDIT_2026-09-19.md` не изменялся.

Локальный красный запуск не считаю defect кода: рабочий synchronized checkout содержит
много восстановленных lock-файлов с завершившимися PID, тогда как идентичный commit в чистом
`/tmp` прошёл targeted и полный baseline. Это ещё одно практическое подтверждение уже
записанного требования: runtime state/locks нельзя размещать в синхронизируемом checkout.

Итог: admission fix и recovery evidence принимаю, открытых блокеров этому bounded package
нет. Следующий шаг лучше посвятить безопасной read-only диагностике неизвестных исходов,
после чего по одной заменять внешние заглушки: venue/fee source, swap и RNG.
