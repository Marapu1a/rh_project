# Canonical Short settlement

16.09.2026. Внутренний компонент после dataset preparation и rules epochs.
Это ещё не production controller: настоящий RNG, политика бюджета, finality,
роли и обеспечение исполнения до freeze остаются отдельной интеграцией.

## Путь розыгрыша

`begin → publish chunks → seal/reserve → WaitingSeed → Processing → Terminal`

- `ShortSettlement` наследует `ShortRulesEpochs`; dataset и корзина берутся из
  единственного опубликованного proposal, правила — из его immutable epoch.
- Controller вызывает `_sealShortDraw(proposalId)`. Резервирование, AttemptsFrozen,
  привязка epoch и создание settlement выполняются одной транзакцией.
  Нельзя выставлять наружу обход через legacy `_sealDataset`/`_sealEpochDataset`.
- `_acceptShortSeed(drawId, seed)` — внутренний вход для будущего authenticated RNG.
  Повторная доставка запрещена; нулевой seed допустим. До доставки обработка закрыта.
  Привязка provider/requestId → drawId ещё не реализована.
- `processShort(drawId, index, chunk)` доступен любому. Принимает только следующую
  опубликованную порцию с точным ABI hash. В порции 1–64 участника;
  суммарного ограничения числа участников этим не вводим.
- Храним top K, число допущенных, обработанных участников и следующий индекс.
  Участник вне top K своей порции не может попасть в глобальный top K.
  Формула допуска, порядок и перемешивание призов остались прежними.
- `shortResult(drawId)` доступен после обработки всего dataset и после завершения.
- `finishShort(drawId)` доступен любому: вычисляет победителей, вызывает реальный
  `PromoVault.finalize`, затем `_completeEpochDraw`. Начисление, AttemptsConsumed,
  закрытие draining epoch и запуск шестичасового интервала атомарны. Ошибка
  откатывает всё завершение, сохраняя seed и прогресс для повтора.

Отсутствие победителей — результат того же seed: бюджет возвращается в free Short,
попытки списываются. Reset/reroll/timeout settlement не добавлены. Начисленные призы
остаются обязательствами vault; получение не блокирует следующий цикл.
Неудачный перевод одному победителю сохраняет его reward.

## Канонический результат

Контекст — существующий `SHORT_DATASET_CONTEXT_V1`, без proposalId, размера порций,
исполнителя и блока seal. Study-only context и legacy flat ABI hash не используются.

```text
keccak256(abi.encode(
  keccak256("SHORT_DATASET_RESULT_V1"),
  context, seed, orderedDatasetRoot,
  ShortOutcome.rulesHash(outcomeRules), basketHash,
  Result(winners, amounts, prizeIndices, admittedCount, bytes32(0))
))
```

Для одинакового context и seed результат не зависит от partition/executor.
prizeIndices соответствуют глобальному рангу победителей; выплаты положительны,
сумма не превышает резерв. Неназначенные призы и остаток целочисленного деления
возвращаются в free Short.

## Восстановление и проверка

`scripts/short-settlement.cjs` экспортирует:

- `compute`: независимый full-sort JS расчёт и canonical result hash.
- `recover(provider, source, drawId)`: read-only восстановление DatasetChunk из
  calldata прямых `publish`, сверка stored hashes/root/count, чтение состояния
  на одном blockTag, независимый результат и следующая операция (`waitSeed`,
  `processShort`, `finishShort`, `terminal`).

Нужны доверенно выбранный deployment, ABI и RPC с историей транзакций.
Hash блока повторно проверяется в конце; это не production finality.
Другой transport, например внутренние вызовы через AA, пока отклоняется.
Это библиотека, не постоянно работающий keeper. BUY-истинность и полнота dataset
отдельно проверяются полным replay; recovery settlement не заменяет эту проверку.

## Проверки и ограничения

Исторический запуск 16.09: `npm test`, **136/136 passed**, включая 8 новых тестов settlement.
17.09 [оптимизация selection](SHORT_SELECTION_OPTIMIZATION.md) уменьшила runtime
`ShortSettlementFixture` с **20 340 до 18 497 байт** при optimizer runs=200, Cancun;
это размер текущей fixture, не обещание размера будущего полного controller.
Публичные транзакции/fork в этом пакете не запускались: внешних интеграций не меняли.

Интеграционные тесты используют настоящий PromoVault и синтетический dataset:
partition 1/7/64, независимый результат, публичное продолжение другим исполнителем,
неправильные/повторные/пропущенные порции, повторный seed/terminal, zero seed,
no-winner, ошибка finalize и повтор, claim, смена epochs, старые unpaid credits,
6 часов, rollback ветки и reentrancy внешнего finalize dependency.
Отдельно проверяется EIP-170 runtime limit тестового интегрированного контракта.

`ShortSettlementFixture` позволяет publisher выбирать seed исключительно для тестов.
Её нельзя запускать с реальными средствами. Старые fixtures остаются историческими
независимыми тестовыми путями, не production API.

Обработка ограничена размером вызова, но суммарная работа растёт с N. С 17.09
processing считает только selection и не повторяет локальную prize permutation.
Сравнение газа описано отдельно; универсальной границы gas-cost или гарантии
неограниченной доступности исторического RPC нет.
Один pending draw по-прежнему блокирует следующий при недоставленном RNG или
отсутствии исполнителей. До реального freeze нужны отдельные проверки RNG и
бюджета/доступности исполнения. Этот пакет не решает внешнюю liveness и не
добавляет скрытый аварийный выход из обязательств.
