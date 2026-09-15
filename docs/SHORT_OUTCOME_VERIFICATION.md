# Проверяемый результат Short

15.09.2026. Реализованы [ShortOutcome.sol](../contracts/ShortOutcome.sol), независимый [JavaScript verifier](../scripts/short-outcome.cjs) и локальный gas sweep. Это параметрический расчёт результата, не production RNG/controller и не утверждение численных настроек.

## Что теперь связано

```text
Полный BUY/attempt replay → один canonical JSON snapshot
  ├─ attemptSnapshotHash: прежний публичный формат
  └─ evmParticipantsHash: ABI-encoded диапазоны того же снимка
              ↓
Short commitment V2: оба hash + cutoff + правила draw + D + basket
              ↓
один seed + commitment + полные participants + сохранённые правила/корзина
              ↓
детерминированные winners/amounts/resultHash
```

Нельзя заменить participant payload после freeze так, чтобы прошла проверка его ABI hash, если не нарушена стойкость хеша. Но оба зафиксированных хеша могут изначально относиться к разным данным или ложному снимку. Проверка `verifySnapshotCommitments(replayedSnapshot, request)` пересчитывает **оба** по одному снимку из независимого replay и отклоняет несовпадение. Сам EVM не доказывает правильность BUY/entries и не устанавливает соответствие JSON и ABI. Существующий lifecycle CLI проверяет JSON; новая дополнительная проверка доступна как функция verifier, не новый production daemon.

## Точные форматы V1

Participant: `(address wallet, uint128 firstAttempt, uint128 lastAttempt)`. Кошельки ненулевые, строго возрастают по числовому адресу; дубликаты/перестановка отклоняются. `1 <= firstAttempt <= lastAttempt`, `entries = last - first + 1`. JSON count обязан совпасть. Пустой список допустим арифметически, но не означает готовность реального draw.

```text
evmParticipantsHash = keccak256(abi.encode(Participant[]))
```

Технический предел диапазона — uint128; количества за его пределами отклоняются, не усекаются. Это предел формата, не выбранный production cap на N.

Outcome Rules: `(uint32 version, uint32 pNumerator, uint32 pDenominator, uint32 hNumerator, uint32 hDenominator)`. Сейчас поддерживается алгоритм version=1. Обе дроби сокращены; `0 < pNumerator < pDenominator`, числитель/знаменатель h положительные. Hash:

```text
keccak256(abi.encode(keccak256("SHORT_OUTCOME_RULES_V1"), Rules))
```

Это канонический payload параметров `p_max` и `h_e`. Тестовый controller использует его hash как BasketRules.remainingRulesHash. Политики расписания/выбора D/авторизации ещё не реализованы — этот payload не выдаётся за полный набор production rules. `version` определяет код алгоритма, а hash конкретного payload различает версии параметров внутри него. Будущая смена параметров не требует замены алгоритма.

## Расчёт

`context = shortCommitmentHash(drawId)` V2. Все хеши ниже используют **abi.encode**, не packed encoding. Seed может быть любым bytes32, включая нулевой; нулевой seed не является признаком недоставленного RNG — будущему controller нужен отдельный статус доставки.

1. Admission random для каждого wallet: `keccak256(abi.encode(keccak256("SHORT_ADMISSION_V1"), context, seed, wallet))`.
2. Threshold: `floor(2^256 * p_max * entries / (entries + h_e))`. Wallet допущен, если uint256(random) строго меньше threshold. Solidity использует Math.mulDiv и остаток, JS — независимое BigInt-выражение. Разрядности ограничивают промежуточные числитель/знаменатель; overflow не маскируется.
3. Rank допущенного wallet: аналогичный hash с tag `SHORT_ORDER_V1`. По возрастанию rank; при совпадении — числового адреса. Выбираем первые min(K,M). Entries не дают повторного веса.
4. Rank каждого исходного индекса корзины: `keccak256(abi.encode(keccak256("SHORT_PRIZE_ORDER_V1"), context, seed, uint256(index)))`. Сортируем по rank, при равенстве — исходному индексу. Сопоставляем первые min(K,M) мест выбранным кошелькам.
5. Максимум один приз кошельку. При M<K выдаётся случайное подмножество корзины; самый крупный приз может остаться. При M=0 — пустые списки, без нулевых наград.

Результат не зависит от stateful RNG loop или количества предыдущих допущенных. Порядок входных кошельков канонический; перемешанный вход отклоняется, не создаёт альтернативный outcome. Solidity хранит только лучшие K кандидатов (O(N*K + K²)); JS независимо сортирует полный список. У библиотеки технический предел K=64, как у commitment.

Прежняя Python-модель short_model.py остаётся инструментом экономических сценариев с random.Random. Она не является byte-for-byte verifier нового seed-протокола; одинаковое число seed не обязано давать одинаковых winners между ней и V1. Точным эталоном кодирования V1 служит новый JS verifier.

Modulo/rejection sampling не используются. Admission округляется вниз с ошибкой менее `2^-256` на кошелёк. При предположении равномерных независимых hash outputs случайная сортировка симметрична, кроме 256-битных коллизий: фиксированный tie-break создаёт пренебрежимо малый bias, не математически нулевой. Вероятность хотя бы одной коллизии ограничена birthday bound по N/K. Это не доказательство честности источника seed.

