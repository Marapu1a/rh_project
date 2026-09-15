# Текущий ответ GPT

Обновлено: 15.09.2026.
Просмотрен latest request commit `2d2d540bd50d164aba573926e8278e4244ca36ee`, а также реализованные commits `d6216fee06cf701fff180b81eac721e09e5ea216` и `a884f2ac2f898e53e6391fd5d9a0053d25f119ee`.

Фактически прочитаны:

- `contracts/ParticipantRegistry.sol` и `test/participant-registry.test.cjs`;
- `docs/PARTICIPANT_REGISTRY.md`;
- `contracts/ShortPrizeBasket.sol` и `test/short-prize-basket.test.cjs`;
- `docs/SHORT_PRIZE_BASKET.md`;
- `docs/INDEXER_TRUST_MODEL.md`;
- актуальные разделы 7–9 `PRODUCT_SPEC.md` и `IMPLEMENTATION_STATUS.md`;
- `scripts/economics-fork.cjs` и test-only `SwapFixture` из `test/contracts/Fixtures.sol`;
- ранее сохранённые PAIR native hook/coordinator sources только в той мере, в какой они относятся к attribution.

Тесты в этом проходе мной не запускались. GitHub workflow/status для latest commit пусты. Ниже отделяю чтение кода от предложений.

Тема: **ParticipantRegistry + ShortPrizeBasket review и минимальная схема BUY → entries / replay**.

## Подтверждение владельца после ревью

Владелец согласовал все три предложенные MVP-границы:

1. `payer == finalRecipient == registered wallet` — только такой BUY получает entries в MVP. `payer != recipient` пока не засчитывается.
2. Порог entry трактуется как **100 USDG nominal в raw units**, а не как динамическая рыночная стоимость `$100` через внешний oracle. Для 6-decimal USDG: `100 * 10^6 = 100000000` raw units.
3. В MVP поддерживается один явно определённый direct TOKEN/USDG route. Aggregator / multihop / batch / ambiguous routes не получают entries до появления отдельного детерминированного decoder.

Дополнительно подтверждено общее направление ответа: explicit statuses для неподдержанных/неоднозначных swap-кандидатов, полный replay из public chain history, carry в raw units и следующий этап `PAIR direct-BUY evidence + deterministic replay v1`.

Эти решения можно считать принятыми для следующего этапа. Не требуется возвращаться к USD oracle или расширению route scope перед его реализацией.
## Короткий вердикт

Оба новых компонента выглядят удачно изолированными. Критического дефекта в `ParticipantRegistry` или арифметике `ShortPrizeBasket` не вижу.

Основная следующая сложность действительно не Solidity, а **доказуемая атрибуция BUY**:

> надо уметь из публичной истории канонического TOKEN/USDG pool получить полный набор swap-кандидатов, а затем для каждого детерминированно доказать payer, final recipient и фактический USDG input.

Текущий historical fork этого ещё не доказывает: там торговал наш test-only `SwapFixture`, а `grossBuyRaw` считался по balance delta тестового кошелька. Это хорошее экономическое evidence, но не production decoder.

Для MVP рекомендую сознательно поддержать **один узкий direct route**, а все неоднозначные aggregator/multihop/batch случаи явно помечать unsupported, а не угадывать.

---

## 1. Ревью ParticipantRegistry

### Существенных code findings нет

`register()` делает ровно одну вещь:

```text
registered[msg.sender] false → true
+ Registered(msg.sender)
```

Нет owner, third-party enrollment, backdating, unregister, внешних calls или proxy. Для выбранного одноразового opt-in это хорошая trust boundary.

Smart wallet semantics тоже правильные: регистрируется тот contract wallet, который **сам вызывает** registry. Generic forwarder/relay, вызвавший `register()` от своего адреса, зарегистрирует себя — это уже честно описано в документации.

Отсутствие `unregister()` само по себе не проблема: eligibility — исторический факт opt-in, а не текущая membership subscription.

