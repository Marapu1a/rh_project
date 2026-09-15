# Текущий ответ GPT

Обновлено: 15.09.2026.
Просмотрен latest commit `eb7070d862c7b6fe372204ad8c1836e5f417f9ac` — `verify Short outcomes and preserve per-draw rule flexibility`.

Фактически прочитаны текущий `GPT_REVIEW_REQUEST.md`, `ShortOutcome.sol`, V2 `ShortDrawCommitment.sol`, `SHORT_OUTCOME_VERIFICATION.md`, независимый JS verifier, outcome tests/fixture, gas script/report и актуальные product/status документы. GitHub CI/status для commit пусты; заявленные `103/103` тестов и 12 gas-сценариев в этом проходе мной независимо не запускались.

Тема: **ревью outcome V1, gas boundary и минимальная модель безопасной активации Short rules**.

## Короткий вердикт

Существенной ошибки в текущей арифметике outcome V1 не вижу. Solidity и JS описывают один и тот же детерминированный алгоритм, а bounded top-K корректно сопоставлен независимой full-sort модели.

Главный production-risk теперь не в random arithmetic, а в двух местах:

1. **до freeze надо уметь доказуемо ограничить объём будущего settlement**; одного `evmParticipantsHash` для этого недостаточно;
2. **правила нельзя просто выбирать при каждом freeze** — нужна state machine активации, которая защищает уже существующие OPEN attempts.

До решения этих двух вещей я бы seed authentication не подключал.

---

## 1. Outcome arithmetic / encoding

### Admission threshold

Формула Solidity корректно реализует:

```text
floor(2^256 * p * e / (e + h))
```

через `type(uint256).max` плюс точную коррекцию на ещё один `numerator`.

Это не off-by-one:

```text
2^256*n = (2^256 - 1)*n + n
```

а `numerator < denominator`, поэтому нужна максимум одна коррекция. При принятых `uint128/uint32` промежуточные значения значительно ниже uint256.

`random < threshold` соответствует ровно этому floor-порогy. При `entries=0` threshold=0; реальные Participant ranges нулевой count не допускают.

### uint128 / uint32 bounds

Для максимальных значений:

```text
entries * hDenominator < 2^160
pNumerator * scaledEntries < 2^192
pDenominator * (scaledEntries + hNumerator) < 2^192
```

поэтому скрытого overflow в threshold не вижу.

Сокращённые дроби через gcd — хорошая canonicalization: один и тот же p/h не имеет нескольких rulesHash.

### top-K

`_select()` корректно работает в обоих режимах:

- пока admitted < K — обычная insertion-sort вставка;
- после заполнения K — новый candidate вставляется только если лучше текущего worst;
- `admittedCount` при этом считает всех admitted, а не только winners.

Tie-break `(rank, wallet)` совпадает с JS full-sort. Один wallet встречается один раз из-за canonical participant list, значит второй prize ему не появится.

### Prize ordering

`_slots()` создаёт permutation исходных basket indices по hash-rank. При равном rank стабильная обработка возрастающих индексов действительно оставляет меньший index первым.

Modulo bias отсутствует; остаётся только практически ничтожный collision/tie bias 256-bit rank, который документация честно признаёт.

### resultHash

Формат однозначный.

В Solidity `Result memory result` имеет `resultHash == 0` до последнего присваивания; именно такой tuple хешируется. JS явно ставит `ZeroHash`. `abi.encode` динамических массивов каноничен, и hash дополнительно связывает:

```text
context
seed
participantsHash
outcomeRulesHash
basketHash
winners
amounts
prizeIndices
admittedCount
```

Отдельной неоднозначности между JS/Solidity здесь не вижу.

---

## 2. Два participant commitments достаточны для принятой trust model — но следующий verifier должен проверять их автоматически

Текущая конструкция разумная:

```text
attemptSnapshotHash    = полный canonical replay snapshot
evmParticipantsHash    = ABI Participant[] из того же snapshot
```

On-chain ABI hash нужен не для доказательства правдивости indexer, а чтобы после freeze нельзя было подменить payload, используемый для outcome.

Это соответствует принятой модели: ложный snapshot не предотвращается контрактом, но должен быть публично обнаружим.

Следующий verifier должен без ручного шага делать цепочку:

```text
свой RPC
→ replay registrations/BUY/carry/attempt lifecycle до cutoff
→ canonical snapshot
→ attemptSnapshotHash
→ evmParticipantsHash
→ compare с frozen request
→ read frozen public rules/basket/D
→ после seed compute outcome
→ compare resultHash
→ compare PromoVault rewards/finalize
```

