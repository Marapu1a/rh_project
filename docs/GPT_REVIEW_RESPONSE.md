# Постоянный ответ GPT

Обновлено: 20.09.2026.

Это независимое review-мнение, не задание на автоматическое исполнение. При следующем
обращении файл следует полностью перезаписать.

Просмотрен commit `e537b9cf181eda2736ff07a90bcd063c16eb7aed` —
`Clear stale transaction context and stop scheduler on unknown outcomes`.

## Короткий вердикт

Узкое исправление принимаю. Подтверждённый в прошлом review stale transaction context
устранён: завершённый intent больше не приклеивается к следующей read/callback error,
а последняя подтверждённая операция хранится отдельно в `lastConfirmed`. В scheduler
Short, Monthly и `closeEmpty` теперь проходят через общую transaction boundary; unknown
broadcast/receipt и неклассифицированная coded RPC error прекращают все последующие
kinds/ticks текущего запуска. Новых continuation paths после unknown outcome я не нашёл.

Изоляция known rejection не сломана: только доказанный read-only estimate revert либо
receipt status 0 именно исходной tx считаются definite rejection. Такой Short failure
может пропустить Short и дать независимому Monthly продолжиться; неясный broadcast,
timeout или receipt/RPC outage этого разрешения не получает.

Блокирующих замечаний к commit нет. Денежная математика, custody и Solidity в этом шаге
не менялись; предыдущая оценка назначения активов и legacy-границ остаётся в силе.

## Stale context исправлен корректно

После confirmed receipt код сначала формирует `lastConfirmed`, затем очищает `current` и
только потом вызывает `onStep`. После обработанного definite rejection `current` также
очищается до callback. Outer catch больше не использует hash предыдущей успешной tx как
fallback.

Это даёт нужные различия:

- read error после confirmed `collect` возвращается без ложного `action`/tx hash, а
  подтверждённый collect остаётся в `lastConfirmed`;
- callback error после success не превращает успешную tx в неизвестную;
- callback error после definite rejection сохраняет failure, но не создаёт ложный
  confirmed/unknown intent;
- настоящая ошибка `sendLocalTransaction` по-прежнему несёт собственные `stage`, `code`
  и, когда он известен, hash исходной tx.

Иными словами, evidence неизвестного send не потерян, но больше не смешан с историей
последней подтверждённой операции.

## Scheduler: stop и независимость видов

Переход Short/Monthly/`closeEmpty` на `sendLocalTransaction` закрывает прежний разрыв:
ошибка broadcast теперь не выглядит как обычный локальный exception, а receipt wait имеет
единый timeout/abort контракт.

В `runScheduler` после non-definite ошибки с `stage` или `code` происходит немедленный
return из всего scheduler, поэтому:

- Monthly не запускается после unknown Short send;
- после unknown Monthly не начинается следующий Short tick;
- последующие ticks того же запуска также невозможны;
- `haltedKind`, `requiresReconciliation`, `code`, `stage` и доступный tx hash остаются в
  результате;
- CLI печатает kind-specific `code`/`stage`/hash и завершает работу с ошибкой.

Для `LOCAL_EXECUTION_STOPPED` scheduler также выходит сразу. Abort до broadcast имеет
`stage=estimate` и не требует tx reconciliation; abort после broadcast сохраняет hash и
не разрешает продолжение.

Known estimate rejection остаётся изолированным намеренно. Это безопасно именно потому,
что estimate read-only и broadcast ещё не выполнялся. Receipt status 0 исходной tx тоже
является определённым rollback. Остальные `CALL_EXCEPTION`, nonce/network/timeout и
replacement-неопределённости не получают такого послабления.

Обычные local validation failures без coded RPC/tx evidence по-прежнему могут быть
изолированы по виду. Это сохраняет прежнюю модель, где плохая конфигурация Short не
лишает Monthly независимого прогресса, и не ослабляет unknown-границу.

## Bound `123 <= 128`

Вынесенные `MAX_LEGACY=8`, `DEFAULT_MAX_STEPS=128` и import-time assertion согласованы с
текущей schema/control-flow. Ручная формула консервативна: она считает максимум tx attempts
для двух distribution-проходов, source collect/harvest и convert/forward всех допустимых
converter. Замена converter на USDG-only vault может добавить sync, но одновременно
убирает более дорогие converter operations, поэтому bound не занижен.

Maximal-legacy integration действительно строит восемь старых converter плюс active
converter и два current project recipient и завершает pass при default limit. Обычного
воспроизводимого starvation при текущих schema limits я не вижу.

Это не решает известную общую проблему маленького debug `maxSteps` и отсутствия durable
phase cursor. Формула остаётся ручной: любое изменение числа фаз, повторов, recipients
или разрешённых операций должно менять формулу и maximal test вместе.

## Независимая проверка

Повторный полный запуск `npm test` прошёл **240/240**, `fail 0`, примерно 536 s. Внутри
него прошли новые stale read/callback regressions, maximal legacy case, unknown Short
broadcast/receipt, unknown Monthly без следующего Short tick и definite estimate rejection
с продолжением Monthly. Отдельный `test/local-scheduler.test.cjs` прошёл **10/10**.

Первый полный запуск дал **239/240**: один старый scheduler integration единожды встретил
существующий `.lock` собственного временного state-файла. Тот же тест отдельно, весь
scheduler-набор и затем полный набор прошли; устойчивой логической регрессии или
повторяемого lock leak я не получил. Поэтому это не считаю finding текущего commit, но
результат первого запуска не скрываю.

## Остающиеся границы

- Это всё ещё local-only execution на chainId 31337 и `LOCAL_HEAD`, не production
  finality/journal/supervisor.
- Trusted legacy list и getter bindings не являются code/implementation attestation.
- TOKEN credit старому USDG-only vault диагностируется worker'ом, но публичный внешний
  `pay` по-прежнему может физически отправить туда TOKEN.
- Реальные PAIR/DEX, price guard, deployment verification и production RNG не проверены
  этим commit.
- `lastConfirmed` — удобная телеметрия одного pass, не durable transaction journal.

## Следующий разумный пакет

Следующий узкий пакет — совместный локальный coordinator денежного `prize-flow` и draw
scheduler, без попытки сразу построить production framework.

Критерии готовности:

1. Один процесс сериализует write intents обоих контуров для общих signer/nonce; два
   worker не отправляют транзакции параллельно.
2. Unknown broadcast/confirmation в любом контуре останавливает оба контура и возвращает
   kind/worker, action, stage, code и доступный tx hash. До reconciliation новых sends нет.
3. После подтверждения исходной pending tx restart восстанавливается из on-chain state и
   существующего scheduler state без повторной выплаты, swap, forward, freeze или begin.
4. Definite rejection одного независимого действия не превращается в глобальный unknown:
   действующие правила изоляции Short/Monthly и recipients сохраняются явно.
5. Интеграции покрывают общий signer, unknown сначала в draw и сначала в prize-flow,
   restart после mined original tx, abort и отсутствие nonce collision/double send.

Project gas budget можно считать следующим отдельным пакетом после coordinator. Live DEX,
production finality и весь backlog не являются prerequisite этого локального шага.
