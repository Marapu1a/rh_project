# Текущий ответ GPT

Обновлено: 14.09.2026.
Прочитан запрос commit `2d3473b0102b54c8d40e2ab3fb9889f14e99455b` и сценарий commit `60b0063ce0221129c049c648d2672318d8b50da2`.

Просмотрены `SHORT_ECONOMY_SCENARIO.md`, `short_economy.py`, его тесты и сохранённый JSON, а также текущая Short reference model. GitHub workflow/status для latest commit отсутствуют; тесты в этом окружении независимо не запускались. Ниже отдельно отмечаю выводы из просмотра кода/отчёта и аналитические расчёты.

Тема: **fixed-seat Short, cash-flow, заметные призы и следующий локальный эксперимент**.

Это ревью модели. Production contracts/controller/RNG не трогаем.

## Короткий вывод

Переход обратно к **небольшому fixed K как основному экспериментальному baseline** выглядит разумно именно после смены продуктового приоритета.

Dynamic K решал задачу «больше людей → больше победителей», но при реальном ограниченном fee income очень легко превращал рост аудитории в дробление фонда на мелкие призы. Новый приоритет другой:

> лучше меньше победителей, но призы должны быть заметными, а история выплат — реальной и регулярной.

Под этот приоритет fixed K проще и честнее исследовать.

При этом `K=10` пока нельзя считать выбранной настройкой. Текущий cash-flow runner уже показал два более важных вопроса:

1. **admission сейчас не согласован с десятью местами** — первая корзина часто будет недозаполнена;
2. **`D = весь freeShort` делает cadence очень рваным**: жирный полный draw может почти обнулить Short, после чего следующий долго строится.

Сам ledger сценария выглядит внутренне согласованным. Явного двойного учёта денег или attempts не вижу.

---

## 1. Проверка cash-flow модели

Основная арифметика сходится.

### Entries / carry

В основном сценарии:

```text
total turnover = 70 000
BUY = 42 000
SELL = 28 000

$100 cumulative eligible BUY = 1 entry
→ 420 entries
```

В коде выполняется отдельный invariant:

```text
cumulativeBuy = entries * 100 USDG + sum(carry)
```

SELL entries не создаёт. Delayed revenue до фактического `received` в readiness не попадает. Это именно то, что нам нужно.

### Revenue / allocation

При сценарных 0.5%:

```text
70 000 × 0.5% = 350 USDG revenue
10% project = 35
315 → prize side
Short получает 1/2 prize side = 157.50
```

External startup 400 GENERAL:

```text
Short   200
Current 133.333334
Next     66.666666
```

Итог отчёта:

```text
400 external + 350 revenue
= 35 project
+ 257.50 Current
+ 100 Next
+ 357.499984 paid
+ 0.000016 free Short
```

сходится точно в raw units.

### Frozen / returned

`D = freeShort` замораживается до random. Невыданные элементы корзины и rounding возвращаются в Short через `returned`. Новое funding во frozen draw не добавляется. Повторного использования одной и той же суммы не вижу.

### Что является не ошибкой, а упрощением

- 0.5% — заданный effective realized USDG revenue, а не измеренная PAIR ставка;
- весь BUY считается eligible;
- revenue линейно зависит от общего BUY+SELL turnover;
- creator TOKEN уже мысленно превращён в effective USDG; price impact/conversion не моделируются;
- все claims и settlement мгновенны;
- операционные расходы отсутствуют;
- 60 одинаковых постоянных покупателей создают искусственно синхронные entries;
- readiness проверяется раз в 6h только из-за шага runner;
- один seed ничего не говорит о среднем outcome.

Есть ещё одна маленькая концептуальная оговорка: один `Allocation.phase` используется и для external GENERAL, и для кандидатного creator 3:2:1. Если в production creator allocation окажется отдельной политикой, фазы округления могут быть разными. Сейчас эффект — микро-units, но это именно assumption модели, а не уже принятое правило.

---

## 2. Fixed K поддерживаю как baseline, но не как lifetime-константу

При текущем приоритете fixed K действительно лучше dynamic K для первого опыта.

Он даёт понятную ось масштабирования:

```text
funding ↑
→ при том же K растут номиналы prizes
```

а не автоматически:

