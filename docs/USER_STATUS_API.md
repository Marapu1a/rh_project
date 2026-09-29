# Read-only API покупок и билетов

29.09.2026. Реализован локальный HTTP endpoint поверх indexer snapshot и существующего
replayAttempts. Награды/выплаты добавлены наблюдением vault на высоте снимка. Frontend и публичный hosting ещё не подключены.

```powershell
node scripts/user-status-api.cjs CONFIG.json 8787
```

CONFIG — тот же полный scheduler/indexer config. Сервер слушает только127.0.0.1.
`GET /v1/wallets/0xADDRESS?offset=0&limit=25` (limit1..100).
Локальный адрес после запуска: http://127.0.0.1:8787/v1/wallets/0xADDRESS
Для публичного размещения нужен отдельный reverse proxy/service deployment; здесь
не открывается внешний порт, не подключается RPC или signer. Методы записи дают405.
Плохая query даёт400, неизвестный route404, недоступные данные503. Cache-Control:no-store.

## Содержание

- balances.SHORT/MONTHLY: mintedTotal, open, frozenByDraw, consumedTotal и byEpoch,
  если доступен. Расходованные попытки берутся из lifecycle, не из minted BUY totals.
- carryRaw, entryThresholdRaw, quoteDecimals: целые raw units, не округлённые доллары.
- purchases: постраничный список decoder-кандидатов с доказанным payer данного
  кошелька, hash/block/log, status/reason, учтённой суммой и начисленными attempts.
  Не все неподдержанные операции имеют доказанный payer: отсутствие в списке НЕ
  означает «покупка проверена и отвергнута». Это не поиск произвольной транзакции
  в сети и не endpoint pending receipts.
- provenance: chain/anchor, processed head/hash, manifestHash, ledgerHash,
  время успешного снимка и возраст, indexerState и наблюдавшийся targetBlock.
  RPC URL, config целиком, файлы журналов и ключи не выдаются.

## Свежесть и доверие

Checksum и config identity обязательны, policy должна быть admitted. Исходные blocks
заново проходят replayAttempts; head и buyLedgerHash сверяются с сохранёнными.
observed означает достаточно свежий успешный локальный снимок, НЕ свежую RPC-проверку
каноничности, контрактную финальность или разрешение freeze.

Если снимок устарел либо indexer ждёт — status=stale, прежние балансы сохраняются
с возрастом. observedAt сохраняется на успешном index.index, отдельно от времени
сообщения о сбое. Старый формат без observedAt показывается stale до следующего sync.
Если файла нет, config/checksum/replay неверны или policy unadmitted — status=unavailable,
balances/purchases=null, HTTP503. Нули возможны только для отсутствующего кошелька
в корректно пересчитанном снимке и относятся строго к указанной высоте.

Это read-only наблюдение доверенного проектного индексера. Checksum не доказывает
честность оператора. Самостоятельное воспроизведение исходных данных по RPC остаётся
отдельной проверкой. JSON загрузка и replay линейны; performance/load qualification,
ограничения публичного proxy и supervisor пока впереди.

## Проверки29.09

Адресно8 различных сценариев прошли: расширенный admitted scheduler/оба draw/API
(32.2s), policy publication+cache reorg+unstarted job (9.6s после исправления fixture),
6соседних indexer tests (1.5s). API проверен после terminal обоих draws: open0,
consumed1 отдельно Short/Monthly; stale сохраняет balances, пропавший файл даёт503/null,
невалидная page limit400, POST405, GET200.

Команды:
- `node --test --test-name-pattern="persistent indexer feeds|policy publication reorg" test/cutoff-scheduler.test.cjs`
- Повтор исправленного fixture: `node --test --test-name-pattern="policy publication reorg" test/cutoff-scheduler.test.cjs`
- `node --test test/persistent-buy-indexer.test.cjs`

