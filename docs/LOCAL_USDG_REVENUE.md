# Сбор USDG и funding одним локальным проходом

20.09.2026. `scripts/local-usdg-revenue.cjs` соединяет существующие FeeRouter
collect/harvest с [funding worker](LOCAL_USDG_FUNDING.md). Контракты, доли и учёт не менялись.
Только chainId 31337; CLI использует loopback HTTP/unlocked accounts.

## Порядок

1. Выполнить funding для уже находящихся на FeeRouter/PromoVault USDG и credits.
2. Сверить привязанный source vault, positionId, sourceEpoch с job.
3. Если текущая epoch источника совпадает с привязанной — один collect.
4. Если в привязанной epoch есть claimable USDG — один harvest.
5. Ещё раз выполнить funding, распределив полученные деньги.

Один проход не повторяет collect до бесконечности. Если первая фаза funding ожидает
gas/nonce/executor либо исчерпала лимит шагов, новая collection пока не начинается.
Призовые резервы, claimable и project recipients обслуживаются прежними контрактами.

Collect у внешнего источника может собирать обе валюты позиции. Worker **harvest-ит
только USDG**; TOKEN остаётся в source, не отправляется в USDG-only prize vault и не
конвертируется. Это не сквозной AMM fee simulation: в тесте revenue вносится в MockPairVault.

## Отказы и повтор

- Подтверждённый EVM revert collect даёт degraded; уже начисленный USDG всё равно
  пытаемся получить. Ошибка collect не отменяет успешно выполненный предварительный funding.
- Revert или неполная выплата harvest оставляют source debt по существующей атомарной
  проверке FeeRouter. Следующий проход может повторить получение без повторного признания дохода.
- При drift epoch collect отключается, но запрос старого claimable и harvest именно
  привязанной epoch разрешены. Это работает лишь если внешний source поддерживает старые claims.
- Неверная привязка источника останавливает source-часть. Funding старых денег уже выполнен.
- Неизвестный RPC/broadcast outcome, receipt timeout или отмена прекращают дальнейшие
  отправки прохода. Timeout сообщает hash; сначала проверить исходную tx. Нет nonce replacement.
- Перед отправкой проверяются campaign, gas cap, pending nonce и stop signal.
  Это off-chain preflight, не атомарная блокировка epoch/campaign на время inclusion.
- Нет автоматического rollover или принятия новой recipient policy. Старые ограничения
  funding при смене campaign сохраняются.

Каждый этап — отдельная транзакция. Отказ позднего этапа не откатывает ранее подтверждённые.
Это намеренно: источник может отказать, а уже полученные деньги всё равно должны работать.
Определённый отказ pay изолируется на один проход: общий для двух фаз набор
(asset, recipient) исключает повторную попытку плохому адресу. Остальные recipients,
collect и harvest продолжаются. Credit сохраняется; следующий проход снова пробует адрес.
Итог degraded содержит funding.failures; onStep сообщает recipientFailed.
Не-recipient ошибки и неоднозначные отправки по-прежнему останавливают writes.

## API и CLI

`runRevenue({provider, router, vault, executor, job, signal?, receiptTimeoutMs?},
{maxSteps=32, onStep, signal})`; maxSteps применяется отдельно к двум фазам funding.
Результат содержит source.collect, source.harvest и funding. Статусы: idle, degraded,
waiting, yielded, stopped, error. Degraded означает известный отказ источника или recipient, а не отсутствие проблемы.

Revenue job оборачивает существующий funding job:

```js
const job = {
  schema: 'local-usdg-revenue-v1',
  funding: fundingJob, // полный local-usdg-funding-v1 с адресами/долями локального deployment
  source: { vault: pairVaultAddress, positionId: '123', epoch: '1' },
  pollSeconds: 300
};
```

Адрес/position/epoch берутся из проверенной привязки FeeRouter, пример 123/1 — тестовый.
Poll interval — локальный параметр, 60–86400 секунд; 300 в примере не является утверждённой
production экономикой. Job сохраняется в JSON один раз, не изготавливается перед каждым collect.

