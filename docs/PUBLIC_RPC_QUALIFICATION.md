# Проверка RPC для публичного runtime

29.09: повторные bounded probes official/Blockreq не квалифицировали archive.
Блоки/receipts повторяются на доступных высотах, historical state/deep history не прошли.
[Свежие отчёты и команды](../research/operational-profile/README.md),
[timing и ограничения](OPERATIONAL_LAUNCH_PROFILE.md). BUY replay в этих прогонах не запускался.

28.09.2026. Это read-only проверка инфраструктуры, не разрешение deployment/отправки.
Публичное исполнение по-прежнему закрыто. Контракты и экономика не менялись.

## Что проверяем

`scripts/public-rpc-qualification.cjs` использует прежний historical probe и добавляет:
полные блоки со всеми receipts, соответствие block/transaction/log provenance,
сравнение eth_getLogs с receipts, повторную проверку canonical hash. Отдельные чтения
USDG code/call/storage на finalized и старых высотах не заменены свежим state.

Allowlist допускает только чтение. По умолчанию 1000 запросов, максимум10000;
таймаут15s на HTTP запрос, без автоматических retries. Ошибки HTTP/RPC, в том числе
429, фиксируются как отказ; URL credentials/provider messages в отчёт не попадают.
Статистика: количество запросов по методам, суммарная длительность запросов,
байты успешных JSON results (не wire traffic и не billable compute units).

Опциональный manifest запускает **существующий** `scanWithRpc` → `replay`:
финализированный диапазон1..32blocks, runtime pins, все receipts, duplicate delivery
invariant. Прежний `scan(url)` использует тот же код; бизнес-логика decoder не менялась.
Reference replay не выполняет BuyPolicySource admission и не выдаёт реальные билеты.
Пустой диапазон/ноль eligible не доказывают успешный BUY.

Повторный CLI с `previous` читает те же полные блоки заново и сравнивает их fingerprints.
Для manifest дополнительно сравнивает manifest/range/ledgerHash. Это новый процесс и
fresh RPC reads, а не проверка crash recovery рабочего worker. Historical state probe
при повторе снова отсчитывает depths от текущего finalized; `repeatable` относится
к сохранённым полным блокам/receipts, не к повторяемости всех state reads.

## Запуск

Создать локальный JSON config, например:

```json
{"depths":[0,10000,864000],"maxRequests":500}
```

```powershell
$env:RH_RPC_URL = 'https://your-provider.example'
node scripts/public-rpc-qualification.cjs .local/logs/rpc-config.json .local/logs/rpc-first.json
```

В следующем config добавить `"previous":".local/logs/rpc-first.json"`, запустить
CLI новым процессом с новым output. Для BUY добавить `manifest` (путь к reference
manifest) и `toBlock`; они не должны ссылаться на выдуманный публичный deployment.
Отчёт всегда `publicLaunchReady:false`. CLI exit0 означает, что отчёт записан;
пригодность определяется полями результатов, а не exit code.

Отдельный ограниченный поиск:
`node scripts/public-infinity-reference-search.cjs .local/logs/reference-search.json`.
Последние10001 finalized blocks, eth_getLogs чанками1000, максимум100 Swap tx,
проверка прямого вызова pinned adapter, разбор pool key/USDG. Это discovery,
не exhaustive поиск и не валидатор BUY. При отказе endpoint не делает blind retry.

## Живые наблюдения 28.09

Evidence: `research/public-deployment/rpc-workload-*-2026-09-28.json`.

| Endpoint | Первое чтение | После нового процесса | Вывод |
|---|---|---|---|
| Official |46requests,8.62s,3 state failures;3 полных блока,27tx доступны|46requests,10.02s;3 fingerprints совпали|Исторический state недоступен, полноценный replay не квалифицирован|
| Blockreq public |48requests,5.78s;2 state samples и2 полных блока,24tx доступны;старый диапазон отказ|48requests,5.80s;2 доступных fingerprints совпали,старый снова отказ|Недостаточная глубина публичного тарифа|

