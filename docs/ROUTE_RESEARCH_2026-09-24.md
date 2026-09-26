# Маршруты покупки: граница поддержки промо

## Актуальный фокус — 25.09.2026

**Обновление реализации:** узкий `rh-pair-auto-usdg-v1` подключён к decoder,
typed policy и полному scanner/replay. 1–2 legs, USDG funding, payer=recipient,
однократный gross debit. Новый fork прошёл registration/admission/ledger,
адресные проверки 55/55. Точные границы и evidence — [DIRECT_BUY_REPLAY](DIRECT_BUY_REPLAY.md).
Разделы ниже сохраняют этапы исследования; следующий шаг «написать adapter» уже закрыт.
Публичного допуска нет; генерации V2/Infinity не становятся поддержанными.

### AUTO controlled fork — положительный результат 25.09

Следующий шаг после recon выполнен. [Полный artifact](../research/pair-auto/fork-buy-2026-09-25.json),
upstream block **0x44f6adc**, local chain31337/Cancun. Использован настоящий
V1 ElonCoin `0xc71d692ff5323d818b425a9536301c5147ed3a6b` с двумя зарегистрированными
рынками. Runtime агрегатора совпал с source evidence, dependenciesConsistent=true;
pool keys сверены с launchpad.getLaunchPool и вычисленными pool ids.

| Сценарий | Фактический расход USDG | Получено TOKEN raw | Итоговых AggregatedBuy |
| --- | --- | --- | --- |
| Одна ветвь через quote первого рынка | 1000000 (1 USDG) | 78002591445803638534358 | 1 |
| Две ветви через quote двух рынков | 2000000 (2 USDG) | 155681336424405771013792 | 1 |

Получатель равен payer; сумма TOKEN delivery совпала с event и balance delta.
USDG списан одним transfer payer→aggregator; затем распределён по V3 конверсиям,
каждая quote-валюта оплачивает свой V4 BUY. Балансы агрегатора восстановлены.
Static calls с невозможным aggregateMinOut и повтором pool отклонены;
балансы пользователя после simulation не изменились. Текущий decoder отвергает
каждую ветвь как NOT_DIRECT_ROUTER_CALL. Промо/entries/RNG не исполнялись.

Команда: `node scripts/permit-buy-fork.cjs NEW_OUTPUT.json --auto`, с
RH_RPC_URL=https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public.
Fork exit0, read-only proxy 292 requests / 5 retries / 0 errors.
`node --test test/pair-auto-evidence.test.cjs` — 1/1 (~0.15 s): независимый
разбор сохранённых calldata/event/transfers/pool ids и отказ текущего decoder.
Syntax/diff проверены, full suite не запускался. Общий permit harness получил
только отдельный opt-in --auto; обычные режимы не заменены.

Ограничения: artificial USDG balance только local wallet, native gas Hardhat;
upstream не получает write RPC. Пул/ликвидность/код не изменялись. Это успешное
исполнение pinned контракта, не доказательство использования текущим UI,
популярности AUTO, совместимости V2/Infinity или production finality.
Пять ветвей, другой funding asset и recipient!=payer пока не проверялись.

**Далее:** узкий versioned AUTO adapter для USDG funding и payer=recipient.
Потребуется purchase-level идентичность (aggregator event), проверка всех legs
и запрет повторного зачёта их Swap. Входной объём — предлагаемый gross USDG debit
всей покупки, включая внутренние conversion fees; это не USDG delta последнего
V4 пула (там stock quote). До реализации закрепить эту семантику отдельно,
сохранить старые policy snapshots и не активировать маршрут задним числом.

### Результат первого AUTO recon, 25.09

- [Read-only RPC evidence](../research/pair-auto-buy-observation-2026-09-25.json):
  chain4663, anchor 0x44f59f6, 15 последовательных окон по 2000 блоков,
  фильтр AggregatedBuy на документированном агрегаторе. **0 событий**, anchor
  повторно совпал. Это короткое окно, не отсутствие использования AUTO вообще.
- [Source/ABI/bindings](../research/pair-auto/source-evidence.json) и
  [исходник](../research/pair-auto/PairV5MultiPoolAggregator.sol): Sourcify exact
  runtime/creation match; hash runtime совпал с RPC
  `0xcca69ea4c59b0c2c0ffc86505c8ffa913057ba837d39dd9faabd5d9feebebe6d`.
  Независимую перекомпиляцию не проводили. Семь immutable getters прочитаны на
  том же anchor; dependenciesConsistent=true. Это V1, не Launch V2/Infinity.
