# Текущий ответ GPT

Обновлено: 16.09.2026.

Просмотрен latest commit `8cbccd26e4ec5bb1c6df6298d8e3138e0ecb1dac` — `request review of autonomous execution funding`.

Текущая ветка действительно стоит небольшого отклонения от rules epochs: до immutable controller лучше понять, **кто и из каких денег гарантированно оплачивает длинный Short pipeline**, иначе технически permissionless система может оказаться операционно ручной.

Ниже — исследование по состоянию на 16.09.2026. Код менять пока не предлагаю.

## Короткий вывод

Самый полезный внешний факт оказался сильнее первоначальной постановки задачи:

> **Robinhood Chain уже имеет официальную инфраструктуру account abstraction / gas sponsorship, и Alchemy прямо заявляет Gas Sponsorship + Bundler + ERC-20 Gas Payments + BSO для Robinhood Mainnet.**

Поэтому для MVP я бы **не ломал прежний trust invariant PromoVault и не учил prize vault покупать ETH / reimbursить gas**.

Предпочтительная схема:

~~~text
gross promo / creator revenue
        │
        ├── project / operations share
        │       └── оплачивает execution
        │
        └── recognized prize share
                ↓
          PromoVault
          Short / Current / Next
~~~

То есть расходы на исполнение отделяются **до признания денег призовыми**. После входа в PromoVault старое правило сохраняется:

> recognized prize money stays prize money.

Для внешнего targeted funding текущая семантика также сохраняется: если пользователь/спонсор отправил `SHORT`, `CURRENT`, `NEXT` или существующий `GENERAL` prize funding, мы не начинаем молча откусывать из него gas. Если будущая sponsor campaign хочет бюджет «всё включено», она заранее и явно декларирует отдельно `execution contribution` и `net prize funding`.

Первичный исполнитель — наш автоматический keeper/smart account через Alchemy Gas Manager / Bundler Sponsored Operations. Alchemy авансирует native ETH; постоянный ручной ETH top-up на каждый draw не нужен. При этом core остаётся provider-neutral: если Alchemy исчез, тот же разрешённый on-chain progress может продолжить другой executor со своим ETH.

Это позволяет решить операционную задачу **без новой административной лазейки в prize custody**.

---

## 1. Что реально поддерживает Robinhood Chain сейчас

### Robinhood / Alchemy

Robinhood Chain официально описывает себя как Arbitrum L2 с ETH как native gas token и first-class ERC-4337 account abstraction. В официальной документации Alchemy указан как рекомендуемый RPC/AA provider и отдельно перечислена `Gasless Transaction Infrastructure` с sponsorship, batching, policies и spending controls.

Alchemy в актуальной таблице supported chains прямо показывает для **Robinhood Mainnet и Testnet**:

~~~text
Bundler              ✅
Gas Sponsorship      ✅
ERC20 Gas Payments   ✅
BSO                  ✅
~~~

Gas Manager может front gas без предварительного пополнения native token: стоимость добавляется в billing. Для PAYG документация сейчас указывает 8% fee от покрытых gas fees; mainnet sponsorship требует платный tier. Policies поддерживают spend/transaction/access limits. Alchemy отдельно предупреждает, что из-за batch processing фактический spend в редких случаях может кратковременно немного превысить установленный limit — поэтому provider policy нельзя считать нашим on-chain hard invariant.

Bundler Sponsored Operations работают на bundler level и не требуют отдельного on-chain paymaster call для каждой операции. Для нашей задачи это особенно интересно: execution wallet может быть smart account, а Promo contracts не обязаны становиться Alchemy-specific.

Источники, проверены 16.09.2026:

- Robinhood Chain overview: https://docs.robinhood.com/chain/
- Robinhood connection / Gasless Transaction Infrastructure: https://docs.robinhood.com/chain/connecting/
- Alchemy Wallet supported chains: https://www.alchemy.com/docs/wallets/supported-chains
- Alchemy Gas Manager FAQ / pricing: https://www.alchemy.com/docs/wallets/reference/gas-manager-faqs
- Alchemy sponsorship policies: https://www.alchemy.com/docs/wallets/transactions/sponsor-gas/sponsorship-policy-management
- Alchemy BSO: https://www.alchemy.com/docs/wallets/transactions/sponsor-gas/bundler-sponsored-operations

### Важное уточнение про ERC-20 gas payment

