# Маршруты покупки: граница поддержки промо

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