### Finding PR-1 — LOW / data-model, не Solidity

Для исторической записи одного порядка

```text
(blockNumber, transactionIndex, logIndex)
```

недостаточно как долговечного identity при reorg.

Для raw occurrence хранить минимум:

```text
chainId
registry address
blockNumber
blockHash
transactionHash
transactionIndex
logIndex
participant
```

Порядок по-прежнему задаётся `(blockNumber, transactionIndex, logIndex)`, а `blockHash`/parent linkage отвечает за каноничность.

`INDEXER_TRUST_MODEL.md` уже требует chainId/address/blockHash, поэтому это не архитектурная ошибка — лучше просто сделать такую схему обязательной в indexer.

### Finding PR-2 — LOW / deployment convention

Фраза «один registry соответствует одному экземпляру promo» не обеспечивается байткодом: registry не знает `PromoVault`, TOKEN или instance id.

Это нормально, но должно оставаться **manifest/controller binding**, а не контрактной гарантией.

Минимальная защита: snapshot domain всегда содержит конкретный `ParticipantRegistry` address + chainId + promo instance/version.

### Чего не надо добавлять

- admin registration/unregistration;
- `tx.origin`;
- mutable terms/version setter;
- off-chain allowlist как источник права участия.

Если когда-нибудь понадобится новый opt-in semantics/terms, проще новый registry/version, чем переписывать историю старого.

---

## 2. Ревью ShortPrizeBasket

### Арифметика выглядит корректно

Логика:

```text
sumW = Σ weights
unit = floor(budget / sumW)
prize[i] = unit * weight[i]
total = unit * sumW
remainder = budget - total
```

безопасна по uint256:

- overflow суммы weights проверяется;
- `unit <= budget / sumW`, поэтому `unit * sumW <= budget`; 
- так как `weight[i] <= sumW`, каждый `unit * weight[i] <= budget`; 
- `minimumUnit * sumW` вообще не вычисляется, поэтому threshold не создаёт отдельного overflow;
- нулевые weights/template/minimum отклоняются.

Интеграционный тест с PromoVault правильно показывает, что late funding не меняет frozen budget, dust и невыданные slots возвращаются в Short через `finalize`, а старые claims сохраняются.

### Finding PB-1 — MEDIUM как production gate, сейчас не exploitable

`build()` линейна по `weights.length` и сама не ограничивает K.

Сейчас это internal pure library без production controller, поэтому у пользователя нет входа для gas-DoS. Но перед production rules нужно обязательно зафиксировать **bounded K** в rules/controller.

Не обязательно зашивать cap в библиотеку сегодня. Важно, чтобы future freeze не принимал произвольный user-supplied массив.

### Finding PB-2 — LOW / freeze invariant

Библиотека детерминирована, но сама не доказывает, что controller вызвал её с тем же `budget/weights/minimum`, которые были committed до random.

Документация это уже честно признаёт. В future snapshot/commitment фиксировать либо всю готовую корзину, либо canonical serialization её inputs + computed basket hash.

### Документация

`SHORT_PRIZE_BASKET.md` обещает не больше, чем код. Старые `51/51` и новые `57/57` — хронологические результаты разных этапов, не противоречат друг другу.

У `IMPLEMENTATION_STATUS.md` только косметически устарел заголовок «проверено 13.09», хотя внутри уже есть изменения 15.09.

---

## 3. Кому засчитывать BUY: минимальная MVP-граница

Сохранённых данных недостаточно, чтобы честно написать production decoder для PAIR UI/UniversalRouter. `economics-fork.cjs` использует наш test-only `SwapFixture`, который явно передаёт `payer=msg.sender` и получает output тому же payer.

Это **не** доказательство production route.

Поэтому сначала зафиксировать policy, а потом собрать реальные receipt/calldata intended route.

### Рекомендованный MVP rule

Самый чистый вариант:

> eligible BUY только если один поддерживаемый direct TOKEN/USDG swap однозначно доказывает `payer == finalRecipient == registered wallet`.

Это снимает спор «кто заработал entry» при gifts/relayers и делает replay проще.

### Минимальная таблица

| Случай | MVP | Что требуется доказать |
|---|---|---|
| Обычный EOA, direct supported TOKEN/USDG route, payer=recipient | **Eligible** | canonical pool swap + payer + final recipient + actual quote input |
| Smart wallet, который сам зарегистрирован и является payer=recipient | **Eligible**, если route decoder поддерживает этот вызов | нельзя использовать `tx.from`; bundler/EntryPoint не участник |
| Known router, один direct single-hop swap | **Eligible** после route-specific decoder | exact command/calldata + receipt evidence |
| payer != recipient | **Unsupported для MVP** | позже нужен отдельный продуктовый выбор, кому принадлежат entries |
| Несколько relevant swaps в одном batch/multicall | **Unsupported сначала** | нужен action-level decoder и разделение settlement |
| Aggregator / multihop | **Unsupported сначала** | pool Swap сам по себе не доказывает payer/recipient и экономику всего path |
| Exact-output direct swap | Можно поддержать только после decoder test | считать actual spent quote после refund, не maximum input |
| Прямой ERC20 transfer TOKEN/USDG | **Not a BUY** | нет canonical swap |
| SELL TOKEN→USDG | **Not eligible** | direction определяется canonical pool swap |
| Developer buy при launch | **Not eligible**, пока явно не принято обратное | отдельный launch path, не обычный registered BUY |

Поддержка smart-wallet registration **не означает**, что любой aggregator route этого wallet автоматически eligible.

### Явный статус неопределённости

Indexer должен хранить для каждого canonical pool swap candidate:

```text
ELIGIBLE
INELIGIBLE
UNSUPPORTED_ROUTE
AMBIGUOUS
```

и reason code/evidence.

Только `ELIGIBLE` меняет carry.

Неоднозначный swap нельзя молча пропустить из публичного отчёта: независимый verifier должен видеть, что swap найден в pool history и почему он не засчитан.

---

## 4. Откуда брать полный набор BUY-кандидатов

Для полноты начинать не со списка нашего сервера и не с wallet transactions.

Для конкретного promo instance известен canonical `poolId`.

Verifier/indexer проходит весь диапазон blocks и собирает **все canonical PoolManager Swap logs этого pool**.

Каждый такой log — candidate.

Дальше для tx кандидата читаются:

- raw transaction calldata;
- receipt + все logs;
- known router/version code/ABI;
- instance manifest (TOKEN, USDG, poolId, currencies).

И route-specific decoder решает direction/payer/recipient/actual quote input.

`Swap.sender` нельзя автоматически считать участником: на router path это обычно инфраструктурный caller PoolManager. Исторический `SwapFixture` уже показывает архитектурно, что между wallet и PoolManager есть отдельный contract caller.

Если production route невозможно доказуемо декодировать из calldata + receipts без node-specific trace, я бы **не делал trace обязательным consensus input**.

Два варианта:

1. этот route объявить unsupported;
2. позже сделать маленький canonical promo buy router, который после успешного direct swap публикует достаточное on-chain evidence.

Trace полезен как diagnostic, но плох как единственный публично воспроизводимый источник истины.

---

## 5. Gross BUY: что именно считать

Рекомендованное определение:

> `grossBuyRaw` = фактическое количество USDG raw units, которое было **settled into the supported canonical direct swap** как quote input.

Не wallet balance delta вообще и не declared/max input.

### Включается

- фактический quote input canonical pool;
- pool swap fee, если она является частью фактически settled input.

### Не включается

- gas в ETH;
- approval/Permit2 allowance;
- exact-output `amountInMaximum`, если часть вернулась;
- отдельная router/service fee вне pool swap;
- tips;
- unrelated USDG transfers в той же транзакции;
- SELL proceeds;
- creator revenue.

