# Обращение к GPT — relevant-action gas fix

21.09.2026. Прочитай текущий commit и укажи hash. Ответ полностью перезапиши
в docs/GPT_REVIEW_RESPONSE.md. Независимое review, не автоматическое задание на код.

## Изменения после ответа d8fd45c

Подтверждён и исправлен глобальный blockGasBound: проверяем текущий action и только
ненулевые actions построенных obligations. Чужой convert/pay больше не блокирует
begin/process/finish; required finish проверяется заранее, завершённый process исключён.
Gas observations, grouping, native forecast, pending/migration не изменялись.

Новые регрессии вызывают настоящий checkExecutionBudget с моделируемыми chain reads:
begin/frozen с oversized convert, required process/finish, нулевой remaining process,
optional current action и его frozen liabilities. Интеграционные проверки — ниже.

Lock не меняли: отдельный probe прошёл 500 циклов конкурентного отказа, освобождения,
исключения и повторного входа. Это не воспроизводит и не объясняет твой intermittent
scheduler failure; не считать его автоматически исправленным или доказанно проблемой среды.

Следующий шаг уточнён: выбрать кандидатный operational envelope общего N/chunks,
затем измерять. Не называем chunk cap 64 пределом всего dataset.

Просьба: проверь узкий diff; для lock нужен конкретный путь/stack и момент появления
оставшегося файла. Не предлагать force-clear. Предыдущий контекст модели сохранён ниже.

## Контекст и границы

После bd43d2a (provider bindings / abort commit point) пользователь разрешил следующий
ограниченный кусок. Реализованы native forecast и budget gate для локального coordinator.
Solidity, USDG reserves, призовая математика, controller permissions и product shares
не менялись. Только chainId 31337, LOCAL_HEAD, fixed swap fixture, тестовый RNG.

Это OFF-CHAIN guard выбранного исполнителя. Прямой seal и legacy CLI без ops его обходят;
мы не выдаём модель за on-chain guarantee или доказательство физической завершаемости
любого draw. Production enforcement, калибровка на предельных данных, реальные RNG/DEX и
native autorefill по-прежнему не готовы. Отчёт: LOCAL_EXECUTION_BUDGET.md.

## Реализация

- local-execution-budget.cjs: validateOps, integer transactionCost/evaluateBudget и RPC
  checkExecutionBudget. Формула ceil((gasUnits * reserveGasPrice + extraFeePerTx) * safetyBps / 10000).
- По всем frozen Short/Monthly считаются оставшиеся process chunks и finish. RNG уже
  оплачен, второй раз не добавляется. Текущий незамороженный кандидат считает оставшиеся
  begin/publish/seal/process/finish и fee+floor в СВОЁМ controller.
- Другие незамороженные подготовки ещё не считаются обязательствами выдачи призов.
  Перед их seal общий баланс проверяется снова с учётом уже frozen jobs.
- Расходы группируются по адресу, buffer один на payer; native balances разных signers
  и RNG controllers не взаимозаменяются. Prize USDG/TOKEN не используются как ops balance.
- Дополнительный collect/pay/convert/forward требует запаса сверх frozen obligations.
- Budget mode: draw перед prize, внутри каждого scheduler tick frozen перед подготовкой,
  подготовка перед новой работой. Это порядок per tick, не обещание закончить один вид
  полностью прежде чем допустить другой при достаточных средствах.
- AsyncLocalStorage boundary имеет preflight до estimate и повторный check перед intent.
  LOCAL_BUDGET_WAIT — только до broadcast, не unknown. Unknown/abort marker semantics сохранены.
- Balance/controller reads привязаны к одному blockTag, anchor проверяется снова.
- Если estimate выше начальной калибровки, сохраняем повышенную gasObservations[action].
  Наблюдения не уменьшаются и входят в последующие прогнозы. Низкая старая оценка не должна
  делать finish навсегда запрещённым: после пополнения можно продолжить. Это не доказывает
  upper bound будущего call при другом seed/state.

## Identity, settings и CLI

Ops schema local-execution-budget-v1. Network model задаёт id/chain/nativeDecimals,
LOCAL_EIP1559 либо LOCAL_EIP1559_EXTRA, reserve gas price ceiling, fixed extra fee,
начальные gas units по методам, safety factor и buffer. Это локальные модели, не live L2 oracle.
Settings (maxGasPrice <= reserve ceiling, receiptTimeoutMs, pollSeconds) отделены от identity.

Budgeted identity включает network model, исходные bindings/jobs/config и именные signer roles.
Legacy prize.pollSeconds/maxGasPrice больше не входят в budgeted identity; effective gas
threshold берётся из ops. ChunkSize старого scheduler по-прежнему фиксирован в его config.

withState допускает миграцию ТОЧНОГО старого config hash на том же path только без pending.
Pending сначала разрешается прежней конфигурацией. Выключение ops, смена model/roles не
являются допустимым изменением settings. Новый path не является recovery.

Pending хранит networkHash/settings/gasObservations; при изменённых settings сначала
reconciliation исходной tx. CLI --ops FILE загружает profile при старте. Без ops остаётся
явный unbudgetedLegacy режим для старых локальных сценариев. Watch проверяет условия
повторно; файл настроек не перечитывается на каждом tick.

## Проверки

2026-09-20: 50/50 targeted tests, 0 failures, 554 s: budget model, coordinator,
transaction classifier, scheduler и executor stability. Полный набор не запускался.
Два модельных профиля, нулевой signer, недофинансированный RNG controller, один бюджет
на два READY draw, защита completion денег от collect, порядок frozen Monthly,
same-file settings/migration, запрет bypass pending и immutable role/model changes.
Дополнительно pending policy snapshot, CLI с ops и завершение draw после низкой калибровки.

## Вопросы

1. Нет ли пропуска или двойного учёта remaining action/current tx/RNG/одного payer?
2. Корректно ли исключение чужих UNFROZEN preparations при повторной проверке перед seal?
3. Есть ли путь потратить completion forecast на необязательные операции или продолжить
   после unknown из-за новой классификации LOCAL_BUDGET_WAIT?
4. Не теряется ли marker/policy при миграции/settings/restart/storage error?
5. Не превращаются ли gasObservations в новый источник starvation/необоснованного admission?
6. Что минимально измерить на больших datasets и одновременных draws до следующего native
   funding/refill пакета? Не строить сразу production registry/keeper framework.

Отличать математическое выполнение текущего forecast от недоказанных production bounds.
Если найдёшь дефект, нужен воспроизводимый сценарий, последствия и минимальная правка.

## Результат проверки фикса

Проверка 21.09.2026: **39/39**, 0 failures, 518 s:

```powershell
node --test --test-concurrency=1 test/local-execution-budget.test.cjs test/local-coordinator.test.cjs test/local-scheduler.test.cjs
```

Полный набор не запускался. Scheduler 10/10; intermittent lock не воспроизведён.
Отдельный локальный probe: 500 циклов overlap rejection / release / exception / reacquire,
без оставшегося lock. Причина наблюдения GPT не установлена, lock implementation не менялась.
