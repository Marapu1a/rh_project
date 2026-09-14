# Текущий ответ GPT

Обновлено: 14.09.2026.
Просмотрен latest commit 73c44ca31b4c46d4cc1be57993ef1d37e7fef9c5 с локальной Short-моделью и reproducible scenarios.

Тема: **что показал первый Short simulator и как переделать модель из fixed-time/fixed-K в экономически созревающий Short cycle**.

Это продуктовый/модельный follow-up. **Не разрешение писать production controller или менять контракты.** Сначала хотим докрутить локальную модель и проверить механику числа мест, размера призов, funding и длительности BUILDING.

---

## Главный вывод после первого симулятора

Локальная модель полезна и менять её базовые принципы сейчас не хочется.

Она уже показала важную вещь: при фиксированной корзине из K мест Luck прекрасно повышает admission, но при росте аудитории можно получить ситуацию:

~~~text
много участников
→ много admitted
→ те же K мест
→ сотни людей после admission конкурируют за несколько призов
~~~

Пример из сохранённого отчёта особенно показателен:

~~~text
1000 wallets
8 prizes / draw
100 draws
→ 433 wallets ни разу не выиграли
~~~

Это не баг probability formula. Это естественное следствие фиксированного K.

Продуктово это плохо совпадает с целью Short Luck. Мы не хотим, чтобы пользователь долго копил Luck, успешно проходил admission, а затем оказывался условно «трёхсотым человеком перед восемью стульями».

Поэтому следующий вопрос уже не только p_max/h_e/h_L. Нужно связать:

~~~text
число участников
число prize seats
реально доступный Short budget
качество/размер prizes
длительность BUILDING
~~~

---

## Важное уточнение про entries и оборот

В PRODUCT_SPEC уже есть принятое правило:

~~~text
$100 cumulative eligible BUY = 1 entry
remainder carries
~~~

Одна entry создаёт одну Short-attempt и одну Monthly-attempt.

Значит свежая покупка на $0.01 при carry=0 **не создаёт билет**. Она только оставляет carry $0.01.

Но важно не сделать обратную ошибку:

> 1000 текущих участников НЕ обязательно означают минимум $100 000 нового BUY именно внутри текущего BUILDING-window.

Почему:

1. carry может существовать раньше текущего цикла;
2. например при carry=$99.99 новый eligible BUY на $0.01 действительно завершит очередную $100 entry;
3. попытки сохраняются, если draw не стартовал;
4. funding pooled, а не earmarked «этот доллар комиссии принадлежит этому entry»;
5. creator revenue может приходить в TOKEN и ждать conversion;
6. точная доля creator revenue, попадающая в Short, ещё не утверждена;
7. SELL создаёт торговый revenue, но entries не создаёт.

То есть связь между attempts и turnover **реальная и полезная**, но её нельзя превращать в бухгалтерскую гарантию:

~~~text
N wallets → гарантированно X USDG Short прямо сейчас
~~~

Источник истины для readiness должен быть **фактически признанный доступный Short USDG**, а не теоретическая комиссия от attempts.

Для симулятора, наоборот, имеет смысл смоделировать происхождение обоих потоков из одной торговли и посмотреть корреляцию:

~~~text
eligible BUY
→ cumulative carry / entries
→ creator revenue

SELL
→ creator revenue
→ no entries

creator revenue
→ project/prize allocation
→ conversion delay if TOKEN
→ actual USDG
→ Short funding
~~~

Параметры могут оставаться экспериментальными.

---

## Новый продуктовый принцип: Short не обязан происходить по жёстким часам

После обсуждения owner direction такой:

> **не таймер запускает Short; экономика Short созревает до розыгрыша.**

Если проект почти мёртвый, участников нет и оборота нет, нет смысла формально запускать каждые 6 часов микророзыгрыш с копеечными призами.

Состояние должно быть ближе к:

~~~text
BUILDING
→ копятся attempts
→ копится фактический Short Reserve
→ периодически проверяется readiness
→ когда cohort и treasury позволяют сделать нормальный draw:
   FREEZE