В дополнительном поиске Blockreq отказал на диапазоне10001blocks (`-32012`),
после разбиения на1000 получен HTTP429. Поиск завершён на Official:
10001blocks,107Swap logs,106unique tx, просмотрены первые100, прямых вызовов
поддерживаемого adapter среди них нет.112requests,20.89s. Evidence:
`research/public-deployment/infinity-reference-search-2026-09-28.json`.
Оставшиеся6tx и другие периоды не исследованы. Это **не** отсутствие рынка.

Живой подходящий TOKEN/USDG BUY replay не выполнен: нет подтверждённого reference
manifest, наши TOKEN/registry/policy ещё не deployed. Не подменяли их fork адресами.
Сохранённая прежняя публичная Infinity покупка имеет другой quote; она не является
доказательством USDG eligibility. Положительный scan/replay здесь проверен локальным
fixture с сохранённой BUY и реальными pinned runtime bytes, без сети.

## Критерий выбора provider

До разрешения public runtime нужны:

- finalized и исторический code/call/storage без fallback; история от genesis проекта
  и запас для восстановления после простоя;
- полные блоки, все receipts и логи от genesis; совпадение повторного replay;
- проверка настоящего cutoffHashes на finalized blockTag после deployment;
- измерение полного рабочего диапазона для обоих draw и восстановления;
- допустимые rate limits, latency и цена по реальному тарифу. Число запросов здесь
  не позволяет честно назвать месячный расход для Short+Monthly.

Три выборки не доказывают archive SLA или честность RPC. Проверки текущего провайдера
не запрещают выбрать другой endpoint и пройти тот же инструмент. Автоматический
failover/постоянный indexer/public signer этим пакетом не реализованы.

## Адресные проверки

28.09:29 соседних direct-buy/infinity-buy +8 новых qualification +3 выбранных
public-launch-checks прошли отдельными запусками;1 catalog check. Не full baseline.

```text
node --test test/public-rpc-qualification.test.cjs test/infinity-buy.test.cjs test/direct-buy.test.cjs
node --test test/public-rpc-qualification.test.cjs
node --test --test-name-pattern="archive probe|missing historical|launch plan" test/public-launch-checks.test.cjs
node --test --test-name-pattern="catalog" test/test-launcher.test.cjs
```

Первый запуск содержал6 новых тестов; после добавления двух сценариев и исправления
HTTP request-id заново выполнены все8. Profile `public-rpc` не компилирует Solidity.
Проверяются отказ RPC/timeout/request budget, mismatch provenance/logs/runtime,
недоступный finalized/state, стабильность повторного чтения и реальный scan/replay
с idempotency. Нет публичных транзакций, нового fork или изменения контрактов.

## Обновление для release profile, 28.09 15:38 UTC

[Новый read-only отчёт](../research/public-deployment/rpc-release-profile-2026-09-28.json):
official endpoint, depths0/10000/864000, budget150requests, фактически136requests.
Три полных блока и117receipts доступны, logs совпали; eth_getCode USDG на всех
трёх высотах отказал с -32000. До call/storage в этих samples проверка не дошла.
`sampledDataAvailable=false`, BUY replay не запускался без reference manifest.
Суммарное время отдельных запросов28.774s, это не wall-clock и не оценка тарифа.

Команда: `node scripts/public-rpc-qualification.cjs .local/logs/release-profile-rpc-config.json .local/logs/release-profile-rpc-refresh.json`;
config: `{"depths":[0,10000,864000],"maxRequests":150}`. RPC/default endpoint — official;
нет signer, sends, retries или платной подписки. Отрицательный результат не требует
повторять тот же прогон: следующий инфраструктурный шаг — доступ к другому archive
endpoint и проверка тем же инструментом. Provider ещё не выбран. Один успешный будущий
sample сам по себе не квалифицирует всю историю, тариф или SLA.
