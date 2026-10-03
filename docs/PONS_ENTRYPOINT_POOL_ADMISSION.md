# EntryPoint / Alchemy 7702 → USDG Pons pool

02.10.2026, тестовый пакет поверх `5f3c497` с сохранёнными локальными изменениями.
Боевой сервер, реальные кошельки и on-chain deployment проекта не затронуты.

## Что получилось

На свежем локальном fork с anchor **78358405** тестовый кошелёк подписал настоящую
EIP-7702 authorization на существующий Alchemy SemiModularAccount7702, затем
UserOperation. Отдельный bundler отправил её в существующий EntryPoint. Неверная
подпись отвергнута с `AA24 signature error`; правильная операция исполнена.

Путь: account → EntryPoint execution → account.execute → AllowanceHolder → Settler
→ один целевой USDG/Pons pool → тот же account. Точнее, внешний вызов идёт от
bundler к EntryPoint; account является sender UserOperation и плательщиком покупки.

- USDG debit **101000000**, route fee **151500**, pool payment **100848500**.
- Куплено **67791892169844925060823 TOKEN** после hook fee; возврата USDG нет.
- В отдельном policy/index/API прогоне account получает **Short 1 / Monthly 1,
  carry 1000000**, bundler получает **0**. Газ в ETH в базу билетов не включается.
- Повтор, checkpoint append, повторное включение сделки в другую ветку и удаление
  покупки проверены. Старые genesis не получают поддержку автоматически.

[Полное evidence](evidence/PONS_ENTRYPOINT_POOL_BUY_2026-10-02.json) содержит signed
authorization, tx/receipt/block, signed UserOperation/hash, события, runtime bytes,
source hashes и before/after балансы. Tx
`0x009c19b490b95c0e213188974d55fa46f97d571b7f3b62cd2d751025519665af`
существует **на локальном fork**, не в публичной сети.

Средства созданы локально; используется публичный тестовый ключ harness. Первичный
approve сделан тестовым account; делегирование и UserOperation подписаны этим ключом.
Это исполнение существующих контрактов, не mock исполнения. Policy/lifecycle,
непрерывная цепочка для index/API и registry в manifest — отдельные synthetic fixtures.
Installed MetaMask UI и полный draw/payout cycle этот пакет не проверяет.

## Узкие условия допуска

Новый genesis `direct-buy-pons-launch-v4`, route
`rh-pons-curve-pool-batch-zeroex-entrypoint-v1`; модуль `scripts/pons-entrypoint-buy.cjs`.
Он включает прежние v3 пути и добавляет только:

1. Канонический `handleOps` pinned EntryPoint, **ровно одна** UserOperation.
2. Пустые initCode/paymaster, nonce key 1 — штатная fallback/global validation
   без deferred action. Подпись `ff00 + ECDSA` проверяется по реальному v0.7
   userOpHash с chain ID и EntryPoint; signer совпадает с account.
3. До блока покупки account уже имеет делегирование на pinned implementation.
   Scanner сохраняет parent code/parent hash только для целевого кандидата.
   Runtime implementation проверяется и на родительской высоте.
4. В блоке нет валидной authorization для этого account. Даже поздняя смена
   делегирования консервативно закрывает допуск; конец блока не подменяет состояние
   на момент исполнения. Чужие/невалидные authorization не блокируют покупателя.
5. Account вызывает именно `execute(holder, 0, canonicalData)`. Success event,
   userOpHash, nonce, sender и `BeforeExecution` определяют единственную ветку.
   Все relevant transfers/swaps/fees лежат внутри её execution interval.
6. Общий proof из [0x-профиля](PONS_ZEROEX_POOL_ADMISSION.md) проверяет весь USDG/TOKEN
   поток и точный target pool. Receipt и внешняя транзакция не переписываются
   в фиктивный прямой BUY; `proveCall` получает отдельно доказанного payer.

Не допускаются multi-op, paymaster, новый account через initCode, неизвестный delegate,
смена делегирования в блоке, иной signer/validation mode, executeBatch/executeUserOp,
native input, split/external pools и refunds. Это не общий ERC-4337 adapter.

