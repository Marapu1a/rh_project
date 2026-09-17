# Текущий ответ GPT

Обновлено: 17.09.2026.

Просмотрен latest commit `80976bd09780c623dc6b13cb44c3443a389f4bff` — `Isolate Short and Monthly draw ID namespaces before preparation and reserve`.

Прочитаны diff, актуальный `GPT_REVIEW_REQUEST.md`, `DualControllerPromoVault.sol`, изменения `PromoVault.sol` / `ShortDatasetPreparation.sol` / `MonthlySettlement.sol`, `draw-id.cjs`, lifecycle v3 и новые dual tests. GitHub CI/status для commit пусты; заявленные `154/154` и отдельный dual size/deployment check в этом проходе мной независимо не запускались.

## Короткий вердикт

Правка закрывает найденный pre-seal cross-kind DoS чисто и дешевле, чем мой предыдущий hash-derived вариант.

Схема:

~~~text
bit 255 = 0 → Short
bit 255 = 1 → Monthly
low 255 bits != 0
~~~

хороша именно тем, что не создаёт вторую сущность `logicalDrawId → vaultDrawId`. Один и тот же bytes32 теперь проходит через request, snapshot, context, events, vault, replay и claim.

Я не нашёл оставшейся точки входа в **новом dual deployment**, через которую один controller может создать/зарезервировать draw в namespace другого типа.

Основной следующий вопрос действительно уже не drawId, а безопасная forward-only эволюция Monthly q/interval.

---

## 1. Где namespace реально защищается

Защита стоит на двух уровнях, и это правильно.

### Preparation boundary

Short:

~~~text
ShortDatasetPreparation._beginDataset
→ datasetVault.validateDrawId(drawId, SHORT)
~~~

Monthly:

~~~text
MonthlySettlement._beginMonth
→ monthlyVault.validateDrawId(drawId, MONTHLY)
~~~

Поэтому hostile/buggy publisher уже **не может даже подготовить READY dataset** с ID чужого типа.

### Custody boundary

Short real reserve:

~~~text
PromoVault.reserveUSDG
→ onlyController
→ validateDrawId(drawId, SHORT)
~~~

Monthly real reserve:

~~~text
PromoVault.startMonthly
→ onlyMonthlyController
→ validateDrawId(drawId, MONTHLY)
~~~

То есть даже если controller обойдёт собственный preparation wrapper и попытается вызвать vault напрямую, namespace всё равно enforced самой казной.

Это сильнее, чем только off-chain generator или только begin-level validation.

---

## 2. Другого cross-kind occupation path в dual vault сейчас не вижу

Проверил оставшиеся пути.

### `reserve(...)`

В `DualControllerPromoVault` generic/TOKEN reserve полностью запрещён через `_validateTokenReserve()`. Поэтому его нельзя использовать как обход namespace.

### `finalize(...)`

`finalize` сам новый draw не создаёт: он требует уже существующий `Reserved` draw. Monthly draw дополнительно отвергается через `UseMonthlySettlement`.

Создать такой `Reserved` draw можно только через уже namespace-checked reserve/start paths.

### `settleMonthly(...)`

Также работает только с уже созданным `MONTHLY` draw и exact `pendingMonthlyDrawId`.

### `fundUSDG / syncUSDG / claim`

Draw storage не создают и namespace не занимают.

### Два одинаковых low-255 payload

Теперь это именно желательный сценарий:

~~~text
Short   = 0 | payload
Monthly = 1<<255 | payload
~~~

Это два разных canonical ID и оба могут быть READY/pending одновременно. Новые tests проверяют обе очередности seal и terminal.

Итого: исходный edge case закрыт не только после reserve, а до первого state commitment каждой стороны.

---

## 3. Replay/on-chain identity выглядит согласованно

Lifecycle v3 теперь включает:

~~~text
drawIdScheme = kind-bit-v1
~~~

и `validateDrawId()` вызывается при построении snapshot и при чтении lifecycle FREEZE/TERMINAL events.

`verifyDualBindings()` отдельно требует exact scheme и всё ещё pin'ит runtime hashes обоих controllers и vault.

Это важно: verifier не просто видит `kind=MONTHLY` в event, он проверяет одновременно:

~~~text
exact monthly emitter
+ MONTHLY high-bit namespace
+ exact deployment domain
~~~

Поэтому on-chain и replay используют одну идентичность, а не две конкурирующие схемы.

Старые experimental v3 artifacts действительно должны быть пересобраны: domain изменился. То, что v1/v2 legacy formats не переписываются задним числом, правильно.

---

## 4. Маленькое уточнение для документации/UI: drawId уникален внутри deployment, не во всём мультичейне

`kind-bit-v1` разделяет Short/Monthly **в одной казне/instance**. Он не пытается делать bytes32 глобально уникальным между сетями и будущими deployments.

Это нормально, потому что cryptographic contexts уже содержат chain/controller/instance/vault.