В первом прогоне reorg fixture использовал hardhat_mine и не прошёл проверку
непрерывности ещё до целевого сценария; заменён последовательным evm_mine.
После реального отката policy/cache сохранённый job получает явный policy mismatch:
нет отправки и изменения artifact. Это осознанная остановка спорного unstarted job,
не автоматическое восстановление произвольной переорганизации финализированной истории.
Solidity не менялась; тесты использовали compiled artifact с SHA256. Не full/live/fork.

## Награды и выплаты (29.09)

Ответ теперь содержит rewards с отдельной pagination (те же offset/limit), vault и
coverage. Каждая запись: drawId, winner, asset, amountRaw, status assigned/paid,
assignment и payment с transactionHash/blockNumber/blockHash/logIndex.
Assigned означает обеспеченную награду в завершённом vault draw; paid требует
успешного RewardPaid с точной суммой и адресом. Нулевой reward без события не считается
доказательством выплаты. Mempool/отправленная неизвестная транзакция не выдаются за paid.

Индексер читает события только закреплённого lifecycle.vault, проверяет reserve →
assign → finalize → pay и суммы, затем сверяет изменившиеся draws и reward историческими eth_call
на том же blockTag, продолжая проверенный checkpoint. Первичная проверка и audit читают все записи. Код vault проверяется существующим scanner по закреплённому hash.
Новый snapshot публикуется только после всех проверок и проверки стабильности ветки.
API пересчитывает события из сохранённых receipts и сверяет сохранённую проекцию;
сам HTTP endpoint не ходит в сеть и не отправляет Claim.

Старый snapshot без rewards даёт rewards=null до нового sync. При устаревании награды
остаются видны с общим status=stale и as-of высотой; отсутствие новой выплаты в таком
снимке не значит, что её не было после этой высоты. При ошибке чтения storage индексер
сохраняет предыдущий хороший snapshot. Нет наград в полном снимке → пустой список,
не вывод «кошелёк проиграл все розыгрыши». Глобальный список draws/исходов пока не API.

Это проверка accounting vault, не независимое доказательство RNG/правомерности выбора
победителя. История должна начинаться до относящихся к проекту reserve событий. Рост
числа historical calls ограничен затронутыми событиями при обычном продолжении; полный
аудит/reorg остаются линейными. Production нагрузка ещё не измерена.

Проверки reward-пакета29.09: `node --test --test-name-pattern="persistent indexer feeds" test/cutoff-scheduler.test.cjs` —1passed/34.4s;
`node --test test/reward-observation.test.cjs test/persistent-buy-indexer.test.cjs` —8passed/1.4s;
`node --test --test-name-pattern="profile catalog" test/test-launcher.test.cjs` —1passed.
Итого9 продуктовых адресных сценариев +catalog. Existing compiled artifact/SHA256,
не full/live/fork. Сырые логи.local/logs/rewards-api-*.log.

## Reward checkpoint (29.09)

Reward snapshot содержит checkpoint(schema/vault/number/hash) и verification(mode/storageCalls).
Продолжение разрешено только при совпадении vault и hash checkpoint в проверенной ветке.
На продолжении применяется новый хвост событий, historical storage проверяется только
для затронутых draws и rewards. Даже поздний Claim старого приза вызывает повторную
проверку этого draw и этой награды. Новый paid по-прежнему требует event+storage.
Неизменившиеся записи наследуют предыдущую проверку, а не объявляются заново прочитанными.
API coverage теперь vault-events-and-checkpointed-storage.

При выявленном indexer reorg checkpoint сбрасывается и выполняется полный аудит текущей
ветки. Старый snapshot без checkpoint также проходит полный аудит один раз. Нет частичных
undo-журналов: редкий reorg намеренно дороже обычного poll. Ошибка не меняет старый snapshot.
Условия корректности: закреплённый immutable vault runtime, полная история событий,
проверенная каноническая ветка; checksum не заменяет доверие к локальному оператору.