## Источники и исторический пример

В сохранённой Harmonic-транзакции `0x764d4c88…` действительно одна UserOperation
и вход **118022303934824258 wei ETH**, не USDG. Её receipt повторно получен и совпал
с сохранённым. Текущее делегирование account указывает на Alchemy implementation,
но **исторический delegate этим не доказан**.

Оба public RPC не дали исторический trace. Blockreq ограничил исторический code
последними 1024 блоками; официальный RPC ответил, что исторический state недоступен.
[Ответы и пределы](evidence/PONS_ENTRYPOINT_RESEARCH_2026-10-02.json) сохранены.
Этот исторический native BUY не получил допуска. Для новой USDG-ветки вместо догадки
получено отдельное свежее подписанное fork-исполнение с доступным parent state.

Первичные источники:

- [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337): account/sender отличается от bundler.
- [Alchemy deployments](https://www.alchemy.com/docs/wallets/smart-contracts/deployed-addresses):
  `0x69007702764179f14f51cdce752f4f775d74e139`, SemiModularAccount7702.
- [Deployed account source](https://sourcify.dev/server/v2/contract/4663/0x69007702764179f14f51cdce752f4f775d74e139?fields=all)
  и [EntryPoint source](https://sourcify.dev/server/v2/contract/4663/0x0000000071727de22e5e9d8baf0edac6f37da032?fields=all).

Runtime hashes сверены с fork bytes, source hashes сохранены. Проверены
SemiModularAccountBase signature mode, nonce locator, execute и execution hooks,
EntryPoint op hash/events. Даже при наличии account hooks лишние relevant переводы,
события до execution interval или другая покупка закрывают узкий proof.
Конкретный adapter следует pinned v0.7 runtime, а не произвольной новой редакции ERC.

## Индекс / API и проверки

`entrypointAccounts` сохраняется вместе с блоком и используется независимым replay.
Недоступный parent state/runtime прекращает sync, а не даёт нулевое начисление как
успешно обработанную покупку. Внешний finalized index остаётся зависимым от RPC;
длительные пропуски истории требуют отдельной квалификации архивного доступа.

Когда событие/хеш однозначно задают account, но route proof не прошёл, API показывает
этому account `observedAccount`, `attribution: user-operation-sender-only` и
`ENTRYPOINT_*_NOT_QUALIFIED`. Это не payer и не билеты. Bundler не получает эту запись.
Multi-op/неоднозначность не распределяются по кошелькам эвристически.

**100 уникальных адресных тестов PASS**, не полный RC baseline:

```powershell
node --test test/pons-entrypoint-buy.test.cjs test/pons-entrypoint-integration.test.cjs test/pons-zeroex-buy.test.cjs test/pons-zeroex-integration.test.cjs
node --test test/direct-buy.test.cjs test/pons-curve-buy.test.cjs test/pons-v4-buy.test.cjs test/pons-pool-batch.test.cjs test/pons-batch-integration.test.cjs test/pons-persistent-indexer.test.cjs test/user-status-cache.test.cjs test/public-status.test.cjs test/pons-policy-indexer.test.cjs test/persistent-buy-indexer.test.cjs
```

21 tests в `.local/logs/pons-entrypoint-tests-a.log`, 79 соседних в
`.local/logs/pons-entrypoint-neighbors.log`. Новый профиль для повторения:
`npm run test:group -- --profile pons-entrypoint` (только 10 EntryPoint tests).

Fork-команда, только с новым output path:

```powershell
node scripts/pons-zeroex-fork.cjs .local/logs/NEW-aa-proof.json --token 0x94641b97010608C3827fB058074889f19868FF33 --entrypoint
```

Следующий пакет — пользовательский Buy/Claim, wallet behavior и понятное отображение
границ поддержки. Native/split/multi-op остаются отдельными расширениями, а не
основанием бесконечно откладывать проверку уже поддержанного пользовательского пути.
