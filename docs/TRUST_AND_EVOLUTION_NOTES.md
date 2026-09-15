# Trust & Evolution — рабочие принципы и карта развития

Обновлено: 16.09.2026.

> **Статус документа:** рабочая архитектурная записка для обсуждения и ревью. Это **не** новый source of truth и не автоматическое изменение PRODUCT_SPEC.md. Здесь собраны полезные выводы, предложения и критерии, которые стоит учитывать в следующих пакетах реализации. Конкретное решение становится продуктовым только после отдельного принятия и отражения в PRODUCT_SPEC.md.

## 1. Зачем этот документ

У проекта есть две цели, которые легко ошибочно противопоставить друг другу.

Первая — сохранить возможность нормально развивать продукт: выходить в других сетях, добавлять новые механики, партнёрские и инвестиционные акции, новые типы призов, адаптировать экономику Short и Monthly к реальным бюджетам, нагрузке и поведению пользователей.

Вторая — не строить эту гибкость на доверии вида «админ теоретически может всё, но обещает не злоупотреблять».

Рабочая формулировка:

> **Immutable obligations, bounded powers, delayed evolution, independently verifiable execution.**

По-русски:

> **Неизменны уже возникшие обязательства и границы полномочий. Будущие правила и дополнительные слои продукта могут развиваться публично, ограниченно и версионно. Результат критичных операций должен быть независимо воспроизводим.**

Это не означает, что весь код и все числа должны быть навечно высечены в камне. Напротив, задача — оставить проекту как можно больше полезной свободы и как можно меньше свободы нарушить уже данное пользователю обещание.

---

## 2. Главная граница доверия: менять будущее, но не прошлое

Условно систему полезно делить не на «mutable / immutable contracts», а на три класса состояния.

### 2.1. Уже возникшее обязательство

Чем дальше состояние прошло по жизненному циклу, тем меньше должно оставаться допустимых изменений.

Пример Short:

~~~text
BUY carry
→ minted OPEN attempt
→ frozen participant
→ seed delivered
→ result
→ assigned prize
→ claim
~~~

Не все эти стадии равнозначны.

Рабочее направление:

- неполный BUY carry гарантирует накопленное номинальное значение и не должен исчезать при смене правил;
- minted OPEN attempt уже является возникшим участием и не должен задним числом переводиться на худшие условия;
- frozen draw не должен менять participants, cutoff, rules, budget, basket или seed;
- назначенный prize не должен быть отменён, уменьшен или возвращён в свободный резерв;
- claimable не должен зависеть от того, когда победитель пришёл за деньгами.

### 2.2. Политика будущих периодов

Здесь гибкость полезна.

Например, в будущем могут разумно меняться:

- параметры допуска p_max / h_e;
- K и структура корзины;
- minimum prize / minimum unit;
- формула бюджета D;
- интервал Short выше установленного минимального порога;
- funding policy будущих campaign;
- параметры новых спонсорских механик.

Но изменение должно иметь понятную границу применения. Не «owner нажал setter и вся система мгновенно живёт иначе», а примерно:

~~~text
новая версия правил опубликована
→ доступна для публичного чтения и проверки
→ проходит заданная процедура/задержка
→ появляется чёткая activation boundary
→ старые обязательства остаются на прежней версии
→ новые обязательства возникают уже под новой версией
~~~

Точная state machine ещё не принята и должна проектироваться отдельно. Важен принцип: **правила должны версионировать будущее, а не переписывать прошлое**.

### 2.3. Новые слои продукта

Расширение продукта не обязано означать расширение полномочий над уже существующим ядром.

Партнёрский розыгрыш, физический приз, сезонная акция, игра, achievement system или новый promotional campaign могут быть отдельными слоями, которые используют публичную историю активности, но не получают произвольный доступ к базовой казне.

Желательная граница:

~~~text
Core Promo
  ├─ Short
  ├─ Monthly
  └─ public activity / attempts history

Extensions
  ├─ sponsor campaign
  ├─ physical prize
  ├─ seasonal promotion
  └─ future game layer
~~~

Дополнительный слой может читать разрешённые данные и иметь собственный funded prize pool, но не должен автоматически уметь:

- трогать Short/Current/Next;
- расходовать базовые attempts;
- отменять base draw;
- менять его seed;
- переписывать уже frozen условия;
- становиться arbitrary module с правом выполнять произвольный код от имени core.

---

## 3. Гибкость не через «универсальный апгрейд», а через ограниченные способности

Современные security guidance отдельно выделяют access control и upgradeability как критичные поверхности риска. В OWASP Smart Contract Top 10 2026 на первом месте стоит Access Control, а Proxy & Upgradeability вынесены в отдельную категорию.

Для нашего проекта отсюда полезен не вывод «никогда ничего не менять», а другой:

> **каждая возможность изменения должна быть явной, ограниченной и исчерпывающе описываемой.**

Плохая форма гибкости:

~~~text
owner.setModule(anyAddress)
owner.upgradeTo(anyImplementation)
owner.execute(anyCall)
~~~

Даже если команда не собирается этим злоупотреблять, аудитор видит практически неограниченную власть.

Более подходящая форма:

~~~text
ANNOUNCE_SHORT_RULES
ACTIVATE_ALREADY_ANNOUNCED_RULES
CREATE_ISOLATED_SPONSOR_CAMPAIGN
FUND_EXISTING_PRIZE_BUCKET
EXECUTE_PERMISSIONLESS_DRAW_STEP
~~~

Каждая capability отвечает на четыре вопроса:

1. кто может её вызвать;
2. что именно она способна изменить;
3. через какую задержку / boundary;
4. на какие уже существующие обязательства она **не имеет права** влиять.

OpenZeppelin AccessManager полезен здесь как модель мышления: роли связываются с конкретными target/function selectors, есть execution/grant delays, guardians и discoverability. Это не означает, что проект обязан использовать именно AccessManager; важно перенять принцип **least privilege + observable permissions**.

---

## 4. Рабочая модель слоёв

На уровне архитектуры полезно держать примерно такую картину.

~~~text
                       PRODUCT
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
   TRUST / CUSTODY CORE                EXTENSIONS
        │                                   │
  prize custody                         sponsors
  immutable obligations                physical prizes
  settlement invariants                seasonal promos
  randomness binding                   future games
        │
        ▼
   VERSIONED POLICY
        │
  p / h / K / basket
  budget formula
  future schedule
        │
        ▼
   NETWORK / PLATFORM ADAPTERS
        │
  PAIR / Robinhood
  future DEX / chain
~~~

Смысл такого разделения не в количестве контрактов, а в том, чтобы изменение одного слоя не давало скрытого права переписать другой.

### Core

В core должны находиться свойства, потеря которых разрушает доверие:

- custody prize funds;
- отсутствие административного вывода уже признанных призовых денег;
- frozen commitments;
- binding единственного seed;
- result/settlement invariants;
- claims;
- ограничения полномочий.

### Versioned policy

Здесь живут параметры, которые могут разумно развиваться между периодами. Они должны быть bounded, публичны и применяться только к подходящему будущему cohort.

### Extensions

Новые акции и механики не должны автоматически получать полномочия core. Лучше отдельный funded campaign и явная интеграция, чем «универсальный плагин».

### Network adapters

PAIR/Robinhood — первая интеграция, а не вечная зависимость продукта. Новый deployment в другой сети может использовать другой DEX, fee source, quote asset или RNG integration при сохранении общих trust principles.

---

## 5. Multi-chain: новый экземпляр вместо магической миграции старых обязательств

Рабочая позиция уже хорошо согласуется с текущим PRODUCT_SPEC: старый instance и новый instance — независимые системы обязательств.

Например:

~~~text
Robinhood instance
Base instance
Arbitrum instance
future network instance
~~~

Новый экземпляр не должен получать скрытую власть над старым.

Желательно, чтобы аудитор видел для каждого instance:

- chainId;
- contract addresses;
- controller/vault/adapters;
- deployment manifest;
- git commit;
- compiler/settings;
- bytecode/code hashes;
- genesis rules;
- текущую rules history;
- funding source;
- external dependencies.

Если какая-то сеть или платформа перестала подходить, старый instance продолжает выполнять старые обязательства, а новая активность может начаться в новом deployment.

Это часто прозрачнее, чем upgradeable proxy, где адрес остаётся прежним, а исполняемая логика под ним меняется.

