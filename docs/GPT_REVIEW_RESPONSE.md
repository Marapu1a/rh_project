# Текущий ответ GPT

Обновлено: 17.09.2026.

Просмотрен latest commit `c66cd711db116bf2ca09b56b9ff80188ab0caa00` — `measure full controller size and immutable helper tradeoffs`, а также предыдущая оптимизация `712936f438a31eaccacf1ab8963138272645cc6b`.

Прочитаны `CONTROLLER_SIZE_STUDY.md`, `ControllerSizeStudy.sol`, текущий `GPT_REVIEW_REQUEST.md`, `SHORT_SELECTION_OPTIMIZATION.md` и связанные production-компоненты. GitHub CI/status для latest commit пусты; локальные `check:controller:size`/behavior сценарии в этом проходе мной независимо не запускались.

## Сначала важное уточнение: для Robinhood проблема 24 KB сейчас НЕ является deployment blocker

Исследование корректно проверяет стандартный EIP-170 лимит Hardhat **24 576 bytes**. Но это не фактический лимит Robinhood Chain mainnet.

В официальном mainnet `robinhood-chain-info.json`, на который ссылается документация Robinhood для запуска собственного full node, сейчас прямо указано:

~~~json
"arbitrum": {
  "MaxCodeSize": 98304,
  "MaxInitCodeSize": 196608
}
~~~

Официальные источники, проверены 17.09.2026:

- Robinhood full-node guide: https://docs.robinhood.com/chain/run-a-full-node/
- официальный mainnet chain info: https://cdn.robinhood.com/assets/generated_assets/hoodchain_docsite/chain-node-configs/robinhood-chain-info.json

То есть текущий study monolith `28 475` bytes составляет примерно 29% от объявленного mainnet MaxCodeSize 98 304 bytes.

Это сильно меняет срочность вопроса:

> **для первого Robinhood deployment нам не нужно ломать архитектуру только ради стандартных 24 KB.**

Но 24 KB остаётся очень полезным **portability benchmark**: Ethereum/Base и многие обычные EVM deployments не обязаны иметь Robinhood-специфичный 96 KB лимит. А multi-chain для проекта — сознательная цель.

Поэтому теперь нужно разделить две задачи:

~~~text
MVP deployability on Robinhood
!=
portable-to-standard-EVM architecture
~~~

Не стоит оптимизировать их как будто это одна проблема.

---

## 1. Что говорит текущий size study

Сам study полезный и честный.

Он показывает:

~~~text
Short + realistic RNG/roles/readiness       21 866
+ отдельная содержательная Monthly machine  28 475
~~~

Selection helper экономит недостаточно. viaIR экономит много, но `24 444` с 132 bytes headroom — явно не production решение.

Особенно правильно, что Monthly в study не пустая заглушка: там есть publication, root/count/attempts, pending, real PromoVault monthly accounting, seed binding, streaming, win/no-win и terminal.

Поэтому вывод study остаётся ценным:

> если мы хотим **тот же exact bytecode architecture** потом разворачивать на стандартной 24 KB EVM, простой monolith в нынешнем виде не подходит.

Но это уже portability/design pressure, а не блокер Robinhood MVP.

---

# 2. Я бы рассматривал четыре варианта, а не сразу один helper

## Вариант A — Robinhood-first monolith

Самый простой путь для MVP:

~~~text
PromoVault
   ↓
one immutable controller
   ├── Short
   ├── Monthly
   ├── RNG binding
   └── readiness / roles
~~~

На Robinhood его текущий исследовательский размер 28.5 KB далеко от официального 96 KB ceiling.

### Плюсы

- минимальное количество trust boundaries;
- проще аудит: один controller + vault;
- атомарность очевидна;
- нет cross-contract orchestration;
- не нужен viaIR/code golf только ради размера;
- быстрее довести полный MVP до E2E.

### Минусы

- такой deployment нельзя считать автоматически переносимым на стандартные 24 KB chains;
- будущий Base/Ethereum instance может потребовать другой composition;
- если бесконтрольно наращивать monolith, можно всё равно получить ненужный комбайн, даже при 96 KB.

### Моя оценка

**Это теперь вполне нормальный кандидат для первого Robinhood MVP.**

Мы уже приняли, что разные сети могут иметь отдельные deployments/adapters. Поэтому отсутствие byte-for-byte portability само по себе не нарушает продуктовую модель.

Но исходники всё равно лучше держать модульными, чтобы будущий standard-EVM вариант не пришлось переписывать с нуля.

---

## Вариант B — общий typed dataset слой внутри monolith

Это первое, что рационально измерить, если хотим сохранить один controller и приблизиться к 24 KB без изменения trust model.

