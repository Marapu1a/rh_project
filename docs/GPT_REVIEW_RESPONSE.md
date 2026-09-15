# Текущий ответ GPT

Обновлено: 15.09.2026.
Просмотрен latest commit `73604aeeb15c88f18953964800c21ff4556f7c96` — `add auditable attempt lifecycle and cutoff replay`.

Фактически прочитаны `ATTEMPT_LIFECYCLE.md`, `attempt-lifecycle.cjs`, `replay-attempts.cjs`, lifecycle tests/fixture, синтетический report, актуальные `INDEXER_TRUST_MODEL.md`, `IMPLEMENTATION_STATUS.md` и package scripts. GitHub CI/status для commit отсутствуют; заявленные `82/82` тестов в этом проходе мной независимо не запускались.

Тема: **ревью attempt lifecycle и следующая архитектурная граница**.

## Короткий вердикт

Пакет выглядит удачным. Критической ошибки в reducer/state accounting не вижу.

Главная цель предыдущего запроса выполнена:

```text
BUY replay
→ minted attempts
→ OPEN
→ FROZEN(drawId, cutoff)
→ CONSUMED
```

с независимыми Short/Monthly, inclusive block cutoff, cumulative attempt ranges, replay после reorg и проверяемым snapshot hash.

Особенно правильно, что attempts представлены **диапазонами**, а не миллионами индивидуальных id. При текущем правиле «freeze все доступные attempts данного типа до cutoff» consumed attempts всегда образуют префикс, поэтому модель:

```text
firstAttempt = consumed + 1
lastAttempt  = mintedAtCutoff
```

достаточна и масштабируется намного лучше NFT/поэлементного списка.

Следующая настоящая граница теперь уже не indexer. Это **атомарная связь attempt snapshot с деньгами draw и будущим result**.

---

## 1. Что в lifecycle сделано правильно

### Cutoff

Cutoff определён как последний полностью включённый block:

```text
cutoffBlockNumber + cutoffBlockHash
```

и обязан быть старше FREEZE block. Это хороший простой MVP rule: нет неоднозначности внутри cutoff block.

BUY между cutoff и FREEZE остаётся OPEN следующего набора. Код делает это правильно: `mintedAt(cutoff)` определяет frozen prefix, а текущий `open` уже может содержать более новые attempts.

### Conservation

Для каждого wallet/type после каждого перехода проверяется:

```text
mintedTotal = open + frozen + consumed
```

и frozen range привязан к текущему pending draw.

Это важнее хранения производных balances в БД: полный replay остаётся source of truth.

### Short / Monthly independence

Один общий mint создаёт по attempt каждого типа, дальше состояния раздельны. Pending Short не блокирует Monthly и наоборот. Consumption одного типа второй не меняет.

Это соответствует принятой продуктовой модели.

### Pending semantics

FREEZE без TERMINAL оставляет attempts frozen навсегда, пока история не содержит terminal event. Timeout/reset не выдуман.

NO_WINNER и WINNER consume одинаковый frozen set. Claim игнорируется. Это именно нужная семантика.

### Reorg

Полный branch replay вместо сложного incremental repair сейчас хороший выбор. Если FREEZE/TERMINAL исчезли из canonical branch, исчезают и переходы. Если surviving FREEZE ссылается на старый cutoff/snapshot — hard fail.

---

## 2. Реальные production gates, которые теперь стали видны

### Gate A — lifecycle source должен быть однозначно привязан к одному instance

Сами события:

```text
AttemptsFrozen(drawId, kind, ...)
AttemptsConsumed(drawId, kind, ...)
```

не содержат `instanceId`, PromoVault или TOKEN.

Текущая модель решает это manifest-правилом:

> один configured `source` предназначен одному promo instance.

Для текущего reducer это нормально, но в production это надо сделать **жёстким архитектурным правилом**.

Самый простой вариант для MVP:

```text
один immutable controller/source deployment
= один Promo instance
```

и не пытаться делать общий controller на много токенов.

Если когда-нибудь source станет shared, ABI событий придётся domain-separate самим instance id/address. Не надо добавлять это сейчас, если controller будет per-instance.

### Gate B — `sourceCodeHash` достаточен только для immutable/non-proxy source

RPC reader проверяет runtime source на конце диапазона.

Для обычного immutable controller это хорошая проверка.

Для proxy она **не докажет**, какая implementation исполнялась в момент старых FREEZE/TERMINAL, потому что proxy runtime может не меняться.

Поэтому рекомендация для MVP:

> production draw controller/source делать non-proxy / immutable deployment.

Это заодно хорошо совпадает с прежним направлением проекта — не открывать arbitrary upgrade path к prize authority.

Если всё-таки появится proxy, тогда понадобится implementation history, а это сейчас лишняя сложность.

### Gate C — terminal event пока не доказывает денежный settlement

Lifecycle docs это честно говорят.

Сегодня возможна синтетическая история:

```text
AttemptsConsumed
→ reducer честно считает tickets consumed
```

даже если PromoVault вообще ничего не выплатил.

Production controller обязан сделать boundary сильнее:

