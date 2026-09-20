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