```powershell
npm run local:revenue -- --job .local/revenue-job.json --rpc http://127.0.0.1:8545 --executor 1 --watch
```

Без watch — один проход. Watch ждёт pollSeconds после окончания прохода, включая degraded,
и повторяет его. На неоднозначном source error CLI выходит с ненулевым кодом; это ещё не
durable transaction recovery. SIGINT прерывает и паузу между проходами. Каждое действие и
итог revenuePass выводятся как JSON. Старые schemas CLI продолжают работать.

У source API нет универсального достоверного preview ещё не собранных LP fees. Поэтому
проход может отправить один **пустой collect**, который всё равно стоит gas. Перезапуск
процесса не помнит прошлый интервал и может выполнить ещё один collect; денежного
дублирования нет, но это не production gas optimization. Не запускать конкурирующие revenue
процессы одним signer. Общего supervisor с draw scheduler пока нет.

## Проверки

В funding suite добавлены автоматический полный проход, повтор, отказ collect при старом
claimable, отказ claim, short payment, source epoch drift, неверная привязка, gas/nonce wait
и реальная pending collect-транзакция с receipt timeout/последующим подтверждением.
В BUY-cycle revenue worker теперь сам получает 4004 raw USDG и распределяет их между
призами и проектом перед прежними двумя Short и двумя Monthly. Проверяется отдельный CLI.

Это локальная интеграция с MockPairVault, не новый PAIR fork и не проверка живой политики PAIR.

Проверено 20.09: `node --test --test-concurrency=1 test/local-usdg-funding.test.cjs test/local-buy-cycle.test.cjs test/fee-router.test.cjs`
— **31/31**, ~222 s. Лог `.local/logs/usdg-revenue-tests.log`. Основной список теперь
198 тестов; полный запуск 198 не выполнялся. Синтаксис JS, ссылки и diff проверены.

## Изоляция выплат — текущая реализация 20.09

Funding и source используют sendLocalTransaction из local-receipt.cjs: отдельный
read-only estimateGas, затем broadcast с явным gasLimit, затем ожидание receipt.
Определённый отказ: CALL_EXCEPTION именно в estimate либо status=0 receipt с hash
исходной отправленной tx (не TRANSACTION_REPLACED). Один лишь CALL_EXCEPTION из send
не доказывает откат. Read/RPC ошибки, timeout, replacement и nonce conflict не обходятся.
Abort после estimate не отправляет tx. Состояние skip/failures живёт только один pass;
waiting/yielded/stopped не превращаются в degraded и не разрешают новую collection.
Прямой stepFunding сохраняет throwing API; runFunding изолирует только recipientFailure.

Это не durable journal: crash/restart при неизвестной tx требует reconciliation.
Отказ RPC без возвращённого hash остаётся неоднозначным даже если RPC фактически
исполнил tx. Математика и Solidity не менялись.

## Проверки recipient isolation, 20.09.2026

- `node --test --test-concurrency=1 test/local-usdg-funding.test.cjs test/fee-router.test.cjs test/local-buy-cycle.test.cjs`: **37/37**, ~240 s.
- `node --test test/local-transaction.test.cjs`: **10/10** — stage/error matrix, включая synthetic mined revert, replacement, RPC и abort.
- `node --test test/local-executor-stability.test.cjs`: **5/5**, ~32 s — соседние receipt/cutoff регрессии.

Итого 52 проверки в трёх непересекающихся наборах. Основной список теперь 215;
полный запуск 215 не выполнялся. Реальный mined revert классифицируется по receipt;
матрица этого исхода использует подставленные ответы, не отдельный mined-revert fork.
Контрактные сценарии покрывают blocked prize/project, восстановление и однократную
выплату долга, два отказавших адреса с работающим третьим (estimate injection),
лимит шагов, неизвестный payment broadcast, реальный pending payment/collect,
сохранение credits и прежний сквозной BUY-cycle. TOKEN-custody regression по-прежнему
воспроизводит открытый дефект, а не исправление A.

Логи исключены из git: `.local/logs/recipient-isolation-tests.log`,
`.local/logs/recipient-isolation-stability.log`. Live PAIR fork не запускался.
