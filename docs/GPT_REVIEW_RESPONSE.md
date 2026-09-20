# Постоянный ответ GPT

Обновлено: 21.09.2026.

Это независимое review-мнение, не задание на автоматическое исполнение. При следующем
обращении файл следует полностью перезаписать.

Просмотрен commit `6407ddb5af25f1d9766c36992520d27c0e20fb2a` —
`Scope block gas checks to remaining execution obligations`.

## Короткий вердикт

Relevant-action fix сделан правильно. Подтверждённый дефект из предыдущего review закрыт:
block gas limit теперь проверяется для текущего action и ненулевых remaining actions всех
построенных obligations. Завышенный bound чужого `convert` больше не блокирует Short;
необходимый `process/finish` по-прежнему блокирует admission, а process с нулевым остатком
не удерживается в required set.

Нового пропуска completion forecast или необоснованного admission в узком diff я не нашёл.
После этого исправления gas model можно переводить к следующему этапу — выбору явного
operational envelope и измерению верхней границы. Production guarantee из этого всё ещё
не следует.

Однако lock-наблюдение не исчезло. В моём повторном targeted-прогоне оно воспроизвелось
сразу в двух CLI handoff-тестах. Поэтому результат текущей проверки — не 39/39, а 37/39.
Это не связано с четырьмя строками gas fix, но уже нельзя считать единичным шумом или
закрывать простым 500-cycle probe.

## Проверка relevant-action fix

Изменение:

```js
const requiredActions=new Set([action]);
for(const o of obligations)
  for(const [method,count] of Object.entries(o.counts))
    if(count)requiredActions.add(method);
if([...requiredActions].some(a=>BigInt(n.gasUnits[a])>head.gasLimit))
  return wait('blockGasBound');
```

Граница выбрана верно:

- current action всегда проверяется, включая optional prize/closeEmpty;
- все frozen Short/Monthly участвуют одновременно;
- current unfrozen candidate приносит весь оставшийся begin/publish/seal/process/finish;
- action с count=0 не считается физически оставшейся транзакцией;
- RNG funding не смешивается с block gas check;
- unrelated unfrozen preparation, как и раньше, не становится completion obligation.

Порядок вычисления не создаёт обхода: obligations сначала строятся из pinned state,
после чего required actions проверяются до balance admission. `evaluateBudget`,
`gasObservations`, state identity, pending и migration этим commit не менялись.

Новые тесты действительно вызывают публичный `checkExecutionBudget`, а не только чистый
`evaluateBudget`. Они закрывают исходный Short-сценарий, oversized required process и
finish, zero-left process и optional action поверх frozen liabilities.

Отдельного committed Monthly block-limit regression нет. Это не найденный дефект:
ручной симметричный probe frozen Monthly дал:

- oversized unrelated `convert` → `ready:true`;
- oversized required `finishMonth` → `blockGasBound`.

Но один Monthly regression был бы дешёвой защитой строковых mappings
`processMonth/finishMonth` при будущем рефакторинге.

## Lock: теперь есть конкретные точки

Команда из обращения:

```powershell
node --test --test-concurrency=1 test/local-execution-budget.test.cjs test/local-coordinator.test.cjs test/local-scheduler.test.cjs
```

дала **37/39**, fail 2, 122 s. Все execution-budget tests прошли; оба падения относятся к
handoff из parent test process в CLI child.

### 1. Coordinator CLI

Тест: `CLI runs both workers; persisted config/corrupt state fail closed`.

Путь:

```text
.local/scheduler-test-Iv7D5N/state.json.lock
```

Lock содержал PID `11` — parent test process. Он был создан во время предварительного
`await runScheduler(..., {maxTicks:1})` fixture и остался после возврата этого вызова.
После этого fixture записал `job.json/config.json` и запустил child CLI. Child успел
выполнить prize-flow, затем draw worker получил:

```text
Scheduler state locked; another process or stale lock:
.../.local/scheduler-test-Iv7D5N/state.json.lock
at withState (scripts/local-scheduler-state.cjs:8:39)
at runScheduler (scripts/local-promo-scheduler.cjs:137:10)
```

Coordinator вернул `status:error`, `haltedWorker:draw`, без reconciliation marker.
Отдельно остался `coordinator.json.lock` с PID child `34`.

### 2. Scheduler CLI

Тест: `scheduler persists before sending, resumes both kinds, handles terminal reorg and
makes two cycles from BUY`.

Путь:

```text
.local/scheduler-test-rLe2U3/state.json.lock
```

Lock содержал PID `58` — parent test process. Последний parent `await run(f)` уже
вернулся, после него тест записал `config.json` и запустил `run-local-scheduler.cjs`.
Child сразу отказался в `withState` с тем же `EEXIST`.

Это дополняет два предыдущих наблюдения:

- `scheduler-test-TjLs06/state.json.lock` — fail перед run на строке 56;
- `scheduler-test-ASTzJe/state.json.lock` — fail перед run на строке 47.

Точный повтор только двух упавших CLI-сценариев после этого прошёл **2/2** за 57 s.
Следовательно, это intermittent lifecycle/handoff failure, а не детерминированно занятый
state. Причину по имеющимся данным я не утверждаю.

500 синхронных overlap/release/exception/reacquire циклов полезны, но не эквивалентны
реальному пути: длинный async scheduler action, filesystem saves, возврат promise и новый
процесс. Они подтверждают базовый helper, но не опровергают наблюдение.

Минимальная следующая диагностика — не force-clear:

1. В двух CLI-тестах прямо перед spawn зафиксировать `existsSync(lock)`, содержимое,
   `stat.mtime` и parent PID.
2. На `EEXIST` возвращать в диагностике содержимое/stat lock, не меняя fail-closed
   поведение.
3. Одним regression повторять именно `await runScheduler → assert no lock → child CLI`,
   а не только синхронный вызов `withState`.
4. Если lock существует уже после resolved promise, инструментировать пары
   `openSync('wx')/unlinkSync` с run id; только затем решать, это код, runtime или FS.

Удалять lock автоматически по PID/возрасту нельзя: без lease/reconciliation это откроет
реальную конкурентную запись или unknown transaction.

## Следующий шаг

Gas fix не блокирует калибровку. Сначала нужен выбранный верхний envelope общего
`N/chunks` — contract-level `MAX_N` по-прежнему отсутствует. Затем измерять Short,
Monthly и оба frozen одновременно: estimate, receipt gasUsed, calldata, фактическую native
дельту, RNG fee и восстановление после каждого chunk/restart.

Lock issue следует вести параллельно как ограниченный ops-hardening item. Он не опровергает
математику budget model, но пока не позволяет называть scheduler/CLI baseline устойчиво
зелёным.

## Выполненные проверки

- relevant-action targeted suite — **37/39**, два intermittent lock failure;
- все `local-execution-budget.test.cjs`, включая пять новых block-limit сценариев, прошли;
- точный повтор двух упавших CLI-сценариев — **2/2**;
- ручной frozen Monthly symmetry probe — unrelated action admitted, required finish blocked;
- `git diff --check d8fd45c..6407ddb` — ошибок нет;
- полный `npm test` повторно не запускался;
- пользовательский `docs/INDEPENDENT_AUDIT_2026-09-19.md` не изменялся.
