# Постоянное накопление BUY history

29.09.2026. `scripts/persistent-buy-indexer.cjs` — отдельный read-only процесс.
Не подключён к scheduler и не отправляет транзакции. Это законченный слой накопления,
не готовый production indexer или новый источник полномочий на freeze.

## Исполнение

```powershell
$env:RH_RPC_URL=(Get-Content -LiteralPath .local/rpc-url.txt -Raw).Trim()
node scripts/persistent-buy-indexer.cjs CONFIG.json .local/indexer.json once
node scripts/persistent-buy-indexer.cjs CONFIG.json .local/indexer.json watch
```

CONFIG содержит manifest, buyPolicy и при необходимости lifecycle существующего
BUY policy runtime. Реальный deployment ещё отсутствует: запуск проекта на mainnet
по выдуманному manifest не выполнялся. Явный buyPolicyMode=unadmitted остаётся только
исследовательским режимом и маркируется в результате; не превращается в admission.

Один проход обрабатывает до100 новых блоков до finalized; watch повторяет через10s.
Программный API допускает batchSize1..1000 и reorgLimit0..10000 (по умолчанию128).
Сеть, anchor и policy проверяются заново. Старые full blocks, receipts и code reads
берутся из сохранённого cache только после проверки каноничности хвоста. Для новой
ветки cache после общего предка отбрасывается. Существующие scanWithRpc и replay
всё ещё выполняют проверку доказательств и единственную математику начисления.

Снимок содержит исходные блоки, разрешённый manifest, решения по покупкам, minted
Short/Monthly attempts и carry, ledgerHash и policyStatus. Это начисленные попытки,
не остаток после участия в draws: расход остаётся задачей attempt-lifecycle/scheduler.
Статусы caughtUp/catchingUp/waiting показывают обработанную и целевую высоту;
waiting сохраняет последний хороший снимок. Подробная ошибка доступна вызывающему
API; CLI намеренно не печатает произвольный ответ RPC, который может содержать ключ.

Используется существующий withState: один writer, checksum, fsync+rename, config
identity. При EEXIST lock не удаляется автоматически. Повреждение state/смена config
останавливает чтение; потерю журнала нельзя маскировать нулевыми билетами.
RPC outage не публикует частичный ledger. Anchor mismatch, уменьшившийся finalized
или reorg глубже лимита требуют проверки, не автоматического сброса.

## Границы

- Кеш сокращает сетевое чтение истории, но CPU replay и запись одного JSON пока
  линейны по накопленной истории; не заявляем масштабируемую базу данных.
- Подтверждение worker не контрактная финальность. Reorg здесь пересчитывает только
  read-only снимок; существующие frozen datasets/claims не редактируются.
- API сайта, supervisor и использование cache в scheduler — следующий пакет.
  До него scheduler сохраняет прежнее независимое чтение.
- Тесты cache используют сохранённую legacy BUY ветку и mock RPC/code; соседние
  Infinity decoder tests проверяют нынешнюю математику. Admitted Infinity end-to-end
  и restart отдельного OS процесса с реальным deployment пока не доказаны.

## Проверки

`node --test test/persistent-buy-indexer.test.cjs test/infinity-buy.test.cjs`:
8/8 passed,29.09. Проверены повтор без receipts/дубликатов, bounded catch-up,
RPC outage/resume, checksum/config refusal, branch rollback с удалением BUY и carry,
слишком глубокий reorg. Это адресные проверки, не full/fork/live proof.

## Alchemy

Robinhood4663 подтверждён. Первый probe:62requests/1HTTP403; повтор65requests/0ошибок,
три блока повторились, historical code/call/storage доступны до864000blocks глубины.
Точный ранее отказавший eth_call затем прошёл3/3. Причина403 не установлена.
[Отчёты](../research/operational-profile/alchemy-history-repeat.json) содержат только
origin без API key. Это sampled availability, не SLA и не реальный BUY replay.
