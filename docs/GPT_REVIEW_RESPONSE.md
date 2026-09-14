# Текущий ответ GPT

Обновлено: 14.09.2026.
Прочитан запрос commit `9ce3f9d01f65350455a5a50b04b06cd74270a6fa`.

Тема: **Short Luck + фиксированная корзина призов**.

Это ревью выбранного направления. Код менять не предлагаю.

## Короткий вывод

Основная схема хорошая и заметно чище прежних вариантов.

```text
entries + Luck
→ admission
→ случайная очередь admitted
→ случайная очередь заранее обеспеченной корзины
→ максимум один prize на wallet
→ terminal settlement
→ attempts consumed, Luck update
```

Сильных экономических противоречий не вижу.

Главные реальные вопросы теперь не про экономику, а про три границы:

1. формула `q(entries, Luck)`;
2. как детерминированно строить basket из D;
3. как атомарно применить Luck всем проигравшим, не уперевшись в gas.

Один pending short на всю систему считаю правильным MVP-ограничением.

---

## 1. Вероятность: рекомендую не приравнивать Luck к entry

Формула Codex:

```text
q = p_max × (e + L)/(e + L + h)
```

очень простая, но у неё есть продуктовый минус: `1 Luck = 1 entry` внутри admission.

Тогда Luck и BUY-активность частично становятся одной и той же валютой. При большом L новые entries действительно начинают мало что значить.

Я бы сохранил две независимые оси и использовал рациональную форму без exponent:

```text
q(e,L) = p_max × [1 - (h_e/(e+h_e)) × (h_L/(L+h_L))], e > 0
q(0,L) = 0
```

Эквивалентно:

```text
q(e,L) = p_max ×
         ((e+h_e)(L+h_L) - h_e h_L)
         / ((e+h_e)(L+h_L))
```

Свойства:

- при `L=0` получаем обычный `p_max × e/(e+h_e)`;
- рост entries всегда повышает admission;
- рост Luck всегда повышает admission;
- у обеих осей diminishing returns;
- конечные e/L не дают 100%, если `p_max < 100%`;
- `h_e` управляет чувствительностью к entries;
- `h_L` имеет понятный смысл: при `L=h_L` Luck закрывает половину оставшегося расстояния от base chance до `p_max`;
- не нужен `r^L`, таблица степеней или floating point.

Для фиксированного состава остальных участников рост собственного Luck монотонно повышает и итоговый шанс денег:

```text
P(prize_i) = q_i × E[min(1, K/(1+M_other))]
```

где множитель после admission от собственного q_i не зависит.

Но между разными draws конкуренция меняется, поэтому UX правильно не должен обещать: «Luck вырос → итоговый шанс денег обязательно выше, чем в прошлом draw».

### Нужен ли cap самого Luck

Для probability safety — нет: cap уже задаёт `p_max`.

Для storage/UI можно в будущем ввести технический saturation level, после которого дополнительные Luck практически ничего не меняют, но продуктового hard cap сейчас не требуется.

---

## 2. Стратегия «фармить Luck минимальными участиями»

Это существует, но я не считаю её нарушением обещаний.

Игрок может:

```text
входить с 1 entry
→ терпеть no-prize
→ накапливать Luck
→ позже сделать более крупный BUY в богатом draw
```

Но:

- каждый шаг требует реальной short attempt;
- +1 Luck максимум за draw, а не за entry;
- любой ненулевой win сбрасывает Luck;
- Luck не переносим и не продаваем;
- hard cap сохраняется;
- большой BUY всё равно отдельно повышает шанс через e.

Это скорее допустимая игровая стратегия, чем exploit.

Проблемой она станет только если параметр Luck сделает одну дешёвую попытку слишком эффективной по сравнению с entries. Именно поэтому отдельный `h_L`, а не `e+L`, мне нравится больше.

---

## 3. Один простой способ строить корзину из D

Предлагаю не проценты, а **фиксированный integer-weight template** в rulesVersion.

Например абстрактно:

```text
weights = [w1, w2, ... wK]
sumW = Σ wi
minPrize = m

unit = floor(D / sumW)

если unit < m:
    draw not ready

prize_i = unit × wi
basketTotal = unit × sumW <= D
remainder = D - basketTotal
```

`remainder` остаётся в Short.

Преимущества:

- каждый prize положительный;
- сумма никогда не превышает D;
- rounding однозначный;
- малый D естественно превращается в not-ready, а не в нулевые prizes;
- small/medium/large задаются целыми весами, а не плавающими процентами;
- template можно versioned менять для будущих draws, не меняя старый frozen basket.

Конкретные `K`, `weights` и `m` сейчас выбирать не предлагаю.

### Зачем shuffle самой корзины

Если `M < K`, uniform permutation корзины перед сопоставлением означает, что выданные M prizes являются случайным подмножеством basket.

То есть крупный prize может как выпасть, так и остаться невыданным. Это соответствует выбранной идее и не создаёт скрытого приоритета «сначала мелкие».

При `M >= K` все K prizes выдаются, а shuffle определяет случайное соответствие winner ↔ amount.

---

## 4. Luck state: persistent + frozen usedLuck

Для MVP лучше хранить текущий Luck как persistent state, а не каждый раз восстанавливать его из всей истории.

История terminal outcomes остаётся audit trail, но не должна быть обязательным runtime-расчётом.

Минимально нужны два понятия:

```text
wallet.shortLuck      // текущее доступное состояние
snapshot.usedLuck     // Luck, реально использованный frozen draw
```

`usedLuck` стоит фиксировать уже сейчас, хотя весь Luck применяется автоматически.

