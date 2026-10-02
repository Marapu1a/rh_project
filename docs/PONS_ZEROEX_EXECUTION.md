# Pons / 0x: исполнение и границы учёта

02.10.2026, рабочее дерево поверх `b166d91`. [Capture с quotes, calldata,
approvals, receipts и балансами](evidence/PONS_ZEROEX_EXECUTION_2026-10-02.json).
Три реальных ответа Pons API исполнены на отдельных локальных Hardhat fork.
Публичных транзакций нет; eligibility adapters, призовые правила и production не менялись.

Позднейшее [исследование graduation](PONS_GRADUATION_REVIEW_2026-10-02.md) нашло
реальные 0x → Pons pool сделки с hook fees. Приведённый ниже PRIORS split-route
показывает одну ветку, а не поведение всех aggregator-покупок.

## Результат

| Покупка за 101 USDG | Fork block | gasUsed обмена | Наблюдение |
|---|---:|---:|---|
| RDH | 78241717 | 218962 | Settler → Pons curve → Settler → пользователь |
| WETH | 78242092 | 219428 | Контрольный обмен; сам по себе не покупка промо-токена |
| PRIORS, graduated Pons V2 | 78243249 | 474115 | Split v3/v4; **целевой Pons pool не участвовал** |

Перед каждой покупкой allowance сброшен в ноль: estimate отклоняется с CALL_EXCEPTION.
После approve ровно 101 USDG тот же payload проходит estimate и реальную локальную
отправку. Балансы до/после согласуются с receipt Transfers, minAmountOut соблюдён.
Во всех трёх случаях USDG debit пользователя = 101, USDG refund пользователю = 0.
Граница partial fill/refund в этом прогоне не достигнута и не считается проверенной.

## Кто платит и кому идут токены

