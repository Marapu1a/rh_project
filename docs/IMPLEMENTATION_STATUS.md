# Карта реализации

19.09.2026. Только состояние компонентов; ближайшая задача и результаты проверок
ведутся в [CURRENT_CONTEXT](CURRENT_CONTEXT.md), порядок работ — [ROADMAP](ROADMAP.md).

| Компонент | Что есть | Ограничение / подробности |
|---|---|---|
| FeeRouter | TOKEN/USDG accounting, recipient credits, фиксированный PAIR source, атомарный rollover | Успешная rollover-транзакция — граница кампании; source epoch drift блокирует переход. [Отчёт](FEE_ROUTER_ROLLOVER_REPORT.md) |
| PromoVault / DualControllerPromoVault | Free Short/Current/Next, funding, reserve/claimable, win/no-win, старые долги, immutable capabilities | Dual — USDG-only. Нет owner withdrawal и замены controllers. [Бухгалтерия](PROMO_VAULT_DESIGN.md), [архитектура](DUAL_CONTROLLER_ARCHITECTURE.md) |
| ParticipantRegistry | Публичный opt-in без backdating | Не доказывает уникальность человека. [Модуль](PARTICIPANT_REGISTRY.md) |
| Direct BUY | Узкий decoder, полный scan/replay с provenance, carry и nominal 100 USDG за entry | Не универсальный swap decoder и не daemon. [Границы](DIRECT_BUY_REPLAY.md) |
| Attempts / builders | OPEN/FROZEN/CONSUMED, независимые Short/Monthly epochs, v4, public verification | Snapshot truth не доказывается on-chain. [Lifecycle](ATTEMPT_LIFECYCLE.md), [trust](INDEXER_TRUST_MODEL.md) |
| Short settlement | Dataset chunks, reserve при seal, один seed, bounded processing, canonical result, atomic finish/consume | Abstract core. [Dataset](SHORT_DATASET_PREPARATION.md), [epochs](SHORT_RULES_EPOCHS.md), [settlement](SHORT_SETTLEMENT.md) |
| Monthly settlement | Chunks, один seed, выбор кандидата, Next/Current переходы, независимые epochs | Abstract core. [Модель](MONTHLY_RULES_EPOCHS.md) |
| Local controllers | Исполняемые Short/Monthly с общим vault, ролями, async RNG transport | Только chainId 31337, mock provider. [Скелет](LOCAL_CONTROLLER_SKELETON.md) |
| BUY → Short integration | Два цикла из локальных транзакций, публичный verifier, recovery/reorg, claim | Упрощённый venue; не PAIR fork. [Сценарий](LOCAL_BUY_CYCLE.md) |
| Local Short executor | Single-job step/run, publisher/executor, readiness, restart, loopback CLI | Нет нового seed/cutoff, durable mempool journal или production daemon. [Исполнитель](LOCAL_SHORT_EXECUTOR.md) |
| Local Monthly executor | Monthly job из BUY builder, step/run, Next funding, win/no-win/recovery, общий CLI | Общий тест 2 Short + 2 Monthly; нет генератора jobs и production scheduler. [Контур](LOCAL_MONTHLY_EXECUTOR.md) |
| Local scheduler | Scan/replay/build → persisted jobs → Short/Monthly workers; empty epochs и повторные циклы | [Планировщик](LOCAL_PROMO_SCHEDULER.md). LOCAL_HEAD, полный rescan, тестовый RNG; аварийный recovery ограничен |
| ChainBlocks | На Robinhood 4663/46630 использует L2 ArbSys number/hash | Не finality, прочие Nitro сети требуют явного porting. [Границы](ROBINHOOD_BLOCK_SEMANTICS.md) |
| Drand | Реальная BN254 подпись проверена отдельно; binding counterexamples воспроизведены | Нет production adapter/future-round policy. [Verifier](DRAND_FEASIBILITY.md), [binding](DRAND_BINDING_MODEL.md) |
| USDG creator funding | Local worker: FeeRouter credits → pay → GENERAL в PromoVault; отдельные recipients проекта | [Контур](LOCAL_USDG_FUNDING.md). Collect/harvest автоматизированы [отдельным проходом](LOCAL_USDG_REVENUE.md); нет swap/ops refill; доли тестовые |
| Автоматизация / выпуск | Локальные тесты и CLI отдельных этапов | Нет постоянного keeper/indexer, production deployment и frontend |
| Local coordinator | Последовательные prize-flow + draw scheduler, durable pending marker, receipt reconciliation | [Модуль](LOCAL_PROMO_COORDINATOR.md). Только локально; hashless/manual recovery, exclusive signers, нет production journal/gas autorefill |

## Проверки

Локальный [execution budget](LOCAL_EXECUTION_BUDGET.md): pure calculator + coordinator
preflight до estimate/intent, native accounting по адресам, RNG отдельно, frozen-first,
два model fee profiles, settings отдельно от deployment identity. Opt-in `--ops FILE`.
Это off-chain forecast, не native escrow или production guarantee; local bootstrap autorefill подключён отдельно.

