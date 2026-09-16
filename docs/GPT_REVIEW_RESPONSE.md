# Текущий ответ GPT

Обновлено: 16.09.2026.

Просмотрен latest commit `5aeeeaf773e4273d74d79a7e50616242353eea58` — `prepare canonical Short datasets before atomic reserve`.

Фактически прочитаны новый `ShortDatasetPreparation.sol`, dataset verifier/builder, CLI, тесты/fixture, `SHORT_DATASET_PREPARATION.md`, актуальные `PRODUCT_SPEC.md`, `IMPLEMENTATION_STATUS.md`, `GPT_REVIEW_REQUEST.md`, а также существующие `ShortOutcome`, `PromoVault` и attempt replay, с которыми новый слой должен быть совместим. GitHub CI/status для commit пусты; заявленные `120/120` tests в этом проходе мной независимо не запускались.

Тема: **ревью canonical dataset preparation и минимальная следующая state machine версий Short**.

## Короткий вердикт

Пакет в целом удачный. Он закрывает именно ту дыру, ради которой делался scaling study:

~~~text
canonical OPEN snapshot
→ publish/validate ВСЕ participants
→ READY
→ только потом reserve/freeze
~~~

То есть ошибочный порядок, дубликат, плохой диапазон, vault-recipient, неправильные root/count/attempt total теперь не могут сначала заморозить деньги, а уже потом обнаружиться на settlement.

Существенного структурного payload, который проходит текущие проверки READY/SEAL и при этом сам по себе несовместим с `ShortOutcome` / `PromoVault.finalize`, я не нашёл.

Особенно хорошо:

- actual root/count/attempts вычисляет контракт, а не принимает их как доверенные assertions;
- границы chunks не входят в canonical context;
- proposalId тоже не влияет на random context;
- supersede существует только до reserve;
- reserve + frozen event атомарны;
- после seal reset пока намеренно отсутствует;
- verifier действительно умеет строить expected dataset из replay, а не только перечитывать JSON оператора.

Следующий большой риск теперь уже не dataset structure, а **корректная привязка rules epoch к моменту mint attempts**. Именно туда логично идти дальше.

---

## 1. Structural payload: явного settlement-blocker не вижу

Текущая publication validation покрывает все ограничения, которые затем требует `ShortOutcome.participantsHash()`:

~~~text
wallet > previous
firstAttempt > 0
lastAttempt >= firstAttempt
~~~

Дополнительно dataset layer запрещает `wallet == PromoVault`, что необходимо, потому что `PromoVault.finalize()` такой winner отвергает.

Zero address отдельно проверять не требуется: первый `wallet > address(0)` его уже исключает.

Basket строится через тот же `ShortPrizeBasket` и поэтому K непустой, K <= 64, все prizes ненулевые, basketTotal <= D и суммы не overflow.

Rules проходят настоящий `ShortOutcome.rulesHash()`, то есть malformed fractions/version также не могут стать READY input.

Диапазон Participant хранится uint128, а максимальный допустимый count `last-first+1` при `first>=1` помещается в uint128 и совместим с `ShortOutcome.threshold()`.

### Что всё ещё можно соврать

Publisher всё ещё может объявить **структурно корректный, но ложный** список eligible wallets, либо неправильный `snapshotHash`.

Это не новый defect: это ровно принятая trust boundary.

Контракт доказывает: «я обработаю именно тот полный canonical dataset, который был опубликован».

Независимый replay доказывает: «этот dataset соответствует registrations/BUY/carry/attempt history».

Текущий пакет эти гарантии не смешивает, и документация это формулирует правильно.

---

## 2. Proposal / draw namespace и supersede

Текущая модель выглядит безопасно:

~~~text
proposalId
    ↓
Publishing / Ready
    ↓
можно Supersede

drawId
    ↓
становится необратимым только при SEAL
~~~

До SEAL USDG не reserved, `AttemptsFrozen` не существует, proposalId можно закрыть, тот же смысловой drawId можно подготовить заново, история старой proposal остаётся публичной.

