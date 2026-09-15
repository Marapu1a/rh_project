# Текущий ответ GPT

Обновлено: 15.09.2026.
Просмотрен latest commit `9adf46d44e36714b31e8f947b4ddb4e6358cf914` — `bind Short snapshots and prize baskets to atomic USDG reserve`.

Фактически прочитаны `ShortDrawCommitment.sol`, `SHORT_DRAW_COMMITMENT.md`, commitment tests/fixture, актуальные `PromoVault.sol`, `ShortPrizeBasket.sol`, `PRODUCT_SPEC.md`, `PROMO_VAULT_DESIGN.md`, `IMPLEMENTATION_STATUS.md` и lifecycle docs. GitHub CI/status для commit пусты; заявленные `93/93` тестов в этом проходе мной независимо не запускались.

Тема: **ревью атомарного Short commitment и следующая граница результата**.

## Короткий вердикт

Пакет сделал ровно то, что требовалось предыдущим ревью: теперь успешный Short freeze атомарно связывает:

```text
cutoff
+ attemptSnapshotHash
+ rulesHash
+ budget D
+ детерминированную basket
+ реальный PromoVault.reserveUSDG(D)
```

Если reserve откатывается, commitment и `AttemptsFrozen` тоже отсутствуют. Это правильная граница перед random.

Критической ошибки в текущем abstract-компоненте не вижу. Особенно хорошо, что это **не публично deployable controller** и что terminal/RNG не были притянуты раньше времени.

Но после этого шага проявились две архитектурные вещи, которые нельзя незаметно зацементировать в production.

---

## 1. Что сделано хорошо

### Atomicity

`_freezeShort()` сначала валидирует request/cutoff/vault binding, строит basket и вызывает настоящий:

```solidity
promoVault.reserveUSDG(drawId, campaignId, SHORT, budget)
```

Только после успешного reserve сохраняет commitment/pending и emits freeze events.

Любой revert откатывает в том числе `_syncUSDG()` внутри vault и изменения `generalFundingPhase`. Тест на donation/rounding rollback полезный.

### Деньги фиксируются именно из Short

`ReserveSource.SHORT` зашит в компонент и не передаётся caller'ом. CURRENT/NEXT нельзя случайно или специально использовать этим путем.

### Basket уже не может измениться после freeze

weights/minimumUnit фиксированы, D записан в request, `basketHash`, `basketTotal` и `remainder` сохранены. Позднее funding на frozen draw не влияет.

### Domain commitment

`shortCommitmentHash` включает chainId, controller, instanceId, registry, vault, quoteToken и весь Commitment. Это хорошо отделяет один deployment/draw от другого.

### Cutoff check честно ограничен EVM blockhash window

Использование `blockhash()` даёт on-chain проверку конкретного recent ancestor, а не выдуманную finality. Документация правильно отмечает, что окно 256 блоков — технический предел, а не политика подтверждений.

### Vault/controller reverse binding

Проверка `promoVault.drawController() == address(this)` закрывает случай ошибочно связанного vault. Для predicted vault deployment схема рабочая.

---

## 2. Не блокер сейчас, но важный production decision: правила сейчас singleton immutable

Текущий `ShortDrawCommitment` фиксирует на весь controller deployment:

```text
weights
minimumUnit
shortRulesHash
```

Это означает, что после публичного deployment Short template/rules фактически нельзя сменить без нового controller.

А `PromoVault.drawController` immutable, поэтому заменить только controller у живой казны тоже нельзя.

Это **нормально для нынешнего abstract/test component**, но это уже не просто техническая деталь, если перенести layout без изменений в production.

`PRODUCT_SPEC` пока оставляет направление:

> ограничения/обязательства immutable, а параметры фиксированных алгоритмов могут версионироваться для будущих периодов; точная архитектура ещё не выбрана.

Поэтому прошу Codex не трактовать singleton `shortRulesHash` как уже принятое lifetime-правило продукта.

Перед полным controller нужно выбрать одно из двух:

1. **MVP instance = одна неизменяемая Short rules version на весь срок жизни deployment.** Тогда текущая схема отлично подходит, но это надо явно принять как продуктовый компромисс.
2. **Ограниченное versioning будущих rules внутри одного immutable controller.** Тогда current component надо обобщить до bounded/versioned rules до production deployment, без proxy/arbitrary modules.

Сейчас production K/weights/minimum/D/pmax/h_e ещё не приняты, поэтому решение не требуется в этом коммите. Главное — не считать его уже закрытым случайно.

---

## 3. Главная следующая техническая проблема: frozen hash ещё недостаточен для проверки winners

`attemptSnapshotHash` сейчас отлично фиксирует **заявленный публичный snapshot** и replay может обнаружить ложь.

Но production controller при terminal должен выполнить более сильное требование:

> после появления random он не должен иметь возможности принять произвольный список winners/amounts, не связанный с frozen participant set.

Текущий canonical JSON `attemptSnapshotHash` сам по себе неудобен для Solidity-проверки результата: контракт не умеет из одного bytes32 восстановить participants/entries и проверить admission/winner selection.

Это не дефект commitment-пакета — он сознательно не делал result verification. Но это теперь следующая реальная граница.

Нельзя просто сделать:

```text
random seed
+ caller-supplied winners
→ PromoVault.finalize
```

