# Ревью Short rules epochs и fresh cutoff

16.09.2026. После краткой [экономической проверки](EXECUTION_ECONOMICS_QUICK_CHECK.md) владелец одобрил возврат к проекту. Доли/пороги/автопополнение gas ещё не production policy. В этом пакете реализованы версии Short и replay, без RNG/аварийных resets.

## Код

- `contracts/ShortRulesEpochs.sol` поверх `ShortDatasetPreparation.sol`.
- `scripts/attempt-lifecycle.cjs`: opt-in lifecycle v2, epoch events, Short snapshot v2, byEpoch и conservation; прежний v1 сохранён для исторических evidence.
- `scripts/short-dataset.cjs`, `scripts/verify-short-dataset.cjs`: выбор целевой epoch, empty artifact/action и сверка on-chain genesis/policy.
- `test/short-epochs.test.cjs`, `test/contracts/ShortEpochFixture.sol`.
- Подробная спецификация: [SHORT_RULES_EPOCHS.md](SHORT_RULES_EPOCHS.md); результаты запуска — IMPLEMENTATION_STATUS.

## Основные решения

Genesis, один announced payload с immutable notice, одна draining epoch. Activation только после notice/6h и без active preparation/pending draw. Если вызов в B, mint до B включительно старый, начиная с B+1 новый. Payload старых билетов не меняется. Carry без собственной epoch; версия назначается при mint. Пока старый набор не закрыт, V3 объявить нельзя.

**Отличие от прежнего предложения GPT:** snapshot cutoff не обязан быть блоком B. Иначе через 256 блоков после activation существующий BEGIN перестаёт принимать старую границу. Теперь выбираем свежий C >= B+1; replay до C отбирает все OPEN старой epoch, то есть mint <= B. Номер границы закреплён activation state/event, старый blockhash(B) для BEGIN не нужен. После BEGIN фиксированы C/root/context, дальнейшая задержка не требует re-anchor.

Пустой старый набор закрывается без draw/денег/AttemptsConsumed/reset clock. Это **авторизованное assertion**, честность которого проверяет independent replay; не выдаём его за on-chain proof. CLI формирует empty artifact + closeEmpty arguments из пересчитанной истории. Permissionless ложное empty не разрешено.

Completion hook требует реального vault Finalized и соответствия win/no-win awarded сумме, затем очищает pending/draining и запускает 6h. Вызывается только внутри будущего authenticated terminal. Fixture intentionally принимает тестовых winners: production так делать нельзя.

## Что проверить

1. Сохраняет ли отделение rules boundary от fresh snapshot cutoff полноту старого набора без зависания после 256 блоков? Нет ли проблем при same-block BUY, reorg и позднем terminal?
2. Есть ли простой путь смешать эпохи, пропустить старые OPEN, изменить правила старого draw либо обойти schedule через empty/supersede?
3. Достаточно ли snapshot v2/domain genesis hash и проверки on-chain policy для заявленной проверяемости? Отдельно отметьте оставшиеся publisher assertions.
4. Empty transition: не усиливает ли эта capability доверие к publisher существенно относительно существующего snapshot? Какие минимальные ограничения нужны перед production, без ZK/governance-комбайна?
5. Корректны ли cumulative ranges/byEpoch при несколько BUY, freeze, новой активности во время pending и отдельном Monthly consumption?
6. Какой следующий один пакет наиболее полезен: связка canonical context с streaming terminal или authenticated seed? Учитывайте, что полный controller обязан поддерживать Monthly до immutable deployment.

Не принимайте из fixture численные notice/параметры или произвольный terminal за утверждённый продукт. Funding/finality readiness, роли, daemon, gas buffer, RNG и аварийная изоляция остаются отдельными незавершёнными частями. Просим конкретные сценарии и независимую оценку, не только подтверждение описания.