После SEAL `sealedDraws[drawId]` закрывает повтор, PromoVault уже имеет Reserved draw, `pendingDatasetDraw` блокирует следующий Short, supersede невозможен.

Это соответствует Trust & Evolution принципу: **можно исправлять подготовку до возникновения обязательства, но не после него**.

ProposalId правильно исключён из context. Два оператора/две попытки подготовки одного и того же draw/cutoff/dataset/rules/D/basket должны приводить к одному random context.

Прямо сейчас критично недостающего смыслового поля в context не вижу. Он уже связывает chainId, controller, instance, registry, vault, quote asset, drawId/campaignId/rulesEpoch, cutoff, snapshotHash, root/count/attempts, D, rulesHash и basketHash.

Не нужно включать proposalId, publisher, chunk size, seal block или executor.

---

## 3. Один важный invariant на будущее: новый context должен стать ЕДИНСТВЕННЫМ Short context

Старый V2 и streaming study остаются в репозитории как этапы разработки, что нормально.

Но production controller не должен иметь legacy context для fast path и новый context для streaming path, если из них получаются разные admission/order hashes.

Новый dataset context уже выглядит подходящим кандидатом на canonical production context.

Следующий terminal/processing пакет должен исходить из:

~~~text
same dataset root
+ same rules
+ same D/basket
+ same seed
→ same winners/result

независимо от того,
был ли весь scan выполнен одним вызовом
или chunks.
~~~

Byte-for-byte совместимость со старым исследовательским V2 не нужна, потому что публичных frozen V2 obligations ещё нет.

---

## 4. Verifier: где он реально независим, а где нет

### Что он пересчитывает самостоятельно

В RPC mode цепочка хорошая:

~~~text
выбранный RPC
→ raw blocks/receipts
→ registration + supported BUY replay
→ carry / minted attempts
→ lifecycle consumption
→ exact OPEN Short at cutoff
→ Participant[]
→ snapshotHash
→ root/count/attempts
~~~

Затем `verifyPublication` независимо сравнивает это с on-chain Request, on-chain rulesHash, basket, published calldata chunks, event indices/hashes, actual root/count/attempts и sealed context.

То есть опубликованный Participant[] не принимается за исходную истину.

### Что verifier НЕ доказывает сам

Он проверяет историю **относительно входного deployment manifest/config**. Он сам не открывает «официальный адрес Promo» из какого-то внешнего trust registry.

Входными policy assertions пока остаются:

- какой deployment/instance считать нужным;
- `campaignId`;
- `rulesEpoch`;
- сами rules/weights/minimumUnit;
- budget D;
- допустимость cutoff/finality;
- шестичасовая readiness policy.

Verifier проверяет, что on-chain proposal соответствует этим данным и что dataset честно пересчитан. Он пока не доказывает, что оператор **имел право выбрать именно эти rules/D/cutoff**.

Это не дефект verifier: именно следующие controller/policy слои должны сделать такие решения bounded и воспроизводимыми.

Также верно отмечено: offline blocks = evidence, не независимая chain authenticity; RPC mode не сертифицирует finality; current publication decoder привязан к test-wrapper transport; automatic artifact mirrors ещё отсутствуют.

---

## 5. Небольшая liveness-граница proposal preparation

Это не blocker текущего internal component, но важно при production wrapper.

Сейчас `activeProposal != 0` блокирует новую preparation. Если production publisher исчез после BEGIN/PUBLISH и никто не имеет права вызвать supersede, Short preparation может зависнуть **до reserve**.

Это безопасно для денег, но плохо для liveness.

Не нужен admin cancel frozen draw. Достаточно в будущем policy wrapper определить прозрачное правило только для незарезервированной proposal, например authorized publisher может supersede либо permissionless expiry после объективного preparation deadline.

История proposal остаётся, draw ещё не frozen, prize obligations не нарушаются. Точный timeout сейчас выбирать не надо.

---

## 6. ReentrancyGuard: работает, но не надо тащить лишнюю сложность дальше

Тест reserve callback полезный: SEAL действительно защищён от reentry.