иначе мы снова получим доверенный произвольный controller, только с красивым snapshot hash рядом.

---

## 4. Рекомендованный следующий пакет: deterministic Short outcome + EVM-verifiable participant commitment

До выбора конкретного RNG provider я бы сделал офлайн/локальный пакет условно:

```text
short-outcome-verification-v1
```

Цель — доказать, что **один random seed + frozen participant data + frozen basket/rules дают ровно один результат**, который controller способен проверить.

### Двойной commitment полезнее одного JSON hash

Сохранить нынешний `attemptSnapshotHash` как публичный canonical/replay commitment.

Для EVM verification добавить параллельный hash структурированного participant payload, например:

```text
evmParticipantsHash = keccak256(abi.encode(sorted ParticipantRange[]))
```

где ParticipantRange содержит минимум:

```text
wallet
attemptCount / firstAttempt / lastAttempt
```

или иной минимальный набор, достаточный для q(e).

Почему два hash:

- canonical JSON hash удобен внешнему verifier и связывает полный snapshot/domain/cutoff;
- ABI hash дешево и однозначно пересчитывается Solidity при settlement.

Они должны быть опубликованы в одном draw context и независимо сверяться verifier'ом. Сам EVM hash по-прежнему не доказывает правдивость snapshot — это соответствует уже принятой trust model; он **зато не даёт после freeze подменить participants именно для результата**.

Если Codex предложит другой EVM-friendly commitment (например Merkle root), сначала объяснить, как он проверяет **полный deterministic outcome**, а не только membership одного победителя. Merkle proof отдельного winner не доказывает отсутствие других admitted/winners.

---

## 5. Outcome algorithm сначала на seed, без RNG integration

Не выбирать Chainlink/VRF/keeper в этом пакете.

Сначала определить pure/versioned функцию:

```text
(randomSeed, frozenParticipants, frozenRules, frozenBasket)
→ admitted
→ ordered winners
→ prize assignments
→ resultHash
```

с текущей принятой семантикой:

- admission зависит только от entries по принятой формуле q(e); Luck отсутствует;
- max один Short prize на wallet;
- entries не добавляют второй вес после admission;
- если admitted > K — K winners;
- если admitted < K — случайное подмножество basket соответствует admitted wallets;
- невыданная basket + dust возвращаются в Short при finalize;
- random состоялся → все frozen Short attempts consumed, даже при 0 winners.

Численные `p_max/h_e/K/weights/m/D` всё ещё не считать production settings. Алгоритм может быть параметрическим/rulesVersion fixture.

### Важный deterministic detail

Не использовать stateful RNG loop, результат которого зависит от порядка обхода/числа предыдущих admitted без явной спецификации.

Лучше domain-separated hashes от одного seed, например отдельные потоки для:

```text
admission(wallet)
winner/order rank(wallet)
basket permutation
```

чтобы verifier мог воспроизвести результат byte-for-byte.

Конкретную схему hashing/modulo/rejection sampling Codex должен описать и тестировать; modulo bias не замалчивать.

---

## 6. Самый важный эксперимент этого этапа — gas/scale

Если on-chain verification требует передать и пройти весь frozen participant list, нужно измерить это **до** production controller.

Сделать sweep хотя бы для:

```text
N = 10, 50, 100, 250, 500, 1000
K = небольшой фиксированный template
```

и измерить:

- calldata size;
- gas verification/outcome calculation;
- gas PromoVault.finalize;
- worst-case admitted;
- итоговый transaction gas.

Если полный atomic settlement для ожидаемого N реально помещается — отлично, не усложняем систему.

Если нет — только тогда проектируем commitment + batching/proofs/lazy settlement. Не выбирать Merkle/batching заранее.

---

## 7. Следующий terminal invariant уже можно считать жёстким

Какая бы result architecture ни была выбрана:

```text
verify random/result
→ PromoVault.finalize(drawId, winners, amounts)
→ clear pending Short
→ emit AttemptsConsumed / terminal
```

должно быть **одной атомарной транзакцией** в простой версии.

Если `finalize` revert:

```text
pending остаётся
attempts остаются FROZEN
AttemptsConsumed отсутствует
```

Никакого timeout-as-no-win и никакого нового seed/reroll.

---

## 8. Ещё два небольших замечания

### `remainingRulesHash`

Сейчас это opaque commitment, что нормально для component boundary. Перед production нужен canonical public rules payload, иначе пользователь видит bytes32, но не может однозначно понять, что именно было зафиксировано.

### `campaignId`

Он остаётся metadata и не доказывает связь с FeeRouter campaign — docs это честно говорят. Не надо строить безопасность Short на этом поле.

---

## Что сейчас не делать

- не подключать RNG provider;
- не делать production executor/scheduler;
- не реализовывать Monthly terminal;
- не расширять BUY decoder;
- не выбирать proxy;
- не принимать тестовые weights/minimum как production;
- не решать finality случайным числом confirmations.

## Итог

`9adf46d` — хороший шаг: теперь до random уже существует настоящий денежно обеспеченный immutable Short input.

Следующий риск не в custody, а в **проверяемости результата из frozen participants**.

Я бы следующим пакетом сделал deterministic outcome model + EVM-friendly participant commitment + gas sweep. Только после этого имеет смысл выбирать RNG integration и писать terminal часть полного controller.