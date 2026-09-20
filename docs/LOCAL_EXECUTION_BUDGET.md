# Локальный эксплуатационный бюджет

20.09.2026. Модель и opt-in gate для coordinator, только chainId 31337.
Не новый контракт/escrow, не автообмен и не гарантия физического завершения при любых
состояниях сети. USDG/free/reserved/claimable в расчёте расходов не используются.

## API и источник параметров

`runCoordinator({...options, ops})` либо CLI с `--ops FILE`.
Готовый [пример локального профиля](examples/local-execution-budget.json) соответствует
тестовому стенду. Его gas numbers — выбранные консервативные начальные оценки для
проверенных fixture-сценариев, не измеренные production bounds для всех datasets/DEX/RNG.

```powershell
node scripts/run-local-coordinator.cjs --job prize.json --config scheduler.json --ops docs/examples/local-execution-budget.json --state .local/coordinator.json --scheduler-state .local/scheduler.json --rpc http://127.0.0.1:8545 --publisher 0 --executor 0 --watch
```

Без `ops` сохранён прежний лабораторный режим `budgetMode=unbudgetedLegacy`.
Он не получает новую гарантию readiness. Production execution в этой работе не появился.
`complete` означает конец прохода; внутри результатов могут быть штатные budget waits.

Schema `local-execution-budget-v1`:
- `network`: id, chainId=31337, nativeDecimals=18; feeModel LOCAL_EIP1559 либо
  LOCAL_EIP1559_EXTRA; reserveGasPrice, extraFeePerTx, signerBuffer, safetyBps и gasUnits
  для каждого поддержанного метода. Это идентичность модели данного deployment.
- `settings`: maxGasPrice не выше reserveGasPrice, receiptTimeoutMs, pollSeconds.
  Их можно менять при следующем вызове/перезапуске без нового state. Watch CLI читает
  файл при старте, а не перечитывает его на каждом tick.

Все суммы — целые native base units, не доллары. Два профиля в тестах проверяют обычную
стоимость и дополнительную фиксированную плату за tx. Это не live L2 fee oracle:
calldata/L1/blob fees, tip policy и настоящая сеть потребуют отдельной реализации.

## Расчёт

Для одного метода:

`cost = ceil((gasUnits × reserveGasPrice + extraFeePerTx) × safetyBps / 10000)`.

Оставшееся число вызовов умножается на эту стоимость. Буфер добавляется один раз
на каждый фактический gas-paying address. Если publisher/executor используют один
кошелёк, обязательства суммируются, баланс читается один раз и не считается дважды.

- До seal текущего кандидата: оставшиеся begin/publish, seal, process chunks и finish.
  Уже опубликованные chunks учитываются фактически, неопубликованный остаток — по
  фиксированному chunkSize scheduler. Отдельно нужны RNG fee + nativeFloor в controller.
- Для каждого frozen draw: все оставшиеся process chunks и finish, даже пока ждём seed.
  RNG уже оплачен в seal и второй раз не резервируется.
- Чужая незамороженная подготовка ещё не является обязательством выдачи призов. На её
  собственном действии/перед seal расчёт выполняется заново, включая все frozen draws.
- Необязательные money operations и closeEmpty требуют свободного остатка сверх
  вычисленной стоимости завершения frozen draws.

Прочитанные balances и фазы берутся на одном blockTag; hash anchor перепроверяется.
Это прогноз, пересчитываемый по on-chain progress, не физическая блокировка native денег.
Сторонние траты с этих же signers нарушают допущение exclusive ownership.

## Проверка и исполнение

Gate срабатывает до estimateGas, чтобы нулевой native balance стал `waiting`, а не
RPC send error. Перед prepared marker после estimate выполняется повторная проверка.
LOCAL_BUDGET_WAIT разрешён только на стадии estimate, не создаёт pending intent и
не маскирует unknown broadcast/receipt. Уже сохранённый intent сохраняет прежний commit point.

