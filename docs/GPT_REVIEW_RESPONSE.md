# Текущий ответ GPT

Обновлено: 16.09.2026.

Просмотрен latest commit `15b248eed6db0a2013107c8de6ee5eb69cb7597f` — `bind Short attempts to immutable rules epochs`, а также предыдущий `46d2ab61f974028a3626e442a9a31afda19404bc` — `check 90-day execution economics scenarios`.

Прочитаны `ShortRulesEpochs.sol`, epoch-aware replay/dataset builder/verifier, `SHORT_RULES_EPOCHS.md`, тесты/fixture, текущий `PRODUCT_SPEC.md`, `IMPLEMENTATION_STATUS.md` и экономическая модель. GitHub CI/status для latest commit пусты; заявленные `128/128` tests в этом проходе мной независимо не запускались.

## Короткий вердикт

Оба ответвления полезные.

Экономический quick-check сделал ровно то, что должен: не доказал автономность, но показал, что отдельный operations budget выглядит жизнеспособно при умеренном обороте и что на тихом старте фиксированная инфраструктура опаснее обычного gas. Это хороший research artifact, а не production policy.

Epoch package в целом тоже выглядит корректно и заметно лучше моей предыдущей грубой схемы `cutoff = activation block`.

Ключевое исправление правильное:

~~~text
activation в B
V1 mint: <= B
V2 mint: >= B+1

старый draw может взять свежий cutoff C >= B+1
но replay фильтрует только V1 attempts
~~~

Так правила и snapshot anchor перестают быть одной и той же сущностью, и 256-block `blockhash` window больше не превращает переход rules в дедлайн.

Явной ошибки, которая позволяла бы честному replay смешать V1/V2 или потерять старые attempts, не нашёл.

Но есть несколько важных границ, которые я бы не потерял перед production.

---

## 1. Fresh cutoff после activation — корректная модель

Предыдущее предложение фиксировать old cutoff ровно на B действительно было слишком жёстким. Если подготовка началась поздно, `_beginDataset` уже не смог бы проверить `blockhash(B)`.

Новая модель разделяет:

~~~text
rules boundary = B / B+1
snapshot cutoff = свежий C
~~~

и это нормально.

При draining V1 replay считает participant upper bound как `firstBlock(V2)-1`, а сам C нужен только как canonical history anchor. Поэтому BUY V2 между B+1 и C видны replay, но не попадают в V1 participant set.

Same-block семантика тоже однозначна: все BUY блока activation остаются V1, даже если транзакция BUY идёт после activation transaction. Это сознательная block-level boundary, а не ошибка ordering.

Reorg естественно откатывает activation event и связанные последующие mint вместе с веткой; тест это покрывает.

---

## 2. Cumulative ranges / byEpoch выглядят согласованно

Глобальные attempt numbers остаются непрерывными по кошельку, а epoch — только разбиение этого диапазона.

При монотонных epochs и обязательном обслуживании oldest outstanding epoch consumption остаётся prefix-like:

~~~text
1..5  V1
6..9  V2

сначала расходуется V1
потом V2
~~~

Поэтому текущая реконструкция `consumed/open/frozen` по epoch через cumulative totals математически согласуется с основной conservation.

Monthly остаётся отдельным ledger того же mintedTotal и не наследует Short epoch. Это соответствует текущему продукту.

---

## 3. Важнейшая оставшаяся trust boundary: ложный snapshot / ложный EMPTY всё ещё возможны on-chain

Это не новый дефект этого commit, но теперь стало особенно видно.

Авторизованный publisher технически может:

~~~text
иметь реальные старые V1 OPEN attempts
→ вызвать closeEmpty с ложным assertion
→ закрыть draining V1 on-chain
~~~

Независимый replay это обнаружит и отвергнет, но контракт сам не остановит.

То же самое по сути уже было возможно через структурно корректный, но ложный participant dataset: publisher мог пропустить старые attempts, а внешний verifier это заметил бы.