Alchemy действительно позволяет настроить custom ERC-20. Native gas авансируется, а ERC-20 списывается со smart account на настроенный policy recipient.

Но это **не означает**, что мы уже нашли trustless USDG→gas расчёт для самого проекта. Документация прямо говорит, что equivalent USD amount + admin fee всё равно попадают в monthly invoice policy owner. Поэтому если executor и policy owner — мы сами, ERC-20 mode не магически отменяет внешний billing.

USDG также надо отдельно проверить как custom token/price reference на Robinhood; из общей поддержки custom ERC-20 нельзя делать вывод, что наша конкретная конфигурация уже работает.

Источник: https://www.alchemy.com/docs/wallets/transactions/pay-gas-with-any-token

Вывод: **для MVP sponsorship/BSO полезнее ERC-20 paymaster path**. USDG→ETH/paymaster можно оставить как альтернативу, а не фундамент core.

---

## 2. Что с другими кандидатами

### Chainlink

Chainlink Automation сейчас плохой кандидат именно для этой задачи: legacy Automation v1.x sunset 30.06.2026, v2.1 — 31.07.2026; Chainlink направляет пользователей в CRE. В текущем списке Automation networks Robinhood нет.

В актуальном Chainlink VRF v2.5 supported-networks Robinhood также не указан. Поэтому нельзя строить MVP-план на предположении «Robinhood EVM → значит VRF/Automation есть». RNG для нашего production controller остаётся отдельным открытым вопросом.

Источники, проверены 16.09.2026:

- https://automation.chain.link/
- https://docs.chain.link/chainlink-automation/overview/supported-networks
- https://docs.chain.link/vrf/v2-5/supported-networks

### Gelato

Gelato — полезный пример модели sponsored relay / Gas Tank, но в текущей официальной странице supported Relay networks Robinhood не найден. Поэтому это benchmark архитектуры, а не зависимость MVP.

Источник: https://docs.gelato.cloud/relay/additional-resources/supported-networks

### OpenZeppelin Relayer

OpenZeppelin Relayer умеет custom EVM network через chainId/RPC и даёт полезные safety knobs: `gas_price_cap`, receiver whitelist, min balance, estimate + safety buffer, retry/failover.

Но self-hosted relayer всё равно требует native ETH balance. Поэтому это хороший fallback/recovery runner, а не решение circular bootstrap само по себе.

Источники:

- https://docs.openzeppelin.com/relayer
- https://docs.openzeppelin.com/relayer/1.2.x/evm

---

## 3. Рекомендуемая MVP-модель денег

Я бы **не пересматривал** формулировку «признанные prize funds нельзя тратить на ops». Вместо этого уточнил бы момент признания.

### Creator revenue / собственный promo budget

~~~text
gross received value
      ↓
policy split ДО PromoVault
      ├── PROJECT / OPERATIONS
      └── PRIZE
             ↓
      Short / Current / Next
~~~

Execution — нормальный operational expense проекта. Он может иметь отдельный публичный accounting/budget, но не должен откусываться из уже признанного `freeShort/freeCurrent/freeNext`, а тем более reserved/claimable.

Это очень хорошо ложится на наш Trust & Evolution принцип: гибкость экономики остаётся, custody обещание пользователю не ослабляется.

### External funding

Существующие значения должны продолжить значить то, что уже значат:

~~~text
targeted SHORT   → 100% prize Short
targeted CURRENT → 100% prize Current
targeted NEXT    → 100% prize Next/overflow по принятым правилам
GENERAL          → 100% prize allocation 3:2:1
~~~

Не надо задним числом превращать их в «95% prize + 5% gas».

Для будущей sponsor campaign можно заранее объявить:

~~~text
gross campaign budget = 1050 USDG
execution contribution = 50
net funded prize = 1000
~~~

или спонсор может дать `1000 prize + execution separately`.

Тогда аудитор не должен гадать, сколько из заявленного приза съели расходы.

---

## 4. Кто физически посылает транзакции

### Primary path

~~~text
keeper daemon
   ↓ signs deterministic allowed calls
dedicated execution smart account
   ↓
Alchemy Bundler / Gas Manager
   ↓ fronts native ETH
Robinhood Chain
~~~

Keeper не должен иметь полномочия выбрать winner или передать деньги произвольному адресу.

On-chain архитектура по возможности остаётся permissionless:

- `seal` после READY — permissionless;
- `process(nextChunk)` — permissionless;
- `finish` — permissionless;
- `claim` уже permissionless к фиксированному recipient;
- begin/publish/supersede, если им нужен privileged publisher, получают только узкую capability.

Таким образом Alchemy и наш keeper — **liveness dependencies, не trust dependencies outcome**.

Если provider умер, другой executor может отправить ту же следующую транзакцию обычным способом, оплатив ETH сам. Никакой migration draw, reset или новый seed не требуется.

### Экономическая защита provider account

Gas Manager policies полезно использовать как второй operational perimeter:

- разрешён только Robinhood;
- allowlist только наших controller/related addresses;
- max spend per operation;
- total/day/month limits;
- отдельная policy для production executor;
- monitoring/alerts.

Но критические ограничения всё равно должны быть в контрактах. Компрометация provider API key не должна превращаться в возможность украсть prize funds.

---

## 5. Economic readiness лучше разделить на две стадии

Repo правильно заметил две проблемы:

1. publication уже стоит gas до SEAL;
2. если просто «ждём дешёвый gas», N продолжает расти и следующий draw дорожает.

Я бы не оставлял одну проверку только перед SEAL.

### Gate A — до BEGIN

Проверяем:

- 6h schedule / отсутствие pending Short;
- текущий execution sponsorship/provider доступен;
- есть operational capacity/лимит;
- примерная полная стоимость draw при текущих N/K находится в допустимой зоне.

Если совсем не готово — BEGIN не делаем, attempts остаются OPEN.

### BEGIN фиксирует свежий cutoff

Когда Gate A прошёл:

~~~text
BEGIN at fresh finalized/recent cutoff
→ cutoff + N этого draw зафиксированы
~~~

После этого **рост новых BUY больше не увеличивает стоимость этого draw**: новые attempts уже относятся к следующему.

Текущий dataset component как раз полезен тем, что проверяет recent blockhash в BEGIN, а затем может дожить до SEAL спустя >256 блоков — повторно старый blockhash не требуется.

### Gate B — перед дорогой publication / дальнейшими этапами

После BEGIN считаем уже конкретный полный remaining path и убеждаемся, что execution capacity с safety margin достаточна.

Если gas внезапно вырос:

~~~text
не supersede
не меняем cutoff
не меняем participants
просто ждём
~~~

Так мы разрываем неприятную петлю:

~~~text
gas дорогой → ждём → N растёт → draw ещё дороже → ждём ещё
~~~

После BEGIN N текущего draw уже фиксирован.

Важно: production policy supersede потом стоит отдельно ограничить/описать. Высокий gas сам по себе не должен быть поводом менять cutoff ради более удобного participant set.

---

## 6. После SEAL правило ещё проще

После SEAL никакой экономический кризис уже не должен менять obligation.

~~~text
frozen dataset
frozen prize D
frozen rules
one seed
progress
~~~

Если gas x50 или Alchemy временно недоступен — processing стоит и затем продолжается с того же `nextChunk`.

Дополнительное project/ops funding можно добавить в execution infrastructure, но:

- нельзя уменьшить frozen D;
- нельзя вернуть reserved в project;
- нельзя новый seed;
- нельзя новый participant list;
- нельзя объявить timeout=no-win.

Это ещё один аргумент за streaming: expensive period ухудшает latency, а не correctness.

---

## 7. Какие расходы считать execution

Для MVP я бы гарантированно финансировал только **critical path до terminal**:

~~~text
BEGIN / proposal setup
dataset publication
SEAL
RNG request/delivery cost — когда provider выбран
PROCESS chunks
FINISH / PromoVault.finalize / AttemptsConsumed
~~~

Не включал бы автоматически в prize economics:

- серверы / RPC subscriptions;
- разработку / monitoring;
- TOKEN→USDG swap execution — это отдельная revenue/conversion экономика;
- бесконечные failed tx;
- произвольные supersede;
- обычные user claims.

Claim уже permissionless. Победитель может вызвать его сам и оплатить gas. Optional sponsored claim — UX-слой с отдельным capped policy, а не условие корректного terminal.

Это важно: один странный winner/claim не должен удерживать весь draw в pending.

---

## 8. Почему не делать generic gas reimbursement в контракте

Схема:

~~~text
кто угодно вызывает process()
→ contract возвращает msg.sender фактический gas
~~~