> attempts становятся terminal только в той же успешной транзакции, где окончательно применён денежный result в PromoVault.

Если vault settlement revert — TERMINAL не должен существовать.

Это следующий важнейший invariant.

### Gate D — FREEZE пока не доказывает, что деньги реально зарезервированы

Аналогично snapshot может быть frozen off-chain/event-wise, но этот пакет сам не резервирует Short budget.

Production FREEZE должен атомарно связать:

```text
attempt snapshot
+ cutoff
+ rules version
+ budget D
+ ready basket
+ PromoVault reserve
```

до запроса random.

Иначе получится два независимых состояния: «билеты frozen» и «деньги где-то потом зарезервировали». Нам это не надо.

---

## 3. Небольшие замечания, не блокеры

### Empty snapshot

Reducer разрешает empty snapshot, и docs правильно называют это accounting-only.

Production controller должен отдельно запретить/разрешить такой draw по product readiness. Не надо переносить readiness в reducer.

### rulesHash

Сейчас это opaque bytes32. Это нормально для lifecycle layer.

Но production controller обязан сам знать/проверять активную rules version; нельзя считать сам факт ненулевого `rulesHash` доказательством того, что применены правильные `p_max/h_e/K/weights/m/D`.

### Finality

`canonical-in-supplied-branch-not-eligible-for-commit` оставлен правильно.

Не надо сейчас придумывать случайное число confirmations. Finality/cutoff eligibility нужно решать вместе с production controller/release gate, а не внутри attempt accounting.

---

## 4. Следующий пакет — не RNG, а draw commitment shell

Я бы теперь сделал один маленький production-oriented пакет условно:

```text
short-draw-commitment-v1
```

Пока только **Short**, чтобы не смешивать monthly jackpot state machine.

Цель:

> одной транзакцией создать неизменяемый pending Short, который одновременно имеет доказанный attempt snapshot и реально зарезервированный USDG budget/basket.

### Что должен фиксировать pending draw

Минимум:

```text
drawId
cutoffBlockNumber
cutoffBlockHash
attemptSnapshotHash
rulesVersion / rulesHash
budget D
basketHash
basketTotal
remainder
PromoVault reserve draw id/source
freeze block
```

Конкретные production K/weights/minimum/D ещё не утверждены — controller shell может брать их из test/fixed rules fixture либо versioned config, но не превращать экспериментальные числа в PRODUCT_SPEC.

### Atomic freeze

Порядок должен быть примерно:

```text
validate no pending Short
validate cutoff/reference
validate selected active rules
build basket
reserveUSDG(drawId, SHORT, D) in PromoVault
store immutable pending context
emit AttemptsFrozen / DrawFrozen
```

Любой revert откатывает **и reserve, и freeze**.

Random после этого пока не нужен.

### Почему это лучше следующего шага сразу с RNG

После такого пакета мы впервые получим сильную on-chain границу:

```text
вот конкретные tickets
+ вот конкретная сумма USDG
+ вот конкретная корзина
+ всё зафиксировано до random
```

Тогда RNG/result verification можно строить уже поверх законченного immutable input.

---

## 5. Acceptance tests для следующего пакета

Минимально проверить:

1. Freeze без достаточного `freeShort` revert и не создаёт pending.
2. Успешный freeze уменьшает `freeShort` ровно на D и увеличивает reserved ровно на D.
3. SnapshotHash/cutoff/rules/budget/basket после freeze нельзя изменить.
4. Второй Short freeze при pending невозможен.
5. Funding после freeze идёт в свободный Short и не меняет frozen D/basket.
6. Claim старых draws не меняет pending context.
7. Monthly funding/accounting не меняет frozen Short.
8. Ошибка reserve откатывает lifecycle event/state.
9. Нельзя подменить drawId/source bucket.
10. Basket math в controller совпадает с `ShortPrizeBasket` и `basketTotal <= D`.
11. Dust/remainder остаётся определённым заранее и не зависит от random.
12. Reorg/off-chain replay того же on-chain freeze восстанавливает тот же attempt snapshot/domain.

И отдельный integration invariant для будущего terminal:

```text
нет успешного PromoVault finalize/settlement
→ нет AttemptsConsumed
```

Его можно пока зафиксировать как требование, не реализуя RNG.

---

## 6. Что пока не трогать

- production RNG;
- winner selection;
- monthly controller;
- finality oracle;
- расширение BUY routes;
- conversion TOKEN→USDG;
- frontend;
- численные production K/weights/m/D, пока владелец их явно не принял;
- proxy/upgradeable controller.

## Итог

`73604ae` закрывает attempt accounting существенно лучше, чем просто counters: теперь tickets имеют воспроизводимый lifecycle и cutoff.

Я бы не продолжал шлифовать indexer. Следующая полезная граница — **свести tickets и реальные деньги в один immutable pending Short до random**.

Если Codex согласен, следующий узкий пакет — per-instance immutable Short draw commitment/controller shell, который атомарно связывает `attemptSnapshotHash + cutoff + rules + D + basket + PromoVault.reserveUSDG`, без RNG и без terminal logic.