- AUTO вызывает UniversalRouter: Swap.sender в manager не обязан быть AUTO.
  Поэтому первоначальный поиск по sender агрегатора не годится для подсчёта
  его использования; итоговая выборка фильтрует event адрес самого агрегатора.
- buyExactInput принимает fundingToken (не только USDG), recipient и 1–5 legs.
  totalIn=sum(legs.amountIn), снимает totalIn с msg.sender; TOKEN направляется
  получателю. AggregatedBuy содержит payer/project/recipient/funding/amountIn/out.
  _restoreBalances требует равенства входных и конечных балансов агрегатора,
  не выдаёт refund. V3 conversion minimum в buy равен нулю, конечный TOKEN
  защищён per-leg и aggregate minima. Нельзя подменять это описанием «min USDG».
- Текущий decoder отвергает AUTO по NOT_DIRECT_ROUTER_CALL для наблюдаемого
  подходящего pool; если покупка идёт через другой pool, он вообще не создаёт
  кандидата для нашего manifest. Простое разрешение адреса не решает задачу.
- Повторён `node --test test/direct-buy.test.cjs`: **25/25**, ~1.3 s.
  Это replay сохранённых public/fork receipts и негативных сценариев, не новый
  пользовательский manual swap на сайте. Runtime не изменён.

RPC не принимает единый диапазон 30000 блоков; запрос разбит на 15 окон без
потери покрытия. Blockscout API вернул HTTP403. Ошибочные/предварительные
ответы оставлены в .local/logs, не выданы за положительные receipts.
Повторяемый сбор: `node scripts/research-pair-auto.cjs NEW_OUTPUT.json`.
Скрипт read-only, ограничен 30000 блоками/3 tx, сохраняет ошибки, не перезаписывает
существующий файл. Частичная выборка после ошибки не доказывает отсутствие событий.

**Следующий ограниченный шаг:** controlled fork buyExactInput на существующем
V1 reference с USDG и payer=recipient, сначала одна ветвь, затем split при наличии
подходящего token/pools. Проверить calldata/event/transfers/pool provenance вместе.
Предлагаемый учёт — один purchase на вызов, сумма реально списанного USDG один раз,
включая стоимость внутренних конверсий, без повторного зачёта промежуточных hops.
Это предложение для нового adapter, ещё не активное правило nominal USDG.
Funding не в USDG, wrappers и payer!=recipient остаются вне первого расширения.
Новый decoder без положительного receipt в этом пакете не добавлен.

Пользователь подтвердил выпуск на PAIR. Ниже — актуальный порядок исследования;
ранние разделы описывают историю шагов, а не список оставшихся задач.
Проверен scripts/direct-buy.cjs: реализованы rh-ur-10-060b0e-v1,
rh-ur-10-060c0f-v1 и rh-ur-0a10-060b0e-v1. Они требуют прямого вызова router,
однозначных settlement/delivery и payer=recipient; replay всё ещё проверяет
регистрацию на момент BUY. Поддержка кода не означает публичную активацию.

| Канал/семейство | Подтверждение | Наш статус и следующий шаг |
| --- | --- | --- |
| PAIR manual / Universal Router | PAIR docs описывают Permit2 и selected-market V4 swap | Три узкие USDG формы поддержаны; сверить текущую транзакцию UI с этими формами |
| PAIR AUTO | Документирован balanced aggregator: USDG, конверсия quote, до пяти V4 legs | Не поддержан decoder; первый приоритет для calldata/receipt/recipient/refund исследования |
| PAIR custom quote | Документирован отдельный signed USDG bridge, не AUTO | Отдельный кандидат только при выборе такого launch release; не переносить правила AUTO |
| Uniswap UI / сторонний Universal Router caller | Совпадение интерфейса не требуется для уже допустимой формы | Проверять исполнение, не бренд; multihop/exact-out/wrappers автоматически не допущены |
| Robinhood Wallet, 0x/LI.FI | Справка Robinhood подтверждает swap в сети через агрегаторы | Конкретный PAIR TOKEN/маршрут пока не доказан; нужен executable quote и receipt |
| 1inch Classic / Fusion | Справка 1inch подтверждает сеть и режимы | Нужен конкретный PAIR TOKEN; Fusion требует атрибуции владельца ордера, не tx.from |
| GMGN / прочие терминалы и боты | PAIR docs упоминают прямую торговлю RWA-пулом в GMGN | Это документационное указание, не наш проверенный BUY; искать конкретный receipt |