Result tuple: `(address[] winners, uint256[] amounts, uint256[] prizeIndices, uint256 admittedCount, bytes32 resultHash)`. Для вычисления итогового hash последний элемент tuple равен zero bytes32:

```text
keccak256(abi.encode(keccak256("SHORT_RESULT_V1"), context, seed,
  evmParticipantsHash, outcomeRulesHash, keccak256(abi.encode(prizes)), ResultWithZeroHash))
```

Поле явно обнулено, рекурсивного хеширования нет. Hash связывает выбранные исходные индексы призов, суммы и общее число допущенных. Frozen context связывает D, basket, snapshot, cutoff и deployment domain.

## Деньги и тестовый terminal

Только [ShortOutcomeFixture](../test/contracts/ShortOutcomeFixture.sol) соединяет результат с PromoVault.finalize: проверяет ABI hash, пересчитывает outcome, назначает prizes, очищает pending и emits AttemptsConsumed одной транзакцией. Ошибка finalize оставляет reserve/pending, без AttemptsConsumed. Пыль и невыданные места возвращаются в Short, старые claimable остаются доступными. Передать произвольные winners/amounts в этот путь нельзя.

**Fixture нельзя разворачивать с реальными средствами:** он принимает seed и правила от caller без авторизации. Это сознательно тестовый способ проверить арифметику, атомарность и стоимость. Производственная фиксация ровно одного проверенного seed, readiness, активация версий, календарь и terminal ещё не готовы. Локальный подбор seed в no-win-тесте не является разрешённым reroll продукта. В production timeout не должен превращаться в no-win.

## Gas и масштаб

Команды:

```powershell
npm run test:short:outcome
npm run report:short:gas
npm test
```

Сохранённый [JSON-отчёт](../research/short-outcome-gas.json) содержит source hashes, версии compiler/optimizer, параметры, commitments, seed, результаты, calldata и отдельные verification/finalize gas. Сценарии синтетические, chainId=31337, Cancun, solc 0.8.37, optimizer=200, K=10. Параметры опыта не production settings.

| N | Calldata bytes | Total gas, обычный профиль | Total gas, допущены все |
|---:|---:|---:|---:|
| 10 | 1 092 | 329 910 | 553 487 |
| 50 | 4 932 | 750 927 | 810 041 |
| 100 | 9 732 | 1 023 329 | 1 122 176 |
| 250 | 24 132 | 1 789 148 | 2 031 397 |
| 500 | 48 132 | 3 205 906 | 3 640 991 |
| 1000 | 96 132 | 6 263 348 | 7 363 734 |

Обычный профиль: p_max=2/5, h=1, entries=1..20. Второй: p_max=4294967294/4294967295, h=1/4294967295, entries=1000000. Скрипт проверяет, что во втором профиле действительно допущены все N; p_max=1 не разрешается даже в fixture.

Все 12 транзакций поместились в локальный блок. Total — receipt gas всей fixture settlement transaction, включая calldata и тестовые события. Verification/finalize — разницы gasleft внутри fixture, не самостоятельные transaction gas; refunds/обвязка означают, что нельзя просто приравнять сумму внутренних замеров к receipt gas. Сам finalize линейный по числу winners: повторы обнаруживаются через уже записанный reward[drawId][winner], вложенного цикла нет. Квадратичный по K участок находится в сортировке prize indices внутри outcome.

Ограничения: all-admitted не является доказанным худшим порядком вставок в top-K; K=64 не измерялся этим sweep; production RNG verification/активация правил и L1 data fee не включены. Это не измерение долларов и не обещание допустимости N=1000 в любой сети. Перед production нужны лимиты целевой сети, предел объёма данных/работы **до freeze**, gas запас и проверка крайнего порядка исполнения. Пока измерения поддерживают простую атомарную схему; Merkle/batching заранее не добавлены. Hashes блоков/context и точные gas могут отличаться между повторными запусками, алгоритм воспроизводится по сохранённым входам.

## Проверки и следующие решения

10 outcome-тестов проверяют независимое совпадение расчётов, дроби/границы uint128/uint256, плохие диапазоны и правила, случайное подмножество корзины, согласованность двух commitment, domain separation, разные правила будущего draw без изменения прошлого, старые claims, замену участников, ошибку finalize и no-win. Есть настоящий локальный receipt replay пустого снимка через terminal; это проверка интеграции событий, не end-to-end торговля. Непустые списки в outcome-тестах синтетические; BUY/lifecycle проверяются существующим отдельным пакетом.

Результат 15.09: **103/103 npm tests прошли**, npm run compile успешно, все 12 gas-сценариев завершились с проверкой resultHash и сохранения средств.

Дальше: дизайн ограниченной активации версий с защитой OPEN attempts/carry, публичный полный rules payload и проверка допустимости snapshot; затем аутентификация seed, расписание и production terminal. Код immutable controller не становится заменяемым, публичный запуск ещё не готов.
