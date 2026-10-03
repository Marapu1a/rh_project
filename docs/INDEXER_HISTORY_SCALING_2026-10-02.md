# Рост истории индексатора: замер и ограничение RPC-кэша

02.10.2026, исходный commit `2038a57`, результат — рабочее дерево поверх него.
[Машинный отчёт](evidence/INDEXER_HISTORY_SCALING_2026-10-02.json) содержит замеры,
счётчики, ledger hashes, окружение и SHA256 исходников до/после.
Production, продуктовые правила и eligibility не менялись.

## Что обнаружено

Scanner уже читает только новый suffix; idle не делает replay. Однако persisted
RPC cache продолжал хранить все исторические blocks/receipts/code/bindings, хотя
canonical prefix отдельно есть в `index.blocks`. Кэш раздувал JSON, checksum,
временные строки/память и полную перезапись снимка даже без новых покупок.

На synthetic Pons curve истории 5000 блоков сохранялось 70500 cache rows.
Idle выполнял только 5 служебных RPC-вызовов, scanned/replayedBlocks=0, но занимал
около 3.3s. Причина не в повторном сетевом сканировании истории.

## Изменение

`persistent-buy-indexer.cjs` сохраняет вспомогательный RPC cache только в пределах
`[max(anchor, end - reorgLimit), end]` (по умолчанию 129 высот). При rollback также
выбрасываются записи выше общего предка, как раньше. Во время catch-up старые
запросы за пределами окна не добавляются в cache. Отсутствующий cache — обычный RPC miss.

Полные blocks/receipts, ledger, checksum/config identity, atomic fsync+rename,
границы reorg и проверки допуска сохранены. Формат снимка и математика replay не
меняются. Старый снимок читается обычным путём, а следующая успешная запись уменьшает
кэш. Первая загрузка старого большого файла всё ещё дороже последующих.
Окно ограничено по высотам, не по байтам: очень большой блок остаётся большим.

## Замер

Локальный mock RPC, synthetic Pons curve: один BUY на 10 блоков, покупки 60/40 USDG
чередуются. Это unadmitted fixture, без lifecycle/rewards/public projection и сетевой
задержки. Каждый сценарий запускается в новом OS-процессе, как service child.
Seed догоняет историю порциями до1000 блоков; append добавляет блок с BUY;
restart снова читает сохранённый результат append, не дописывая блок.

| История / проход | До, ms | После, ms | Снимок до → после, MiB | Peak RSS до → после, MiB |
|---|---:|---:|---:|---:|
| 100 / idle | 145 | 170 | 0.44 → 0.44 | 74 → 75 |
| 1000 / idle | 705 | 229 | 4.43 → 1.22 | 227 → 130 |
| 5000 / idle | 3298 | 639 | 22.24 → 4.19 | 1150 → 307 |
| 5001 / новый блок | 3315 | 889 | 22.25 → 4.20 | 1155 → 370 |
| 5001 / restart | 3139 | 595 | 22.25 → 4.20 | 1151 → 307 |

RSS — пик процесса, включая fixture/сборку исходных данных; не live heap и не
изолированный расход библиотеки. Время — один замер каждого сценария, без обещания
стабильного коэффициента ускорения. Первые маленькие сценарии after частично
пересекались с адресными тестами; небольшие различия не интерпретируем как регрессию.
5000-block idle/append/restart выполнялись после завершения этих тестов.
`stateBytes` соответствует размеру полностью записываемого JSON на каждом проходе.

У 5000-block after — 1818 cache rows вместо70500. Все 12 before/after ledger hashes,
wallet carry/tickets и RPC counters совпали. Копия старого5001-block снимка прочитана
новым кодом: ledger не изменился, cache сократился до1819 записей. Migration pass
занял1889ms; время первого чтения старого снимка не скрываем.

## Проверки и повторение

```powershell
node scripts/benchmark-indexer-history.cjs .local/logs/NEW_DIRECTORY
node --test test/pons-persistent-indexer.test.cjs test/persistent-buy-indexer.test.cjs test/pons-policy-indexer.test.cjs test/indexer-service.test.cjs
node --test test/pons-batch-integration.test.cjs
```

Benchmark отказывается перезаписывать существующую директорию, не обращается в сеть,
не подписывает транзакции. Он использует fixture из test; RPC bindings/runtime
синтетические. Не запускать его с путём рабочего state. Размеры можно передать
третьим аргументом: `100,1000,5000`.

Первый адресный набор: **20/20 PASS**. Проверены old snapshot/restart, отсутствие
исторических запросов при idle, сохранение tickets/carry, RPC outage, rollback,
cache miss после увеличения reorgLimit, нулевое cache-окно, policy/consumer guards
и supervisor recovery. Batch-соседи: **5/5 PASS**, отдельно проверены parent-state/receipt eviction.
Логи: `.local/logs/indexer-growth-tests.log`, `indexer-growth-batch-tests.log`;
сырые замеры/state — `indexer-growth-before`, `indexer-growth-after`, `indexer-growth-migration`.
Полный набор не запускался: изменение касается только необязательного RPC cache.

## Что осталось

Сохранение/проверка всего JSON и replay на новом блоке всё ещё O(history).
Оптимизация убрала лишнюю копию, но не решает неограниченный рост истории. Даже
после неё пустой проход дорожает с увеличением prefix. Для долгой работы нужен
следующий отдельный пакет хранения/checkpoints: сначала целевой объём и измеримый
бюджет времени/памяти, затем формат с проверкой восстановления и reorg. Это не повод
объявлять нынешний JSON production-ready или молча увеличивать freshness timeout.
Реальные admitted routes, lifecycle, API concurrency и latency ещё нужно измерять
на согласованном тестовом кандидате. A4 целиком не закрыт.