Небольшое инженерное замечание: `_beginDataset`, `_publishDataset`, `_supersedeDataset` сами не делают опасных внешних calls, а modifier стоит на internal functions.

Это не vulnerability, но создаёт composition constraint: будущий external wrapper не может бездумно иметь свой `nonReentrant` и затем вызвать эти методы тем же guard.

Документация это уже предупреждает. Я бы пока не переписывал пакет ради косметики. При сборке общего controller просто ещё раз проверить guard topology. Критичный guard — SEAL и будущий settlement, где реально есть external vault calls.

---

# 7. Следующая state machine: rules должны принадлежать attempts с момента mint

Это сейчас главный вопрос.

Требование владельца: правила можно менять между периодами, но нельзя задним числом менять условия уже заработанного OPEN participation.

Поэтому `rulesEpoch` нельзя определять в момент dataset begin/seal. Он должен быть производным от **момента появления attempt**.

## Минимальная модель без governance-комбайна

Состояние:

~~~text
currentEpoch
pendingRules?          // максимум одна будущая версия
noticeSatisfied
transition?            // максимум один незавершённый переход old → new
~~~

Каждая epoch содержит immutable после объявления payload/hash: epochId, outcome rules, basket template, budget policy identifier/data и другие разрешённые versioned параметры. Hard bounds остаются в immutable controller code.

## 7.1 Announce

Новая версия публикуется заранее. Она ещё не влияет ни на один attempt. Нужен minimum notice, конкретное значение позже.

Пока существует незавершённый transition V1→V2, нельзя объявить V3. Так в системе максимум два соседних epochs.

## 7.2 Activation — не SEAL и не задним числом выбранный cutoff

Самая чистая минимальная граница для block-based dataset:

~~~text
после notice вызывается activateRules()

activationBlock = block.number + 1
oldEpochLastBlock = block.number
~~~

Почему `+1 блок` важно:

- все BUY внутри блока activation transaction однозначно остаются old epoch;
- все BUY начиная со следующего блока однозначно получают new epoch;
- не нужен transactionIndex cutoff;
- activation нельзя задним числом поставить раньше уже увиденных BUY;
- BUY между old cutoff и будущим SEAL уже автоматически принадлежат new epoch и не «проваливаются».

Activation event должен публично фиксировать oldEpoch, newEpoch, oldEpochLastBlock и newEpochFirstBlock.

Replay присваивает Short attempt epoch по блоку BUY, который реально mint'ит entry.

### Carry

Carry не получает epoch.

~~~text
99 USDG накоплено при V1
+ 1 USDG BUY уже в V2
→ entry/Short attempt mintится в V2
~~~

При этом 99 USDG не теряются и threshold 100 USDG nominal не меняется.

## 7.3 Boundary draw старой версии

После activation старые OPEN attempts не превращаются в V2.

Создаётся переходное состояние:

~~~text
old V1 OPEN ≤ oldEpochLastBlock
new V2 OPEN ≥ newEpochFirstBlock
~~~

Следующий Short обязан обслужить **oldest outstanding epoch**, то есть V1.

Его canonical cutoff:

~~~text
cutoff = oldEpochLastBlock
rulesEpoch = V1
~~~

Dataset builder должен получить все V1 OPEN attempts и ни одного V2.

После terminal V1 cohort consumed. Только после этого V2 становится единственной обслуживаемой epoch.

Таким образом новая версия не переписывает OPEN, но и не требует вечного списка epochs.

## 7.4 Связь с 6 часами и предыдущим terminal

Activation не должна обходить Short schedule.

Минимально:

~~~text
нет pending Short
block.timestamp >= lastShortTerminalAt + 6 hours
notice новой версии уже выполнен
old rules/budget policy READY для boundary draw
~~~

Тогда activation фактически открывает следующий допустимый old-rules boundary Short.

После terminal boundary draw следующий V2 Short всё равно ждёт обычные 6 часов согласно уже принятому правилу.

Cutoff старого transition draw автоматически не раньше предыдущего terminal, потому что activation разрешён только после него.

## 7.5 Что делать с BUY между activation и SEAL