Сейчас Monthly study повторяет заметную часть Short preparation:

~~~text
Publishing
root/count/attempts
lastWallet
chunk hashes
Ready
Supersede
cutoff checks
canonical ordering/ranges
~~~

Это можно попробовать свести в один generic **canonical dataset primitive**, не смешивая смысл draw.

Примерно:

~~~text
DatasetKind = SHORT | MONTHLY

common state:
  status
  root
  count
  attempts
  lastWallet
  chunkHashes
  cutoff/snapshot identity

separate state:
  Short: epoch, basket, D, draining
  Monthly: cycle, Current/Next, jackpot budget
~~~

`publishCanonicalDataset(kind, ...)` один раз реализует structural validation/root/chunk accounting.

Отдельные `sealShort` / `sealMonthly` остаются разными, потому что деньги и product semantics разные.

### Как сохранить независимость

Не один общий pending:

~~~text
activeProposal[SHORT]
activeProposal[MONTHLY]

pendingShort
pendingMonthly
~~~

Short draining epoch остаётся только Short.
Monthly clock/cycle остаётся только Monthly.
AttemptsConsumed остаётся kind-specific.

### Domain separation

Generic storage не означает generic randomness domain.

Context обязательно включает draw kind либо использует разные domain constants:

~~~text
SHORT_DATASET_CONTEXT_V1
MONTHLY_DATASET_CONTEXT_V1
~~~

Один и тот же participant payload никогда не должен давать interchangeable Short/Monthly commitment.

### Плюсы

- не меняется custody model;
- один controller;
- меньше duplicated code и duplicated bug surface;
- вероятно заметно уменьшает size.

### Минусы

- можно получить слишком generic state machine, которую тяжелее читать;
- Short и Monthly всё-таки отличаются по funding/terminal/policy;
- экономию надо **измерить**, а не предполагать.

Я бы не делал generic «draw framework». Только общий низкоуровневый dataset lifecycle.

---

## Вариант C — два immutable capability-scoped controller в PromoVault

Это вариант, который я бы обязательно измерил, потому что он решает size pressure и при этом может даже **улучшить least privilege**.

Не:

~~~text
one controller can do all prize operations
~~~

а:

~~~text
PromoVault
   ├── immutable ShortController
   └── immutable MonthlyController
~~~

Причём vault сам ограничивает способности:

~~~text
ShortController:
  reserve only SHORT
  finalize only SHORT
  cannot start/settle Monthly
  cannot touch Current/Next as monthly authority

MonthlyController:
  startMonthly
  settleMonthly
  cannot reserve/finalize Short
~~~

Оба адреса задаются в constructor и **никогда не заменяются**.

Нет proxy, module registry, delegatecall или owner-set-controller.

### Почему это не обязательно хуже для доверия

Количество privileged addresses растёт с 1 до 2, но полномочия каждого сильно сужаются.

Аудитор получает очень понятную capability map:

~~~text
Short code physically cannot spend jackpot
Monthly code physically cannot spend Short reserve
~~~

Это по духу ближе к нашему `bounded powers`, чем один огромный controller, который технически умеет всё.

### Atomicity

Не страдает.

Short controller делает:

~~~text
vault.finalizeShort(...)
→ local terminal state
~~~

в одной transaction. Если локальный completion revert — откатывается и вызов vault.

Monthly аналогично.

Short и Monthly и сейчас задуманы как независимо pending, поэтому между ними нет terminal, который обязан атомарно менять state **обоих** controllers.

### Shared vault concerns

Нужно отдельно проверить:

- drawId collision между двумя controllers;
- syncUSDG/generalFunding race semantics;
- одновременный Short pending + Monthly pending;
- старые claimable;
- Short не получает способ reserve `CURRENT`;
- Monthly не получает generic finalize;
- reverse binding каждого controller к конкретному vault.

Все эти ограничения можно сделать непосредственно в PromoVault.

### Deployment circularity

Технически решаемо как и сейчас через predicted addresses: оба controller получают predicted vault, затем vault создаётся с двумя уже существующими controller addresses и проверяет reverse binding.

### Плюсы

- огромный запас по code size без compiler tricks;
- сильное capability separation;
- естественная независимость Short/Monthly;
- стандартные 24 KB deployments становятся намного реалистичнее.

### Минусы

- меняется нынешний invariant «vault имеет один controller»;
- два основных contracts вместо одного;
- немного больше deployment/audit surface;
- если когда-нибудь нужен новый core draw type, его нельзя тихо добавить — потребуется новый deployment/version. Но для extension campaigns это скорее плюс: они и не должны получать доступ к core vault.

**Я считаю этот вариант очень сильным кандидатом, а не аварийным workaround.**

---

## Вариант D — маленький immutable root + fixed Short/Monthly engines

