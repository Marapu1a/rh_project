# Текущий ответ GPT

Обновлено: 16.09.2026.

Просмотрен latest commit `2586de843b8ea81c62fecaa250285dca8b42f494` — `integrate canonical Short streaming settlement`.

Прочитаны `ShortSettlement.sol`, `SHORT_SETTLEMENT.md`, independent JS verifier/recovery, новые integration tests, а также связанные `ShortOutcome`, `ShortRulesEpochs`, `ShortDatasetPreparation` и `PromoVault`. GitHub CI/status для latest commit пусты; заявленные `136/136` tests в этом проходе мной независимо не запускались.

## Короткий вердикт

Пакет хороший: canonical Short теперь действительно собран почти полностью от SEALED dataset до атомарного terminal.

В текущем коде я не нашёл нового пути, где корректно опубликованный dataset + один фиксированный seed дают неправильный global top-K или альтернативный result из-за partition/executor.

Основная цепочка выглядит согласованно:

~~~text
SEALED dataset
→ WaitingSeed
→ seed принимается один раз
→ permissionless sequential chunks
→ global top-K
→ canonical SHORT_DATASET_RESULT_V1
→ PromoVault.finalize
→ AttemptsConsumed / epoch completion
~~~

Reserve и terminal атомарны; failed finalize не меняет seed/progress/result, reroll отсутствует.

Но перед следующим большим слоем есть два важных архитектурных предупреждения и одна полезная оптимизация.

---

## 1. Local top-K → global top-K: логика корректна

`ShortOutcome.compute()` на каждом chunk возвращает первые `min(local admitted, K)` кандидатов, отсортированных тем же `(SHORT_ORDER_V1 rank, wallet)`.

`_merge()` сливает два уже отсортированных списка тем же comparator и оставляет первые K.

Кандидат, не попавший в local top-K, действительно не может попасть в global top-K: внутри собственного chunk уже есть K admitted кандидатов лучше него.

Поэтому композиция индуктивна и не зависит от partition.

Prize assignment выполняется только после полного scan, через тот же `SHORT_PRIZE_ORDER_V1`. Equal prize-rank сохраняет меньший исходный index первым, как и `ShortOutcome._slots()`.

Canonical result hash также выглядит однозначно: `context + seed + ordered root + outcome rules hash + basketHash + Result(resultHash=0)`. Context уже связывает полный dataset rules hash, budget/request и basket, поэтому отдельное повторение только outcome-rules hash не ослабляет commitment.

### Маленький пробел в тестах

Я бы добавил один targeted test:

~~~text
0 < global admitted < K
и admitted лежат в разных chunks
~~~

Сейчас хорошо покрыты `0 winners` и обычный случай `>=K`, но именно частичный случай `1..K-1` полезно зафиксировать отдельно: winners должны совпасть full-sort, а prize slots должны быть случайным подмножеством корзины, а не первыми исходными prizes.

Это test coverage, не найденный defect.

---

## 2. Пропуск/повтор/ранний finish/повтор seed закрыты

По state machine:

- seed принимается только из `WaitingSeed`; даже `bytes32(0)` однозначен благодаря phase;
- process требует `index == nextChunk`;
- payload chunk обязан совпасть с сохранённым ABI hash;
- duplicate/skipped/out-of-order chunk не проходят;
- finish требует все chunks и `processed == proposal.count`;
- sealed proposal уже нельзя supersede/reseal;
- rules/basket/D/context после seal читаются только из зафиксированного proposal/epoch;
- drawId повторно не seal'ится;
- terminal переводит phase только после успешного vault.finalize + completion.

Если `PromoVault.finalize` revert, вся terminal tx откатывается: settlement остаётся Processing, pending draw остаётся тем же, reserve остаётся frozen, result детерминирован тем же seed. Повторный finish должен дать тот же результат.

Это именно нужная no-reroll semantics.

---

## 3. Старые unpaid credits не смешиваются с новым draw

Новый terminal использует стандартный PromoVault accounting:

~~~text
reserved текущего draw
→ его own reward[] / claimable

старые reward[]
→ остаются отдельными долгами старых drawId
~~~

Claim failure одного старого winner не мешает следующему Short и не меняет `freeShort` нового draw. Тест epoch transition это покрывает.

---

## 4. Recovery сейчас корректен только для direct-call transport — и это уже конфликтует с нашим вероятным AA keeper

Это не ошибка settlement contract, но важная интеграционная граница.

`recover()` сейчас требует:

~~~text
DatasetChunk event tx
→ tx.to == Short controller
→ tx.data напрямую decode как publish(proposalId, chunk)
~~~

То есть текущий recovery **не восстановит publication**, если production keeper публикует через ERC-4337 smart account / EntryPoint / bundled call.

А в предыдущем execution-funding исследовании именно sponsored AA через Alchemy был основным кандидатом для автоматического keeper.

При AA данные, скорее всего, всё ещё публичны внутри UserOperation / nested calldata, но нужен другой decoder/recovery path.

Поэтому до production надо выбрать одно из двух:

1. publication намеренно остаётся direct EOA transaction transport; или
2. verifier/recovery получает canonical decoder фактического AA transport.

Я бы предпочёл второй вариант, если AA остаётся основным execution path. Нельзя запускать с обещанием permissionless recovery, если production transport сам recovery tool не понимает.

Это пока integration blocker, не изменение Short math.

---

## 5. Самое важное: code-size budget уже становится архитектурным риском

Документация фиксирует runtime `ShortSettlementFixture` около **20 340 bytes** при локальном EIP-170 check.

Лимит, против которого тестируется fixture: 24 576 bytes.

Остаётся примерно:

~~~text
24 576 - 20 340 = 4 236 bytes
~~~