```text
audience ↑
→ K ↑
→ фонд размазывается по большему числу мест
```

Если проект когда-нибудь станет существенно больше, K можно менять будущей `rulesVersion`, не строя сейчас автоматический `K(N)`.

Но надо помнить следствие fixed K: при большом N общий throughput победителей ограничен. При K=10 и minimum interval 6h максимум 40 prize assignments/day. Luck перераспределяет шанс в пользу более невезучих кошельков, но не создаёт новые места.

Это не противоречие новой цели, просто метрика `never won / max loss streak` должна остаться в отчётах.

---

## 3. Первый draw с 4 победителями — не случайная странность, а настройка admission

При текущих параметрах первого участия:

```text
p_max = 0.40
h_e = 3
L = 0
e = 1

q = 0.40 × 1/(1+3) = 10%
```

Для 60 одинаковых новых участников:

```text
E[admitted] = 60 × 10% = 6
```

То есть корзина `K=10` **по определению чаще недозаполнена**, чем заполнена.

Аналитически для `N=60, q=10%`:

- ожидаемое число winners при K=5 ≈ **4.52**; вероятность заполнить все 5 мест ≈ **72.9%**;
- при K=10 ожидаемо ≈ **5.94** winners; вероятность заполнить все 10 ≈ **7.3%**;
- K=20 почти ничего не добавляет: admitted в среднем всё равно около 6.

Поэтому наблюдаемые 4/10 в первом draw выглядят нормально для этой настройки.

Если оставить `p_max=40%`, но сделать `h_e=1`, то первый-entry base admission становится 20%. Для N=60/K=10 это уже примерно:

```text
E[admitted] = 12
P(M >= 10) ≈ 78.7%
E[winners] ≈ 9.54
```

При этом cap всё ещё 40%, reroll и guaranteed win не появляются.

### Вывод

Нельзя выбирать K отдельно от base admission.

Для следующего опыта я бы не крутил сразу все `p_max/h_e/h_l`. Оставить `p_max=40%` и `h_l=6`, а сравнить хотя бы:

```text
h_e = 3   // current, base q=10%
h_e = 1   // base q=20%
```

Это сразу покажет, хотим ли мы:

- редкие заполненные корзины и часто пустующие крупные prizes;
- или чаще заполняемые корзины с тем же hard cap.

Важно: публично `K=10` нельзя формулировать как «будет 10 победителей». Это максимум десять назначений.

---

## 4. Как честно сравнить K = 5 / 10 / 20

Сравнение должно использовать **один и тот же event stream**:

- одинаковые BUY/SELL;
- одинаковый initial bank;
- одинаковый revenue/delay;
- одинаковые wallets/carry;
- одинаковые seeds;
- одинаковую D-policy;
- одинаковый minimum meaningful prize.

И главное: **не досыпать дополнительную субсидию варианту с большим K**, чтобы он выглядел лучше. Если K=20 не ready из-за quality floor — более длинный BUILDING и есть реальная цена двадцати мест.

Чтобы сначала изолировать именно эффект K, я бы в первом сравнении временно использовал **равные веса `[1,1,...]`** и один `minPrize`. Иначе одновременно меняются K и форма распределения крупных/мелких призов.

После выбора разумного диапазона K вернуть tiered basket и отдельно выбрать skew.

Обязательные метрики сравнения:

```text
draws/day
time to first draw
time between draws
winners/draw
filled seats / K
paid USDG/day
min / median / max prize
unique winners
repeat-winner concentration
never won
max loss streak
freeShort after settlement
```

Admission rate полезен как диагностическая метрика, но не как самостоятельная product KPI.

---

## 5. `D = весь freeShort` — хороший крайний вариант, но не лучший baseline

Текущий отчёт уже показывает характер этой политики.

После первого underfilled draw:

```text
hour 24:
D = 222.50
paid ≈ 101.14
returned ≈ 121.36
```

Следующий draw получает возврат + fresh funding:

```text
hour 36:
D ≈ 143.86
10/10 prizes assigned
→ Short почти в ноль
```

После этого следующий draw строится до hour 72.

То есть `all freeShort` создаёт **accordion effect**:

```text
underfilled draw → большой return → следующий жирный draw
full draw → reserve cleared → длиннее BUILDING
```

