# Текущий ответ GPT

Обновлено: 17.09.2026.

Просмотрен latest commit `0cb3cc1c111aef2f107ec80c590363fa8a4d6962` — `Separate Short and Monthly controller capabilities and verify dual settlement`.

Прочитаны `DUAL_CONTROLLER_ARCHITECTURE.md`, `DualControllerPromoVault.sol`, изменённый `PromoVault.sol`, `MonthlySettlement.sol`, текущий `GPT_REVIEW_REQUEST.md`, dual controller tests, replay/binding описание и `IMPLEMENTATION_STATUS.md`. GitHub CI/status для latest commit пусты; заявленные `151/151` и отдельный dual size/readiness check в этом проходе мной независимо не запускались.

## Короткий вердикт

Да — разделение получилось не просто способом обойти размер, а **архитектурно более чистой моделью полномочий**.

~~~text
                   DualControllerPromoVault
                    /                   \
                   /                     \
       ShortController               MonthlyController
       только Short                  только jackpot
~~~

При этом:

- казна и liabilities остаются общими;
- controllers immutable и различны;
- Short физически не может резервировать Current или запускать Monthly;
- Monthly физически не может резервировать Short или generic-finalize;
- TOKEN/generic reserve в новом vault полностью закрыт;
- `fundUSDG`, `syncUSDG`, `claim` остаются permissionless, потому что не дают caller перенаправить уже признанные деньги;
- terminal каждого типа остаётся атомарным в одной EVM transaction;
- Short и Monthly могут быть pending одновременно и не требуют общего root-controller.

Это хорошо совпадает с нашим Trust & Evolution принципом: **разделение функциональности одновременно уменьшило полномочия каждой части**.

Критического обхода capability matrix через унаследованный API я не нашёл.

---

## 1. Capability matrix действительно закрыта на уровне vault

Наследование `PromoVault` сначала выглядело местом, где легко оставить старую лазейку, но текущие hooks достаточно узкие.

Base `PromoVault` сохранил legacy single-controller semantics по умолчанию. `DualControllerPromoVault` переопределяет только:

~~~text
_authorizeMonthly()
_validateTokenReserve()
_validateUSDGSource()
~~~

В результате Short (`drawController` alias) может:

~~~text
reserveUSDG(... SHORT ...)
finalize(non-MONTHLY draw)
~~~

но не может:

~~~text
reserve TOKEN
a reserve Current
startMonthly
settleMonthly
finalize MONTHLY draw
~~~

Monthly controller, наоборот, входит только через `startMonthly/settleMonthly`; generic `reserve/finalize` по-прежнему защищены `onlyController`, который указывает именно на Short.

Permissionless `fundUSDG/syncUSDG/claim` не создают capability bypass:

- funding только добавляет призовые средства;
- sync только признаёт уже находящийся USDG по фиксированной GENERAL policy;
- claim переводит только заранее зафиксированному winner.

То есть controller не получает способ назвать произвольного recipient через эти пути.

Отдельно правильно, что новый vault запрещает generic TOKEN reserve полностью. Это делает границу ясной: **TOKEN должен быть конвертирован до попадания в эту prize custody**, а не лежать вторым spendable prize asset.

---

## 2. Общая казна + независимые pending выглядит согласованно

Одновременный:

~~~text
pending Short
+
pending Monthly
~~~

сам по себе бухгалтерию не ломает.

Short резервирует только `freeShort`. Monthly через `startMonthly` резервирует весь текущий `freeCurrent`, оставляя `freeNext` на месте до результата.

Новые прямые USDG transfer во время pending по-прежнему проходят одну общую `_syncUSDG()` и поэтому не становятся «деньгами конкретного controller».

Порядок вызовов Short reserve / Monthly start не должен менять признание уже лежащих средств; тесты специально проверяют обе очередности. Старые `claimable/reward[drawId][winner]` также не принадлежат controller state и переживают новые draw/cycles.

Monthly win/no-win использует прежнюю принятую бухгалтерию:

~~~text
WIN:
Current frozen → winner claimable
old Next → new freeCurrent
Next → 0
cycle++

NO-WIN:
frozen Current → freeCurrent
Next остаётся полным
cycle не переключается
~~~

Это хорошо отделяет **draw execution state** от **денежных обязательств vault**.

---

## 3. MonthlySettlement выглядит нормальным самостоятельным sibling Short

Мне нравится, что Monthly не пытались притянуть к Short inheritance ради экономии нескольких функций.

У него свой понятный lifecycle:

~~~text
Publishing
→ Ready
→ WaitingSeed
→ Processing
→ Terminal
~~~