выглядит красиво, но для MVP создаёт больше проблем, чем решает:

- какой gas price считать допустимым;
- как учитывать L2 execution + L1 data component;
- как не платить за revert;
- как не платить повторно за один progress;
- как не стимулировать искусственное дробление work;
- что делать с конкурентными executors;
- как ограничить выплаты связанному адресу;
- как не превратить reimbursement в disguised withdrawal.

На первом запуске это не нужно.

Если позже потребуется экономически стимулировать recovery executors, безопаснее рассматривать **фиксированную bounded bounty за доказанный state progress** (`chunk i → i+1`) из отдельного execution budget, а не reimbursement произвольного `gasUsed * gasPrice`.

---

## 9. USDG→ETH buffer: рабочая альтернатива, но не MVP-first

Self-funded native buffer можно построить:

~~~text
execution USDG
→ fixed swap route
→ ETH buffer
→ keeper
~~~

Но тогда сразу появляются:

- bootstrap ETH для первого refill;
- low-watermark;
- ETH/USDG price source;
- slippage/max price;
- fixed recipient;
- signer custody;
- swap failure;
- overfund/leftover semantics;
- refill во время gas spike.

Один bootstrap deposit всё равно неизбежен: чтобы купить первый ETH on-chain, уже нужен ETH.

Alchemy sponsorship убирает почти весь этот слой из MVP. Native buffer можно оставить provider-independent fallback и реализовать позже, если реальная стоимость/надёжность SaaS не устроит.

---

## 10. Сценарные числа из нашего study

Использую только repo assumption:

~~~text
gas price = 0.065 gwei
ETH = $2400
~~~

Это **не прогноз текущей цены**, а сценарная база из запроса. Реальный production pipeline и Robinhood estimate надо измерять отдельно.

Study gas:

~~~text
N=1000 K=10 → 16,604,947 gas
N=5000 K=10 → 74,908,186 gas
~~~

| N / K | base x1 | gas x10 | gas x50 |
|---|---:|---:|---:|
| 1000 / 10 | $2.59 | $25.90 | $129.52 |
| 5000 / 10 | $11.69 | $116.86 | $584.28 |

Если чисто иллюстративно добавить текущие документированные 8% Alchemy PAYG Gas Manager fee, получается примерно:

| N / K | x1 | x10 | x50 |
|---|---:|---:|---:|
| 1000 / 10 | $2.80 | $27.98 | $139.88 |
| 5000 / 10 | $12.62 | $126.21 | $631.03 |

Это всё ещё не invoice forecast: здесь нет настоящего RNG, production controller overhead, реального `eth_estimateGas`, provider tier specifics, claims и conversion.

### Сравнение с банком

Для gross/net prize reference $100:

~~~text
N1000:  2.6% / 25.9% / 129.5%
N5000: 11.7% / 116.9% / 584.3%
~~~

Для $1000:

~~~text
N1000:  0.26% / 2.59% / 12.95%
N5000: 1.17% / 11.69% / 58.43%
~~~

Поэтому fixed «5% всегда хватает на gas» — плохая policy. Малый банк + большой N легко делает draw экономически бессмысленным.

### Несколько циклов

При десяти одинаковых циклах raw local proxy:

~~~text
N1000:
x1  ≈ $25.90
x10 ≈ $259.04
x50 ≈ $1295.19

N5000:
x1  ≈ $116.86
x10 ≈ $1168.57
x50 ≈ $5842.84
~~~

Процент на цикл не меняется, но любой недостаточно финансируемый execution reserve линейно уходит вниз. Поэтому модель должна смотреть **reserve trajectory**, а не только «этот draw вроде дешёвый».

---

## 11. Absolute + relative gate — кандидат, не принятое правило

Для локальной модели стоит проверить readiness типа:

~~~text
estimatedRemainingCost <= executionCapacity
AND
estimatedRemainingCost <= absoluteDrawCap
AND
estimatedRemainingCost <= relativeCap * plannedNetPrize
~~~

Но параметры пока нельзя переносить в PRODUCT_SPEC.

Relative cap защищает маленький prize от абсурда.

Absolute cap защищает operations budget при большом prize.

Execution capacity отвечает за реальную способность закончить draw.

Если gate не проходит **до BEGIN**, attempts сохраняются. Если Gate A прошёл и BEGIN уже зафиксировал cutoff, дальнейший gas spike не должен менять cohort: proposal просто ждёт.