Это не accounting bug. Но под цель «регулярная публичная история выплат» может оказаться слишком рвано.

Я бы сравнил ровно три D-policy и больше пока не добавлял:

### A. Minimum basket

```text
D = B_min
```

Контрольный вариант: максимально бережёт reserve и cadence, но не использует upside богатой казны.

### B. All free Short

```text
D = freeShort
```

Текущий prize-max вариант.

### C. Leave one minimum basket

Простой buffer-policy:

```text
если freeShort < 2*B_min:
    D = B_min
иначе:
    D = freeShort - B_min
```

То есть если денег достаточно, после freeze оставляем в freeShort минимум ещё одну минимальную корзину.

У этого варианта нет процентного регулятора, он легко объясняется и должен сглаживать cadence, не оставляя богатый reserve навсегда нетронутым.

Current в D не использовать.

---

## 6. Luck при fixed K: что именно он делает

При насыщенном admission fixed K означает важную вещь:

> Luck не повышает число победителей; он перераспределяет вероятность попасть в эти K мест.

Это само по себе нормально и даже полезно.

Winner сбрасывается в Luck=0, losers растут по Luck. Поэтому система создаёт отрицательную обратную связь против постоянных повторных побед одних и тех же wallets.

Но если вся толпа накопила высокий Luck, q у многих приближается к cap, и различия снова сжимаются.

Поэтому следующий pity test должен быть именно counterfactual:

```text
фиксируем остальных wallets, entries, basket и K
меняем только один wallet:

Luck = 0 / 1 / 3 / 6 / 20
entries = 1 / 2 / 5 / 20

→ измеряем FINAL P(nonzero prize), не только admission q
```

Плюс в длинной серии смотреть:

- win hazard по текущему Luck;
- долю repeat winners;
- never-won tail;
- loss-streak p50/p95/max.

Так мы увидим, действительно ли pity ощущается, а не просто красиво меняет первую стадию.

---

## 7. Какие реальные данные нужны вместо условных 0.5%

Сейчас не нужен новый сетевой сбор. Но перед боевыми параметрами нужно будет измерить минимум следующее:

1. **Gross canonical TOKEN/USDG turnover** за интервалы и реально начисленный creator revenue за те же интервалы.
2. Creator revenue по активам отдельно: сколько пришло **USDG**, сколько **TOKEN**.
3. Для TOKEN-части — фактический realized USDG после conversion: amount sold, USDG received, effective price, slippage/fees.
4. Распределение задержки `fee accrual → collect → conversion → recognized USDG`.
5. Долю total BUY, которая реально проходит promo eligibility/registration/canonical attribution.

После этого можно считать несколько ставок, а не одну магическую:

```text
creator revenue / gross turnover
direct USDG revenue / turnover
realized USDG after TOKEN conversion / turnover
effective Short USDG / turnover
```

Project share и Short allocation — продуктовая политика, а не рыночное измерение.

Также отдельно от prize ledger нужно считать **операционные расходы**:

- RNG/request execution;
- keeper/settlement gas;
- fee collection/conversion transactions;
- RPC/server/indexer.

Они по принятой модели оплачиваются вне prize fund. Поэтому полезная sustainability-метрика:

```text
project free share earned / operational cost
```

В текущем трёхдневном сценарии project share всего $35. Prize ledger может идеально сходиться, а эксплуатация при этом быть убыточной для проекта — это отдельная ось.

---

## 8. Равные 60 кошельков сильно искажают cadence

Сейчас они синхронно доходят до первой $100 entry ровно к 24h. Поэтому на 6/12/18h есть деньги, но нет ни одного участника.

Для следующего runner не нужен сложный market simulator. Достаточно трёх простых типов потока:

### Поток 1 — heterogeneous steady

- initial carry случайно распределён 0..99.99;
- BUY amounts неодинаковые, heavy-tail;
- persistent core + периодические новые wallets.

### Поток 2 — hype → decay

Большой стартовый BUY turnover, потом снижение и рост SELL-share. Это одновременно проверяет:

```text
новых attempts становится меньше
но creator revenue от SELL ещё приходит
```

### Поток 3 — whale + retail

Много небольших wallets и один/несколько больших BUY. Проверяем, как multiple entries whale влияют на admission, funding и max-one-prize rule.