---

## 6. Что должно быть открыто аудитору

Цель не в том, чтобы публиковать всю внутреннюю кухню. Цель — открыть всё, что влияет на деньги, шанс и обязательство пользователя.

### 6.1. Желательно публично и независимо проверяемо

- точные deployed contracts и их source/bytecode correspondence;
- список существующих privileged capabilities;
- кому они принадлежат;
- задержки и условия их применения;
- правила создания attempts;
- eligibility BUY;
- carry;
- rules versions и activation history;
- cutoff;
- canonical participant dataset / commitment;
- budget D;
- basket;
- reserve;
- source и конкретный authenticated seed;
- outcome algorithm;
- resultHash;
- winners/amounts;
- claimable;
- OPEN/FROZEN/CONSUMED transitions;
- funding movements между призовыми состояниями;
- история новых deployments / network instances.

Идеальная проверка выглядит так:

~~~text
"Я не доверяю вашему UI, API и indexer.

Я беру:
- addresses
- manifest
- chain history
- rules
- cutoff
- seed

и своим RPC/verifier получаю тот же результат."
~~~

### 6.2. Необязательно раскрывать

Если это не влияет на outcome/обязательства:

- private keys;
- signer operational procedures;
- RPC credentials;
- серверные IP;
- CI secrets;
- внутренние alert channels;
- коммерческие договоры;
- внутреннюю аналитику;
- антиспам/антибот operational heuristics, пока они не участвуют в on-chain eligibility;
- инфраструктурные детали, которые создают лишнюю attack surface без улучшения проверяемости.

Иными словами, **прозрачность критичной механики не равна публикации секретов инфраструктуры**.

---

## 7. Полезный будущий артефакт: карта полномочий

Кроме человеческого TRUST_MODEL.md, имеет смысл позже сделать машиночитаемую карту вроде PRIVILEGES.json.

Пример идеи, не утверждённая схема:

~~~text
Capability: ANNOUNCE_SHORT_RULES
Holder: POLICY_ROLE / multisig
Delay: TBD
Can affect existing OPEN attempts: NO
Can affect frozen draw: NO
Can move prize funds: NO

Capability: SEAL_SHORT_DATASET
Holder: permissionless after verified READY
Can change dataset: NO
Effect: reserve + frozen context

Capability: PROCESS_SHORT_CHUNK
Holder: ANYONE
Can choose winners: NO
Effect: deterministic progress only

Capability: CLAIM
Holder: ANYONE
Recipient: already assigned winner

Capability: WITHDRAW_PRIZE_FUNDS
Exists: NO
~~~

Ценность такого файла в том, что аудитор быстро видит **полную attack surface полномочий**, а не ищет её по всему коду.

---

## 8. Изменения правил: announce, delay, activation boundary

OpenZeppelin timelock/access-management practices полезны именно как защита от ситуации, когда легитимный администратор сам действует против пользователя. Delay даёт время увидеть изменение до его применения.

Для нас одного timelock недостаточно: он не отвечает на вопрос, **какой cohort уже получил старые условия**.

Поэтому возможная будущая схема должна совмещать две идеи:

~~~text
public announcement / proposal
+
minimum notice
+
explicit activation boundary
+
old obligations remain old
~~~

Важный открытый вопрос — точный момент binding rules для OPEN attempts. Текущая рабочая позиция: attempt получает rules epoch при mint; carry до 100 USDG не обязан нести старую Short rules version. Но state machine ещё требует отдельного дизайна, особенно для активности между cutoff и фактическим seal/freeze.

Не следует превращать этот документ в преждевременную спецификацию конкретных часов notice или ролей.

---

## 9. Randomness: результат нельзя «перебирать»

Chainlink VRF security guidance совпадает с уже выбранным направлением проекта:

- не разрешать re-request/cancel randomness для одного commitment;
- после randomness request не принимать новые inputs, влияющие на outcome;
- тяжёлый settlement лучше не выполнять внутри callback, а сохранить randomness и продолжить отдельными вызовами.

Это хорошо сочетается с текущим streaming study:

~~~text
canonical frozen input
→ one authenticated seed
→ permissionless bounded processing
→ one deterministic result
→ finalize
~~~