→ RANDOM
→ SETTLEMENT
→ новый BUILDING cycle
~~~

Шесть часов больше не хочется трактовать как фиксированную сетку:

~~~text
00:00 / 06:00 / 12:00 / 18:00
~~~

Рабочее направление:

~~~text
minimumBuildAge ≈ 6h
~~~

То есть раньше этого Short не запускаем, а после этого можем запустить **в любой момент, когда readiness выполнена**.

Если в 6:00 не готов, а в 7:13 стал готов — не ждём 12:00 только ради календарной сетки.

Точное значение minimumBuildAge ещё можно проверить моделью. Главная идея — это нижняя граница зрелости, а не обязанность выдать приз каждые 6 часов.

---

## Не нужен forced timeout с плохим draw

Не хотим правило вида:

~~~text
прошло 24 часа
→ всё равно обязаны раздать хоть что-нибудь
~~~

Если для честного количества мест и осмысленных призов денег недостаточно, лучше продолжать BUILDING.

Attempts и Luck не сгорают.

Если проект никому не нужен и Short «строится вечность», практически нет аудитории, которую это вводит в заблуждение. Искусственно субсидировать или раздавать центы ради соблюдения таймера хуже.

Отдельный product sunset / shutdown policy можно когда-нибудь обсудить для случая «люди уже имеют attempts, а проект окончательно прекращён», но это не причина сейчас ломать readiness forced draw.

---

## Главная новая ручка: отношение участников к prize seats

Хотим избежать fixed-K.

Пусть:

~~~text
N = unique participating wallets frozen в Short
K = number of prize seats
R = target wallets per prize seat
~~~

Простой кандидат:

~~~text
K = ceil(N / R)
~~~

Тогда:

~~~text
N = 100  → K примерно 8
N = 250  → K примерно 20
N = 1000 → K примерно 80
~~~

если выбран соответствующий R.

Это не старый block design, где 100 wallets могли иметь 8 мест, а 101 внезапно 16. K растёт по одному месту по мере роста N.

Цель:

~~~text
N / K ≈ стабильный диапазон
~~~

То есть рост проекта не должен сам по себе ухудшать конкуренцию за место в 10 раз.

Конкретный R не выбран.

---

## Но проверить нужно не только N/K

Есть важная тонкость из двухступенчатой схемы:

~~~text
participants N
→ admission с q(entries,Luck)
→ admitted M
→ K prizes
~~~

Финальный bottleneck определяется скорее M/K, а не только N/K.

Если у всей толпы высокий Luck, средний q растёт, и при том же N/K admitted crowd может стать существенно больше.

Поэтому просим симулятор сравнить по крайней мере две политики:

### Policy A — простая продуктовая

~~~text
K = ceil(N / R_wallet)
~~~

Плюсы: легко объяснить, легко проверить, не зависит от probability calculation.

### Policy B — по ожидаемому admission

До random можно точно вычислить:

~~~text
A = sum_i q(entries_i, Luck_i)
~~~

Это ожидаемое число admitted.

Можно исследовать кандидат:

~~~text
K = ceil(A / R_admitted)
~~~

или смешанное правило.

Это НЕ принятое решение. Нужно посмотреть, даёт ли оно реально лучший pity UX или только усложняет систему.

Важно: K фиксируется **до random**; фактическое M после random не должно менять число мест.

---

## Вторая контрольная величина: качество prize seat

Нам недостаточно увеличить K. Иначе можно получить:

~~~text
1000 участников
100 победителей
каждому по $0.27
~~~

что продуктово тоже выглядит плохо.

Поэтому одновременно нужны две величины:

~~~text
competition = N / K      (или ожидаемый admitted / K)
quality     = D / K
~~~

где D — реально frozen Short budget.

И hard quality floor:

~~~text
smallestPrize >= meaningfulMinimum
~~~

Если система не может одновременно обеспечить приемлемое число мест и осмысленный minimum prize, Short **не ready** и продолжает BUILDING.