`node scripts/persistent-buy-indexer.cjs CONFIG STATE audit` принудительно пересчитывает
и читает весь reward accounting до высоты текущей порции indexer. Это не автоматический
scan всей сети и не гарантия catch-up за один вызов. API функция fullRewardAudit=true
даёт тот же режим. Независимый аудит с пустым STATE заново читает исходные RPC evidence.

Нагрузочная модель120draws/1200rewards: первый проход1320storage calls; без событий0
(в том числе новые пустые блоки); поздняя выплата2; full audit/reorg1320. Это подсчёт
вызовов с mock RPC, не live latency/цена/SLA. Полные BUY replay/JSON и API event replay
по-прежнему линейны по памяти/CPU/диску. Reward error всё ещё задерживает новый общий
снимок; старые frozen execution paths независимы от него.

Checkpoint проверки29.09: `node --test test/reward-observation.test.cjs test/persistent-buy-indexer.test.cjs` —9passed/2.9s;
`node --test --test-name-pattern="persistent indexer feeds" test/cutoff-scheduler.test.cjs` —1passed/34.8s после детерминизации payout fixture;
`node --test --test-name-pattern="120 draws" test/reward-observation.test.cjs` —1passed/2.9s после добавления empty-extension assertion.
Итого10 разных адресных сценариев. Первый integration run выявил ошибочное предположение
теста о выигрыше при seed0, а не storage mismatch. Контракты не менялись; использован
существующий compiled artifact/SHA256. Не full/live/fork.


## Подготовленный снимок API и замер 29.09.2026

HTTP server использует один `createReader(config)` с копией конфигурации. На каждом
запросе проверяется generation файла: dev/ino/size/mtimeNs/ctimeNs. Новая версия
проходит checksum, config identity, admission, BUY/lifecycle replay и reward event
projection до публикации в память. Дескриптор проверяется до/после чтения, путь —
после подготовки: замена во время загрузки даёт unavailable и повторную попытку
на следующем запросе. В памяти остаются индексы по кошелькам и provenance, а не raw blocks.
Ответ клонируется, чтобы вызывающий код не изменил кэш.

Возраст вычисляется заново каждый запрос: кэш не продлевает observedAt. Waiting
снимок выдаёт stale с прежними as-of данными. Missing/невалидный новый файл сбрасывает
кэш и даёт unavailable/null/503, а не старое observed или нулевой баланс. Recovery
автоматический. Restart заново проверяет файл. Пагинация/coverage/HTTP schema сохранены.

Это доверенный локальный single-writer файл на обычной файловой системе с atomic rename.
Metadata не защищает от злонамеренного оператора/подмены с сохранением metadata;
checksum не является подписью. Замена сразу после stat видна на следующем запросе:
ответ — наблюдение конкретной версии, не транзакционная гарантия последнего состояния.
Не предназначено для сетевого/synced volume. `walletStatus` остаётся uncached one-shot API.
`reader.metrics()` возвращает loads/hits/failures/loadMs/stateBytes без нового public endpoint.

Команда: `node scripts/measure-status-api.cjs`. Windows, один процесс; пять uncached
чтений, одно cold и 1000 warm чтений разных адресов. Synthetic non-BUY tx/блоки над
сохранённым legacy fork evidence, admission выставлен fixture; не живой Infinity,
не месячная нагрузка и не benchmark RPC/indexer end-to-end. Warm преимущественно
проверяет неизвестные адреса; стоимость крупных ответов отдельно не квалифицирована.

| Блоки | JSON bytes | Uncached mean ms | Cold ms | Warm mean ms |
|---|---:|---:|---:|---:|
| 13 | 88136 | 21.82 | 18.64 | 0.062 |
| 1013 | 1988136 | 168.42 | 151.55 | 0.059 |
| 5013 | 9588136 | 695.91 | 721.27 | 0.056 |