В предложенной модели ничего специального делать не надо:

~~~text
activation tx в block B
old cutoff = B

BUY в block B      → V1
BUY в block B+1...  → V2

dataset V1 может публиковаться и seal хоть позже
~~~

Поэтому seal timing не способен переназначить уже minted attempt.

## 7.6 Что надо изменить в replay

Current attempt ledger хранит один cumulative Short OPEN balance. Для epochs потребуется явная принадлежность mint к epoch.

Поскольку epochs активируются монотонно во времени, ranges одного wallet естественно остаются последовательными:

~~~text
attempts 1..5  → V1
attempts 6..9  → V2
...
~~~

Нужен replay вида `SHORT.byEpoch[V] = open/consumed/frozen` или эквивалентное компактное представление.

Dataset builder получает target rulesEpoch + cutoff и строит только OPEN диапазон этой epoch. Conservation по-прежнему должна выполняться по всем epochs вместе.

Monthly пока не надо затягивать в этот пакет автоматически; его versioning можно решить отдельно, используя тот же общий принцип.

---

## 8. Важная граница flexibility

Новая rules version не должна содержать wallet-specific material: никаких specialRecipients, walletMultipliers, allowList winners или custom winner addresses.

Versionable payload — глобальная экономика будущих attempts.

И особенно budget D: оператор не должен после просмотра dataset произвольно выбирать любую сумму в допустимом диапазоне.

Production rules желательно связывают D с публичной детерминированной policy от on-chain reserve state / bounded параметров.

Тогда порядок остаётся:

~~~text
rules заранее известны
→ attempts получают epoch
→ dataset фиксируется
→ D вычисляется по policy
→ reserve
→ только потом random
~~~

---

## 9. Что бы я делал следующим пакетом

Не RNG.

Следующий ограниченный пакет:

~~~text
short-rules-epochs-v1
~~~

Acceptance примерно такой:

1. Genesis epoch существует и immutable как payload.
2. Можно иметь максимум одну announced future epoch.
3. Future epoch не влияет на attempts до activation.
4. Activation не может быть поставлена задним числом.
5. Чистая block boundary: old through B, new from B+1.
6. BUY crossing 100 USDG carry после boundary mint'ит attempt новой epoch.
7. Старые OPEN сохраняют old epoch.
8. Dataset old epoch не включает new attempts.
9. Пока old boundary cohort не terminal, следующая rules update запрещена.
10. Один pending Short остаётся общим.
11. Cutoff boundary не раньше previous terminal.
12. 6h rule не обходится update'ом.
13. Reorg replay корректно откатывает activation/mints вместе.
14. Independent verifier воспроизводит epoch каждого attempt из публичной chain history.
15. Нет owner setter, способного назначить epoch уже существующему attempt.

Численные rules, notice duration и production D formula можно оставить fixture/test candidates, не утверждая их в PRODUCT_SPEC.

---

## 10. Лишних абстракций в текущем dataset package почти нет

`Publishing → Ready → Superseded/Sealed` оправданы разными trust states.

`expectedCount` и `expectedAttempts` не выглядят лишними: они позволяют доказать завершённость публикации и не полагаться только на невозможность случайно попасть в root.

`sealedDraws` частично дублирует будущий PromoVault status, но как локальный explicit no-reuse invariant вполне разумен и дешёв.

`activeProposal` тоже подходит текущему правилу «один Short pipeline за раз». Если позже потребуется готовить следующий draw параллельно pending draw, это будет уже отдельное product/liveness решение; сейчас усложнять не нужно.

---

## Итог

`5aeeeaf` — хороший переход от исследовательского streaming к production-oriented input layer.

Самое важное изменение по сравнению с предыдущими этапами:

> теперь деньги не frozen, пока весь объявленный participant dataset не прошёл canonical structural validation.

Следующая архитектурная задача уже не про список участников. Она про **время возникновения обязательства rules version**.

Я бы продолжил через небольшой `short-rules-epochs-v1`, где epoch присваивается attempt при mint через заранее объявленную block boundary, а старый cohort гарантированно доживает по старым правилам.