Этого достаточно. Отдельные десятки искусственных archetypes пока шум.

---

## 9. Startup bank и способность жить дальше надо показывать отдельно

Текущий сценарий уже правильно показывает важную разницу:

```text
с external 400 → 3 draws за 72h
без него       → первый draw только на 60h
```

То есть bank улучшает запуск, но не sustainable rate.

Следующий отчёт должен всегда иметь пары:

```text
same market flow + startup bank
same market flow + no startup bank
```

Для 7 дней я бы взял хотя бы один declining path, например концептуально:

```text
40k → 30k → 20k → 15k → 10k → 5k → 2k/day
```

не как прогноз, а как stress path.

Для 30 дней можно сделать затухающую/волнообразную активность и multi-seed.

Monthly при 30-дневной модели нельзя выдавать за реально смоделированный, если его random/settlement отсутствует. Для **Short-only** анализа это не ломает Short inflow при текущем кандидатном split, потому что Short получает половину prize-side GENERAL и до, и после заполнения Next. Но Current/Next balances после monthly boundary уже нельзя интерпретировать как полный продуктовый ledger без monthly events.

---

## 10. Три следующих эксперимента, которые действительно дадут решение

### Эксперимент A — K × base admission

Один и тот же cash/event stream, equal-weight baskets, quality floor одинаковый.

```text
K = 5 / 10 / 20
h_e = 3 / 1
p_max = 40%
h_l = 6
```

Цель: понять tradeoff между количеством мест, заполнением корзины и размером выплат без смешивания с basket skew.

Критерии: fill ratio, winners/draw, min/median prize, draw interval, paid/day.

### Эксперимент B — D policy

На одном выбранном K/admission сравнить:

```text
B_min only
all freeShort
leave-one-B_min buffer
```

Цель: найти баланс между заметностью prizes и регулярностью следующего draw.

Критерии: time-between-draws p50/p95, payout/day, max prize, freeShort after draw, variance payout cadence.

### Эксперимент C — multi-seed 7/30-day heterogeneous lifecycle

Сравнить startup/no-startup, steady/hype-decay, conversion delay, whale+retail.

Цель: проверить не красивый первый draw, а жизнь Short после запуска.

Критерии:

- draws/day and gaps;
- actual paid/day/week;
- unique winners / repeats / never-won;
- unfinished waiting at end of scenario;
- Luck hazard;
- carry/OPEN attempts at end;
- freeShort and pending revenue;
- project share vs ops-cost placeholder.

Именно здесь нужен multi-seed; один красивый seed больше не использовать для выбора параметров.

---

## Что стоит принять сейчас, а что рано

### Можно оставить рабочим направлением

- fixed small K **per rulesVersion** как baseline;
- actual recognized `freeShort` как source of truth для readiness;
- meaningful minimum prize;
- no forced timeout с плохим draw;
- один pending Short;
- attempts/Luck не теряются при not-ready;
- unawarded basket возвращается в Short;
- minimum age как нижняя граница, а не обещание выплаты по часам.

### Рано принимать

- именно K=10;
- current weights `[7,5,2,2,1×6]`;
- `$5` minimum;
- `D=all freeShort`;
- `0.5%` revenue;
- creator `10/45/30/15`;
- `p_max=40%, h_e=3, h_l=6` как production numbers;
- четыре draws/day как цель или обещание.

## Итог

Новый cash-flow runner полезнее предыдущего fixed-D опыта: он уже связывает turnover, carry, actual recognized funding и draw readiness и не показывает скрытой бухгалтерской дыры.

Главное, что я бы изменил в следующем эксперименте: **не возвращаться сейчас к dynamic K**. Сначала проверить fixed K вместе с admission и D-policy.

Самая явная проблема текущего кандидата — не K=10 как таковой, а связка:

```text
K=10
+ base admission q=10%
+ D=all freeShort
```

Она одновременно даёт пустые места в раннем draw и рваный reserve/cadence.

Если локальные sweeps покажут, что fixed 5/10/20 позволяют получить заметные prizes и приемлемую историю выплат на разумном cash-flow, это гораздо проще будущего dynamic seat engine.

Следующий кодовый шаг действительно стоит ограничить simulator/report/tests.