Будущий RNG provider пока не выбран. Но независимый от конкретного provider invariant можно сформулировать уже сейчас:

> **для одного frozen draw существует не более одного допустимого authenticated seed; failure дальнейшего исполнения не создаёт право на новый seed.**

---

## 10. Execution path не должен менять outcome

После scaling study появился особенно важный принцип.

Если будущий controller поддерживает:

~~~text
fast single-tx verification
и
streaming verification
~~~

то пользователь не должен получать разных winners только потому, что оператор выбрал другой технический путь.

Требование:

~~~text
same canonical dataset
+ same draw context
+ same rules
+ same seed
= same outcome
~~~

Fast/streaming — транспорт и способ вычисления, а не альтернативные лотереи.

Поэтому canonical participant commitment/context format лучше выбрать **до** production deployment и использовать одинаково во всех разрешённых execution paths.

---

## 11. Emergency powers: если появятся, то только очень узкие

Generic pauseEverything() удобен оператору, но опасен для доверия и liveness. Современные access-control frameworks сами предупреждают, что guardians/cancellation powers могут становиться DoS surface.

Если когда-нибудь emergency controls окажутся реально нужны, безопаснее рассматривать capability уровня:

- остановить создание **новых** draw/proposals;
- остановить activation **новых** rules;
- остановить приём некоторых **новых** funding flows.

Гораздо опаснее и, вероятно, не должны существовать:

- pause уже назначенных claims;
- cancel frozen draw;
- вернуть frozen budget проекту;
- поменять seed;
- изменить frozen participant set;
- заменить winner;
- превратить timeout в no-winner.

То есть emergency power может ограничивать появление новых обязательств, но не должна уничтожать уже возникшие.

---

## 12. Проверяемый deployment

Source code в GitHub сам по себе не доказывает, что именно этот код работает on-chain.

Sourcify использует Solidity metadata — compiler settings, ABI, source hashes — для byte-for-byte verification deployed contracts. Для каждого production instance полезно публиковать reproducible deployment package:

- exact git commit;
- source tree hash;
- compiler version;
- optimizer/EVM settings;
- constructor args;
- deployed addresses;
- runtime bytecode/code hashes;
- verified source links;
- deployment tx hashes;
- initial rules/config;
- external dependency addresses.

Source verification доказывает correspondence кода и deployment, но не доказывает безопасность логики — это отдельная задача аудита.

---

## 13. Invariants вместо надежды на unit tests

Текущий проект уже достаточно зрелый, чтобы постепенно описывать безопасность не только примерами тестов, но и свойствами системы.

Stateful invariant/property testing, например Echidna/Foundry-style, полезен тем, что генерирует последовательности операций и пытается сломать свойства, возникающие только через сложную историю state transitions.

Кандидаты будущих protocol invariants:

~~~text
prize funds can never become project funds after recognition

assigned prize can never be reduced or cancelled

frozen draw inputs can never change

one frozen draw can never obtain a second seed

same context + same seed always produces same outcome
regardless of allowed execution path

new rules cannot rewrite obligations of an older epoch

no privileged function can directly name a winner

no privileged function can remove a frozen participant

Short actions cannot consume Monthly attempts

partner campaign cannot debit core prize reserves

new network instance cannot mutate old instance obligations
~~~

Такие invariants стоит со временем сделать частью CI/security suite.

---

## 14. Monitoring и наблюдаемость

Проверяемость после запуска — это не только возможность вручную читать explorer.

Trust-relevant события полезно автоматически мониторить и, возможно, показывать в публичном feed:

- rules announced;
- rules activated;
- role/permission changes;
- new deployment / new network instance;
- proposal READY;
- SEAL;
- randomness request/fulfillment;
- terminal/finalize;
- unusual funding movements.

OpenZeppelin Monitor — один из современных примеров tooling для multi-chain monitoring on-chain events и alerts. Выбор конкретного инструмента не принципиален; важен сам подход: **критичные изменения не должны происходить тихо**.

---

## 15. Что уже сделано в проекте

Ниже не новая спецификация, а краткая карта текущего состояния по репозиторию на 16.09.2026.