То есть отдельная router fee не должна печатать entries: она не является TOKEN purchase volume канонического pool.

### Exact-in

Считать фактически settled quote input, а не только calldata `amountIn`, пока decoder не доказал, что они обязаны совпасть.

### Exact-out

Считать фактически consumed quote after refund, не max.

### Что текущий fork действительно показал

В test-only fixture для BUY 100 скрипт получил wallet quote delta `-100 USDG` и именно её использовал как `grossBuyRaw`. Это полезный sanity check, но не доказывает, какое поле production PoolManager/router event надо использовать.

Следующий этап должен на настоящем intended route сравнить:

```text
calldata amount
PoolManager Swap delta
ERC20/Permit2 transfers
payer balance delta
refunds/router fees
```

и выбрать минимальный достаточный evidence set.

### `$100` против `100 USDG`

Для полностью детерминированного MVP проще всего формализовать:

```text
ENTRY_THRESHOLD = 100 * 10^USDG_decimals raw units
```

то есть **100 USDG nominal**, без внешнего price oracle.

Это надо принять явно: такая формула не доказывает рыночный peg USDG к доллару. Если продукт хочет именно market-value `$100`, потребуется отдельный price source/time rule.

---

## 6. Минимальная replay model

Локальная БД — только materialized view. Детерминированный reducer должен восстанавливаться с deployment genesis.

### Instance manifest

```text
chainId
ParticipantRegistry address + deployment block
PoolManager
poolId
TOKEN
USDG + decimals
supported route/version(s)
entryThresholdRaw
decoderVersion
promo/controller/rules version
```

### Raw canonical occurrences

**Registration**

```text
blockNumber/blockHash/parentHash
txHash/transactionIndex/logIndex
participant
```

**Swap candidate**

```text
blockNumber/blockHash/parentHash
txHash/transactionIndex/logIndex
poolId
raw Swap fields
```

**Buy decision** (derived, reproducible)

```text
candidate id
status
payer
recipient
grossQuoteRaw
routeVersion/decoderVersion
reasonCode
evidence log indexes
```

### Wallet reducer

Для каждого wallet:

```text
carryRaw
entriesMintedTotal
shortAttemptsAvailable/Frozen/Consumed
monthlyAttemptsAvailable/Frozen/Consumed
```

На ELIGIBLE BUY:

```text
x = carryRaw + grossQuoteRaw
newEntries = floor(x / ENTRY_THRESHOLD_RAW)
carryRaw = x % ENTRY_THRESHOLD_RAW

short += newEntries
monthly += newEntries
```

Все вычисления integer raw units.

### Draw consumption ledger

Каждый freeze/settlement ссылается на:

```text
drawId + kind
cutoff block number/hash
snapshot/rules version
wallet → frozen attempts
terminal random/result
wallet → consumed attempts
```

Short consumption не меняет monthly, и наоборот.

---

## 7. Reorg / idempotency / completeness

### Ingestion

Обрабатывать blocks только с проверкой parent hash.

Если новый canonical head не продолжает локальный head:

```text
найти common ancestor
→ удалить/пометить orphan raw occurrences
→ rollback derived buys/carry/attempts/draw-open state
→ replay canonical branch
```

Повторное чтение тех же block/log не должно менять state.

Raw occurrence key лучше хранить как:

```text
(chainId, blockHash, txHash, logIndex)
```

а tx/log identity отдельно для поиска re-inclusion.

### Регистрация и BUY в одном block/tx

Eligibility определяется порядком canonical confirmation event.

Предлагаю считать моментом BUY сам canonical PoolManager `Swap` log этого pool. Тогда registration должна быть строго раньше него по `(blockNumber, txIndex, logIndex)`.

Если production decoder выберет другой canonical confirmation event, это должно быть versioned rule, а не эвристика.

### Completeness

Independent verifier не получает «наш список BUY». Он сам:

```text
scan Registry Registered logs
scan every Swap log of poolId
decode every candidate
replay every previous draw consumption
```

из собственного RPC.

Именно так обнаруживаются и лишние, и пропущенные entries.

Нужен RPC, способный прочитать всю required history; наш зеркальный JSON не заменяет independent chain source.

### Finality

Не выбираю случайные `N confirmations`: из текущих материалов безопасный production параметр Robinhood Chain не доказан.

До выбора finality policy indexer должен различать:

```text
seen
canonical-at-current-head
eligible-for-commit
```

а `latest` не считать final.

Если RPC/providers не позволяют подтвердить требуемую canonical history или расходятся — **не freeze новый snapshot**, а остановиться.

### Reorg вокруг on-chain commitment

Если snapshot commitment находится в той же chain позже cutoff, нормальный reorg ancestor удалит и descendants, включая commitment/random/settlement tx на orphan branch.

После этого canonical reducer строится заново.

Future commitment всё равно должен включать cutoff block hash и instance domain; verifier проверяет, что cutoff является canonical ancestor.

Если commitment canonical, но заявленный cutoff hash не является его ancestor/не найден — это не «переоценить данные», а fail/halt.

---

## 8. Следующий один пакет работ

Не production indexer целиком.

Предлагаю пакет **`PAIR direct-BUY evidence + deterministic replay v1`**.

### Часть A — получить реальные данные intended route

На свежем local fork текущего PAIR release провести именно тем route, который собираемся поддерживать в frontend:

1. registered EOA direct BUY exact-in;
2. BUY меньше threshold + следующий BUY, пересекающий threshold;
3. SELL;
4. BUY до registration и после registration;
5. если UI поддерживает exact-out — exact-out с refund;
6. smart wallet direct route, если он входит в MVP;
7. один deliberately unsupported batch/aggregator example, если легко получить.

Сохранить raw:

```text
tx input
receipt/logs
pool key/id
relevant token transfers
pre/post balances только как diagnostic
router address + verified source/ABI/code hash
block/hash
```

Trace сохранить можно, но decoder не должен зависеть только от trace.

### Часть B — route decoder

Чистая функция:

```text
(instance manifest, tx, receipt)
→ zero/one/many swap candidate decisions
```

с explicit statuses/reasons.

Никакой базы и carry внутри decoder.

### Часть C — block-range replay

Минимальный indexer/replay:

```text
scan registrations
scan all canonical pool Swap logs
fetch tx/receipts
decode
sort
apply registration rule
apply carry → entries
output canonical ledger
```

Выход — deterministic file + hash, но файл не объявляется source of truth.

### Acceptance

- повторный replay того же range byte-for-byte одинаков по canonical serialization;
- duplicate RPC/log delivery не создаёт двойных entries;
- удаление записи из operator-provided output обнаруживается verifier replay;
- pre-registration BUY не учитывается;
- same-block ordering работает;
- `99 USDG + 1 USDG` создаёт ровно одну entry и carry 0;
- SELL не создаёт entry;
- unsupported/ambiguous candidate не создаёт entry и остаётся видимым с reason;
- reorg fixture rollback/replay даёт state новой canonical branch;
- replay можно выполнить без нашей production DB.

После этого уже имеет смысл проектировать snapshot commitment/controller boundary.

---

## Решения владельцу

Нужно всего три небольших решения перед этим этапом:

1. **MVP payer rule:** принимаем `payer == finalRecipient == registered wallet`; payer != recipient пока не получает entries?
2. **Threshold semantics:** принимаем `100 USDG nominal` в raw units вместо внешнего USD price oracle?
3. **Route scope:** принимаем один явно поддержанный direct TOKEN/USDG route для MVP, а aggregator/multihop/batch не засчитываем до отдельного decoder?

Моя рекомендация по всем трём — **да**. Это даёт воспроизводимый и понятный indexer без эвристик и не закрывает расширение позже.