Поэтому `closeEmpty` **не создаёт новый класс доверия**, но делает существующую accepted boundary более очевидной.

Для текущего этапа я не предлагаю ZK/challenge/governance. Минимум перед public deployment:

- отдельная узкая publisher capability, не общий owner;
- публичный artifact до `closeEmpty`;
- monitoring события `ShortEpochEmpty`;
- verifier, который в один вызов говорит `VALID EMPTY / FALSE EMPTY` из собственного RPC;
- UI/audit feed не должен скрывать empty transition;
- документация должна прямо говорить: false snapshot/empty detectable, но пока не cryptographically prevented.

Если позже захотим поднять гарантию с detectability до prevention, это отдельная архитектурная задача. Не надо притворяться, что текущий replay уже делает это on-chain.

---

## 4. Rules epoch пока НЕ означает полную экономическую policy draw

Сейчас epoch immutable payload содержит:

~~~text
ShortOutcome rules
weights
minimumUnit
~~~

Но `budget D` остаётся caller-supplied в `Request`.

Это соответствует границе текущего пакета и не является багом `ShortRulesEpochs`, однако для пользователя слово «rules version» легко понять шире, чем реализовано.

До production нужно отдельно решить:

> может ли оператор произвольно выбирать D у каждого draw, или D вычисляется по публичной budget policy версии?

С учётом нашей Trust & Evolution позиции я по-прежнему предпочитаю второе: epoch либо связанная public policy задаёт deterministic/bounded способ получить D из on-chain reserve state. Тогда publisher не может после просмотра dataset выбрать удобную сумму.

Пока этого нет, в docs/UI лучше называть нынешний payload именно `outcome/basket policy`, а не делать вид, что вся экономика Short уже version-bound.

---

## 5. Announcement semantics надо сформулировать точно

Текущий код разрешает:

~~~text
announce V2
notice уже прошёл
но V2 ещё не activated
→ продолжать начинать V1 draw
~~~

потому что `eligibleAt` — earliest activation, а не автоматический effective time.

Это может быть нормальной моделью, но её надо назвать именно так.

Если frontend скажет пользователю «V2 вступит в силу в 12:00», текущий контракт этого не гарантирует.

Он гарантирует только:

> V2 нельзя активировать раньше 12:00; фактическая activation будет отдельной on-chain transaction.

Для MVP это проще и приемлемо. Если позже захотим deterministic scheduled activation, state machine надо менять отдельно.

---

## 6. Нет cancellation announced rules — безопасно, но это сознательная потеря flexibility

Сейчас валидный, но ошибочно объявленный payload нельзя отменить:

~~~text
announce плохую V2
→ либо никогда больше не обновлять rules
→ либо активировать V2, drain, потом V3
~~~

Это trust-conservative решение, но operationally жёсткое.

Я бы НЕ добавлял cancel прямо сейчас. Но перед production стоит решить, нужна ли прозрачная pre-activation replacement:

~~~text
replace/cancel только до activation
→ публичное событие
→ новый notice начинается заново
~~~

Такое действие не переписывает уже minted attempts, но влияет на ожидания пользователей, поэтому не должно быть мгновенным и тихим.

Отдельно можно запретить no-op update `newPolicyHash == currentPolicyHash`, чтобы не плодить бессмысленные epochs. Это low priority.

---

## 7. Completion hook scoped правильно

`_completeEpochDraw` не принимает просто заявление `terminal`.

Он требует:

- тот же pending draw;
- PromoVault уже `Finalized`;
- win/no-win согласован с `awarded`; 
- nonzero resultHash.

И только после этого снимает pending, закрывает draining и запускает новый 6h interval.

Это хорошая граница.

Но она пока не доказывает, что winners соответствуют canonical context + seed. Fixture намеренно caller-controlled; production wrapper обязан сначала завершить deterministic streaming outcome и только в той же транзакции вызвать vault.finalize + completion.

---

## 8. Экономическая ветка 46d2ab6: полезная, но не переносить числа в policy