Это лучше, чем ухудшать либо odds, либо prize quality ради часов.

---

## Почему у системы вообще есть шанс естественно это финансировать

Attempts не появляются из воздуха.

Каждая Short-attempt происходит из полной накопленной $100 eligible BUY entry.

Плюс торговля, включая SELL, создаёт creator revenue без создания новых attempts.

Поэтому направление экономики естественное:

~~~text
рост BUY activity
→ больше attempts
→ обычно больше creator revenue

SELL activity
→ больше creator revenue
→ без роста числа attempts

external funding
→ больше Short funds
→ без роста attempts
~~~

То есть при здоровом проекте рост N/E обычно сопровождается ростом казны, а дополнительный turnover сверх новых participants улучшает prize quality.

Но ещё раз: readiness должна смотреть на **actual freeShort USDG**, потому что комиссия, allocation и conversion не синхронны и пока не полностью специфицированы.

---

## Как должны одновременно масштабироваться K и prize sizes

Хотим получить естественный эффект:

~~~text
больше участников
→ больше prize seats

больше фактического Short funding
→ больше общий D

если funding растёт быстрее K
→ увеличиваются размеры prizes
~~~

При росте участников и funding примерно одинаковым темпом средний prize может оставаться примерно стабильным, а число победителей расти.

Если много дополнительного оборота на тех же wallets, SELL или external funding:

~~~text
D ↑ быстрее N
→ K почти тот же
→ prizes становятся крупнее
~~~

Это желательное свойство.

---

## Fixed weights надо адаптировать к dynamic K

Принятый integer-weight basket по-прежнему полезен, но текущий fixed list автоматически задаёт fixed K.

Нужно сохранить его хорошие свойства:

- только integer/raw USDG;
- deterministic construction;
- bounded total;
- meaningful minimum;
- basket frozen before random;
- random subset when admitted меньше seats;

но позволить K меняться плавно.

Просим не спешить с новым сложным алгоритмом, а проверить простые варианты.

Например кандидат для исследования:

1. rulesVersion задаёт несколько prize tiers и их relative weights;
2. K вычисляется динамически;
3. количество slots каждого tier детерминированно получается из K по фиксированным долям/правилу округления;
4. после этого:

~~~text
sumW = сумма weights всех K slots
unit = floor(D / sumW)
prize_i = unit * weight_i
~~~

5. если unit ниже minimum meaningful base unit — not ready.

Это только пример направления. Главное — dynamic K без больших дискретных скачков и без произвольного решения оператора.

---

## Новый смысл D/readiness

Сейчас local runner искусственно делает:

~~~text
каждый раунд:
fund Short на фиксированный D
дать всем fresh entries
сразу draw
~~~

Это было правильно для проверки механики, но больше не подходит для следующего вопроса.

Новая модель должна разделять:

~~~text
freeShort               // реально накопленный доступный reserve
requiredBudget(N,K,...) // сколько нужно хотя бы для качественной корзины
selected D              // сколько реально freeze в этом draw
~~~

Readiness минимум:

~~~text
age >= minimumBuildAge
participants/attempts достаточны
freeShort позволяет построить K meaningful prizes
нет pending short
~~~

Плюс могут остаться отдельные ограничения exposure относительно Short reserve / Current jackpot. Старый кандидат min(10% freeShort, 10% Current) не считаем автоматически утверждённым.

Нужно отдельно сравнить простые D policies.

Например:

- только minimum required D;
- доля freeShort с floor/ceiling;
- весь допустимый D до exposure cap;
- hybrid: минимум для quality + дополнительный scale из избытка reserve.

Наша продуктовая цель: не держать богатый Short искусственно бедным, но и не обязательно вычищать весь резерв каждый draw.

---

## Lifecycle после изменения scheduling

Предпочтительная семантика сейчас:

~~~text
BUILDING
  attempts/carry/funding accumulate

READY
  deterministic readiness true

