# Dwellir: проверка перед оплатой — 04.10.2026

**Не переключать production пока.** Архив и небольшой проектный replay прошли;
Free запрещает getLogs, а finalized нестабилен по свежести. Платный тариф ещё
не куплен/не проверен. Сервер продолжает использовать Alchemy.

[Числовое evidence без ключей](evidence/DWELLIR_QUALIFICATION_2026-10-04.json).
Endpoint host: api-robinhood-mainnet-archive.n.dwellir.com.
Время проб:03.10.2026 22:45–22:48UTC (04.10Москва).

## Результат

- eth_chainId4663. USDG code/call/storage доступны на finalized, -10000 и
  -864000 блоков; decimals6. Это выборочные архивные пробы, не SLA.
- Launch header79377860 воспроизведён RLP/Keccak, hash совпадает с launch evidence.
  Runtime TOKEN совпадает. eth_getBlockReceipts launch возвращает5 receipts.
- indexOnce:10 блоков с нуля, затем ещё10 из сохранённого checkpoint.
  Policy admitted; первый ledgerHash точно совпадает с независимым сохранённым
  Alchemy full-receipt prefix:0x573b5006fb302851fe42de78443a2cb06decf5adf2d4fc8f08e70.
  Всего343 запроса в этой пробе, по14.5s на проход с искусственным ограничением
  частоты. Это НЕ замер производительности платного RPC и не покрытие всех BUY.
- getLogs для1/10/500/501 блоков:HTTP403. Free недоступен для полного контура выплат.
- Первые2 из3 сравнений finalized совпали с Alchemy79442624 (lag~14мин),
  третье вернуло79419788 (lag~53мин). Повтор8 запросов подтвердил чередование:
  5 ответов79419788,3 ответа79442624. Это регрессия выдаваемой высоты тега,
  а не доказанный reorg цепочки. Причина (backend/cache) не установлена.
- Допуск новых draw с maxFinalizedLag1200s не ослабляем. Не подменяем finalized
  на latest или сохранённый максимум. Оплата сама по себе исправление не доказывает.

## Следующий шаг

Уточнить у поддержки Dwellir нестабильный finalized и наличие того же поведения
на Developer; после исправления повторить одинаковые запросы. На paid проверить
доступность getLogs и реальные диапазоны500/501, затем полный admission и повтор
индексатора. До этих результатов смены RPC/credentials на сервере нет.

Официальные сведения (проверены04.10):
- https://www.dwellir.com/blog/robinhood-chain-defi-data — Free excludes getLogs;
  Developer500, Growth/Scale10000.
- https://www.dwellir.com/docs/robinhood/eth_getBlockReceipts — архивный endpoint.

## Готовый текст для поддержки (не отправлен)

Our Robinhood Mainnet archive endpoint on the Free plan intermittently returns
an older finalized block. Host: api-robinhood-mainnet-archive.n.dwellir.com.
At 2026-10-03 22:47:49–22:48:17 UTC, eth_getBlockByNumber(["finalized",false])
alternated between:

- 79442624 / 0xf12dc4b943b07378a3a6eb999a457b706e6230b54062b7ffe18c29469f796d68
- 79419788 / 0x743bae4328afb87476c2de925d524c435ae148bd900a8fd89a70b6b60d21ddd6

In eight consecutive requests, five returned the older height. Concurrent
Alchemy reads returned79442624. Latest was around79451090, so the older response
was approximately53minutes behind latest. Our application requires a fresh
finalized observation and will wait rather than fall back to latest.
Could you investigate inconsistent backend/cache finality, and confirm whether
Developer uses the same backend? We are evaluating the service before upgrading.
We also observed HTTP403 for eth_getLogs even for one block, which appears to be
the expected Free-plan restriction. Please confirm Developer access and its
500-block query cap for this network. No API key is included in this report.

## Воспроизводимость и мониторинг

Пробы: `node .local/logs/dwellir-probe.cjs`, `dwellir-index-probe.cjs`,
`dwellir-finality-probe.cjs`, `dwellir-finality-repeat.cjs` в том же каталоге.
Ключ только в игнорируемом .local/dwellir-rpc-url.txt; в evidence его нет.
Runtime не менялся, продуктовые тесты не запускались: задача read-only/docs.

Сервер на Alchemy:22:46:29UTC,43 успешных прохода/0 ошибок после legacy-fix,
56100 блоков, lag4625, файл187.29MB. Догон продолжается; рост файла остаётся риском.