и отдельные domains:

~~~text
MONTHLY_DATASET_V1
MONTHLY_DATASET_CONTEXT_V1
MONTHLY_RESULT_V1
~~~

Это лучше, чем generic `DrawEngine`, где аудитору пришлось бы доказывать, какая ветка параметров реально исполняется.

После seed:

- chunks только по порядку;
- chunk обязан совпасть с опубликованным hash;
- selection использует общий проверенный `ShortOutcome.selectTopK(..., K=1)`;
- global winner — минимум того же `(rank, wallet)` порядка;
- no admitted → terminal no-win;
- `settleMonthly + local terminal + AttemptsConsumed` идут одной транзакцией;
- любой revert откатывает всё.

Нового внутреннего сценария «корректный frozen Monthly + валидный seed, но алгоритм сам завёл draw в неразрешимое состояние» я не нашёл.

Внешние причины зависания остаются отдельно: недоставленный RNG, отсутствие исполнителя, chain failure или реальный USDG deficit. Они не должны лечиться reroll/reset — и текущий код такого пути не добавляет.

---

## 4. Replay v3: направление правильное

Для dual deployment старые lifecycle v1/v2 действительно уже недостаточны: два источника событий нельзя молча смешивать.

Новая v3-domain связывает:

~~~text
chain
registry
Short source + runtime hash + instance
Monthly source + runtime hash + instance
vault + runtime hash
assets
Monthly immutable policy identity
~~~

RPC verifier дополнительно читает обе reverse bindings и policy с chain.

Это правильная модель: event `AttemptsConsumed(kind=MONTHLY)` принимается не потому, что у него красивый topic, а потому что он пришёл **с exact monthly source**, закреплённого deployment domain.

При этом прежняя граница остаётся: verifier подтверждает выбранный deployment и replay его истории, но сам по себе не создаёт глобальный registry «официальных deployment проекта». Эту роль позже выполняет deployment manifest / verified release package.

---

# 5. Один конкретный пробел: cross-kind drawId collision ДО seal

После просмотра двух независимых preparation state machines я вижу один небольшой, но реальный liveness edge case, которого текущий collision test не закрывает полностью.

Vault действительно имеет global namespace:

~~~text
draws[drawId]
~~~

и после того, как один draw уже зарезервирован, второй тип с тем же `drawId` атомарно отвергается. Это протестировано.

Но **до seal** proposals живут только в своих controllers.

Возможна последовательность:

~~~text
Short publisher:
  begin Short(drawId = X)
  publish...
  Short Ready, но ещё не sealed

Monthly publisher видит X:
  begin Month(drawId = X)
  publish...
  sealMonth(X)   // vault X теперь занят

Short:
  seal(X)        // revert в vault._reserve
~~~

И наоборот.

Деньги не теряются: проигравшая proposal ещё pre-freeze и может быть superseded. Но compromised/buggy publisher одной стороны получает возможность **мешать liveness другой стороны**, хотя денежные capabilities специально разделены.

Это не критический custody bug, но против нашей идеи capability isolation выглядит лишним.

### Минимальное исправление, которое я бы рассмотрел

Сделать canonical vault drawId domain-separated по типу, а не принимать общий произвольный namespace от publisher.

Например концептуально:

~~~text
Short vaultDrawId   = H("PROMO_SHORT_DRAW_V1", shortInstance, logicalDrawId)
Monthly vaultDrawId = H("PROMO_MONTHLY_DRAW_V1", monthlyInstance, logicalDrawId)
~~~

Тогда cross-kind collision невозможен без hash collision.

Можно также просто определить обязательный kind namespace в самом drawId schema, но hash-domain выглядит чище и воспроизводимее.

Важно: если это делать, **canonical ID должен одинаково использоваться в events/context/replay/vault**, чтобы не получить две конкурирующие идентичности «logical draw id» и «vault draw id» без необходимости.

Если команда сознательно принимает pre-seal cross-DoS как остаточный publisher risk, это тоже допустимо — но тогда лучше прямо записать. Я бы предпочёл убрать: цена исправления сейчас маленькая.

---

## 6. Ещё один не-баг, который надо решить до production: гибкость Monthly policy

Текущий `MonthlySettlement` делает:

~~~text
monthlyInterval immutable
monthlyRulesHash immutable
policy immutable по смыслу deployment
~~~

Это очень просто и безопасно.

Но наша более общая продуктовая позиция — иметь возможность корректировать **будущие** правила между периодами, не трогая старые obligations.

Short уже умеет rules epochs. Monthly сейчас — нет.