- `npm run test:local:buy-cycle` — новый сквозной локальный путь.
- `npm run test:local:executor` — тот же расширенный BUY-cycle с worker; `npm run local:short -- ...` — CLI для уже развёрнутого локального узла/job.
- `npm run test:local:monthly` — тот же общий сценарий; `npm run local:monthly -- ...` — CLI Monthly job, schema выбирает исполнитель.
- `npm run test:local:controllers` — контроллеры/казна/async callback/recovery.
- `npm test` — основной Node-набор; точный последний результат в CURRENT_CONTEXT.
- `npm run test:drand`, `npm run test:drand:binding` — отдельные research suites.
- Live RPC/fork и Python research не включены автоматически в основной Node-набор.
  Условия запуска и evidence находятся в документах соответствующего модуля и
  [research README](../research/README.md). Исторические цены/gas не являются текущими ставками.

Логи сохранять в `.local/logs/`. Старый накопительный статус, команды и результаты
этапов сохранены [в снимке](archive/snapshots/IMPLEMENTATION_STATUS_2026-09-19.md).
Тестовые успехи не равны готовности к публичным средствам или внешнему аудиту.

- Стабилизация workers 19.09: bounded receipt/abort и cutoff следующего блока; `npm run test:local:stability`. [Результаты и ограничения](LOCAL_STABILIZATION_REVIEW.md).

Review 20.09: [открытые custody/execution дефекты и исправление reorg](AUTOMATION_REVIEW_2026-09-20.md). Успешные локальные suites не закрывают эти ограничения.

20.09: recipient isolation в funding/revenue и explicit estimate/broadcast/confirm; детали — [LOCAL_USDG_REVENUE](LOCAL_USDG_REVENUE.md). Контрактная математика не менялась.

20.09: [LocalPrizeConverter](LOCAL_PRIZE_CONVERTER.md) — shared inventory и immutable destination, только локальный fixed adapter/floor. Интегрирован через отдельный prize-flow job; старый USDG-only funding job converter не обслуживает.

20.09: [Local Prize Flow](LOCAL_PRIZE_FLOW.md), scripts/local-prize-flow.cjs — отдельный job/CLI для converter и bounded legacy recipients; старый USDG API сохранён.

20.09: error context отделён от lastConfirmed; draw workers/closeEmpty используют общий tx classifier, scheduler глобально останавливается на unknown outcome. Подробнее LOCAL_PRIZE_FLOW и LOCAL_PROMO_SCHEDULER.

20.09: [самопроверка и переносимость](LOCAL_REVIEW_AND_PORTABILITY.md) — открытые границы
ops funding, state/config и production integration. Не новый полный аудит/прогон тестов.
`npm run local:coordinator -- ...` / `npm run test:local:coordinator` — общий локальный контур.

После review f222a8c: coordinator заранее проверяет provider у всех signers и переданных
контрактов; successful prepared-intent persistence — явный abort commit point.

21.09: lock initialization cleanup и fault tests; `npm run report:execution:calibration`
измеряет реальные локальные контроллеры, отдельный calibration child проверяет clean
process handoff на chunks. [Границы и результаты](LOCAL_EXECUTION_CALIBRATION.md).

21.09: scripts/local-native-refill.cjs — pure planner, `npm run test:local:refill`.
Приоритет obligations, caps с gas, source floor, cooldown/period, pending/anchor/domain.
RPC/transfer executor отсутствует. [API и границы](LOCAL_NATIVE_REFILL.md).

21.09: scripts/local-native-refill-state.cjs — pure intent/hash/receipt transitions общего journal;
actual expense и cooldown попыток, atomic finalization. Coordinator не очищает refill pending
через generic recovery. Typed recovery подключён; автоматический запуск funding подключён optional-конфигурацией. [Модуль](LOCAL_NATIVE_REFILL.md).

21.09: local-native-refill-executor.cjs — один bootstrap-native transfer под существующим
coordinator lock, RPC/source/fee/estimate/head/nonce checks; typed receipt recovery включён в
coordinator startup. Автосбор draw obligations и запуск пополнений теперь подключены (см. ниже).

21.09: refill intent связывает gas/fee envelope; post-broadcast mismatch сохраняет hash,
учитывает расход и ставит durable stop для executor/coordinator. Первого перерасхода это не предотвращает.

21.09: автоматический native funding включён optional-конфигурацией coordinator/CLI; общий
collectExecutionObligations для budget/refill, anchor binding, frozen-first, один refill/pass.
Receipt wait отделён от requiresOperatorAction. Детали и границы — LOCAL_NATIVE_REFILL.

22.09: withState.validateMigration — guard под lock до записи нового configHash; coordinator
проверяет history domain/pending и статическую полноту funding targets. Нет reset/migration bypass.

22.09: test/local-native-refill-process.test.cjs + test-only child fixture — пять crash boundaries, stale-lock stop, hashless stop и known-hash recovery; coordinator receipt RPC outage regression. [Матрица](LOCAL_NATIVE_REFILL_RECOVERY.md).

22.09: local-native-refill-inspector.cjs / inspect-local-native-refill.cjs — read-only JSON diagnosis, expected config/domain validation, nonce evidence, pure projected accounting, snapshot-change guard. [CLI](LOCAL_NATIVE_REFILL_INSPECTOR.md).
