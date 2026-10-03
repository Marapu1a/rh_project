# 0x → один Pons USDG pool: тестовый допуск

02.10.2026, рабочее дерево поверх `5f3c497`. Боевой deployment не выполнялся.

## Результат и границы

Свежая котировка Pons для Commander Vrax исполнена на локальном Hardhat fork
Robinhood Chain с anchor **78345083**. Существующие контракты исполнили реальную
calldata; USDG/ETH на тестовом счёте созданы локально, отправитель impersonated.
Это не QIANQI, не MetaMask UI и не mainnet-транзакция.

| Измерение | Raw units / результат |
|---|---|
| USDG списан с кошелька | 101000000 |
| Комиссия маршрута в USDG | 151500 |
| USDG поступил в целевой pool | 100848500 |
| Возврат USDG | 0 |
| Hook fee в TOKEN | 710213407191804428891 |
| TOKEN получен кошельком | 70311127311988638460243 |
| Билеты при replay и в отдельной index/API интеграции | Short 1, Monthly 1, carry 1000000 |

Сохранены [tx, receipt, block, before/after и runtime bytes](evidence/PONS_ZEROEX_POOL_BUY_2026-10-02.json).
Tx `0xdef3064c035b7acd5bbcf8f2b858715f98b25d4d771bb7eea682c538b95c13ff`
существует только на локальном fork. Первая попытка без allowance завершилась
ожидаемым отказом estimateGas; после approve покупка исполнена.

**Разделение доказательств:** calldata/переводы/runtime взяты из исполнения fork;
policy/lifecycle bindings и непрерывная цепочка для index/API теста смоделированы.
Registry в decoding manifest — неиспользуемая synthetic роль, не реальный deployment.
Полный draw/payout cycle этим пакетом не переобъявляется проверенным.

## Что допускает адаптер

`scripts/pons-zeroex-buy.cjs`, genesis `direct-buy-pons-launch-v3`, route
`rh-pons-curve-pool-batch-zeroex-v1`. Он сохраняет direct/curve/self-batch пути v2
и отдельно допускает прямой вызов кошельком pinned AllowanceHolder:

1. `exec`: USDG, amount > 0, operator = target = pinned Settler, native value 0.
2. Settler `execute`: получатель TOKEN совпадает с отправителем транзакции.
3. Ровно четыре канонически закодированных действия: `TRANSFER_FROM`, `BASIC`
   для комиссии 1500 ppm, `UNISWAPV4` для одного точного pool key, `POSITIVE_SLIPPAGE`.
4. Один целевой BUY, полный USDG exact-input после route fee, пустой hookData,
   известные адреса получателей комиссий. Никаких дополнительных relevant transfers.
5. Совпадают фактическое списание, route fee, pool deltas, hook fee/tax, выдача
   TOKEN и minimum output. База билетов — 101 USDG, комиссия повторно не прибавляется.

Полный список и порядок переводов проверяются, включая optional positive-slippage
fee в TOKEN. Эта ветка покрыта **synthetic receipt**, в сохранённом реальном
fork-исполнении положительного проскальзывания не было. Аналогично 3% creator tax
проверен synthetic branch; у исполненного Vrax tax = 0%, hook fee = 1%.

Не допускаются: split/multihop, внешний pool, произвольный BASIC, другой получатель,
другая комиссия/версия Settler, exact-output, partial fill/refund, служебный плательщик,
EntryPoint/ERC-4337, оболочка self-batch вокруг AllowanceHolder. Отдельный баланс
Settler не считается средствами пользователя. Никаких обещаний полного охвата 0x.

Старые genesis не получают новый маршрут. `pons-profiles.cjs` регистрирует новую
версию для policy/replay/scanner; scanner проверяет runtime dependencies на высоте
каждого обработанного блока. Несовпадение runtime или policy прекращает допуск.

## Почему известен плательщик

Исходники deployed contracts сверены с захваченным runtime hash:

- [AllowanceHolder, Sourcify](https://sourcify.dev/server/v2/contract/4663/0x0000000000001ff3684f28c67538d4d072c22734?fields=all):
  `_exec` создаёт allowance для operator/sender/token и дописывает sender к вызову.
  `transferFrom` расходует этот allowance и списывает USDG с owner.
- [Settler, Sourcify](https://sourcify.dev/server/v2/contract/4663/0x6aa80DbBed9ae5aB45FbF61f9644faDA3b29326E?fields=all):
  AllowanceHolderContext извлекает forwarded sender; `TRANSFER_FROM` с пустой
  подписью и nonce 0 использует holder allowance. Проверяется deadline.
  BASIC переводит долю баланса; один v4 fill задаёт pool; surplus fee ограничен
  положительной разницей к expectedAmount, остаток выдаётся указанному получателю.

Hashes исходников и bytecode записаны в evidence. Это proof конкретного pinned
исполнителя и узкой формы вызова, а не общая эвристика по Transfer или tx.from.

## Индексатор и API

Допущенный BUY проходит существующие policy → persistent index → lifecycle → API.
Restart без новых блоков не читает receipt заново; append продолжает checkpoint;
смена ветки пересчитывает canonical history. Frozen/claimable правила не менялись.

Для неподдержанного **прямого holder-вызова с кандидатом целевого pool** сохраняются
`observedSender`, `attribution: transaction-sender-only` и стадия отказа
`ZEROEX_*_NOT_QUALIFIED`. API показывает эту запись отправителю без начисления.
`payer` остаётся null: наблюдаемый sender не подменяет доказанного участника.
Внешние рынки без target event, EntryPoint-покупатель и произвольный адрес получателя
не угадываются. Отсутствие покупки в API не означает подтверждённый отказ.
UI-перевод причин и внешние уведомления оператору остаются отдельной работой.

## Проверки и воспроизведение

11 новых адресных тестов: 8 decoder/evidence + 3 policy/index/API, все PASS.
Дополнительно 69 соседних decoder/index/API и 4 policy tests PASS.
**84 уникальных адресных теста**, не полный baseline проекта.

```powershell
# Выполненные финальные адресные запуски (по отдельности, без повторного full run)
node --test test/pons-zeroex-buy.test.cjs
node --test test/pons-zeroex-integration.test.cjs
node --test test/direct-buy.test.cjs test/pons-curve-buy.test.cjs test/pons-v4-buy.test.cjs test/pons-pool-batch.test.cjs test/pons-batch-integration.test.cjs test/pons-persistent-indexer.test.cjs test/user-status-cache.test.cjs test/public-status.test.cjs
node --test test/pons-policy-indexer.test.cjs

# Группа для будущего воспроизведения
npm run test:group -- --profile pons-zeroex

# Новый live quote; сделки только внутри local fork, нужен новый путь отчёта
node scripts/pons-zeroex-fork.cjs .local/logs/NEW-zeroex-proof.json --token 0x94641b97010608C3827fB058074889f19868FF33
```

Финальные логи: `.local/logs/pons-zeroex-tests-3.log` (8), `pons-zeroex-tests-2.log`
(3), `pons-zeroex-neighbors.log` (69), `pons-zeroex-policy.log` (4).
Первый прогон нашёл проблему тестового state path: проверка неправильной policy
переиспользовала файл проверки runtime и упиралась в config mismatch. Fixture исправлен:
для следующего негативного сценария создаётся свежий state; финальный прогон зелёный.

Следующий [EntryPoint/Alchemy USDG пакет](PONS_ENTRYPOINT_POOL_ADMISSION.md) выполнен
отдельным genesis v4. Ограничения этого v3 не менялись; native/multi-op остаются
вне допуска. Текущая очередь — [ROADMAP](ROADMAP.md).