Перепроверенные первичные источники 25.09:
- https://pair.fund/docs
- https://robinhood.com/us/en/support/articles/send-receive-and-swap-crypto/
- https://help.1inch.com/en/articles/15781744-how-to-use-1inch-on-robinhood-chain

Ближайший ограниченный пакет: на существующих PAIR reference-токенах получить
evidence manual и AUTO, закрепив release/pool/code hashes/block. Для каждой покупки
показать фактический payer, конечного получателя, quote расход/возврат и TOKEN output.
Отделять найденный публичный receipt от controlled fork с искусственным капиталом.
Не выдавать пример старого V1 за поддержку Launch V2/Infinity: AUTO в документации
описан для V1; Infinity использует Pancake Infinity CL, а не наш V4 decoder.
По AUTO отдельно определить USDG-объём, относящийся к покупке, и защиту от двойного
учёта ветвей. До этого не реализовывать общий aggregator decoder.

Победитель/размер приза не зависят от интерфейса покупки: расширение касается входа
в entries, не RNG или призовой математики. Регистрация и автоматизация выплат —
отдельные незакрытые продуктовые/реализационные границы, этим исследованием не сняты.

Этот шаг — сверка кода и документационных источников; новых RPC/fork/публичных
транзакций не выполняли, частоты маршрутов не измеряли. Runtime не менялся.

24.09.2026. Read-only исследование; не утверждение новых правил или production support.
Текущий decoder по-прежнему принимает только две direct USDG формы из
[DIRECT_BUY_REPLAY](DIRECT_BUY_REPLAY.md). Новые правила ниже — предложение.

## Что подтвердили внешние источники

