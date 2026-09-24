# Локальный планировщик Short и Monthly

20.09.2026. Соединяет scanner/replay/builders с существующими workers. Контракты,
денежная математика, расписание и RNG не изменены. Только chainId 31337 и loopback HTTP.

## Проход по системе

`BUY history → replay → нужная epoch → сохранённый job → begin/publish/seal → ожидание RNG → process/finish → следующий цикл`.

Каждый проход продвигает Short и Monthly максимум на одно действие каждого вида.
Ожидание/ошибка одного вида не мешает попробовать другой в том же проходе.
Библиотека повторяет проходы, пока есть прогресс, но не более maxTicks (по умолчанию 32).
Затем watch может запустить следующий проход. Источник seed планировщик не вызывает.

Перед новым job проверяются schedule, отсутствие чужой подготовки/pending draw, publisher,
pending nonce, текущая/draining epoch. Правила и шаблон берутся из соответствующей on-chain
policy, а не из устаревшего JSON. Builder выбирает OPEN только нужной версии, старую первой.
Short budget — явно заданное фиксированное число конфигурации; это локальная настройка,
не принятая production формула D. Проверяются минимальная корзина и maxBudget контроллера.

Временно пустой текущий набор возвращает `waiting: empty`, без draw, расхода билетов и денег.
Пустая draining epoch проходит через существующий closeEmpty: snapshot вычисляется из
реальной истории, сохраняется и перед отправкой независимо пересобирается из RPC.
Новые правила планировщик сам не объявляет и не активирует.

## Хранение и повторный запуск

State содержит config hash и историю jobs обоих видов. Полный artifact сохраняется
**до первой отправки**. Запись идёт через временный файл, fsync и rename; ошибка записи
останавливает запуск, не разрешая продолжить отправку с несохранённым новым job.
Это локальная файловая сохранность, не гарантия пережить любой отказ диска/питания.
Checksum защищает от случайной правки, а не от владельца файлов.

### Независимая проверка перед begin (24.09.2026)

Для неначатого Short/Monthly job scheduler под тем же lock повторно загружает
BUY policy на cutoff, полные канонические blocks/receipts до cutoff и lifecycle
history. Целевая epoch выводится из replay, её правила читаются из контракта
на cutoff. Campaign/budget берутся из config, draw/proposal ids детерминированно
восстанавливаются из configHash, kind, epoch и cutoff hash. Поля job не являются
источником этих параметров.

Builder пересоздаёт весь artifact: snapshot/participants/ranges/root/request/rules.
Сравнивается canonical hash полного artifact и Short proposal id. Несовпадение
останавливает этот вид розыгрыша до broadcast, без замены сохранённого artifact
или отметки «проверено». Перед worker повторно проверяется cutoff hash.
Полный replay повторяется при следующей попытке неначатого begin; постоянного
флага, способного пережить reorg или подмену файла, нет.

Если begin уже существует on-chain, нового списка не строим: worker сверяет
сохранённый request и snapshot/root commitments с контрактом и продолжает именно
его. Исчезновение ранее наблюдавшегося begin по-прежнему требует явного recovery.
Путь closeEmpty сохранён. Несостоявшиеся устаревшие/orphan jobs по прежнему правилу
retire без отправки begin; уже frozen нельзя заменить таким способом.

Это защита scheduler/coordinator от согласованной подмены локального job, а не
доказательство честности RPC или защита от злонамеренного publisher с собственным
кодом. Low-level standalone workers сами полную историю не сканируют; обход
scheduler не приобретает эту гарантию. Production publication ещё не разрешена.
Полный scan от anchor может быть дорогим на длинной истории; доказуемый incremental
replay не добавлен. Не маскировать этот предел постоянным checksum-cache.

Прогресс публикации, seed и settlement берутся из контрактов; локальный счётчик шагов
не заменяет цепь. Terminal проверяется worker независимо, отметка проверки привязана
к canonical block. Откат terminal возвращает прежний job в работу, не создаёт новый draw.
История jobs сохраняется; автоматической очистки пока нет.