FREEZE
  N, E, participants, entries, usedLuck,
  K, D, basket, rulesVersion фиксируются

RANDOM/PENDING
  snapshot не меняется
  новые BUY идут в следующий OPEN buffer
  funding не расширяет старый D

SETTLEMENT
  prizes assigned
  old attempts consumed
  Luck updated
  claimable created

NEW BUILDING CYCLE
~~~

Один pending Short сохраняем.

Если RNG задержан, старый snapshot остаётся frozen. Новая активность не меняет его.

Не хотим replay пропущенных «6h checkpoints», потому что фиксированных checkpoints как продуктового расписания больше фактически нет.

После settlement новый cycle начинает отсчёт minimumBuildAge. Attempts, появившиеся во время pending, могут лежать в next OPEN buffer и стать стартовым содержимым нового BUILDING, но не должны позволять мгновенный catch-up draw в ту же секунду, если сохраняем minimum age.

---

## Что нужно измерять в следующем симуляторе

Просим не переходить к production contracts/controller.

Следующий полезный этап — расширить local simulator так, чтобы он отвечал на продуктовые вопросы.

### 1. Реалистичнее смоделировать источник attempts

Нужен cumulative carry:

~~~text
eligible BUY USDG amount
→ carry
→ floor(carry / 100 USDG) new entries
→ remainder
~~~

SELL не создаёт entries.

Можно не моделировать DEX в деталях. Нужен детерминированный economic event stream.

### 2. Смоделировать funding как отдельный поток

Хотя бы parameterized:

~~~text
BUY/SELL turnover
→ creator revenue
→ prize share
→ Short share
→ actual USDG after optional conversion delay
~~~

Если точные ставки/доли не утверждены — не выдумывать их как product fact. Делать scenario parameters.

Также отдельные external Short top-ups.

### 3. Dynamic BUILDING duration

Не запускать round автоматически каждые 6h.

Пусть время идёт, события приходят, readiness проверяется, draw freeze происходит при выполнении условий после min age.

Нужны сценарии:

- почти мёртвый проект;
- медленный органический;
- обычный;
- резкий хайп;
- большой BUY whale;
- много маленьких wallets;
- много SELL без новых entries;
- большой external funding;
- задержка TOKEN→USDG conversion;
- высокий accumulated Luck crowd.

### 4. Sweep seat policies

Сравнить:

~~~text
fixed K                         // baseline, чтобы видеть проблему
K ≈ N / R_wallet
K ≈ expectedAdmissions / R_admitted
~~~

В нескольких диапазонах R.

### 5. Sweep D/readiness policies

Смотреть не только spend fraction, но и:

- duration BUILDING;
- N и E на freeze;
- K;
- N/K;
- expected admitted/K;
- actual M/K;
- minimum prize;
- median prize;
- max prize;
- D/K;
- freeShort after settlement;
- долю funding, реально уходящую в draw;
- wallets never won;
- max loss streak;
- completed wait p50/p95;
- win rate в зависимости от Luck;
- win rate в зависимости от entries.

### 6. Counterfactual pity check

Очень хотелось бы отдельный тест:

при **одинаковом frozen окружении остальных wallets** посмотреть финальный P(prize) одного кошелька для:

~~~text
Luck = 0, 1, 3, 6, 20, ...
entries = 1, 2, 5, 20, ...
~~~

Не только admission q, а именно итоговую вероятность получить ненулевой USDG prize после seat competition.

Это лучший тест того, что Luck реально ощущается, а не растворяется во втором random stage.

### 7. Multi-seed

Один seed уже показал проблему, но параметры по нему выбирать нельзя.

Нужны multi-seed aggregate/percentile summaries хотя бы по десяткам seeds.

---

## Важная продуктовая инварианта для следующей модели

Хочется проверить возможность держать одновременно:

~~~text
1. competition floor:
   prize seats не становятся редкими просто из-за роста N

2. prize quality floor:
   нет бессмысленно маленьких выигрышей

3. no forced schedule:
   если первые два условия не обеспечены — BUILDING продолжается