Но публичные инструменты лучше считать полной идентичностью draw примерно так:

~~~text
(chainId, vault/instance, drawId)
~~~

а не обещать, что один bytes32 никогда не повторится в другом deployment.

Для multi-chain проекта это стоит сохранить как audit/UI convention.

---

## 5. `draw-id.cjs`: только косметическое замечание

В helper параметр сейчас называется `seed`:

~~~text
drawIdFor(kind, seed)
~~~

Комментарий правильно говорит, что это не randomness seed. Security-проблемы здесь нет.

Но перед public tooling я бы переименовал argument в `payload`, `number` или `idSeed`, потому что в проекте одновременно существует настоящий RNG `seed`. Это уменьшит шанс путаницы в auditor/keeper code.

Сам masking корректен: теряется только один high bit, остаётся 255-bit payload. Same-kind повтор payload не обязан предотвращаться генератором — повторный canonical ID уже запрещает state machine/vault.

---

## 6. Размер после исправления всё ещё здоровый

Новая policy добавила немного кода:

~~~text
Short research wrapper   21 988   headroom 2 588
Monthly                  13 876   headroom 10 700
Dual vault                8 496   headroom 16 080
~~~

Это не меняет принятую dual-controller архитектуру. Short запас всё ещё требует дисциплины перед реальным RNG, но сам namespace не создал нового size-проблемного слоя.

---

# 7. Monthly rules: требования совместимы, если использовать один draining epoch, а не очередь

Текущий вопрос в `GPT_REVIEW_REQUEST.md` сформулирован правильно:

- lifetime immutable q/interval нежелательны;
- уже накопленные OPEN Monthly attempts нельзя ухудшить задним числом;
- не хочется бесконечной очереди epochs;
- новые Monthly cycles не должны получать дополнительную artificial остановку.

Я думаю, эти требования **можно совместить**.

Ключевая идея очень похожа на Short, но Monthly не надо копировать целиком.

Нам нужен максимум:

~~~text
1 current epoch
1 announced future epoch
1 draining old epoch
~~~

и никогда больше двух реально живых versions одновременно.

---

## 8. Предлагаемая Monthly transition state machine

Допустим сейчас действует `M1`, объявляем `M2`.

### Шаг A — announce

Публикуется полный future payload:

~~~text
epoch = 2
q / admission rules
interval
other explicitly versionable Monthly params
eligibleAt
~~~

До activation **ни один attempt не становится M2**.

Одновременно можно иметь только одну announced version.

### Шаг B — activation в block B

После notice отдельная transaction активирует transition:

~~~text
oldEpoch = M1
newEpoch = M2
firstNewBlock = B + 1
~~~

Все Monthly attempts, minted:

~~~text
<= B   → M1
>= B+1 → M2
~~~

Same-block semantics такая же простая, как у Short: весь block B остаётся old.

Activation допустима только когда:

- нет pending Monthly draw;
- старый monthly schedule уже допускает boundary draw;
- execution/RNG/funding readiness достаточны, чтобы не открыть переход, который заведомо нельзя обслужить.

Последнее — readiness policy, не новая admin power.

### Шаг C — старый epoch становится draining

После activation:

~~~text
M1 OPEN attempts → должны быть обслужены старым draw
M2 OPEN attempts → уже копятся для следующего обычного draw
~~~

Никакого преобразования M1 → M2 нет.

### Шаг D — boundary Monthly draw использует СВЕЖИЙ cutoff C

Здесь полезно повторить именно удачную часть Short epochs.

Не нужно требовать:

~~~text
cutoff == activation block B
~~~

Можно взять свежий canonical cutoff:

~~~text
C >= B+1
~~~

а replay знает, что participant upper bound для draining M1 всё равно:

~~~text
B = firstBlock(M2) - 1
~~~

Поэтому:

- `blockhash(C)` ещё доступен;
- BUY M2 между B+1 и C видны chain replay;
- но они не попадают в M1 dataset;
- весь старый M1 cohort остаётся точным и конечным.

Это решает ту же 256-block проблему, которую уже решили для Short.

### Шаг E — terminal старого draw

Boundary draw полностью работает по M1:

~~~text
M1 q
M1 interval/schedule eligibility
один M1 seed
M1 attempts consumed и при win, и при no-win
~~~

После terminal:

~~~text
drainingEpoch = none
currentEpoch = M2 only
lastMonthlyAt = boundary terminal time
~~~

Следующий обычный Monthly draw использует M2 и ждёт уже `M2.interval`.

M2 attempts, накопленные пока M1 draw был pending, не теряются и не меняют version.

Это не дополнительная остановка относительно обычного правила «один pending Monthly»: пока старый boundary draw pending, новый draw и так не мог бы начаться.

---

## 9. Почему очередь epochs не растёт

Пока существует draining M1:

~~~text
announce M3 запрещён
activate M3 запрещён
~~~

После terminal/verified-empty M1 остаётся только M2.

Поэтому состояния вида:

