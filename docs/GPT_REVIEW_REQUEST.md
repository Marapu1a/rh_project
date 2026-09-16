# Ревью canonical Short settlement

16.09.2026. Следующий ограниченный пакет после Short rules epochs. Просим независимое ревью кода, особенно сценариев неверного результата или зависания.
Предыдущее обращение и ответ остаются в Git; GPT_REVIEW_RESPONSE пока относится к предыдущему пакету.

## Что сделано

- `contracts/ShortSettlement.sol`: epochs/dataset, единственный canonical context, один internal seed hook, permissionless последовательная обработка порций, глобальный top K, реальный vault.finalize и epoch completion одной транзакцией.
- Новый `SHORT_DATASET_RESULT_V1` с rolling root вместо legacy flat ABI hash; partition/proposalId/executor не влияют на результат.
- `scripts/short-settlement.cjs`: independent full-sort verifier и публичное восстановление calldata/progress, чтение на одном blockTag и проверка reorg.
- `test/short-settlement.test.cjs`: настоящий PromoVault, синтетические участники, partitions, recovery, ошибки, no-winner, credits, epochs и guard.
- [Точная модель/API/ограничения](SHORT_SETTLEMENT.md).

## Что проверить

1. Совпадает ли local top K → global top K с full-sort, в том числе при меньшем числе допущенных, чем мест? Независим ли результат от partition?
2. Возможны ли пропуск/повтор порции, ранний finish, повтор seed или смена dataset/rules/budget? Атомарны ли reserve и terminal hooks?
3. После неуспешного finalize остаются те же seed, результат, прогресс и обязательства? Сохраняются ли старые unpaid credits при новом draw/epoch?
4. Достаточно ли recovery по прямым publish calldata для узкого transport? Не выдаём ли structural verification за проверку полноты BUY history?
5. Что минимально добавить перед authenticated RNG: draw/request binding, одноразовая доставка, callbacks, pre-freeze readiness? Без proxy, reroll и ручного выбора победителей.
6. Есть ли конкретный новый путь заморозить структурно корректный draw, который именно из-за этой реализации невозможно завершить? Внешнюю liveness отделяйте от ошибок алгоритма.

Числа fixtures не являются утверждёнными параметрами. Publisher выбирает seed только в TEST fixture — её нельзя деплоить с реальными деньгами.
Production roles/finality/D-policy, обеспечение исполнения до freeze, keeper, Monthly и полноценный BUY→claim E2E остаются впереди. Не расширяем пакет до всех задач сразу: нужны конкретные исправления и следующий разумный шаг.