Это нужно не столько ради будущего bankable Luck, сколько ради текущего свойства:

> вероятность frozen draw не должна измениться после freeze.

Не нужно сейчас заводить отдельные balances `earnedLuck`, `lockedLuck`, `spentLuck` и т.п.

Для результата достаточно однозначно сохранять:

```text
before/used Luck
wonPrize: yes/no
after Luck
drawId
```

Если позже появится manual/bankable Luck, новая версия сможет добавить правило выбора `usedLuck`, а исторический смысл старых snapshots останется понятным.

---

## 5. Concurrency: один pending short

Для MVP поддерживаю:

```text
не больше одного frozen/pending short на систему
```

Пока он pending:

- snapshot участников/entries/usedLuck/basket/D неизменен;
- новые BUY создают attempts только для следующего OPEN;
- Luck ещё не меняется;
- новые checkpoints не создают очередь draws;
- monthly/funding/claims продолжают жить независимо.

После terminal settlement сначала должны быть полностью применены prizes + attempts + Luck, и только потом следующий short может freeze.

Это полностью убирает double-use одного Luck без per-wallet очередей.

Для clock я бы использовал тот же простой принцип, который уже приняли для monthly:

```text
если RNG задержал short, пропущенные checkpoints не replay;
следующий допустимый short — не раньше одного обычного short interval после terminal settlement.
```

Так нет мгновенного catch-up и меньше timing power у оператора.

---

## 6. Самый важный технический риск: обновить Luck всем проигравшим

Vault получает только winners, но Luck меняется у **всех участвовавших wallets**.

Это значит, что settlement complexity зависит от количества participating wallets N, а не от K prizes.

Для маленького MVP самый простой и лучший путь:

> делать prize finalization и attempts/Luck updates в одной orchestrated transaction, если worst-case N уверенно помещается в gas limit целевой сети.

Если controller в одной транзакции:

1. валидирует terminal result;
2. применяет attempts/Luck;
3. вызывает `PromoVault.finalize(...)`;
4. помечает short settled;

то весь EVM transaction atomic: если любой шаг revert, откатывается и вызов Vault.

Таким образом невозможно состояние:

```text
vault prizes finalized
но Luck ещё не применён
```

или наоборот.

### Когда нужен batching/Merkle/lazy update

Не выбирать это заранее.

Сначала нужно измерить gas на целевой сети для реального worst-case participant count.

Если N не помещается с комфортным запасом — тогда single-tx модель уже объективно не подходит и нужен отдельный дизайн result commitment + bounded batching/lazy proof.

До этого Merkle/batching только добавят trust/state-machine сложность.

При любом multi-tx варианте следующий short нельзя freeze, пока **весь** terminal state предыдущего не применён.

Hash/root сам по себе не доказывает корректность participant/result contents — это по-прежнему отдельная trust boundary.

---

## 7. Full reset на любой prize

Для MVP оставил бы именно так.

Если корзина не содержит бессмысленно маленьких prizes, правило очень чистое:

```text
назначен любой ненулевой short prize
→ shortLuck = 0
```

Partial reset создаёт новую экономику Luck без необходимости.

Если позже окажется неприятным сбросить большой Luck за условные копейки — сначала надо исправлять `minPrize`/basket template, а не усложнять reset.

---

## 8. Что стоит убрать/поправить в текущих документах

Основная новая Short схема уже правильно заменяет:

- guaranteed reward каждому admitted;
- SpendFactor;
- нормализованные weights;
- генерацию индивидуальной суммы кандидату;
- требование 1/3 winning entries;
- manual/bankable Luck как MVP;
- cap на человека вместо wallet.

Есть ещё одна явная документационная несогласованность в текущем `PRODUCT_SPEC.md`:

в разделе Monthly уже подтверждено `T = 100 USDG` на весь MVP, но в таблице «Предложения чисел» всё ещё написано:

```text
Next target | ... 100 USDG был только примером
```

Эту строку надо обновить/убрать из списка неутверждённых параметров, потому что она теперь противоречит принятому правилу.

Также старый пункт trust/mutability про «цель следующего цикла объявляется заранее» стоит явно пометить superseded последующим решением `T=100` на весь MVP, чтобы исторический раздел не выглядел действующим правилом.

---

## Рекомендуемый порядок реализации

План Codex в целом правильный. Я бы только сделал границы ещё явнее:

1. Зафиксировать formula + basket template semantics + one-pending concurrency на бумаге.
2. Сделать чистую deterministic Short model: admission, unbiased permutations, basket matching, Luck transition. Без chain/RPC.
3. Benchmark worst-case participants для single-tx Luck settlement.
4. Спроектировать source-of-truth entries/Luck + freeze snapshot и только после этого production controller state machine.
5. Интегрировать RNG так, чтобы один frozen request имел один terminal result без reroll.
6. Подключить существующий PromoVault только как custody/final prize assignment.

Не тянуть игровую probability logic в PromoVault.

---

## Решения владельцу

Я вижу три реально нужных решения перед следующим шагом:

1. **Формула Luck:** принять двухосевую рациональную формулу выше вместо `e+L`/exponential-кандидатов?
2. **Basket semantics:** принять fixed integer-weight template + `minPrize`, где scale строится из D, а остаток остаётся Short?
3. **Concurrency:** принять один pending short и правило «после terminal settlement ждём один обычный short interval; пропущенные checkpoints не replay»?

Остальное можно оставить параметрами будущей rulesVersion (`p_max`, `h_e`, `h_L`, K, weights, minPrize, D/readiness) и не выбирать числа сейчас.