И публиковать один machine-readable draw-proof artifact. Сам lifecycle CLI, который проверяет только JSON hash, после появления production draw уже будет недостаточен как полный verifier.

---

## 3. Concrete finding: pre-freeze gas limit сейчас нельзя enforce по одному hash

Severity: **MEDIUM / production blocker до live controller**, не дефект текущей fixture.

Settlement gas и calldata растут с N, но `FreezeRequest` V2 фиксирует только:

```text
evmParticipantsHash
```

Контракт из hash не знает, сколько там участников.

Следовательно, будущий production controller не сможет на freeze доказать:

```text
N <= safe limit
```

или:

```text
N * K <= safe work limit
```

не получая полный список on-chain уже при freeze.

Плохой сценарий:

```text
operator commits корректный огромный snapshot
→ USDG reserve успешно frozen
→ честный seed приходит
→ единственный допустимый atomic settlement не помещается в gas/tx-size limit
→ pending и attempts зависают навсегда
```

Минимальная правка до production:

добавить в frozen request хотя бы canonical `participantCount` (лучше также `totalFrozenAttempts` как audit metadata), включить его в commitment V3 и заставить independent verifier доказать соответствие snapshot.

Тогда controller может **до reserve** enforce immutable technical bound, например:

```text
participantCount <= MAX_N
weights.length <= MAX_K
participantCount * weights.length <= MAX_SELECTION_WORK
```

Точные MAX_N/MAX_WORK выбирать только после целевых gas tests.

Это намного полезнее, чем пытаться спасать oversized draw batching'ом после freeze.

---

## 4. Gas: причин отказываться от atomic settlement пока нет

Текущие измерения выглядят обнадёживающе:

```text
N=1000, K=10
~6.26M normal
~7.36M all-admitted
~96 KB calldata
```

Но перед production cap нужны ещё четыре проверки:

1. **K sweep**, минимум K=1/10/32/64. Сейчас измерен только K=10.
2. **Worst insertion work.** All-admitted повышает работу, но случайный rank order не гарантирует максимальные K shifts на каждом candidate. Нужен либо специальный harness с synthetic ranks, либо консервативная аналитическая/измеренная верхняя граница worst-path.
3. **Target-chain limits:** фактический Robinhood Chain block gas limit, max tx/calldata/RPC acceptance и запас под production seed verification/controller logic.
4. **N beyond intended cap** (например 1500/2000 или до явного failure), чтобы cap выбирался от измеренной границы, а не от последней успешной строки.

Отдельно calldata может стать ограничением раньше compute gas.

Пока K небольшой и N порядка 1000, данных недостаточно, чтобы оправдать Merkle/batching/lazy settlement. Простая atomic transaction всё ещё предпочтительнее.

---

## 5. Минимальная state machine для rules versioning без очереди старых epochs

Я бы не привязывал правила только при freeze: это действительно позволяет ухудшить уже накопленные OPEN attempts.

Минимальная модель — **boundary activation**.

### Состояние

```text
activeRules
pendingRules?        // максимум одна будущая версия
pendingAnnouncedAt
pendingActivationBoundary
```

Код controller immutable; поддерживаемый алгоритм outcome V1 тоже immutable. Версионируется только bounded data payload.

### Announce

Новая rules version сначала публикуется целиком и получает hash. Она ещё ни на что не влияет.

Должен существовать immutable минимальный notice period/blocks, значение которого владелец выберет отдельно. Нельзя announce и тут же применить к уже накопленным attempts.

### Boundary Short

Первый Short freeze после достаточного notice:

```text
использует СТАРЫЕ rules
замораживает ВСЕ old-version OPEN attempts до cutoff
```

и этот же cutoff становится activation boundary новой версии.

После boundary:

```text
attempts, minted после cutoff → new rules epoch
старые frozen attempts → завершаются только old rules
```

Пока boundary draw pending, новые attempts уже спокойно копятся под новой version.

После terminal старой boundary draw старого OPEN cohort больше нет; следующий Short работает на новой version.

Чтобы не получить очередь epochs:

- максимум одна pending rules update;
- новую следующую update нельзя объявить/активировать, пока boundary draw предыдущей версии не terminal и новая version не стала единственной OPEN version.

Так мы получаем максимум два соседних epochs в системе: frozen old + open new.

### Где rules становятся обязательством

Для **Short attempt** — при его mint.

Это важная граница. Уже minted OPEN attempt нельзя перевести на худшую version.

Для frozen attempt — тем более остаётся frozen rules.

---

## 6. Отдельное решение про BUY carry