| Область | Текущее состояние |
|---|---|
| Product boundaries / base Promo | Основная модель TOKEN + Promo определена |
| PAIR dependency | Исследована; PAIR рассматривается как первая интеграция, не вечная платформа |
| PromoVault custody/claim | Реализовано |
| Short / Current / Next accounting | Реализовано |
| External USDG funding | Реализовано |
| Monthly accounting | Реализовано бухгалтерски, без полного production draw/RNG |
| Participant registration | Реализовано |
| Direct BUY → carry → entries | Реализован узкий deterministic replay |
| Attempt lifecycle | OPEN/FROZEN/CONSUMED replay реализован |
| Short prize basket | Реализована pure arithmetic |
| Atomic Short commitment | Snapshot/cutoff/rules/budget + real reserve реализованы как внутренний компонент |
| Deterministic Short outcome | Solidity + независимый JS verifier |
| Scaling study | Permissionless streaming проверен test-only до N=5000 без product MAX_N |
| Canonical production dataset layer | Ещё не реализован |
| Rules activation/versioning | Ещё не реализованы |
| Authenticated seed / RNG | Ещё не реализован |
| Production Short terminal | Ещё не реализован |
| Full Monthly attempts/RNG/controller | Ещё не реализован |
| TOKEN → USDG conversion | Ещё не реализована |
| Frontend | Ещё не реализован |
| Public deployment | Нет |

---

## 16. Предлагаемый маршрут дальше

Это рабочий порядок, а не жёсткий roadmap.

### Этап 1. Canonical dataset preparation

Ближайший технический пакет после scaling study.

Цель:

~~~text
PROPOSED
→ PUBLISHING
→ READY
→ SEAL + reserve/freeze
~~~

До SEAL preparation можно safely abandon/supersede, потому что призовые деньги и attempts ещё не frozen. После SEAL — никаких reset/cancel/replacement.

Нужно получить:

- единый canonical participant format;
- единый commitment/context для fast и streaming;
- anchored cutoff;
- bounded chunk publication;
- root/count/totalAttempts из фактических данных;
- independent verifier со своим RPC;
- публичный manifest + downloadable/mirrorable artifact;
- recovery path для другого executor.

### Этап 2. Rules activation / epochs

Определить:

- какие параметры вообще versionable;
- immutable bounds;
- кто может объявлять версию;
- notice;
- точную activation boundary;
- binding rules к attempts;
- поведение carry;
- отсутствие retroactive downgrade;
- публичную rules history.

### Этап 3. Authenticated seed / RNG

Выбрать production randomness integration и закрепить:

- один request ↔ один draw;
- один fulfillment ↔ один seed;
- no re-request/reroll;
- immutable inputs до request;
- callback только фиксирует randomness;
- streaming processing permissionless после seed.

### Этап 4. Production Short terminal

Соединить:

~~~text
canonical dataset
+ frozen budget/basket/rules
+ authenticated seed
+ bounded processing
→ deterministic result
→ PromoVault.finalize
→ AttemptsConsumed
~~~

При revert финализации остаются те же seed/result/progress; новый random не появляется.

### Этап 5. Monthly integration

Переиспользовать уже созданную инфраструктуру:

- attempts;
- cutoff/snapshot;
- RNG authentication;
- verifier;
- terminal semantics.

При этом Monthly сохраняет свою отдельную accounting state machine.

### Этап 6. TOKEN → USDG и реальный revenue path

Построить безопасный путь:

~~~text
creator revenue TOKEN
→ constrained conversion
→ actual received USDG
→ product allocation
~~~

С asset/recipient restrictions, slippage/bad-price protection и accounting только фактически полученного USDG.

### Этап 7. Full E2E

Первый настоящий сквозной сценарий:

~~~text
registration
→ PAIR BUY
→ entry/attempt
→ creator revenue
→ USDG funding
→ dataset
→ freeze
→ authenticated random
→ process
→ winner
→ claim
~~~

### Этап 8. Frontend / public audit surfaces

UI должен показывать не только «вы выиграли», но и проверяемые данные:

- current rules version;
- attempts;
- cutoff;
- draw state;
- budget/basket;
- seed/result;
- claims;
- rules history;
- deployment addresses;
- ссылки на verifier/manifest.

### Этап 9. Deployment package / security review

До public MVP:

- reproducible deployment;
- verified source;
- privilege map;
- protocol invariants;
- external security review;
- canary checks внешних dependencies;
- monitoring/alerts;
- recovery documentation.

---

## 17. Возможные будущие trust artifacts

Не обязательно делать всё сейчас. Полезный набор на зрелом этапе:

~~~text
PRODUCT_SPEC.md
IMPLEMENTATION_STATUS.md

TRUST_MODEL.md
PRIVILEGES.json
DEPLOYMENT_MANIFEST.json
RULES_HISTORY.json
DRAW_PROOF.json
public verifier CLI
public monitoring feed
~~~

Их задача разная:

- PRODUCT_SPEC — что продукт обещает;
- TRUST_MODEL — чему именно приходится/не приходится доверять;
- PRIVILEGES — кто что может;
- DEPLOYMENT_MANIFEST — какой код реально развёрнут;
- DRAW_PROOF — как воспроизвести конкретный draw.

---

## 18. Вопросы, которые полезно задавать к каждому новому решению

Перед добавлением новой функции, сети, партнёра или admin capability полезно пройти короткий checklist:

1. Создаёт ли это новое полномочие над **старыми** обязательствами?
2. Может ли владелец/оператор с этим полномочием направить prize funds произвольному адресу?
3. Можно ли действие сделать только для будущих epochs/campaign?
4. Можно ли объявить его заранее и сделать наблюдаемым?
5. Что увидит независимый аудитор?
6. Может ли UI/API соврать, а on-chain/verifier это обнаружить?
7. Есть ли второй технический execution path, который меняет outcome?
8. Что будет, если наш сервер/keeper исчезнет?
9. Что будет, если роль/ключ окажется злонамеренным?
10. Можно ли добиться той же продуктовой гибкости с меньшей властью?

Хороший критерий:

> **новая функциональность желательно должна расширять возможности продукта, а не полномочия над уже возникшими обязательствами.**

---

## 19. Современные источники и ориентиры

Это не нормативный список и не утверждение, что надо буквально копировать конкретный framework.

- **OWASP Smart Contract Top 10 2026** — Access Control как SC01 и отдельный класс Proxy & Upgradeability risks:  
  https://scs.owasp.org/sctop10/

- **OpenZeppelin Access Control / AccessManager / Timelock** — function-scoped permissions, grant/execution delays, guardians, discoverability и защита от misbehaving administrator:  
  https://docs.openzeppelin.com/contracts/5.x/access-control

- **Chainlink VRF v2.5 Security Considerations** — no re-request/cancel randomness, freeze outcome-affecting inputs before randomness, callback лучше использовать для сохранения random и продолжать сложный settlement отдельными вызовами:  
  https://docs.chain.link/vrf/v2-5/security

- **EIP-712** — пример явного domain separation через chainId / verifyingContract / version; полезная модель для наших commitment/result domains даже вне подписей:  
  https://eips.ethereum.org/EIPS/eip-712

- **Sourcify Solidity metadata / source verification** — compiler settings, ABI, source hashes и exact deployed-code verification:  
  https://docs.sourcify.dev/docs/metadata/

- **Trail of Bits / Building Secure Contracts — Echidna** — stateful property/invariant testing для последовательностей транзакций:  
  https://secure-contracts.com/program-analysis/echidna/basic/testing-modes.html

- **OpenZeppelin Monitor** — пример multi-chain on-chain monitoring и alerts для событий/транзакций:  
  https://docs.openzeppelin.com/monitor

---

## 20. Итоговая рабочая позиция

Проекту не нужно выбирать между двумя крайностями:

~~~text
"всё immutable навсегда и продукт невозможно развивать"
~~~

и

~~~text
"всё upgradeable, поэтому доверьтесь владельцу"
~~~

Более интересная цель:

> **максимальная свобода развивать будущее при минимальной способности нарушить прошлые обещания.**

Практически это означает:

~~~text
обязательства — immutable
полномочия — bounded и публично понятны
изменения — versioned / forward-only / observable
расширения — изолированы от core custody
новые сети — отдельные воспроизводимые instances
randomness — one-shot
execution — независимо проверяем
audit data — публично восстанавливаемы
~~~

Эту записку стоит использовать как фильтр при следующих архитектурных решениях, но не как замену отдельному принятию конкретных параметров и state machines.