Если принципиально хотим оставить в PromoVault ровно один `drawController`, можно разделить state/logic иначе:

~~~text
PromoVault
   ↑
TinyRootController
   ├── immutable ShortEngine
   └── immutable MonthlyEngine
~~~

Engines:

- хранят dataset/progress/policy;
- не имеют права двигать vault funds;
- immutable addresses в root;
- permissionless processing можно вызывать прямо на engine.

Root:

- единственный controller vault;
- принимает только result exact fixed engine;
- делает reserve/finalize/settle;
- после успешного vault call отмечает terminal в engine в той же transaction.

### Atomic terminal

Например:

~~~text
root.finishShort(drawId)
  ↓
read verified result from immutable ShortEngine
  ↓
vault.finalize(...)
  ↓
ShortEngine.complete(drawId) // only immutable root
~~~

Любой revert откатывает всю межконтрактную transaction.

### Плюсы

- PromoVault всё ещё имеет ровно один controller;
- bulky state machines вынесены;
- engines не имеют custody authority;
- root можно сделать очень маленьким и легко аудируемым.

### Минусы

- самая сложная composition из разумных вариантов;
- больше cross-contract calls/gas;
- нужно очень тщательно bind result/context/state между root и engines;
- root становится security boundary, который доверяет двум fixed code units.

Я бы рассматривал это **после** dual-controller варианта, а не раньше.

---

# 3. Что я бы НЕ делал

## viaIR + 132 bytes как решение

Нет. viaIR можно позже принять как нормальный compiler profile после полного regression/gas review, но он не должен быть единственным, что удерживает production contract под лимитом.

## Code golf ради нескольких сотен bytes

Custom errors, более компактные getters и устранение очевидного duplication — нормально.

Удалять проверки, события, replay data или делать unreadable assembly ради 24 KB — плохой tradeoff для этого проекта.

## delegatecall libraries / Diamond / upgradeable facets

Не нужны.

Они действительно решают code-size композицию, но прямо противоречат выбранной trust model: скрытая/широкая исполняемая власть и более сложная audit surface нам не окупаются.

## Отдельный selection helper как основной ответ

Study уже показал, что этого недостаточно.

Stateless immutable helpers могут быть полезным последним слоем оптимизации, но не надо строить архитектуру вокруг экономии ~1 KB, если state-machine composition остаётся неправильной.

---

# 4. Текущий study немного завышает и немного занижает будущий размер

## Что может завышать

### Дублированная Monthly preparation

Это главный очевидный источник лишнего bytecode. Common dataset path способен убрать часть.

### Большие study getters / ABI encoding

Например возврат больших structs с dynamic arrays может стоить заметный runtime bytecode. Production audit API необязательно должен возвращать весь state одним методом; можно иметь маленькие scalar getters + события/artifacts.

Прозрачность не требует самого дорогого ABI.

### Revert strings

Production custom errors могут уменьшить размер, не убирая checks.

### Study-specific glue

Некоторые методы нужны именно для макета и measurements.

## Что может занижать

- реальный RNG provider adapter/protocol может быть тяжелее mock interface;
- production finality может добавить Arbitrum-specific logic;
- окончательная D policy ещё не написана;
- реальные monitoring/readiness bindings могут потребовать состояния;
- recovery/transport integration ещё не закончена;
- Monthly final semantics/epochs пока не утверждены.

Поэтому `28 475` — хороший pressure test, но не forecast точного production bytecode.

---

# 5. Какой запас считать нормальным

Теперь два разных ответа.

## Robinhood

Официальный ceiling 98 304 означает, что десятки килобайт headroom уже есть. Я бы не вводил искусственное правило «обязательно меньше 24 KB» для Robinhood deployment.

Но всё равно стоит завести CI gate заметно ниже network max, чтобы размер не рос бесконтрольно. Точное внутреннее ограничение пока не нужно утверждать.

## Standard-EVM portability

Если хотим deployment, который гарантированно проходит обычный EIP-170, `24 444` — не результат.

Практический экспериментальный target для **уже feature-complete** controller я бы ставил порядка `20–21.5 KB`, то есть оставлять примерно 3–4.5 KB до 24 576.

Это не protocol rule, а engineering headroom.

До feature completeness желательно иметь ещё больше.

---

# 6. Что делать прямо сейчас

Я бы не переписывал production contracts по итогам одного size study.

Следующий пакет лучше сделать **архитектурным сравнением**, а не новой реализацией продукта:

~~~text
controller-architecture-options-v1
~~~

## Сначала — target-chain reality

Добавить два независимых size profiles:

~~~text
ROBINHOOD_MAINNET:
  runtime max = 98 304
  initcode max = 196 608
  source = official chain-info.json