Здесь нужна одна явная продуктовая формулировка.

Моя рекомендация для MVP:

> BUY carry гарантирует только неизменный `100 USDG nominal → entry` threshold. Short rules version прикрепляется не к неполному carry, а к attempt в момент, когда entry реально minted.

Тогда `$99` carry до boundary не теряется и не пересчитывается: покупка ещё `$1` после boundary создаёт ровно одну entry, но уже новой Short version.

Это сохраняет экономический смысл carry без вечного хвоста старых rule epochs.

Если владелец хочет, чтобы частичный carry наследовал ещё и старые p/K/D условия, нужна отдельная `carryEpoch` модель; тогда старые attempts смогут появляться после activation boundary, и простой двух-epoch механизм ломается.

Я бы этого не добавлял.

Entry threshold `100 USDG` для MVP уже фиксирован отдельно; его не включать в versionable Short rules.

---

## 7. Какие параметры можно версионировать

Безопаснее разделить **algorithm/invariants** и **economic data**.

### Immutable для deployment / MVP

- custody/no-withdraw authority;
- outcome algorithm V1 и его encoding/hash domains;
- max one Short prize per wallet;
- Luck отсутствует;
- no reroll после доставленного random;
- frozen inputs/results immutable;
- entry threshold 100 USDG для MVP;
- T=100 USDG;
- hard technical MAX_K / MAX_N / MAX_WORK после измерений;
- минимальная граница расписания, уже принятый минимум 6h;
- запрет recipient/address-specific rules.

### Можно version как публичный bounded payload для будущих attempts

- `p_max`; 
- `h_e`; 
- K/weights;
- minimum prize/unit;
- Short budget policy D;
- возможно интервал > immutable minimum, если владелец захочет.

Но bounds для каждого параметра должны быть в immutable controller code, а не только в UI.

### Особенно D

Я бы **не оставлял production D произвольным аргументом оператора на каждый freeze**.

Лучше rules version содержит детерминированную публичную формулу D от уже известного on-chain reserve state, с hard cap. Controller сам вычисляет D и сравнивает/не принимает caller value.

Иначе оператор после просмотра participant set может произвольно менять expected payout draw, пусть даже не может назвать конкретного winner.

---

## 8. Как flexibility не превращается в скрытый вывод связанным кошелькам

Нужен жёсткий порядок полномочий:

```text
1. public rules payload announced
2. notice проходит
3. activation boundary/cutoff фиксирован
4. participant snapshot + D + basket frozen
5. только ПОСЛЕ этого появляется единственный authenticated seed
6. immutable outcome V1 вычисляет winners
7. atomic finalize + AttemptsConsumed
```

Rules payload должен содержать только глобальные параметры. Никаких wallet addresses, allowlists, per-wallet multipliers, caller-selected winners или специальных recipient branches.

При таком порядке изменение p/K/D может менять экономику **будущих attempts**, но не позволяет после знания seed подобрать параметры под связанный кошелёк.

Sybil несколькими обычными кошельками остаётся тем остаточным риском, который продукт уже принял.

---

## 9. Какой следующий пакет

Из трёх кандидатов я бы выбрал **rules activation + public payload + pre-freeze work bounds**.

Условно:

```text
short-rules-activation-v1
```

Почему не seed authentication прямо сейчас:

seed verification бесполезно цементировать, пока controller ещё может выбирать правила при freeze и пока нельзя доказать, что frozen N вообще settlement-safe.

Минимальный пакет:

1. canonical public `ShortRulesV1` payload;
2. immutable hard bounds;
3. `announceRules(hash/payload)` без немедленного действия;
4. максимум одна pending update;
5. boundary activation с old OPEN → old frozen, post-cutoff mint → new epoch;
6. participantCount в snapshot/commitment и pre-freeze MAX_N/MAX_WORK check;
7. verifier обновить так, чтобы он проверял epoch/rules/count вместе с обоими snapshot hashes;
8. тесты на notice, попытку мгновенного downgrade, pending boundary, reorg, повторную update и отсутствие смешивания epochs.

После этого следующий пакет уже естественно будет seed authentication + production terminal.

## Итог

`eb7070d` заметно усиливает систему: outcome V1 уже не доверяет caller-supplied winners и воспроизводится независимым кодом.

Текущая atomic architecture выглядит жизнеспособной; преждевременно уходить в Merkle/batching не надо.

Самая полезная следующая работа — закрыть **когда и для каких attempts правила становятся обязательством** и одновременно не позволить заморозить draw, который заведомо невозможно атомарно settle из-за N/K.