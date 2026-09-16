# Оптимизация Short selection — 17.09.2026

Узкий пакет после ревью canonical settlement. Правила, ABI production-компонентов,
контексты и хеши результатов не менялись. Новых внешних зависимостей нет.

## Изменение

`ShortOutcome.selectTopK(context, seed, participants, rules, K)` — общий internal
primitive для `compute` и `ShortSettlement.processShort`. Проверяет context/K,
rules и упорядоченность/диапазоны участников; возвращает candidates с готовыми
rank и полное число admitted. Массив имеет длину K, но заполнены только первые
`min(admitted, K)` элементов. `_merge` получает именно это число; нулевой хвост
никогда не включается в результат.

Processing больше не рассчитывает local prize permutation, amounts, prizeIndices,
flat participant hash или local resultHash. Ранги кандидатов повторно не хешируются.
Корзина проверена при создании proposal и после seal не меняется; processing
использует только её длину. Финальный результат и проверки PromoVault прежние.
Полный `compute` использует общий selection, затем рассчитывает prizes и прежний
`SHORT_RESULT_V1`. Валидация отделена от хеширования, а не отключена.

## Размер

Solc 0.8.37, optimizer runs=200, Cancun, runtime `ShortSettlementFixture`:

| | До | После |
|---|---:|---:|
| Runtime, байт | 20 340 | 18 497 |
| Запас до проверяемых 24 576 байт | 4 236 | 6 079 |

Экономия 1 843 байта, около 9.1%. Это Short с тестовыми wrappers, не будущий полный
controller с RNG/Monthly/readiness. Не вводим helpers/proxy и не утверждаем, что
оставшихся 6 079 байт точно хватит. Нужен отдельный budget для содержательной
реализации оставшихся частей: пустые stubs дадут слишком оптимистичную оценку.

## Газ обработки

`npm run report:short:selection` создаёт
[`short-selection-benchmark.json`](../research/short-selection-benchmark.json).
N — участники, K — призовые места; порция до 64 участников, по 20 attempts/wallet.
Normal — тестовые normalRules, near-certain — тестовый допуск почти 1.
Это профили нагрузки, не утверждённые шансы продукта.

| N | K | Профиль | Processing до | После | Снижение |
|---:|---:|---|---:|---:|---:|
| 128 | 1 | normal | 908 576 | 866 125 | 4.7% |
| 128 | 10 | normal | 1 626 696 | 1 515 917 | 6.8% |
| 128 | 64 | near-certain | 7 989 845 | 6 254 431 | 21.7% |
| 1 000 | 10 | normal | 9 902 387 | 8 981 480 | 9.3% |
| 1 000 | 64 | near-certain | 46 717 935 | 32 506 799 | 30.4% |

Это сумма газа всех process-транзакций. Максимальный process в измеренных случаях
снизился с 5 120 606 до 4 253 216 gas. Finish практически прежний: +29 gas в каждом
сценарии. Process+finish дешевле во всех пяти случаях. Не измеряли worst-case
insertion, provider fees, L1 DA, стоимость ETH, deployment, публикацию и claims.
Старые экономические evidence не перезаписывали. Это не универсальный gas bound.

## Честное сравнение

Baseline: Git commit `2586de843b8ea81c62fecaa250285dca8b42f494`. Исходники компилируются
в памяти, обычные artifacts не заменяются. Нужен этот commit в локальной Git history.
Простое отдельное развёртывание изменило бы cutoff hash/context и случайных
кандидатов, исказив сравнение. Поэтому версии разворачиваются локально по одинаковым
адресам/времени; сохраняется новый runtime с подставленными immutables.

Baseline публикует/freeze один dataset и принимает seed. После snapshot прогоняются
старые process/finish; состояние откатывается, runtime подменяется через **локальный
Hardhat setCode**, прогон повторяется. Это приём измерения, не механизм обновления
реального контракта. Context/seed/participants/chunks между ветками одинаковы.
Каждый прогон сверяет exact resultHash с независимым full-sort JS, claimable,
free Short и нулевой reserve. Обычные тесты отдельно разворачивают новую версию
напрямую, без setCode.

## Дополнительные проверки

17.09: targeted outcome/settlement — **20/20 passed**; полный `npm test` —
**138/138 passed**. Пять gas-сценариев прошли все resultHash/accounting assertions.
Сохранённые source hashes соответствуют финальным измеренным исходникам.

- Primitive: N=0/1/12/80, K=1/3/64, кандидаты против full-sort, точность ranks,
  нулевой хвост, invalid inputs.
- Settlement: два admitted из разных порций при трёх местах, крупнейший приз не
  выпал, нет нулевых winners, тот же resultHash при partition 4 и 1, реальный finalize.
- Сохранены прежние проверки partition 1/7/64, no-winner, retry без reroll,
  epoch transition, claim, reentrancy и recovery.

## Следующий шаг и transport

Внешнее разделение расчётов пока отложено: локальная оптимизация дала запас без
расширения trust surface. Следующий архитектурный замер должен учесть RNG binding
и Monthly до решения о монолите/fixed helper.

Primary ops-направление — свой ETH buffer и автоматическое пополнение до funding
призовых резервов. Alchemy/AA — возможный fallback, а не обязательный transport.
Recovery сейчас поддерживает прямые `publish`; перед включением AA нужны decoder
конкретного transport и тесты. Этот пакет их не добавляет.