STANDARD_EVM:
  runtime benchmark = 24 576
  initcode benchmark = 49 152
~~~

И перестать называть standard Hardhat rejection доказательством невозможности Robinhood deployment.

Желательно дополнительно сделать read-only `eth_estimateGas`/test deployment probe против Robinhood **testnet/mainnet-compatible RPC** без отправки transaction, если provider это позволяет, и сохранить evidence. Но official chain config уже является сильным источником.

## Эксперимент 1 — SharedDatasetMonolith

Перенести только structural publication lifecycle Short/Monthly в одну typed реализацию.

Не менять outcomes/funding.

Измерить обычный compiler и viaIR отдельно.

## Эксперимент 2 — DualControllerPromoVault

Минимально изменить test-only copy PromoVault:

~~~text
immutable shortController
immutable monthlyController
~~~

с function-level capability checks.

Развернуть реальный Short controller и содержательный Monthly controller отдельно.

Проверить standard 24 KB **каждый** contract без viaIR сначала.

## Эксперимент 3 — TinyRoot + Engines

Только если dual-controller по trust/deployment причинам окажется хуже.

Не тратить время на этот вариант первым.

### Сравнение должно включать

| Свойство | Monolith | Shared monolith | Dual controllers | Tiny root + engines |
|---|---|---|---|---|
| Robinhood deployable | | | | |
| Standard 24 KB deployable | | | | |
| Vault authorities | | | | |
| Can Short touch Monthly funds | | | | |
| Can Monthly touch Short funds | | | | |
| Atomic terminal | | | | |
| Cross-contract calls | | | | |
| Runtime bytes per contract | | | | |
| Initcode | | | | |
| Gas begin/publish/process/finish | | | | |
| Audit complexity | | | | |
| Future multi-chain portability | | | | |

---

# 7. Behavioral checks для split-вариантов

Текущие study checks хорошие, но для architecture comparison добавить:

### Dual controller vault

- ShortController cannot call `startMonthly`/`settleMonthly`;
- MonthlyController cannot reserve/finalize Short;
- Short cannot debit Current/Next;
- Monthly cannot debit Short;
- same drawId collision fails safely;
- simultaneous pending Short + Monthly works;
- old claims survive both controllers;
- failure of one controller path cannot mutate the other's pending state;
- controller addresses immutable/no replacement API;
- reverse binding verified at deployment.

### Root + engines

- engine cannot call vault directly;
- root rejects result from any address except fixed engine;
- engine cannot change result after root reads/finalizes;
- vault finalize + engine complete atomic rollback;
- wrong draw/context/result engine response reverts;
- engine addresses immutable;
- no generic call/delegatecall.

### Shared monolith

- Short and Monthly active proposals independent;
- root/chunk hashes domain-separated by kind;
- Short epoch filtering cannot affect Monthly snapshot;
- one kind cannot supersede the other's preparation;
- simultaneous pending remains supported.

---

# 8. Что бы я выбрал сегодня

После обнаружения реального Robinhood limit я **не стал бы срочно дробить controller**.

Для первого MVP у нас есть роскошь выбрать архитектуру по безопасности и понятности, а не потому что Hardhat кричит 24 KB.

Мой порядок предпочтений сейчас такой:

~~~text
1. Robinhood MVP:
   монолит остаётся допустимым и, возможно, самым простым для аудита.

2. Параллельно проверить SharedDatasetMonolith:
   если он естественно убирает duplication — взять рефактор независимо от размера.

3. Если хотим standard-EVM portable V1:
   серьёзно рассмотреть DualControllerPromoVault.
   Это не костыль: capability separation может улучшить trust model.

4. Tiny root + engines:
   fallback, если принцип одного vault-controller важнее простоты.
~~~

Самое главное — **не позволить старому 24 KB предположению заставить нас принять более сложную архитектуру, чем реально нужна первой сети.**

Но и не забывать multi-chain: 96 KB Robinhood — преимущество конкретного deployment, а не универсальное свойство нашего протокола.

---

## Итог

Проблема оказалась мягче, чем выглядела из локального Hardhat:

~~~text
Robinhood mainnet MaxCodeSize = 98 304
full controller study         = 28 475
~~~

Поэтому прямого size blocker для Robinhood сейчас нет.

Настоящий архитектурный вопрос теперь звучит лучше:

> хотим ли мы оптимизировать V1 под универсальный стандартный EVM limit уже сейчас, или сначала выпустить максимально простой immutable Robinhood monolith и использовать split architecture только там, где сеть действительно требует её?

Я бы пока не принимал решение. Один сравнительный study `shared monolith vs two immutable scoped controllers` даст гораздо больше пользы, чем дальнейший code golf.