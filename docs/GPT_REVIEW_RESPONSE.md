# Текущий ответ GPT

Обновлено: 17.09.2026.

Просмотрен latest commit `198e8dd1c28c649ddcf1c9525d54f628d4e778d2` — `Add forward-only Monthly admission epochs and independent v4 replay`.

Прочитаны `MONTHLY_RULES_EPOCHS.md`, `MonthlySettlement.sol`, lifecycle v4, `monthly-dataset.cjs`, dual binding checks, epoch/replay tests, актуальные `PRODUCT_SPEC.md`, `IMPLEMENTATION_STATUS.md` и `GPT_REVIEW_REQUEST.md`. GitHub CI/status для commit пусты; заявленные локальные `164/164`, дополнительные replay/CLI `6/6`, RPC publication `1/1` и size/deployment check в этом проходе мной независимо не запускались.

## Короткий вердикт

Пакет выглядит цельным. После принятых продуктовых уточнений Monthly теперь делает ровно то, что хотелось:

~~~text
q можно менять только вперёд
interval и notice immutable
старые attempts не меняют policy
activation: old <= B, new >= B+1
максимум один draining + один current
empty не является draw и не двигает clock
~~~

Нового correctness blocker в самой epoch state machine я не нашёл.

Особенно важно: Кодекс правильно **не скопировал буквально прошлое предложение GPT**. В `PRODUCT_SPEC` теперь принято, что Monthly interval не versionable, а verified-empty не начинает новый clock. Текущий код и replay этой принятой версии соответствуют.

До исследования настоящего RNG я бы добавил только один дешёвый multi-epoch regression test и явно сохранил два известных trust/integration debt, описанных ниже.

---

## 1. Старые attempts действительно не могут тихо получить новую q

On-chain policy history хранится отдельно:

~~~text
policies[epoch] = {
  outcome,
  hash,
  firstBlock
}
~~~

После announcement payload уже не переписывается. Следующая версия получает новый epoch; старую mapping entry setter не меняет.

При begin draw выбирается только:

~~~text
target = drainingMonthlyEpoch != 0
       ? drainingMonthlyEpoch
       : currentMonthlyEpoch
~~~

и `Input.rulesEpoch` обязан совпасть с target.

После этого draw сам несёт epoch в immutable preparation input, context V2 содержит весь Input + exact policy hash, а processing читает:

~~~text
policies[m.input.rulesEpoch].outcome
~~~

а не `monthRules()` текущей версии.

Следовательно, последующая activation не может подменить q уже опубликованному/frozen draw.

### Единственное исключение — уже известная publisher truth boundary

Контракт всё ещё не умеет сам доказать, что publisher не положил в structurally valid old dataset попытки новой epoch или не выкинул старые.

Это не новый дефект Monthly epochs: тот же класс доверия уже существовал у canonical datasets/empty assertions.

Lifecycle v4 и builder такое смешение отвергают при independent replay, но on-chain prevention пока нет.

То есть корректная формулировка гарантии остаётся:

> policy старого draw нельзя изменить после honest canonical publication; ложная publication detectable, но пока не cryptographically prevented.

---

## 2. Clock semantics между контрактом и replay совпадают

Принятая логика теперь очень простая.

### Настоящий terminal win/no-win

Контракт после успешного `settleMonthly`:

~~~text
lastMonthAt = block.timestamp
lastMonthBlock = block.number
~~~

и только затем clearing draining epoch/`AttemptsConsumed` в той же transaction.

При revert vault settlement откатывается весь terminal, поэтому clock и draining остаются прежними.

Replay делает то же: `lastMonthlyTime` меняется только на `AttemptsConsumed` terminal.

### `MonthlyEpochEmpty`

Контракт:

~~~text
НЕ меняет lastMonthAt
НЕ меняет lastMonthBlock
НЕ резервирует деньги
НЕ расходует attempts
~~~

Replay также просто закрывает draining epoch и оставляет `lastMonthlyTime` прежним.

Это означает, что после verified empty новая current epoch может начать draw сразу, если старый обычный interval уже истёк. Это теперь **принятое продуктовое правило**, а не случайный side effect.

Расхождения clock в просмотренных ветках win/no-win/empty я не вижу.

---

## 3. Третья обслуживаемая epoch не появляется

State machine bounded корректно:

~~~text
announce:
  require announced == 0
  require draining == 0

activate:
  old current → draining
  announced → current

пока draining != 0:
  следующий announce запрещён
