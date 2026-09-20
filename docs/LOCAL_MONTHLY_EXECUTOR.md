# Локальный Monthly executor и совместный BUY-контур

19.09.2026. К существующему Short worker добавлен отдельный Monthly worker.
Контракты, funding/distribution математика и схема случайности не менялись.

Результат 19.09: `local-buy-cycle`, `local-controllers`, `monthly-epochs`,
`monthly-replay` — **17/17 passed** (~168 s). Основной список остаётся 176;
полный объединённый набор в этом шаге не повторялся.

## API

`scripts/local-monthly-executor.cjs`:

- `makeMonthlyJob(artifact, chunkSize=64)` — job из результата Monthly builder v4.
- `stepMonthly(options)` — максимум одна подтверждённая транзакция.
- `runMonthly(options, {maxSteps, onStep, signal})` — до ожидания/terminal/лимита.

Options те же, что у Short: provider, source, job, publisher, executor, необязательный
gasPrice (верхний предел). Прогресс восстанавливается по цепи, job не хранит seed/nonce
или локальный nextChunk. Чужой controller, chainId, подмена checksum, request/policy
или опубликованного префикса останавливают исполнение.

| Состояние | Действие |
|---|---|
| None | Ожидание monthly interval/роли/свободного слота, затем beginMonth |
| Publishing | Следующая порция publishMonth от publisher |
| Ready | Полная проверка публикации, readiness и симуляция sealMonth |
| WaitingSeed | Ожидание того же запроса, без повторного RNG request |
| Processing | Порции из публичного calldata; сверка winner/admitted/processed с независимым результатом |
| Готов результат | Permissionless finishMonth |
| Terminal | Проверка resultHash, выход без транзакции |

Симуляция seal учитывает direct USDG и не меняет цепь. Недозаполненный Next даёт
`waiting: nextStartFunding`, пустой Current — `currentFunding`. Неподходящая цена газа,
provider readiness, роль, schedule и pending-транзакция signer также дают явное ожидание.
Ошибки RPC/request не превращаются в no-win и не запускают rebroadcast.

Один worker обслуживает один job. Кошелёк publisher нужен только до готовности списка;
другой executor может продолжить process/finish без него. Short и Monthly продолжаются
независимо, насколько позволяют их собственные readiness и общий ресурс signer.

## CLI

Общий `scripts/run-local-promo.cjs` выбирает Short/Monthly по schema job. Старый
`scripts/run-local-short.cjs` сохранён как совместимый entrypoint, не дублирует CLI.
Только loopback HTTP, chainId 31337, unlocked accounts. Нужны уже существующие
локальный deployment, ABI compiled.json и job именно этого deployment.

```powershell
npm run local:monthly -- --job .local/monthly-job.json --rpc http://127.0.0.1:8545 --publisher 0 --executor 1 --watch
```

`npm run test:local:monthly` — автономный тест стенда; это тот же расширенный
`local-buy-cycle.test.cjs`, не дополнительная копия в основном test suite.

## Сквозной сценарий

История состоит из настоящих локальных транзакций упрощённого venue и registry.
Scanner получает блоки/receipts через локальный HTTP RPC, оба builders используют
один lifecycle v4 с независимым расходом Short/Monthly attempts.

1. Два кошелька получают 1 и 2 билета. До регистрации BUY не учитывается.
2. Short 1 и Monthly 1 фиксируют эти диапазоны. Monthly ждёт seed, Short завершается.
   Поздний BUY остаётся OPEN для следующих draws обоих видов.
3. Monthly 1 выигрывает: frozen F назначается победителю, старый Next T переходит
   в Current, новые поступления A сохраняются. Долг не выплачивается сразу.
4. Новые покупки дают второму Short диапазоны 2–3 и 3. Short 2 завершается независимо
   от невыплаченного jackpot. Monthly сохраняет свои новые диапазоны.
5. Monthly 2 сначала ждёт расписания, затем заполнения Next. Targeted funding
   оставляет недостающей 1 raw unit; прямой GENERAL transfer заполняет её при seal.
   Отказ request не признаёт перевод и не оставляет frozen draw.
6. Monthly 2 получает no-win: Current становится F + новые поступления, Next остаётся
   заполненным. Все 6 Short и все 6 Monthly attempts двух кошельков расходованы ровно
   своими двумя draws. Пустой третий Monthly builder не создаёт draw.
7. Старый jackpot после второго Monthly всё ещё выплачивается в полном объёме.

Проверены restart между порциями, смена исполнителя, terminal reorg/retry с тем же seed,
ожидание seed без нового request, повтор terminal без новой транзакции, высокая цена
газа, provider failure, next funding, обе CLI в отдельных процессах и conservation USDG.

## Границы

Это локальный single-job контур, не production scheduler/indexer. Автоматическое создание
новых jobs, выбор cutoff, закрытие пустых draining epochs и мониторинг инфраструктуры
не добавлены. Пустой текущий набор отвергает builder; будущий scheduler должен ждать
новых entries без расхода бюджета. Старые empty-epoch механизмы остаются в компонентах.

Тестовый RNG подбирает seed с win/no-win только для покрытия обоих исходов; worker
seed не выбирает и не доставляет. Venue упрощённый, деньги технические raw units.
Нет нового PAIR fork, production drand binding, finality или доказательства полноты
snapshot. Ограничения конкурентных процессов, mempool recovery и цены постоянного
пересчёта те же, что у [Short worker](LOCAL_SHORT_EXECUTOR.md).

## Ограниченное ожидание транзакции

Receipt ожидается не дольше 30 секунд; library option `receiptTimeoutMs` допускает
1–300000 ms. Timeout завершает запуск с ошибкой и hash транзакции; автоматической
повторной отправки нет. AbortSignal/SIGINT прекращает ожидание, но отправленная
транзакция всё ещё может подтвердиться. Перед повтором проверить её состояние;
после подтверждения worker продолжает с on-chain progress. Это не durable mempool journal.

До begin проверяется возраст cutoff в предполагаемом следующем блоке: текущий
возраст 255 ещё допустим, 256 уже отвергается. При задержке включения окончательную
проверку всё равно делает контракт. Регрессии: `npm run test:local:stability`.

20.09: подготовку новых jobs и очередность локальных циклов теперь выполняет отдельный
[планировщик](LOCAL_PROMO_SCHEDULER.md). Сам worker остаётся исполнителем одного job.