При этом полного immutable controller ещё нет, а в него по текущему плану всё ещё должны войти:

- authenticated RNG/request binding;
- production authorization;
- economic/finality readiness;
- возможно budget D policy;
- keeper-facing hooks;
- **Monthly production state machine**, которую мы договорились иметь до immutable deployment.

Fixture содержит тестовые wrappers, поэтому нельзя утверждать, что production controller уже гарантированно не влезет. Но 4.2 KB headroom — достаточно мало, чтобы **не продолжать слепо наращивать один контракт**.

Я бы считал это HIGH architectural warning до следующей крупной интеграции.

Не нужен proxy или replaceable module. Можно сохранить immutable trust model и при этом заранее спроектировать фиксированную composition:

~~~text
immutable root controller
    ├── fixed Short calculation/helper contract
    ├── fixed Monthly helper
    └── fixed RNG adapter / verifier
~~~

где addresses задаются один раз в constructor и никогда не заменяются, а только root controller имеет право двигать PromoVault money.

Другой вариант — вынести pure/view-heavy computation в linked/fixed helper contract, оставив custody/state transitions в root.

Но это надо измерить до того, как RNG + Monthly заставят нас переделывать уже сшитый controller.

### Что попросил бы сделать сейчас

Небольшой `controller-size-composition-study`, без product changes:

- собрать realistic skeleton будущего root controller;
- добавить stubs interfaces для Short, Monthly, RNG auth, readiness/auth roles;
- измерить runtime bytecode;
- сравнить monolith vs fixed immutable helpers;
- проверить, какие внешние helper calls меняют trust surface;
- оставить PromoVault controller immutable и один;
- никакого delegatecall/proxy/arbitrary module replacement.

Если monolith спокойно влезает с большим запасом — отлично, продолжаем. Если нет — мы поймаем это сейчас, а не перед deployment.

---

## 6. Есть ещё очевидная gas-оптимизация в processing

`processShort()` сейчас вызывает полный `ShortOutcome.compute()` **на каждом chunk**.

А полный compute помимо admission/top-K каждый раз ещё:

- строит prize permutation;
- создаёт amounts/prizeIndices;
- считает local resultHash;
- валидирует basket.

Но `processShort` использует из результата только:

~~~text
local.winners
local.admittedCount
~~~

Остальное выбрасывается.

При K=64 повторный `_slots()` O(K²) на каждом chunk особенно дорог.

Перед финальными gas/economic оценками разумно рефакторнуть `ShortOutcome` так, чтобы был общий internal primitive вроде:

~~~text
selectTopK(context, seed, participants, rules, K)
→ Candidate[] + admittedCount
~~~

а полный `compute()` и streaming process использовали один и тот же primitive.

Это не меняет probability semantics и даже уменьшает риск расхождения двух реализаций.

Я бы не делал отдельный алгоритм — именно вынес общий selection primitive.

---

## 7. Publisher truth boundary не изменилась

Settlement recovery доказывает:

> processed exactly the published canonical dataset.

Он не доказывает:

> published dataset == all true eligible BUY attempts.

Полнота BUY history по-прежнему проверяется отдельным full replay.

Документация это не смешивает, что хорошо.

False snapshot / false empty остаются detectable-not-prevented до отдельного future challenge/proof слоя.

---

## 8. Что минимально нужно перед authenticated RNG

После code-size/composition проверки RNG boundary уже довольно узкая.

Нужны:

~~~text
requestRandom(drawId, context)
→ immutable requestId ↔ drawId/context binding

provider callback(requestId, randomness)
→ проверка sender/provider
→ ровно один seed
→ _acceptShortSeed(drawId, seed)
~~~

Критичные invariants:

- request создаётся только для SEALED/WaitingSeed draw;
- один draw не имеет двух requestId;
- requestId нельзя перепривязать;
- callback другого draw отвергается;
- duplicate callback идемпотентно reject/ignore без нового seed;
- timeout не создаёт новый request/random;
- никакого owner `setSeed`; 
- provider failure оставляет тот же pending obligation;
- context/dataset/rules/D уже immutable до request.

Pre-freeze readiness остаётся отдельной policy: наличие RNG provider/operations capacity надо проверять **до seal**, но оно не даёт права cancel после seal.

---

## 9. Какой следующий шаг

С учётом нового code-size факта я бы немного поменял прежний порядок.

Не сразу писать provider-specific RNG.

Сначала маленький технический пакет:

~~~text
controller-composition-and-selection-refactor
~~~

В нём:

1. измерить production-like bytecode budget и выбрать monolith или fixed immutable helpers;
2. вынести общий Short selection primitive, чтобы streaming не считал ненужную prize permutation каждый chunk;
3. добавить test `0 < admitted < K` across chunks;
4. решить recovery transport для будущего AA keeper хотя бы на уровне documented interface/decoder boundary.

После этого — authenticated RNG binding.

Это не новая продуктовая ветка; это снижение риска перед последними внешними интеграциями.

---

## Итог

`2586de8` — сильный шаг. Canonical Short terminal уже не исследование: это цельная внутренняя state machine с одним seed, permissionless continuation и реальным atomic vault settlement.

Нового correctness blocker в самом top-K/terminal я не вижу.

Главное, что всплыло на этом этапе:

~~~text
Short algorithm/state machine       → выглядит хорошо
AA recovery transport               → ещё не совместим
per-chunk gas                       → можно заметно упростить
full-controller bytecode headroom   → проверить СЕЙЧАС
authenticated RNG                   → следующий внешний trust boundary
Monthly                             → всё ещё обязан попасть в immutable deployment design
~~~

То есть уже можно двигаться к RNG, но сначала я бы потратил один короткий пакет на composition/code-size и убрать очевидный processing overhead.