Внешний tx.from — тестовый taker `0x443E…c8C5`. Точка входа и allowance spender:
`0x0000000000001ff3684f28c67538d4d072c22734` (AllowanceHolder).
Внутренний исполнитель: `0x6aa80DbBed9ae5aB45FbF61f9644faDA3b29326E` (Settler).
`exec` передаёт ему действия; `execute` содержит конечного recipient и minimum output.
Это согласуется с [разделением ролей в документации 0x](https://docs.0x.org/docs/core-concepts/contracts).

В RDH receipt CurveBuy.buyer и recipient — Settler, а конечный TOKEN получен taker.
CurveBuy.quoteIn = **100,8485 USDG**. Ещё **0,1515 USDG (0,15% от 101)** перечислено
от Settler к `0xaD01C20d5886137e056775af56915de824c8fCe5` отдельным fee action.
Это наблюдение конкретной котировки, не постоянная ставка Pons/0x и не creator fee.
Нельзя приравнивать CurveBuy.buyer пользователю или считать wallet debit равным quoteIn.
Продуктовый принцип фактического списания с комиссиями сохраняется: для будущего
допуска потребуется доказать принадлежность всех списаний/возвратов конкретному BUY.

## Graduated-токен не означает торговлю в Pons pool

PRIORS `0xeDBf91223639800BCd5756815CAf908Df3b890bE` выбран из публичного
[каталога graduation](https://www.ponsfamily.com/api/pons-launches/graduations?catalog=1&v=12).
На fork factory.getLaunchedToken подтвердил phase=2, quote USDG, fee=0,
tickSpacing=200. Factory.memeHook = `0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044`.
По этим данным ожидаемый poolId:
`0xff7b3bd2db34d9ed8160e6dedf1d448777abaa1fa6fc8a31144930a1a656fd92`.

В выполненной 0x котировке после отдельной комиссии:

- 42,745140 USDG обменены через v3 на WETH, затем WETH через другой v3 рынок на PRIORS.
- 58,103360 USDG ушли в v4 pool
  `0x9be7ab27227e115085b0949a819a73f6963ddc6da0c6204d37757c24297706e8`.
  Его ID соответствует USDG/PRIORS, fee=10000, tickSpacing=100, **hook=нулевой адрес**.
- Полученные PRIORS собраны у Settler и переданы taker.

Ни одного Swap ожидаемого Pons pool нет. Поэтому эта транзакция не доказывает
поступления creator fee нашего выбранного venue. Существующий decoder правильно
не создаёт целевой pool BUY. Это не утверждение, что все 0x маршруты обходят Pons:
проверен конкретный ответ на конкретном состоянии. Но допуск «любой 0x BUY нашего
TOKEN» был бы ошибочным расширением правил. Матрица остаётся частично открытой.

## Source/runtime и границы доказательства

Sourcify runtime bytecode обоих посредников совпал по keccak256 с кодом на всех
трёх fork; metadata возвращает `runtimeMatch=match`, не заявляется новый independent
compiler verification. URL/хеши сохранены в capture. Settler source:
[развёрнутый RobinHoodTakerSubmittedFlat](https://sourcify.dev/server/v2/contract/4663/0x6aa80DbBed9ae5aB45FbF61f9644faDA3b29326E?fields=all).
Его POSITIVE_SLIPPAGE имеет четыре аргумента, тогда как текущий master
[ISettlerActions](https://github.com/0xProject/0x-settler/blob/master/src/ISettlerActions.sol)
содержит пять. Декодирование будущего adapter должно опираться на pinned deployment,
не на сегодняшнюю ветку master. Совпадение runtime само не допускает произвольные BASIC calls.

Исполнитель использует in-process Hardhat и read-only upstream proxy. Балансы ETH/USDG
синтетические, taker impersonated; calldata не переписываются, minimum output не снижается.
Quote живой и не привязан к точному fork block. Здесь существующие публичные токены,
не локально созданный QIANQI. Не проверены установленный MetaMask, выбор best-route UI,
native-input 0x, self-batch вокруг 0x, split/refund edge cases и полный draw/index/API cycle.
Диагностический inspect всегда возвращает `admission: NOT_IMPLEMENTED`.

## Воспроизведение и проверки

```powershell
node scripts/pons-zeroex-fork.cjs .local/logs/NEW-zeroex.json
node scripts/pons-zeroex-fork.cjs .local/logs/NEW-zeroex-pool.json --pool
node --test test/pons-zeroex-evidence.test.cjs test/pons-channel-attribution.test.cjs test/pons-pool-terminal.test.cjs
```

Runner требует новый output path; quotes/маршруты могут измениться, старые цифры
не являются ожиданием нового live прогона. Конкретные успешные отчёты:
`.local/logs/pons-zeroex-execution-b.json` и `pons-zeroex-pool-a.json`.
Первый `execution-a` не исполнен: debug_traceCall на исходном fork-block потребовал
неизвестную историю hardfork. Runner исправлен явным локальным evm_mine; guards не сняты.

**11/11 адресных tests PASS**, лог `.local/logs/pons-zeroex-tests.log`.
Проверены воспроизводимость анализа raw receipts, intermediary/fee separation,
split вне Pons pool, сохранение недопуска существующими decoders, отбрасывание
подмешанного receipt, removed/duplicate logs, изменённого taker/calldata/балансов.
Новый тест включён в full и pons-channels. Полный набор не запускался.

После добавления runtime-сверки AllowanceHolder новый файл повторно прошёл **4/4**:
`node --test test/pons-zeroex-evidence.test.cjs`, лог `.local/logs/pons-zeroex-final-tests.log`.
Локальные ссылки изменённых документов, состав test profiles и `git diff --check`
проверены без ошибок.

После [исследования graduation](PONS_GRADUATION_REVIEW_2026-10-02.md) следующий
пакет уточнён: воспроизведение реального 0x → Pons pool BUY и точный допуск.
Наблюдаемость неподдержанных покупок дополняет этот путь; начисления по одному
Transfer нет. Актуальная очередь — [ROADMAP](ROADMAP.md); production остаётся этапом B.
