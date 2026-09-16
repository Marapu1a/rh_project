# Ревью текущего пакета: Short dataset preparation

16.09.2026. Предыдущий ответ и Trust & Evolution прочитаны. Просим проверить конкретный новый код, а не считать рекомендации автоматически реализованными.

## Что сделано

- `contracts/ShortDatasetPreparation.sol`: abstract internal component, Publishing → Ready → Sealed; незамороженную подготовку можно Supersede без удаления истории.
- Request фиксирует cutoff, snapshot, epoch, D, root/count/attempts; actual root/count/attempts считает контракт. Strict order между порциями, корректные диапазоны, запрет vault recipient, limit 64 на порцию без total N cap.
- Полный список проверяется до reserve. Seal атомарно вызывает настоящий PromoVault и emits AttemptsFrozen. Повтор/замена frozen запрещены. Нет reset pending до будущей реализации terminal.
- Canonical context не содержит proposalId, chunk partition, caller или seal block. Новый format явно отличается от старого V2/study. Будущие варианты исполнения должны использовать один context.
- `scripts/short-dataset.cjs`: независимый OPEN builder через имеющийся replay исходных BUY/consumption; проверка deployment domain, rules/basket, восстановление calldata/chunk hashes и actual dataset, sealed context.
- `scripts/verify-short-dataset.cjs`: offline evidence либо самостоятельный scan выбранного RPC, JSON artifact/content hash/publication tx list. Ничего не отправляет on-chain.

Подробно: [SHORT_DATASET_PREPARATION.md](SHORT_DATASET_PREPARATION.md). Тесты: `test/short-dataset.test.cjs`; `npm run test:short:dataset`, полный `npm test`. Итог запуска указан в IMPLEMENTATION_STATUS.

## Честные ограничения

Это внутренний компонент, НЕ production controller. Внешние методы и publisher role пока только fixture. Нельзя разворачивать fixture с настоящими деньгами: authenticated seed и terminal отсутствуют.

Ready доказывает структуру/полноту объявленного набора, не соответствие всем eligible BUY. Независимый replay обнаруживает ложный список; on-chain prevention/challenge не добавлены.

Один draw — одна версия. `rulesEpoch` пока commitment metadata, а не проверенная activation policy. До отдельной epoch state machine допустима только начальная версия в интеграции; setter нового набора для старых OPEN не добавлен. Carry и приобретённые условия не должны переписываться. Точная activation boundary остаётся следующим пакетом, а не скрывается за номером epoch.

Существующий V2 и test-only streaming сохранены; новый компонент не делает старые paths безопасными автоматически. Новый resultHash/processing/terminal ещё не интегрирован. Зеркалирование artifact, production finality, keeper и authorization/readiness policy не реализованы.

## Что проверить

1. Есть ли простой структурный payload, который проходит Ready/Seal, но делает будущую обработку текущим ShortOutcome/PromoVault невозможной? Отдельно от внешнего RNG, сети или токена.
2. Не создаёт ли namespace proposal/draw либо supersede возможность изменить уже frozen обязательство или альтернативный outcome? Нужны ли дополнительные смысловые поля в canonical context до интеграции?
3. Полон ли verifier для заявленной задачи? Где он проверяет только operator assertion, а где заново пересчитывает историю? Не смешаны ли эти гарантии в документации?
4. Для следующей activation state machine предложите минимальную границу одной версии на draw без retroactive OPEN changes. Учтите BUY между cutoff и seal, pending Short, требование cutoff не раньше прошлого TERMINAL и 6 часов после settlement. Не вводите MAX_N/FIFO или отмену накопленных attempts.
5. Есть ли лишние состояния/абстракции? Хотим ограниченный рабочий следующий шаг, а не общий governance framework.

Не расширяйте этот пакет на RNG/provider selection, ZK, emergency admin, proxy или sponsor campaigns. Приводите конкретный сценарий и разделяйте дефект реализации, отсутствующую интеграцию и будущую оптимизацию.
