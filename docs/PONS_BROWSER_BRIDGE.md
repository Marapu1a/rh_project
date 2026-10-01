# Browser → local fork purchase

01.10.2026: browser review flow соединён с настоящим local-only planner через
Playwright bindings. Это автоматизированный Chromium-прогон на Hardhat fork,
не wallet extension, не публичная торговля и не новая публикация сайта.

## Граница исполнения

- `scripts/pons-browser-bridge.cjs`: принимает только prepare/send/receipt/recover
  и identity в контексте одного manifest, account и Hardhat instanceId4663.
- В браузере нет generic RPC, URL отправителя или API для публичной отправки.
  Playwright binding замыкается на тот же in-process Hardhat RPC.
- Prepare выдаёт ID и копию плана. Send сравнивает весь входной план с сохранённым,
  затем заново проверяет bindings/фазу/allowances, аккаунт/сеть, expiry и canonical
  блок исходной котировки. Симулируется и отправляется именно старый показанный
  payload, если его минимум ещё выполняется; новое calldata незаметно не подставляется.
- Перед отправкой intent сохраняется в отдельном JSON journal через tmp+rename.
  Known hash сохраняется до ответа браузеру. Duplicate ID возвращает тот же hash;
  intent без hash блокирует повторную отправку, включая restart bridge.
- Receipt проверяет hash, from/to/input/value/chainId, blockNumber/blockHash
  транзакции и соответствие canonical block. Несовпадение оставляет pending.
  Status0 отображается как revert, не успешная покупка.
- Перезагрузка браузера с удалённым sessionStorage восстанавливает pending/hash
  из server journal. Сумма и отправитель восстанавливаются из исходного плана,
  не из default формы или текущего выбранного аккаунта.

## Тестовый прогон

`scripts/pons-browser-rehearsal.cjs` открывает opt-in demo через loopback server,
подставляет local-fork adapter, скрывает вымышленные scenario controls и меняет
подписи на local fork. Подтверждает каждый отдельный шаг через DOM, затем удаляет
browser session state, перезагружает страницу и проверяет receipt через bridge.
Основная кнопка BUY и обычная страница4174 остаются прежними: этот adapter
подключается только в тестовом Chromium-процессе.

```powershell
$env:RH_FORK_RPC_URL='https://rpc.mainnet.chain.robinhood.com'
node scripts/pons-collector-fork.cjs .local/logs/NEW_FILE.json --browser-purchase
```

Флаг включает direct-purchase/v4. USDG/ETH синтетические; owner/operator
impersonation локальная; graduation/SELL используют прежние fixture операции.
Не считать этот прогон новым полным draw/coordinator baseline.

Первый прогон выявил восстановление101USDG по умолчанию вместо выбранных60/40
между approval и BUY. Ledger assertion остановил тест. Исправлено восстановление
суммы из плана; browser regression дополнительно проверяет60.125 после reload.

Адресные проверки: `node --test test/pons-browser-bridge.test.cjs test/purchase-review.test.cjs web/purchase-demo.test.cjs` —18/18 PASS после исправления.
Лог: `.local/logs/pons-browser-tests-final.txt`. Проверены подмена payload/amount,
account/chain changes, duplicate ID, unknown after restart, canonical receipt и
UI recovery; mock unit RPC не заменяет настоящий fork результат ниже.

Финальный fork77427785, hash
`0x98ad73f041d609398c49b5a86ace6f7523cb59175254d5eec9268d6e4157a4ae`: **PONS_BROWSER_PURCHASE_FORK_PASSED**.
12 запросов/12 восстановлений после удаления sessionStorage;4 BUY:
curve101, pool101, pool60 и pool40. Ledger подтвердил ожидаемые суммы и
накопление60+40 в1 билет, replay/dedup сохранены. Journal:12 completed, pending=null.
[Компактное evidence](evidence/PONS_BROWSER_PURCHASE_2026-10-01.json).
Полный вывод `.local/logs/pons-browser-20261001-b.json` / `.txt`, отдельный
`.browser-journal.json` содержит исходные exact plans.

Следующий ограниченный шаг — admission Pons в постоянный BUY indexer:
сохранение прогресса, restart/reorg и совместимость ledger с новым direct route.
Реальные wallet extensions/public sends ещё не включаем.

## Что не закрыто

Bridge journal имеет lock только внутри одного процесса; fsync/power-loss,
межпроцессные writers и production service ownership не допущены. Canonical
receipt проверяется на момент чтения; deep reorg/finality после подтверждения
требуют индексатора. Unknown hash не угадывается по nonce и не пересылается.
Quoter/source admission, реальные расширения, публичный sender и browser origin
admission остаются отдельными границами. Последующее восстановление ticket ledger
не заменяется UI receipt.