Вывод: повторный полный replay больше не нужен каждому HTTP запросу. При смене
snapshot синхронная загрузка всё ещё блокирует HTTP event loop; весь indexer scan,
JSON hash/read/write и replay остаются линейными. Миграция БД этим замером не обоснована.
Следующий ограниченный шаг: подготовка новой версии вне HTTP event loop с теми же
проверками поколения/ошибок, затем измерение длительности реального admitted indexer
по добавленным metrics. Не называть сервис production-ready по тёплым чтениям.

Адресные проверки29.09: `node --test test/user-status-cache.test.cjs test/persistent-buy-indexer.test.cjs`
—10passed; `node --test test/reward-observation.test.cjs` —3passed (в составе первого
совместного прогона); `node --test --test-name-pattern="persistent indexer feeds" test/cutoff-scheduler.test.cjs`
—1passed/35s, существующий compiled artifact+SHA256. Catalog —1passed.
14 разных продуктовых сценариев +catalog, не полный baseline и не live/fork.
Проверены одинаковый размер atomic replacement, aging, waiting, corruption/missing,
restart/config mismatch, 20 параллельных HTTP запросов до/во время outage, response
mutation, checksummed ledger/policy/rewards mismatch. Замер не заменяет эти проверки.


## Worker isolation (следующий пакет 29.09.2026)

Описанное выше синхронное ограничение HTTP устранено: createServer теперь использует
createAsyncReader. Один worker_threads worker содержит createReader и prepared Maps;
в HTTP-поток возвращается только ответ одного кошелька. Main не получает полный raw
JSON/Maps и не выполняет history replay. Прежние синхронные API сохранены для one-shot
чтений и измерений. Конфигурация фиксируется копией при создании.

Первый запрос/новая версия ждёт подготовки, но другие HTTP routes и main event loop
продолжают работать. Не более64 outstanding запросов; лишние сразу unavailable/503.
30s timeout включает очередь, исполнение и parent stat. Timeout/error/exit завершает
все pending как unavailable и уничтожает worker; следующий запрос создаёт новый.
Closed reader не перезапускается; server close завершает worker. Нет бесконечной
очереди или выдачи старого observed во время отказа. Не вводится новый статус loading:
штатный запрос ожидает, перегрузка/ошибка остаются существующим unavailable.

Worker проверяет generation до/после подготовки. Перед передачей HTTP ответа main
асинхронно проверяет generation ещё раз: снимок, сменившийся во время передачи,
даёт unavailable. Это не гарантия отсутствия изменений после последней проверки.
Возраст рассчитывается в worker при обслуживании запроса, не при его постановке
в очередь. Prepared snapshot и trust boundary single local writer прежние.

Cold по-прежнему линейный; очередь wallet reads во время загрузки ждёт. Публикация
снимков быстрее их подготовки может давать unavailable; больших ответов serialization
и сетевого backpressure этот пакет не квалифицирует. Worker не делает indexer scan/JSON
инкрементальным и не является новым process supervisor или production deployment.

Измерение `node scripts/measure-status-worker.cjs`: synthetic legacy5013blocks,
cold867.9ms;10ms timer main потока сработал55раз, max gap16.03ms;
100 warm запросов известного кошелька: mean round-trip0.269ms. Это включает worker
message и async stat, несопоставимо напрямую с прошлым in-process0.056ms.
Не Infinity/RPC/месячная нагрузка и не SLA.

Проверки: `node --test test/user-status-cache.test.cjs` —8passed/3.1s;
`node --test --test-name-pattern="persistent indexer feeds" test/cutoff-scheduler.test.cjs`
—1passed/35.2s (existing compiled artifact+SHA256).9 адресных сценариев, не full/live/fork.
Дополнены responsiveness с5000 unrelated tx, bound pending, timeout/повторный запуск,
close, freshness/recovery и детерминированная замена файла при доставке ответа.
Следующий шаг — эксплуатационный service/runbook и реальные indexer metrics; не новая
перепись хранения без измерений. Public sends по-прежнему закрыты.