~~~

Draining очищается только terminal старого draw либо `MonthlyEpochEmpty`.

Поэтому в один момент могут существовать максимум:

~~~text
old draining Mn
+
new current Mn+1
~~~

Исторические `policies[1..n]` остаются для аудита, но это не очередь обязательств.

Announcement во время обычного current draw разрешён, что нормально: он ещё ничего не переключает. Activation запрещён при `activeMonth != 0` и при `pendingMonth != 0`.

Так что опубликованный Publishing/Ready dataset новой activation не пересекается.

---

## 4. Fresh cutoff после 256 блоков снова решён правильно

Как у Short, rules boundary и canonical snapshot anchor разделены.

Activation в B фиксирует:

~~~text
firstBlock(new) = B + 1
~~~

Для старого draining draw later cutoff может быть свежим:

~~~text
C >= B + 1
~~~

но replay participant upper bound остаётся:

~~~text
B = firstBlock(new) - 1
~~~

Поэтому:

- старый blockhash B не обязан оставаться доступным;
- canonical C остаётся в recent window;
- новые attempts после B видны replay;
- но в old cohort не попадают.

Контракт сам проверяет только fresh cutoff/boundary metadata; фактическую epoch-completeness, как и прежде, доказывает replay.

---

## 5. Carry и same-block boundary выглядят последовательно

Принятое правило выполняется:

~~~text
carry сам epoch не имеет
entry/attempt получает epoch в момент mint
~~~

То есть 99 USDG до activation + 1 USDG после B приводит к attempt новой epoch, если mint произошёл с B+1.

В самом activation block B все mints остаются old независимо от transaction ordering. Это сознательная block-level semantics, которую и contract event, и replay выражают через `firstNewBlock = B+1`.

Reorg удаляет activation event и последующие mints вместе с canonical branch, поэтому отдельного rollback mechanism не требуется.

---

## 6. Lifecycle v4 / genesis binding выглядит достаточно строгим для текущей trust model

V4 не переинтерпретирует старые formats и добавляет отдельный Monthly epoch domain.

Deployment identity связывает:

~~~text
chainId
Short source/runtime/instance
Monthly source/runtime/instance
vault/runtime/assets
kind-bit drawId scheme
Short genesis
Monthly genesis rules
Monthly interval
Monthly notice
Monthly firstBlock/startedAt
~~~

`verifyDualBindings()` читает runtime hashes/reverse bindings с RPC, отдельно сравнивает immutable `monthlyRulesHash`, `monthlyInterval`, `monthlyStartedAt`, notice и `monthlyEpochPolicy(1)`.

Для конкретного draw publication verifier ещё проверяет exact `monthlyEpochPolicy(rulesEpoch)`, rules payload/hash, request, chunks, root/count/attempts и после seal — `MONTHLY_DATASET_CONTEXT_V2`.

Я не вижу здесь очевидного места, где можно подменить genesis/current epoch и всё равно получить VALID publication при честном RPC.

Ограничения правильно остаются явными:

- offline evidence не доказывает canonical chain;
- RPC не доказывает finality;
- publication verification отдельно не доказывает BUY completeness;
- RNG пока вообще не сертифицируется.

---

## 7. Один конкретный test gap перед тем, как закрыть epochs

Большинство tests проверяют первый переход M1 → M2.

Я бы добавил один полноценный сценарий **двух последовательных переходов**:

~~~text
M1
→ activate M2
→ terminal/empty M1
→ обычный M2 draw с cutoff, оставляющим часть M2 attempts OPEN
→ announce M3 во время/после M2 draw
→ interval
→ activate M3
→ M2 становится draining
→ M3 attempts копятся
→ terminal M2
→ M3 normal draw
~~~

И проверить одновременно:

- `byEpoch` после трёх исторических policies;
- global cumulative attempt numbers остаются непрерывными;
- остаток M2 после предыдущего M2 cutoff действительно попадает в draining M2;
- M3 не смешивается с ним;
- consumed prefix/conservation сохраняются;
- после второго transition можно объявить M4 только после drain M2;
- отдельная ветка `M2 empty → M3 immediate eligibility` тоже не ломает clock.

Я не ожидаю, что этот test найдёт баг, но он проверит главное обещание конструкции: **история policy может расти сколько угодно, а live obligations остаются bounded двумя epochs**.

Это особенно полезно потому, что расчёт `byEpoch` использует cumulative consumed prefix и сейчас логически корректен именно благодаря old-first invariant.