~~~text
M1 + M2 + M3 + M4 open
~~~

не возникает.

Максимум:

~~~text
frozen/draining M1
+
open M2
~~~

Это тот же полезный bounded-state принцип, но Monthly state machine значительно проще Short: нет корзины/Short D policy и отдельного выбора K.

---

## 10. Empty old epoch

Если на activation старых M1 attempts фактически нет, нет смысла запускать randomness с пустым dataset.

Нужен аналогичный replay-verifiable transition:

~~~text
MonthlyEpochEmpty(M1, cutoff, snapshotHash)
~~~

После него M2 становится единственным epoch.

Trust boundary остаётся уже знакомой:

- контракт сам не доказывает полную BUY history;
- ложный EMPTY обнаруживается independent RPC replay;
- до public launch нужны artifact/monitoring/verifier;
- это не повод добавлять reset/reroll.

Для empty transition я бы начинал новый M2 clock от момента подтверждённого empty/activation boundary, чтобы первая M2 попытка не могла получить мгновенный draw только потому, что предыдущий old clock давно истёк. Точное правило стоит отдельно зафиксировать в tests/spec.

---

## 11. Interval versioning

`interval` можно безопасно versionить тем же payload, если разделить две вещи.

Boundary draw старого cohort проверяется по **M1 interval**.

После его terminal следующий draw проверяется по **M2 interval**.

То есть обновление:

~~~text
30 days → 20 days
~~~

не ускоряет старый M1 draw задним числом.

А:

~~~text
20 days → 30 days
~~~

не удлиняет уже накопленным M1 attempts их старое schedule условие.

Новые M2 attempts заранее знают свою будущую policy.

Как и раньше, interval — минимальная eligibility spacing, а не гарантия terminal ровно через N дней: pending/RNG/readiness могут задержать исполнение.

---

## 12. Replay changes

Lifecycle v3 сейчас ведёт Monthly как один ledger. Для versioning потребуется отдельная Monthly epoch принадлежность mint.

Одна BUY/entry в конкретном block может законно создать:

~~~text
Short attempt  → Short epoch S3
Monthly attempt → Monthly epoch M2
~~~

Эти timelines независимы.

Replay должен хранить monthly `byEpoch` или эквивалентные monotonic ranges и при boundary snapshot выбирать target old epoch, а не весь Monthly OPEN.

Conservation остаётся общей:

~~~text
monthly minted
= sum(open by epoch)
+ sum(frozen by epoch)
+ sum(consumed by epoch)
~~~

Это важно проверить отдельно, а не пытаться переиспользовать Short fields вслепую.

---

## 13. Что НЕ нужно копировать из Short

Не надо превращать Monthly в второй Short.

Monthly не нужны:

- basket versions;
- K/weights;
- caller-supplied D policy;
- Short-specific minimumUnit;
- Short draw interval 6h;
- общий rules struct только ради reuse.

Monthly epoch payload должен содержать только **реально изменяемую Monthly policy**.

Budget у Monthly уже определяется accounting через `startMonthly`: весь frozen Current. Это даже чище, чем Short D, и не требует новой operator discretion.

---

## 14. Минимальный следующий design package

До RNG я бы сделал маленький design/fixture пакет:

~~~text
monthly-rules-epochs-v1
~~~

Acceptance:

1. Genesis Monthly epoch фиксируется deployment.
2. Максимум одна announced future version.
3. Notice не активирует rules автоматически.
4. Activation B: old through B, new from B+1.
5. Existing Monthly OPEN attempts сохраняют old epoch.
6. New attempts после boundary получают new epoch.
7. Old boundary draw использует fresh cutoff C, но dataset ограничен old epoch end B.
8. Boundary draw uses old q/interval.
9. New epoch attempts не расходуются old draw.
10. После terminal старого draw new epoch становится единственным target.
11. Следующий update запрещён, пока draining old не terminal/verified-empty.
12. Empty transition проверяется replay и публичным snapshot hash.
13. Reorg activation/mints откатываются детерминированно.
14. Monthly and Short epochs полностью независимы.
15. Никакой setter не может переназначить уже minted attempt другой version.

Production численные q/interval по-прежнему не выбирать в этом пакете.

После этого RNG boundary можно делать сразу для уже окончательной Short + Monthly policy architecture.

---

## Итог

`80976bd` хорошо закрывает найденную коллизию.

Kind-bit scheme здесь даже лучше моего первоначального hash-domain предложения: она даёт непересекающиеся namespaces, сохраняет один canonical ID и почти ничего не добавляет в audit surface.

Нового cross-kind occupation path в dual vault/replay я не вижу.

Следующая логичная ветка — **Monthly forward-only epochs**. Причём требования не выглядят противоречивыми: один draining old epoch + один active new epoch позволяет сохранить старые attempts, менять q/interval для будущих, не строить очередь versions и не добавлять отдельную паузу сверх уже существующего one-pending Monthly lifecycle.