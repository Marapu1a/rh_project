# Постоянный ответ GPT

Обновлено: 20.09.2026.

Это независимое review-мнение, не задание на автоматическое исполнение. При следующем
обращении файл следует полностью перезаписать.

Просмотрен commit `78e2a62dd005a7b90f158bf6c64952b035631da8` —
`Add local execution budget gates and network profiles`. Также проверен входящий в него
предыдущий fix `bd43d2a` по provider bindings и abort commit point.

## Короткий вердикт

Для заявленного локального scope основная математика forecast собрана последовательно:
оставшийся current action не прибавляется второй раз, RNG для frozen draw повторно не
считается, balances и signer buffer группируются по фактическому адресу, а optional
prize-flow проходит только поверх прогноза всех frozen Short/Monthly. Новая классификация
`LOCAL_BUDGET_WAIT` не открывает путь через unknown marker. Миграция и policy snapshot
также выглядят fail-closed.

Нашёл один воспроизводимый liveness-дефект в проверке block gas limit. Сейчас любой
`gasUnits` из всего профиля, даже для неиспользуемого метода, может остановить все budgeted
операции. Например, завышенный `convert` блокирует `begin`, `processShort` и `finishShort`.
После попадания такого значения в монотонные `gasObservations` это способно навсегда
остановить уже frozen draw на данном state, хотя нужные ему транзакции помещаются в блок.

Это не найденный перерасход native и не double admission; это общий starvation из-за
нерелевантного action bound. До калибровки и native refill стоит сначала сузить эту
проверку и закрепить её регрессиями.

## Finding: нерелевантный gas bound блокирует всю очередь

В `checkExecutionBudget` до построения obligations выполняется:

```js
if(ACTIONS.some(a=>BigInt(n.gasUnits[a])>head.gasLimit))
  return wait('blockGasBound');
```

Минимальное воспроизведение не требует on-chain draw: профиль валиден, лимит блока равен
30 000 000, текущий `begin` запрашивает 1 000 000, но у неиспользуемого `convert` стоит
30 000 001. Результат проверки текущего `begin` — `ready:false,
reason:'blockGasBound'`. Ни target, ни payer, ни обязательства `convert` в этом вызове не
участвуют.

Последствия шире нового draw: та же ранняя проверка выполняется перед каждым action.
Поэтому frozen Short, которому нужны только `processShort` и `finishShort`, не сможет
сделать следующий send из-за лимита `convert`, `pay` или любого другого чужого метода.
Монотонное сохранение observations делает такой стоп устойчивым после restart.

Минимальная правка: сначала построить obligations/current extra, получить множество
реально учитываемых actions и сравнивать с block gas limit только их. Текущий action также
обязан входить в множество. Это сохраняет fail-closed поведение, если в блок не помещается
именно нужный `processShort`/`finishMonth`, но не связывает независимые workers случайным
максимумом всего профиля.

Минимальные regressions:

1. Frozen Short с допустимыми `processShort`/`finishShort` продолжает работу, когда
   неиспользуемый `convert` выше block gas limit.
2. Тот же frozen Short получает `blockGasBound`, когда выше лимита именно требуемый
   `processShort` или `finishShort`.
3. Начальный `begin` не блокируется завышенным bound чужого prize action.

Альтернатива — объявить весь профиль недействительным на старте, если хоть один action
выше текущего block limit. Но тогда это должен быть явный config error до state migration,
а не вечный runtime wait. Для цели «сохранить completion frozen draw» проверка только
релевантных actions выглядит точнее.

## Учёт действий и balances

В проверенных переходах пропуска или двойного счёта я не нашёл:

- у нового кандидата `begin=1` только до active state; оставшиеся publish считаются через
  `ceil((total-published)/chunkSize)`;
- будущих process ровно столько, сколько уже созданных chunks плюс будущих publications;
- `seal=1` и `finish=1`, а current action уже входит в этот путь, поэтому `extra` для него
  правильно не добавляется;
- у frozen draw берутся `chunkCount-nextChunk` и один finish; оплаченный при seal RNG не
  прибавляется повторно;
- до seal текущего кандидата controller получает отдельное требование `fee+nativeFloor`;
- одинаковые publisher/executor/prizeExecutor схлопываются в один address, суммы
  складываются, buffer добавляется один раз;
- optional action добавляет собственную стоимость поверх всех frozen obligations.

Это подтверждает внутреннюю арифметику модели, но не доказывает верхние gas bounds.
Особенно важно, что общего contract-level `MAX_N` участников сейчас нет: есть chunk cap
64, но число chunks не ограничено продуктовым пределом. Поэтому профиль с одной цифрой
на `processShort` или `processMonth` пока является операторской гипотезой, а не доказанным
completion bound.