Если ещё не начатый job потерял canonical cutoff либо cutoff истёк, он помечается retired,
после чего строится свежий. До этого проверяется отсутствие pending tx и чужого active draw.
У опубликованного job возраст cutoff сам по себе не мешает завершению. Исчезнувший после
reorg ранее начатый job требует явного восстановления: автоматического reroll/reset нет.

Если on-chain работа есть, а job-файл потерян, возвращается `missingJob`. Планировщик
не придумывает другой список участников. Нужен исходный artifact/восстановление state.
Существующие public calldata recovery компоненты остаются доступны, но автоматическая
реконструкция всего потерянного scheduler state в этот шаг не включена.

Lock-файл исключает обычный одновременный запуск двух процессов с одним state.
При нормальном завершении, ошибке и обработанном SIGINT lock снимается. После аварийного
убийства процесса lock может остаться: проверить PID в файле и удалить только этот lock,
когда процесс точно остановлен. Автоматической распределённой блокировки и durable
mempool journal нет. Не запускать два разных state-файла для одного publisher/deployment.

## Конфигурация и команды

`scripts/local-promo-scheduler.cjs`: `runScheduler(options, {maxTicks=32, onTick})`.
Options: provider, short, monthly, config, rpcUrl, statePath, publisher, executor, signal.
В конфигурации:

```json
{
  "schema": "local-promo-scheduler-v1",
  "manifest": { "...": "полный существующий direct-buy-v1 manifest" },
  "lifecycle": { "...": "полный существующий attempt-lifecycle-v4 config" },
  "cutoffMode": "LOCAL_HEAD",
  "campaignId": "1",
  "shortBudget": "101",
  "chunkSize": 64
}
```

Это схема полей, не готовый deployment config. Адреса, code hashes и genesis берутся из
конкретного локального развёртывания. Budget указан в raw USDG; 101 в тесте не означает
принятый приз в 101 USDG. Campaign — заданная метка draws; автоматической привязки к
текущей кампании FeeRouter пока нет. Изменение config не принимается поверх чужого state.

```powershell
npm run compile
npm run local:scheduler -- --config .local/scheduler.json --state .local/scheduler-state.json --rpc http://127.0.0.1:8545 --publisher 0 --executor 1 --watch
```

Без watch выполняется один ограниченный запуск до ожидания/лимита. Watch повторяет
через 10 секунд. JSON-строки показывают состояние каждого вида. Ошибка завершает CLI
с ненулевым кодом после обслуживания другого вида в этом запуске; это ещё не supervisor.
Ключи не читаются, используются unlocked accounts локального узла. Цепь должна сама
создавать блоки; планировщик не перематывает время и не майнит блоки за пользователя.

## Явные ограничения

- LOCAL_HEAD выбирает текущую вершину для локального теста. Это **не finality policy**,
  не защита от выбора удобного снимка и не решение привязки к будущему drand round.
- Для нового job история перечитывается полностью; это не incremental indexer.
- Неизвестная или повреждённая история останавливает работу. Независимый replay не
  превращает полноту publisher snapshot в on-chain доказательство.
- Fee funding и collect/harvest запускаются отдельным [revenue worker](LOCAL_USDG_REVENUE.md).
  TOKEN swap и ops refill не добавлены; bootstrap и seed доставляет локальный тестовый стенд.
- Нет автоматической доставки призов кошелькам: существующий permissionless claim
  получает уже назначенный долг и не блокирует следующий draw.
- При контролируемом restart файл позволяет продолжить. Аварийная потеря файла,
  stale lock, неоднозначный broadcast и глубокий reorg ещё требуют recovery/runbook.

## Проверки

`npm run test:local:scheduler`: два Short + два Monthly из реальных локальных BUY,
сохранение до отправки, повторные запуски, пропажа state при pending draw, terminal reorg,
независимость видов, пустые epochs, пустой текущий набор, обновление лишь неначатого cutoff,
funding wait, corruption/config mismatch, lock и ошибка записи без broadcast.
Отдельный CLI-процесс читает state и завершается без лишних транзакций на пустом наборе.
RNG — управляемый fixture; эти проверки не доказывают production fairness.