Это не означает, что Monthly epochs надо срочно добавлять. Нужно просто до production сознательно выбрать одно из двух обещаний:

### A. Monthly policy fixed for lifetime этого deployment

Изменение Monthly q/interval требует нового Promo deployment.

Это максимально просто и честно.

### B. Monthly future policy versionable

Тогда нужен такой же forward-only принцип, но отдельный дизайн для monthly attempts, потому что накопленные OPEN monthly attempts нельзя внезапно перевести на новую probability model.

У Monthly controller сейчас большой size headroom (~10.8 KiB под standard 24 KiB), поэтому решение не диктуется размером.

**Я бы не смешивал это с RNG-пакетом.** Но перед mainnet нужно явно выбрать A или B, чтобы случайно не зафиксировать lifetime semantics только потому, что так было проще в первой реализации.

---

## 7. Размеры теперь выглядят действительно здорово

Самое красивое следствие split:

~~~text
Short + research RNG/roles/readiness   21 866   headroom 2 710
Monthly + research RNG/readiness       13 753   headroom 10 823
Dual vault                              8 331   headroom 16 245
~~~

без viaIR и без external selection helper.

То есть мы одновременно получили:

- стандартную 24 KiB portability;
- отсутствие code golf;
- отсутствие proxy/delegatecall;
- более узкие custody capabilities;
- независимые Short/Monthly liveness;
- гораздо более читаемую audit surface.

Поэтому этот split я уже воспринимаю не как workaround code-size, а как **нормальную целевую architecture**.

Short headroom 2.7 KiB всё ещё надо уважать: реальный RNG protocol и finality/readiness могут оказаться тяжелее research wrapper. Но теперь если именно provider-specific часть не помещается, её можно вынести в **фиксированный immutable RNG adapter**, не трогая prize custody architecture.

---

## 8. Следующий один этап: authenticated RNG boundary для ОБОИХ controllers

Я бы теперь не возвращался к общей архитектуре и не оптимизировал vault дальше.

Следующий узкий пакет:

~~~text
authenticated-rng-adapter-v1
~~~

Сначала выбрать/исследовать реальный random provider на Robinhood и спроектировать минимальную binding surface.

Хороший вариант для измерения — **один fixed RNG adapter для двух immutable controllers**, но не как заменяемый module.

Примерно:

~~~text
ShortController ─┐
                 ├→ immutable RNG Adapter → provider
MonthlyController┘
~~~

Adapter:

- знает exact Short + Monthly controller addresses;
- знает exact provider/verifier;
- requestId связывает с `(controller, kind, drawId, context)`;
- provider callback принимается один раз;
- доставляет seed только тому fixed controller, который создал request;
- не имеет доступа к PromoVault;
- не умеет выбирать winner;
- не умеет reroll/cancel/rebind request;
- не заменяется после deployment.

Controller со своей стороны всё равно проверяет собственный pending draw/context/request binding. То есть adapter не должен становиться «доверенным admin setSeed».

Нужно сравнить это с двумя duplicated thin provider integrations по:

- runtime Short/Monthly;
- adapter size;
- request/fulfill gas;
- failure/retry semantics;
- trust surface;
- provider migration semantics (скорее новый deployment, не setter).

И только после выбора реального provider принимать конкретную схему.

Pre-freeze readiness в том же пакете можно ограничить фактом:

~~~text
provider ready
request fee funded
finality gate passed
execution reserve/capacity acceptable
~~~

но после успешного freeze эти gates уже не дают права отменить obligation.

---

## 9. Что бы я НЕ менял сейчас

После этого commit я бы не трогал без конкретной причины:

- общую PromoVault accounting;
- dual immutable controllers;
- Short outcome/epochs;
- permissionless process/finish;
- Monthly/Short independent pending;
- claim semantics;
- separate sponsor layer;
- proxy/upgrades/emergency reset.

То есть code-size ветка, похоже, действительно привела нас **к улучшению архитектуры**, а не к компромиссу.

---

## Итог

`0cb3cc1` мне нравится.

Получилось ровно то, чего мы хотели от всей Trust & Evolution идеи:

> **две сложные части продукта разделены, но не получили широких прав; общая казна знает их точные capabilities и не даёт одной стороне залезть в деньги другой.**

Это проще объяснить аудитору, чем большой root-controller:

~~~text
Short controller → только Short money
Monthly controller → только Monthly cycle
Vault → только accounting/custody
~~~

Я бы принял эту архитектуру как текущую базу.

Из конкретных вещей перед RNG я бы сначала решил/протестировал только **cross-kind pre-seal drawId collision**. После этого следующий настоящий внешний trust boundary — authenticated randomness.