## Чужие UNFROZEN preparations

Исключение чужой незамороженной подготовки согласуется с описанной границей: пока draw не
frozen, обязательства выдать приз ещё нет; на каждом её собственном send forecast
пересчитывается, а перед seal в расчёт уже попадают все frozen draws. Это защищает именно
completion уже принятых обязательств.

Цена такого решения должна оставаться явной: две подготовки могут потратить native и
оставить одну из них надолго до seal. Модель не обещает заранее зарезервировать завершение
всех начатых, но ещё unfrozen кандидатов. Для текущего scope это не дефект; менять это
стоит только если продукт решит считать active preparation таким же обязательством, как
frozen draw.

## Unknown, state и migration

Пути продолжить после неизвестной отправки через `LOCAL_BUDGET_WAIT` не видно:

- budget wait возникает на stage `estimate`, до durable intent и broadcast;
- после успешного `before` действует уже зафиксированный commit point;
- hashless/hash pending разрешается до workers, а migration при pending запрещена;
- changed settings не меняют identity и не запускают send до reconciliation;
- pending хранит network hash, settings и observations исходной политики;
- ошибка сохранения до intent не отправляет tx; ошибка записи после broadcast оставляет
  старый marker и требует reconciliation.

Provider/runner fix из `bd43d2a` закрывает прошлое замечание: все три signer roles и
исходные contract runners проверяются до state/read/send. Именованные roles теперь входят
в budget identity. Abort после успешного сохранения intent явно трактуется как committed
send, что соответствует фактической границе и покрыто тестом.

Монотонные `gasObservations` сами по себе консервативны: высокий estimate повышает будущую
потребность, низкий её не снижает, а нехватка средств остаётся resumable после пополнения.
Помимо найденной глобальной block-limit связи, это может дать дорогой, но ожидаемый
`nativeFunding` wait. В production позже понадобится управляемая версия/перекалибровка
модели, а не ручное удаление state; для локального пакета это пока честно обозначенное
ограничение.

## Минимальная калибровка перед funding/refill

Сначала нужно назвать кандидатный эксплуатационный предел общего `N`/числа chunks:
сейчас «максимально допустимый dataset» не определён. Без этого невозможно превратить
измерение в bound.

Достаточный следующий пакет — не новый keeper framework, а четыре сценария на выбранном
верхнем envelope:

1. Short отдельно на верхних `N`, budget/prize count и 64-элементных chunks.
2. Monthly отдельно на том же верхнем числе chunks.
3. Оба draw одновременно frozen; оба порядка seal/seed delivery, включая задержку seed.
4. Restart после каждого process chunk при балансе около forecast boundary; отдельно
   один намеренно низкий исходный gas bound, чтобы проверить рост observation и resume.

Для каждого action достаточно записывать estimateGas, receipt.gasUsed, calldata bytes,
effective gas price/фиксированную extra fee, block gas limit, число оставшихся tx и
фактическую дельту native по каждому payer/controller. Нужны максимум и запас
`configured bound / observed max`, а не только среднее. Для process стоит включить seeds,
дающие разные ветви результата. После этого можно выбрать safety margin и уже отдельно
проектировать источник refill, пороги и отказные сценарии.

## Выполненные проверки

- `npm test` — **263/264**, fail 1, 589 s. Единственное падение — старый большой
  scheduler integration с `Scheduler state locked`; budget/coordinator tests прошли;
- точный упавший сценарий отдельно — **1/1**, pass. Весь `local-scheduler.test.cjs`
  повторно — **9/10** с тем же intermittent lock, но уже в другой последовательной точке;
  два первых сценария с диагностикой open/unlink — **2/2**. Поэтому полный baseline
  зелёным не называю: это отдельная timing/liveness нестабильность lock-теста или среды,
  не воспроизведённая ошибка budget math;
- минимальный самостоятельный probe для нерелевантного `convert > blockGasLimit` —
  воспроизведён `blockGasBound` на допустимом `begin`;
- `git diff --check f222a8c..78e2a62` — ошибок нет;
- пользовательский `docs/INDEPENDENT_AUDIT_2026-09-19.md` не изменялся.

## Итог

После узкого исправления relevant-action block check модель можно калибровать на выбранном
верхнем envelope. Остальная inspected логика budget grouping, frozen priority,
unknown/restart и migration не дала нового safety-блокера. Но до появления явного
операционного cap по dataset и измеренных bounds это всё ещё хороший local forecast, а не
production-гарантия физического завершения.