20.09: `node --test --test-concurrency=1 test/local-scheduler.test.cjs test/local-buy-cycle.test.cjs test/local-executor-stability.test.cjs`
— **11/11**, ~259 s. Лог `.local/logs/local-scheduler-verification.log`.
Полный список теперь 191 тест; весь набор 191 не запускали. Синтаксис новых JS,
локальные ссылки документации и `git diff --check` проверены.

Review 20.09: исправлен повторный begin после reorg с сохранившимся cutoff.
Если started уже наблюдался, а on-chain phase стала None, scheduler требует recovery
при любом возрасте cutoff. [Результаты проверки](AUTOMATION_REVIEW_2026-09-20.md).

## Общая остановка при неизвестной tx, 20.09

Short/Monthly writes и closeEmpty теперь используют общий sendLocalTransaction:
explicit estimate → broadcast → confirm. Definite rejection может остаться локальным
отказом вида; unknown broadcast/receipt немедленно завершает весь runScheduler,
не вызывая следующий kind и не переходя к следующему tick. Неклассифицированные RPC
ошибки с code/stage также консервативно останавливают pass; обычные validation errors
без признаков RPC/tx сохраняют прежнюю независимость веток.

Результат содержит haltedKind, а для unknown broadcast/confirm — requiresReconciliation.
Ошибка соответствующего kind сохраняет code/stage/transactionHash. После глобальной
остановки results может не содержать ещё не вызванный MONTHLY; это не успешный пропуск.
Abort также не разрешает следующую ветку. receiptTimeoutMs доступен library caller;
его значение проверяется до выполнения. CLI по error выходит, не запускает watch заново.

Это не durable latch/journal: новый вызов после crash/unknown требует reconciliation.
Тест возобновления сначала подтверждает исходную pending tx и только затем перезапускает.
Комбинированный coordinator и автоматическое восстановление не добавлены.

## Проверки исправления, 20.09.2026

`node --test --test-concurrency=1 test/local-prize-flow.test.cjs test/local-scheduler.test.cjs test/local-executor-stability.test.cjs test/local-transaction.test.cjs test/local-buy-cycle.test.cjs`
— **42/42**, fail 0, ~380 s. Добавлены 8 регрессий/интеграций; основной набор теперь
**240**, полный запуск 240 не выполнялся. Лог `.local/logs/error-boundary-fixes.log` ignored.

Проверены stale read/callback context после success и definite rejection; максимальный
legacy list; unknown Short broadcast/receipt, unknown Monthly broadcast без следующего
Short tick, definite estimate rejection с продолжением Monthly; restart только после
подтверждения исходной pending tx. Прежние reorg/empty/funding/state/cutoff/abort/timeout
и BUY-cycle также прошли. Денежная математика и Solidity не менялись.

### Проверки pre-begin replay, 24.09.2026

Адресные запуски через `scripts/test-launcher.cjs::runTests`:

```js
runTests({profile:'pre-begin-replay',selection:{compile:true,
  files:['test/local-scheduler.test.cjs']}})
runTests({profile:'pre-begin-coordinator',pattern:'coordinator serializes real prize',
  selection:{compile:true,files:['test/local-coordinator.test.cjs']}})
```

Scheduler 13/13, exit 0, 260.0 s включая compile 17.5 s;
`.local/logs/test-run-6V1o7Q/result.json`.
Coordinator 1/1, exit 0, 41.9 s включая compile 18.3 s;
`.local/logs/test-run-2ZDCb1/result.json`.
Это адресные результаты, не полный baseline проекта; full/fork/live не запускались.

Новое adversarial испытание покрывает Short и Monthly: увеличение ranges, удаление
покупателя, изменение request с пересчитанными root/snapshot/job/state hashes.
Старые валидаторы принимают согласованный artifact, новый gate отклоняет до send;
nonce и bytes файла неизменны. Оригинальные jobs начинают draws, подмена после
begin отвергается chain commitment проверкой. Соседние сценарии покрывают
повторные циклы, closeEmpty, cutoff expiry/reorg, policy activation/finality lag,
завершение frozen после неизвестного adapter и unknown-send остановки.
Syntax, локальные ссылки и git diff --check прошли.