| Семейство | Подтверждение | Значение для нас |
| --- | --- | --- |
| Uniswap multihop | [Официальный пример](https://developers.uniswap.org/docs/sdks/v4/guides/swapping/multi-hop-swapping) | Исходный актив может отличаться от quote последнего пула. Нужны path и settlement, не только один Swap. |
| PAIR AUTO | [PAIR docs](https://pair.fund/docs): V1 balanced aggregator, USDG через V3-конверсию в Stock Token и один/несколько V4-пулов | Одна покупка может содержать до пяти ветвей; адрес агрегатора отличается от UniversalRouter. |
| Robinhood Wallet | [Официальная справка](https://robinhood.com/us/en/support/articles/send-receive-and-swap-crypto/): 0x и LI.FI | Пользователь может покупать из кошелька через дополнительный контракт. Это не доказательство поддержки конкретного PAIR-токена. |
| 1inch | [Справка по Robinhood](https://help.1inch.com/en/articles/15781744-how-to-use-1inch-on-robinhood-chain): Classic, Fusion, Limit | Resolver/settlement требует отдельной атрибуции владельца ордера; tx.from не универсальный покупатель. |

Реальные страницы проектов показывают несколько рынков и AUTO:
[Commotitties](https://pair.fund/tokens/0x350cadde605e083f58d286e8b3a6b086685fa1ec)
(GLD/USO/SLV),
[ElonCoin](https://pair.fund/tokens/0xc71d692ff5323d818b425a9536301c5147ed3a6b)
(TSLA/SPCX). Это примеры устройства продукта, не измерение популярности маршрутов.

PAIR поколения нельзя смешивать: документация различает V1, Launch V2 и Infinity;
последнее использует другую pool architecture. Для нашего deployment проверять
именно выбранное поколение. Ни наличие интерфейса, ни документация не гарантируют
ликвидность между любой парой токенов. Контракт самого токена PAIR в этой выборке
отдельно не идентифицирован; наблюдение пользователя не подменено другим токеном.

## Ограниченная on-chain проверка

Evidence: [route-observation-2026-09-24.json](../research/route-observation-2026-09-24.json).
Chain 4663, PoolManager `0x8366a39cc670b4001a1121b8f6a443a643e40951`;
блоки 71157236–71159235, 24.09 06:30:43–06:34:07 UTC.
Получено 2614 Swap, 2256 уникальных tx, 440 pool ids. У 1103 событий sender —
известный UniversalRouter; это 1071 tx, не 1071 пользователь и не 1071 BUY.
Остальные адреса автоматически агрегаторами/брендами не объявляем.

Проверены tx + receipt + block hash для 12 детерминированно выбранных примеров:
по два tx четырёх ведущих sender, ещё четыре равномерно по окну, без повторов.
Все успешны, anchor при повторной проверке совпал. Это не proof of finality.

- `0xef54b1347d0d84c78e18e7e9d22d98ce636e5e23347dbcf539663a219c3c854d`:
  UniversalRouter, commands `0x10`, V4 actions `0x060b0e`.
- `0xee46fd960864754f009c47d93668af0744091f9392b207012aa72f7336d650e2`:
  тот же router, commands **`0x0a10`**, те же V4 actions. Совпадение swap action
  не означает совпадение всей формы calldata или eligibility нашего TOKEN.
- `0x9d4ada4902a060e20bbdafe3790ffd19d9a81e24befb0d4d8e5946da270025e8`:
  top-level to `0x0000000000001ff3684f28c67538d4d072c22734`, два manager Swap;
  один из sender — `0x6aa80dbbed9ae5ab45fbf61f9644fada3b29326e`.
  Наглядное отличие адреса внешнего вызова от адреса исполнителя в пуле.

Не измеряли объём/долю рынка, retail/bot, продажи против покупок и покрытие PAIR
по этой общей выборке. Она короткая и намеренно стратифицированная; это поиск
форм исполнения, не репрезентативная статистика. Поддержку нового BUY не доказала.
Первые широкие запросы истории/init получили timeout и HTTP/RPC 429; такие
неполные результаты не включены в выводы. Повторная проверка использовала только
успешно сохранённый bounded logs response, последовательные запросы с паузой 1.2 s
и остановкой при первой ошибке. Полные неудачные dumps остались локально.

Скрипт повторной проверки сохранённой выборки (read-only, новый output обязателен):

```text
node scripts/research-route-census.cjs research/route-observation-2026-09-24.json .local/logs/route-recheck.json
```

## Предлагаемая граница учёта

Уточнение пользователя: точка наблюдения — наш TOKEN, а не каталог всех исходных
токенов/интерфейсов. Это принимается как направление исследования, не как новое
правило выдачи билетов за любые transfers.

Предлагаемый pipeline: TOKEN Transfer → candidate tx → receipt + Swap разрешённого
пула → доказанная оплата и доставка → participant → однократный зачёт объёма.
Transfer — обнаружение кандидата, не доказательство покупки. Переводы между своими
кошельками, prize claim, liquidity withdrawal, mint и bridge arrival сами по себе
не дают билетов. Поле from в Transfer — предыдущий держатель, не обязательно payer;
to — непосредственный получатель, не обязательно участник. В V4 общий PoolManager
обслуживает много пулов: адрес источника Transfer не заменяет проверку pool id.

Список известных посредников полезен для выбора адаптера и проверяемых code hashes,
но не является классификатором «любой другой адрес — человек». Smart wallet может
быть участником; tx.from может быть relayer. Для поддержанной формы исполнения
доказывать роль по calldata/параметрам ордера и фактическому settlement.
Неоднозначные batch/refund/cycle случаи не превращать в last-transfer эвристику.
Текущий direct decoder уже сверяет Swap и TOKEN/USDG Transfer, но требует direct
router call и payer=recipient; эту границу нельзя снять одним address allowlist.

Не добавлять отдельный decoder на каждый исходный ERC20. Поддерживать проверенные
семейства исполнения и отдельно допустимые пулы/активы/правило оценки:

1. `другой актив → USDG → наш TOKEN`: кандидат для следующего адаптера.
   Зачёт — фактический USDG, относящийся к покупке в разрешённом пуле. Оракул
   не требуется, если это единственная однозначно выделяемая покупка.
2. `USDG → промежуточный актив → наш TOKEN`: возможно, но нельзя просто взять
   весь input транзакции. Нужна сверка относящихся к покупке ветвей, refunds,
   комиссий и получателей; точную границу USDG-объёма надо утвердить до кода.
3. `другой актив → наш TOKEN` без USDG: отдельное решение об оценке. Нельзя
   незаметно добавить текущую цену/оракул в правило «100 nominal USDG».
4. Split/batch/solver: не считать каждый hop самостоятельной покупкой, не
   начислять билеты роутеру или solver. Неоднозначный результат не засчитывать.

Кандидат результата адаптера: chain/tx, непересекающиеся purchase/log identifiers,
проверенный participant, TOKEN received, eligible USDG, pool и adapter version.
Для batch одного tx hash недостаточно; нужны защита от пересечения адаптеров,
частичного исполнения и повторного учёта одних средств. Получение Transfer само
по себе не доказывает BUY. Текущие требования регистрации сохраняются.

Объявление нового маршрута заранее, с будущим fromBlock; прошлые/frozen datasets
остаются на прежней политике. Не обещать на сайте поддержку до реализации,
публичного объявления и активации. Welcome/holdings бонус не возвращаем.

## Следующий ограниченный пакет

1. Закрыть найденные review границы policy source: произвольный JSON способен
   остановить replay; отсутствие buyPolicy не должно молча снимать admission.
   Typed объявления нужны, но не пожизненный hardcode только двух маршрутов.
2. На основании реального receipt выбрать один multihop USDG→TOKEN вариант,
   формализовать attribution/settlement и сделать positive/negative vectors.
   Проверять runtime/ABI выбранного deployment, не переносить ABI из общей статьи.
3. Затем реализовать этот adapter и versioned activation целиком. PAIR AUTO и
   wallet/solver маршруты — последующие отдельные adapters после evidence.
4. Независимый replay перед первым begin сохранённого job остаётся открытым
   пунктом review; самосогласованный checksum не доказывает верность участников.

Не требуется менять PromoVault, призовую математику или разводить отдельную
систему билетов для каждого кошелька/интерфейса. Поддержка всех возможных calldata
не обещается. Приоритеты выше основаны на сложности и документированных путях,
а не доказанной доле рынка.

## Проверка кандидата 0x0a10 после pre-begin replay

24.09.2026. Поддержка decoder НЕ расширена; это законченная read-only проверка
кандидата, не реализованный BUY adapter.

`0x0a = PERMIT2_PERMIT`, `0x10 = V4_SWAP` по
[Uniswap reference](https://developers.uniswap.org/docs/protocols/universal-router/concepts/commands).
Сохранённый `contracts_base_Dispatcher.sol` вызывает Permit2.permit для msgSender(),
передавая PermitSingle (token/amount/expiration/nonce, spender, sigDeadline) и подпись.
Это разрешение на списание, не доказательство покупки или размера eligible USDG.

Повторно получены tx/receipt/header для
`0xee46fd960864754f009c47d93668af0744091f9392b207012aa72f7336d650e2`:
commands `0x0a10`, actions `0x060b0e`, успешная квитанция и совпавший block hash.
Но вход — `0x798Cf9C4648638ce25FFA3A7d33b256968Ae06E0`, выход пула — native ETH.
USDG в этой паре нет. Этот sample нельзя использовать как положительный BUY vector.
[Сохранённый ответ](../research/permit-route-evidence-2026-09-24.json).

RPC НЕ предоставил historical state для eth_getCode на блоке этой tx. Runtime
прочитан на отдельном свежем runtimeBlock, hash совпал с нашим pinned router:
`0x2ce6aaaf9f4151f5e1cbf774668772f17f532ae11b15e9284fd0a072a8b0fbde`.
Это не подменяет проверку кода на историческом блоке; ошибка сохранена в evidence.

Дополнительно разобраны пять USDG-input Swap кандидатов из прежнего 2000-block
окна, только среди 77 успешно определённых pools незавершённого init census:
три direct tx используют `0x10`, две имеют другие top-level targets. Ни одного
`0x0a10` в этих пяти нет. Среди двух последних есть wrapper перед manager/router;
их нельзя считать прямыми только по Swap.sender.
[Tx, Swap и Initialize evidence](../research/permit-usdg-candidates-2026-09-24.json).
Это не полный поиск и не доказательство отсутствия permit+USDG покупок в сети.

Следующий проверяемый путь — controlled fork test настоящего router/Permit2 с
USDG и подходящим TOKEN-пулом. До теста проверить доступность необходимого state
у RPC. Fork transaction будет явно тестовой, не публичной покупкой. Если нужен
публичный positive receipt — искать ограниченную целевую выборку, не включать
adapter на основании одной synthetic подстановки calldata в прежний receipt.

После positive execution проверять как минимум exact commands без allow-revert,
permit token/spender, payer=recipient, фактический USDG settlement, отсутствие
дополнительных transfers/batch/refunds и activation block. Permit event сам по себе
не создаёт билетов. Signature semantics должны опираться на исполненный pinned
router/Permit2, а не на одну длину подписи или ручное восстановление EOA.

Воспроизводимая read-only проверка сохранённого кандидата:
`node scripts/research-permit-route.cjs NEW_OUTPUT.json`.
Проверены syntax, структура RPC evidence, направления swap и source hash;
продуктовые unit/full/fork tests и публичные sends не запускались.

## Controlled fork: положительный Permit2 + USDG BUY

24.09.2026. Предыдущий пробел positive execution закрыт для одной узкой формы.
Это LOCAL fork, не публичная сделка нашего проекта и не activation adapter.

Команда: `node scripts/permit-buy-fork.cjs NEW_OUTPUT.json`.
Upstream по умолчанию официальный RPC, замена через RH_RPC_URL. Upstream доступен
только через existing read-only proxy; отправки идут в Hardhat chain31337.
Выходной файл не перезаписывается. Подмена кода router/Permit2/pool отсутствует.

Evidence:
- [Проверка доступности RPC](../research/permit-buy-fork-probe-2026-09-24.json).
- [Диагностика первого исполнения](../research/permit-buy-fork-diagnostic-2026-09-24.json).
- [Успешный fork](../research/permit-buy-fork-positive-2026-09-24.json).

Старый block 0x3c89e39 недоступен: официальный endpoint не хранит historical
state, blockreq public ограничен последними 32768 блоками. Оба возвращают
текущий router code. Fork свежего блока доступен.

Первый запуск свежего fork прочитал runtime, но eth_call на самом fork block
отклонён Hardhat: для chain4663 не задана история hardfork. Это НЕ revert USDG:
публичный decimals() вернул 6, внутренний trace тоже сообщил ошибку выбора hardfork.
Решение harness — evm_mine пустого локального блока перед исполнением. Не задаём
выдуманную историю hardfork сети и не заменяем USDG. Исполнение после fork идёт
по настроенному локальному Cancun; Nitro-specific execution этим не сертифицирован.

Успешный run: исходный блок **0x43f3b4e**, первый локальный **0x43f3b4f**.
Пул и TOKEN — ранее найденный существующий public reference, не наш deployment.
Тестовому Hardhat wallet изменён только USDG balance storage slot (1000 USDG);
пул/его ликвидность и остальные контракты не редактировались. Native gas оплачивает
локальный Hardhat account. Это искусственный тестовый капитал, не public funding.

Затем настоящий ERC20 approve даёт доступ Permit2. Прямого Permit2 approve для
router нет: allowance до swap = 0. Пользователь подписывает PermitSingle EIP-712
с domain chain31337. Router execute commands **0x0a10**, actions **0x060b0e**:
- успешный receipt, ровно один Swap нужного pool id;
- фактически списано **100000000 raw USDG = 100 nominal USDG**;
- TOKEN доставлен тому же payer, положительный balance delta;
- ровно два TOKEN/USDG Transfer: payer→manager, manager→payer;
- nonce Permit2 **0→1**, allowance после обмена = 0 (лимит 100 USDG израсходован);
- runtime hashes шести контрактов сохранены, router совпадает с pinned hash;
- read proxy: 202 requests, 0 retries, 0 errors.

Проверены script syntax и offline assertions evidence. Текущий production decoder
на этом receipt возвращает `COMMAND_SEQUENCE`: случайного допуска не произошло.
Регистрации/выдачи билетов и нового adapter в этом шаге нет, signature-negative
vectors ещё не выполнены. Full suite не требуется: runtime код проекта не менялся.
Следующий пакет — decoder именно для этой формы, negative vectors и versioned
future activation; не обобщать результат на multihop, другие routers или recipients.