4. actual-funds-only:
   readiness основана на реально доступном USDG, а не обещанных комиссиях

5. growth upside:
   избыточный funding повышает суммы призов, а не только бесконечно копится
~~~

Если эти свойства совместимы на реалистичных потоках — Short начинает выглядеть саморегулируемой системой.

---

## Один conceptual пример

Не как принятые числа, только чтобы проверить архитектуру.

Пусть целимся примерно в:

~~~text
R_wallet ≈ 12 wallets / seat
~~~

Тогда:

~~~text
N=120  → K≈10
N=600  → K≈50
N=1200 → K≈100
~~~

Дальше basket construction определяет, сколько USDG нужно минимум для этих K slots.

Если freeShort не хватает — BUILDING.

Если хватает ровно минимума — prizes приемлемые, но небольшие.

Если freeShort существенно больше и D policy позволяет использовать избыток — те же K/tier structure масштабируются вверх по номиналу.

Так проект при росте не превращается ни в «8 winners навсегда», ни в «100 winners по 20 центов».

---

## Что НЕ хотим сейчас добавлять

- forced max timeout, который запускает плохой draw;
- ручное решение оператора «сегодня хватит 7 winners»;
- динамическое изменение K после random;
- гарантированный win;
- отдельную identity/KYC систему;
- новый bankable/manual Luck;
- production Merkle/batching до gas benchmark;
- production RNG/controller до выбора модели;
- сложную экономическую симуляцию рынка TOKEN как обязательный prerequisite.

Нам нужна следующая **локальная экономико-игровая модель**, не новый protocol framework.

---

## Что дальше по плану

Предлагаемый порядок теперь такой.

### Этап A — расширить Short simulator

Добавить:

~~~text
trade events
carry → entries
revenue → actual Short funding
BUILDING readiness
dynamic K
dynamic D/basket
variable cycle duration
multi-seed reports
counterfactual final win probability
~~~

Цель: выбрать не «красивые числа», а диапазоны параметров, где Short ведёт себя ожидаемо при разных масштабах.

### Этап B — зафиксировать продуктовые параметры/формулы readiness

После результатов принять:

- seat policy;
- target competition ratio;
- basket/tier construction для variable K;
- minimum meaningful prize;
- D selection/exposure policy;
- minimum build age;
- p_max/h_e/h_L.

### Этап C — только потом gas/architecture

Когда известен реальный диапазон N/K и ожидаемые размеры cohort:

1. benchmark worst-case settlement;
2. решить, помещается ли atomic update всех Luck/attempts;
3. выбрать source-of-truth entries/Luck/snapshot;
4. специфицировать controller state machine.

### Этап D — RNG и production integration

После этого уже:

- RNG request/result binding;
- no reroll;
- production controller;
- PromoVault winners/amounts integration;
- conversion/funding automation;
- UI.

---

## Вопросы Codex

Просим теперь не возвращаться к общему дизайну всего Promo, а критично проверить именно эту смену модели.

1. Есть ли логическая ошибка в переходе от fixed 6h/fixed K к BUILDING + readiness + dynamic K?
2. Правильно ли считать actual freeShort USDG source-of-truth readiness, а turnover/entries использовать только как correlated source funding, не как обещание?
3. Что лучше для первой модели K: ceil(N/R) или candidate через sum(q_i)? Нужен один рекомендуемый baseline и аргументы.
4. Как проще всего адаптировать integer-weight basket к variable K без больших дискретных скачков и без операторского выбора?
5. Какие 2–3 простых D policies стоит сравнить в simulator, чтобы не утонуть в вариантах?
6. Какие метрики в списке выше действительно дают решение, а какие шум?
7. Видишь ли сценарий, где dynamic K + build-until-funded создаёт новый очевидный exploit/degenerate equilibrium?
8. Подтверди или поправь предложенный порядок следующих этапов.

Если направление согласовано, следующий кодовый шаг хотим ограничить **только расширением локального simulator/report/tests**. Production contracts пока не трогать.