`EXECUTION_ECONOMICS_QUICK_CHECK.md` аккуратно маркирует assumptions, и это важно.

Модель показывает, например:

~~~text
$5k/day, 0.2% creator revenue, 20% ops
→ ops reserve растёт в 90-дневном сценарии

$1k/day при тех же assumptions
→ стартовый ops reserve постепенно проедается
~~~

Также x10/x50 spike в модели в основном превращается в ожидание до BEGIN, а prize reserve не затрагивается.

Но модель сознательно грубая:

- Short условно раздаёт весь накопленный bank;
- N получен из упрощённого `entriesPerWallet`;
- gas линейно аппроксимирован по двум точкам;
- RNG/DA/conversion/provider billing не измерены;
- операции ведутся в USD-equivalent, а не отдельными ETH/USDG balances.

Поэтому вывод из неё только один: **отдельный pre-prize operations share стоит продолжать исследовать; 10%/20% и gates не приняты**.

PromoVault ради этого менять по-прежнему не требуется.

---

## 9. Что я бы делал следующим

Из двух вариантов в текущем запросе:

~~~text
A. canonical streaming terminal
B. authenticated seed
~~~

я бы выбрал **A — canonical streaming terminal**.

Причина простая: RNG provider на Robinhood пока не выбран и это внешняя зависимость, а у нас уже есть всё внутреннее для завершения Short:

~~~text
epoch-aware canonical dataset
+ canonical context
+ deterministic ShortOutcome
+ proven streaming top-K composition
+ PromoVault finalize
+ AttemptsConsumed
~~~

Нужно теперь сшить их в один production-oriented internal state machine, пока ещё с test-only seed delivery hook.

Acceptance следующего пакета:

1. Используется только `SHORT_DATASET_CONTEXT_V1`, без legacy/study random domain.
2. Один sealed draw принимает seed ровно один раз через **internal authenticated-seed hook**; fixture может мокать auth, production нет.
3. Processing chunks permissionless и strictly sequential.
4. Chunk data обязаны совпадать с already-published dataset hashes/root.
5. Streaming top-K даёт тот же winners/amounts/admitted, что independent full-sort JS для того же context+seed.
6. `finish` единственным вызовом делает `PromoVault.finalize` + `_completeEpochDraw`; revert откатывает оба.
7. No-winner — terminal того же seed, не reroll.
8. После seed нельзя supersede/change dataset/rules/D.
9. Новый Short не стартует до terminal + 6h.
10. Старый draining epoch закрывается только terminal этого draw или verified empty path.
11. Recovery executor может продолжить по public chunks/progress без исходного keeper.
12. Result hash/domain становится будущим canonical Short result format и не зависит от chunk partition/executor.

После этого authenticated RNG становится очень узким последним входом:

~~~text
какой внешний механизм имеет право вызвать internal deliverSeed(drawId, seed)
~~~

и его уже можно выбирать/аудировать отдельно.

### Monthly

Полный immutable controller обязан поддерживать Monthly до deployment, но я бы не тащил Monthly terminal в этот следующий Short package.

Зато новый seed/storage interface надо проектировать так, чтобы позже Monthly мог использовать тот же authentication layer без replaceable module/proxy.

---

## Итог

`15b248e` хорошо закрывает важную проблему: **правила теперь принадлежат attempts с момента mint, а не назначаются задним числом при freeze**.

Fresh cutoff C вместо старого activation block B — правильное улучшение и не меняет cohort.

Главные незакрытые вещи теперь хорошо видны:

~~~text
truth of publisher snapshot/empty   → detectable, not prevented
budget D policy                     → ещё не version-bound
canonical streaming terminal        → следующий логичный слой
authenticated RNG                   → после terminal wiring
production roles/finality/economics → ещё отдельно
Monthly production path             → обязательно до deployment
~~~

Я бы двигался дальше именно через canonical streaming terminal, не меняя сейчас ни prize custody, ни epoch model.