---

## 8. Две вещи не надо потерять при переходе к production

### A. Activation readiness

Сам internal `_activateMonthlyRules()` проверяет notice/schedule/absence active+pending, но намеренно не знает:

~~~text
Next full?
RNG доступен?
execution budget жив?
finality достаточна?
~~~

Если production wrapper откроет permissionless activation без readiness gate, можно создать draining old epoch в момент, когда его заведомо нельзя закончить.

Это не меняет шансы и не крадёт attempts, но ухудшает liveness.

Поэтому будущая readiness policy должна применяться **до activation и до seal**, не давая затем cancel/reset frozen draw.

### B. AA publication recovery

Новый `monthly-dataset.cjs` по-прежнему восстанавливает chunks через direct transaction:

~~~text
tx.to == MonthlyController
parseTransaction(publishMonth(...))
~~~

Если production keeper пойдёт через ERC-4337/Alchemy sponsored smart account, этот recovery transport сам по себе его не поймёт.

Это уже известный integration debt Short и теперь Monthly. Его лучше решить общим transport decoder/recovery layer после выбора execution stack, а не плодить два разных решения.

---

## 9. Самый сильный оставшийся trust debt — не epochs, а truth of dataset/empty

С учётом нашей заявленной философии это важно не замылить словами «verifiable».

Сейчас авторизованный publisher технически способен:

~~~text
опубликовать структурно корректный неполный dataset
или
сделать ложный MonthlyEpochEmpty
~~~

и contract сам этого не предотвратит.

Independent verifier такую историю объявит ложной, но on-chain система уже может продолжить по неправильному cohort.

Это **не новый blocker этого commit** и текущий `PRODUCT_SPEC/GPT_REVIEW_REQUEST` прямо принимает модель detectable-not-prevented. Поэтому я не предлагаю сейчас тормозить Monthly epochs и тащить ZK/challenge.

Но перед public mainnet это нужно вынести отдельным trust decision:

> достаточно ли проекту публичной обнаружимости обмана publisher, или принцип «даже мы не можем тихо нарушить участие» требует prevention layer?

С учётом последнего Trust & Evolution направления я бы не дал этой теме потеряться после RNG.

---

## 10. Size после Monthly epochs остаётся здоровым

Research wrappers после пакета:

~~~text
Short    21 988 bytes   headroom 2 588
Monthly  17 064 bytes   headroom 7 512
Vault     8 496 bytes   headroom 16 080
~~~

без viaIR и под standard 24 576 runtime benchmark.

Monthly имеет хороший запас. Short по-прежнему является более тесной стороной, поэтому общий fixed RNG adapter для двух controllers всё ещё выглядит разумным кандидатом, если provider-specific code окажется тяжёлым.

---

## 11. Следующий этап

После одного multi-transition regression test я считаю Monthly epochs достаточно закрытым компонентом, чтобы **перейти к отдельному RNG research package**.

Не кодировать provider заранее.

Следующая задача:

~~~text
rng-provider-and-auth-boundary-study-v1
~~~

Нужно сначала установить, что реально доступно на Robinhood Chain сейчас, и сравнить минимум:

- native/официальный randomness mechanism сети, если существует;
- внешние VRF/randomness providers, которые фактически поддерживают Robinhood;
- commit/reveal или chain-native fallback, если внешний provider отсутствует;
- стоимость, latency, callback/retry semantics и failure model.

После исследования — минимальный fixed authenticated adapter/interface, общий для Short/Monthly если это уменьшает duplication без расширения полномочий.

Обязательные invariants будущего API:

~~~text
one sealed draw → at most one requestId
requestId permanently binds draw kind + drawId + context
callback only from authenticated provider/adapter
one accepted seed forever
no owner setSeed
no re-request/reroll after request
provider failure leaves same pending obligation
callback failure does not choose a new random
Short/Monthly domains remain disjoint
adapter cannot move PromoVault money
adapter/controller addresses immutable
~~~

### Итог

`198e8dd` хорошо закрывает именно policy evolution Monthly: старые attempts остаются под старой q, новые получают future q по block boundary, history растёт для аудита, а live state не превращается в очередь epochs.

По текущему коду/replay явного correctness blocker я не нашёл.

Добавить multi-transition M1→M2→M3 regression, после чего можно переходить к реальному RNG research. При этом false dataset/empty и AA recovery остаются отдельными явно отслеживаемыми trust/integration debts до public deployment.