Если estimateGas выше исходной оценки, coordinator повышает `gasObservations[action]`
и сохраняет её. Это минимум для следующих прогнозов данного метода, он автоматически
не уменьшается. Нехватка средств даёт ожидание пополнения; низкая исходная калибровка
сама по себе не запирает frozen draw жёстким старым gas cap. Это не доказательство
верхней границы ещё не выполненных вызовов: состояние/seed/данные могут увеличить расход.
Проверка block gas limit также не заменяет доказательство исполнимости будущих chunks.

При нехватке native или дорогом gas новые sends ждут. Watch проверяет условия снова.
В бюджетном режиме порядок — draw, затем prize-flow; внутри каждого scheduler tick
frozen jobs приоритетнее незамороженных, начатые подготовки приоритетнее новых.
Это не исчерпывающая очередь: второй вид может продвигаться в том же tick, если денег
хватает с учётом остатка первого. Ожидание seed не разрешает тратить его запас на collect.

## State и настройка

Budgeted coordinator использует identity `local-coordinator-budget-v1`: исходные
deployment/source/custody/job bindings, scheduler config/path, network profile и
именные prizeExecutor/executor/publisher roles. Старые prize pollSeconds/maxGasPrice
исключены из identity; effective gas threshold берётся из ops.settings.
ChunkSize и прочие параметры старого scheduler не стали свободно изменяемыми.

При включении ops на старом state допускается одна проверяемая миграция по точному
legacy config hash и только без pending. Используется тот же файл, история lastResolved
сохраняется. С unresolved marker сначала разрешить исходную tx прежней конфигурацией;
новый path/сброс state не являются recovery. После перехода нельзя отключить ops на том
же state или поменять модель/роли, выдав это за изменение polling.

Каждый новый pending хранит networkHash, копию settings и gasObservations. Изменение
settings при pending не запускает новые sends до reconciliation; исходная policy snapshot
сохраняется. `lastBudget` показывает accounts/required/balance/shortfall, обязательства,
anchor, профиль и policy hash. Отсутствующие поля удаляются перед checksum/JSON.

## Чего этот шаг не обещает

- Он не запрещает permissionless seal напрямую и не защищает legacy CLI без ops.
  Для production требуется отдельное решение о достаточном on-chain readiness enforcement.
- Ошибочный исходный прогноз, новый seed, рост RNG fee, reorg или внешняя трата native
  могут потребовать нового пополнения после freeze. Нужна калибровка на максимальных
  разрешённых данных и реальных adapters; local fixtures этого не доказывают.
- Нет покупки native, перевода доли проекта, reimbursement/escrow или автоматического
  claim за победителей. Текущий native баланс предполагается bootstrap/средствами проекта;
  происхождение native перечислений этот calculator не устанавливает.
- Призовые средства не переводятся на gas. Creator/project shares не утверждены.
- Замена network model, восстановление после потери state, replacement и publisher trust
  не решаются этой миграцией. Гибкость нового deployment не меняет старые обязательства.

Проверка 2026-09-20: **50/50**, 0 failures, 554 s. Команда:

```powershell
node --test --test-concurrency=1 test/local-execution-budget.test.cjs test/local-coordinator.test.cjs test/local-transaction.test.cjs test/local-scheduler.test.cjs test/local-executor-stability.test.cjs
```

Полный набор не запускался. Сокращённый запуск: `npm run test:local:budget`.

## Исправление block limit, 2026-09-21

Лимит блока проверяется только для текущего action и ненулевых remaining actions
в учитываемых obligations. Завышенный чужой convert/pay не останавливает draw.
Завершённые process chunks не создают block-limit обязательства; будущий finish
проверяется даже до начала processing. Optional action учитывает также все frozen draws.
Это не ослабляет native forecast и не сбрасывает сохранённые gasObservations.

## Результат проверки фикса

Проверка 21.09.2026: **39/39**, 0 failures, 518 s:

```powershell
node --test --test-concurrency=1 test/local-execution-budget.test.cjs test/local-coordinator.test.cjs test/local-scheduler.test.cjs
```

Полный набор не запускался. Scheduler 10/10; intermittent lock не воспроизведён.
Отдельный локальный probe: 500 циклов overlap rejection / release / exception / reacquire,
без оставшегося lock. Причина наблюдения GPT не установлена, lock implementation не менялась.