При хронически дорогой сети нет волшебства: кто-то всё равно должен оплатить вычисление. Система может накопить operations budget, дождаться удешевления или получить дополнительное project/sponsor execution funding. Нельзя превращать нехватку gas в исключение участников/no-win/reroll.

---

## 12. Liveness и исчезновение keeper

Разделить две вещи:

### Кто обычно платит

Primary keeper через Alchemy sponsorship.

### Кто способен продолжить

Любой executor для permissionless этапов.

Recovery package должен содержать:

- current draw/proposal id;
- next required action;
- canonical artifact/chunks;
- seed после fulfillment;
- CLI, который вычисляет следующий calldata;
- public contract addresses.

Тогда потеря нашего daemon/key/provider не делает состояние логически зависимым от него.

OpenZeppelin Relayer на custom Robinhood RPC может быть одним из self-hosted fallback инструментов, но его ETH funding остаётся operational concern.

---

## 13. Что это значит для Trust & Evolution

Я бы **не принимал** формулировку из discussion буквально как «теперь prize funds можно тратить на gas».

Более безопасная формулировка:

> **gross campaign/promo economics may allocate a bounded execution share before prize recognition; funds already recognized as prize reserves, frozen budgets or claims are never execution funds.**

Так мы получаем автономность, не создавая дыру:

~~~text
admin says: это gas
→ забирает freeShort
~~~

которой сейчас нет.

Если когда-нибудь execution allocation меняется, это future-facing policy. Уже поступивший targeted prize funding не переклассифицируется.

---

## 14. Что пока остаётся продуктовым решением

Не принимать автоматически из этого ревью:

1. размер execution/project share из creator revenue;
2. должен ли GENERAL external funding когда-нибудь иметь отдельный execution-aware вариант;
3. absolute/relative economic caps;
4. сколько циклов operations runway держать;
5. что считать допустимой задержкой Short при gas spike;
6. оплачиваем ли sponsored claims;
7. используем ли Alchemy PAYG/Enterprise или собственный native buffer;
8. конкретный RNG provider.

Особенно пункт 2: текущий GENERAL уже имеет принятую prize семантику. Для другого поведения лучше новый явно названный funding mode/campaign budget, а не изменение старого.

---

## 15. Следующий ограниченный пакет

Я бы **не возвращался прямо сейчас к rules epochs** и не писал ExecutionTreasury contract.

Следующий пакет:

~~~text
execution-economics-v1
локальная модель + report, без production contract
~~~

Входы:

- gross creator/promo inflow;
- candidate execution allocation;
- net prize inflow;
- N / K / chunk size;
- measured gas по каждой стадии;
- gas multipliers/distribution;
- provider surcharge;
- initial operations runway;
- relative/absolute gates;
- growth attempts во время ожидания;
- Alchemy sponsorship availability/limits как external dependency.

Выходы:

- net Short/Monthly prize flow;
- execution cost per cycle;
- operations reserve/billing trajectory;
- сколько draws проходят/ждут;
- время до readiness;
- что происходит при x10/x50 spike;
- сколько циклов выдерживает bootstrap;
- сценарий N growth до BEGIN;
- сценарий fixed N после BEGIN;
- provider outage/recovery.

Сравнить минимум три модели:

~~~text
A. pre-prize project/operations share + Alchemy sponsorship   ← основной кандидат
B. dedicated native ETH buffer + constrained auto-refill
C. permissionless bounty/reimbursement                       ← future option
~~~

После чисел уже решить, нужен ли вообще новый on-chain execution accounting.

Только затем вернуться к rules epochs. Это логично, потому что epoch activation/readiness тоже должна понимать: «мы можем начать boundary draw и гарантированно его довести».

---

## Итог

Ответ на главный вопрос ветки получился неожиданно простым:

> **автономность исполнения не требует давать PromoVault право тратить призовые деньги на gas.**

Robinhood уже имеет подходящую sponsored-transaction инфраструктуру. Для MVP можно держать keeper без постоянного ETH balance, финансировать execution из заранее отделённой operations economics, а prize custody оставить такой же жёсткой, как мы её проектировали.

Это сохраняет одновременно три свойства:

~~~text
автоматическая работа
гибкая экономика будущих периодов
отсутствие новой лазейки в prize funds
~~~

И я бы именно это проверил следующей локальной экономической моделью до любого изменения контрактов.