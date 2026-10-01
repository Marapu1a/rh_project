# Карта реализации

01.10: добавлены scripts/pons-automation.cjs, run-pons-automation.cjs и automation rehearsal. Используют существующие scheduler/drand, durable intent/receipt journal, independent funding, payout queue, газовые лимиты и --drain. Только идентифицированный локальный fork; fork77338337 PASS,25/25 соседних+7/7 новых адресных tests. [Модуль](PONS_AUTOMATION.md).

01.10: [pons-promo-cycle.cjs](../scripts/pons-promo-cycle.cjs), runner --cycle: реальные Robinhood controllers/DrandRandomAdapter/DualControllerPromoVault на локальном fork, existing Short/Monthly executors, persisted drand journal. Использует launch-plan math; только constructor clocks компилируются с backdating в памяти. Fork77287946 PASS,16/16 соседних tests. Production Solidity/автоматика не переключены. [Evidence](PONS_PROMO_CYCLE.md).

01.10: [pons-v4-buy.cjs](../scripts/pons-v4-buy.cjs) добавляет объединённый curve+UR профиль; проверяет hook fee/output и USDG settlement. Подключён к replay/RPC reader; [тесты](../test/pons-v4-buy.test.cjs) и группа pons-v4-buy:55/55 PASS. Runner --v4 использует настоящие UR/Permit2 на local fork,33 шага PASS. [Границы](PONS_V4_BUY.md).

01.10: curve BUY real-runtime fork77265497 PASS: BUY101 и частичный graduation/refund → entry → открытые Short/Monthly; вместе с funding27 шагов. Только локальный fork, без draws/public sends. [Evidence и границы](PONS_BUY.md).

01.10: [pons-curve-buy.cjs](../scripts/pons-curve-buy.cjs) — прямой curve BUY; подключён к direct-buy/replay-direct-buy и существующему attempt lifecycle. RPC reader сверяет runtime и связи venue на каждом блоке. [Тесты](../test/pons-curve-buy.test.cjs), профиль pons-buy:49/49 PASS. [Границы](PONS_BUY.md).

01.10: LocalPonsCollector теперь использует [IPonsVenue](../contracts/IPonsVenue.sol), однократный venue binding и отдельные curve/pool sweep. [Ручной runner](../scripts/pons-collector-manual.cjs), [fork](../scripts/pons-collector-fork.cjs);7/7 tests и локальный real-runtime funding proof PASS. Это не full suite, BUY/draw proof или production admission. [Подробности](PONS_COLLECTOR.md).

01.10: [LocalPonsCollector](../contracts/LocalPonsCollector.sol), [тесты](../test/pons-collector.test.cjs), профиль `pons-collector`: escrow fixture→реальный PromoVault,4/4 PASS. Sweep/ручной runner/real-source admission ещё отсутствуют; [границы](PONS_COLLECTOR.md). Страница /transparency/ — локальный датированный статус, не мониторинг сервиса.

Текущая адаптация: [Pons migration](PONS_MIGRATION.md); PAIR сохранён как резерв. Отдельные draft config/ABI готовы, production collector и BUY adapters ещё не реализованы.

30.09: [pons-fork-rehearsal.cjs](../scripts/pons-fork-rehearsal.cjs) — отдельный research runner:
live fork launch→curve BUY/SELL→probe collector90/5/5→graduation→v4 BUY/SELL→
operator conversion→claim. Exit0 на anchor76626917. Probe contracts не production;
PromoVault/indexer/tickets не подключены. [Результаты и границы](PONS_V2_RESEARCH.md).

КТ1 начата, но BLOCKED до fork/BUY: PAIR proxy implementation сменился с0x4AdC… на0x557cb0e797973ef01f0e7fe9de0b75f2b5b587b7 (2RPC подтвердили). Runner same-chain подготовлен, compile и5адресных tests passed; интеграционный путь еще не доказан. Следом review новой implementation, затем повтор КТ1 без обхода pins. [Отчет](KT1_BUY_REHEARSAL.md).

30.09: prepare-pair-launch создает draft calldata collector/PAIR и выполняет live read-only simulation: обе eth_call прошли, gas estimates получены (~0.00061634ETH с launch fee только за эти2операции). USDG109.622644 подтверждены. Metadata/настройки draft, public sends нет. Последовательный local fork collector→PAIR прошел; получатель комиссий проверен. Остальные Promo contracts не покрыты оценкой. [Детали](LAUNCH_PREPARATION.md).

30.09: добавлен read-only PAIR launch preview (readiness/opening/source, без calldata). Live12 checks passed; пользовательский creator записан в launch plan, баланс0.00311832ETH прочитан, total deployment cost еще неизвестен. Следом metadata/роли/immutable settings и проверка token/collector prediction перед simulation. [Детали](LAUNCH_PREPARATION.md).

30.09: `launch-source-preflight.cjs` — read-only runtime/proxy/graph/quote/fee check на одном блоке; `public-launch-plan.cjs` дополнен required launch inputs. `launch-source-preflight.test.cjs` —3 адресных сценария; плановые проверки5/5. [Результат и ограничения](LAUNCH_PREPARATION.md).

30.09: `public-observation.cjs` + `public-status.cjs` — резервный snapshot и overview projection, opt-in persistent indexer, общий user-status worker/API. `web/overview.js` + app.js — карточки/history/frozen/asset amounts. `start-public-service.cjs` и `deploy/public-api/` — read-only service/standby. Новые public-status/public-observation/overview tests. [Контракт, установка и пределы](PUBLIC_STATUS_API.md).

30.09: `web/app.js` — EIP-6963 discovery, wallet/account menu, session-scoped restoration, EIP-1193 event handling, permission/network requests только по клику. `web/wallet.test.cjs` (`npm run test:site:wallet`) — 12 адресных сценариев, synthetic providers. Shared wallet-dialog CSS в обеих темах. [Контракт поведения](WEBSITE.md).


29.09: `web/concepts/hk/index.html` и самостоятельный `style.css` — альтернативная композиция сайта. `serve-site.cjs` разрешает два новых static routes; `SITE_TEST_PATH=/concepts/hk/` выбирает вариант в существующих browser tests. Preview Nginx направляет только `/concepts/hk/` на отдельный release; исходный root сохранён. [Детали](WEBSITE.md).


29.09: `web/` + `scripts/serve-site.cjs` — одностраничный pre-launch сайт, read-only wallet API proxy и browser wallet connect. `web/site.test.cjs` — отдельные browser tests. [Состояние/границы](WEBSITE.md).

29.09: `run-indexer-service.cjs` + `indexer-service-child.cjs` — read-only supervisor, health, isolated passes/retry. `ops/rh-promo-indexer.service` — server template; `test/indexer-service.test.cjs` — process recovery. [Runbook](INDEXER_SERVICE.md).

29.09: HTTP использует `createAsyncReader` → `scripts/user-status-worker.cjs`; worker хранит prepared view, main проверяет generation после ответа. Bounded queue/timeout/close, probe `scripts/measure-status-worker.cjs`. [API module](USER_STATUS_API.md).

29.09: `scripts/user-status-api.cjs:createReader` — generation-aware prepared wallet view, HTTP использует его; `walletStatus` остаётся одноразовым replay. `scripts/measure-status-api.cjs` — локальный synthetic benchmark; `test/user-status-cache.test.cjs` — cache/freshness/replacement/outage. Indexer возвращает timing/lag/size metrics. [Границы](USER_STATUS_API.md).

29.09: observeRewards принимает previous/fullAudit, проверяет checkpoint в ветке, продолжает проекцию и читает только touched storage. Indexer отключает reuse при reorg; CLI audit. [Детали](USER_STATUS_API.md).

29.09: reward-observation.cjs — event accounting + исторические draws/reward eth_call; persistent indexer сохраняет результат атомарно вместе с ledger, user-status-api выдаёт paginated wallet rewards. [Семантика и границы](USER_STATUS_API.md). Контракты не менялись.

29.09: user-status-api.cjs — walletStatus/createServer, loopback GET wallet purchases/attempts, без signer/RPC; replayAttempts и проверенный snapshot. persistent-buy-indexer сохраняет observedAt успешных данных. [API/тесты](USER_STATUS_API.md).

29.09: readSnapshot в persistent-buy-indexer + history в local-promo-scheduler подключают сохранённые blocks к прежним replayAttempts/buildFromHistory. INDEXER_WAIT изолирован по kind; frozen не читает cache. nextDelay убирает обычную паузу при catchingUp. [Модуль](PERSISTENT_INDEXER.md).

29.09: persistent-buy-indexer.cjs использует существующие scanner/replay/withState; once/watch, cache и статусы. [Границы и проверки](PERSISTENT_INDEXER.md). Нет интеграции scheduler/сайта, CPU replay пока полный.

29.09: [Операционный профиль](OPERATIONAL_LAUNCH_PROFILE.md):
`operational-profile.cjs` — офлайн genesis/settings + pinned on-chain inspection;
`deployment-admission.cjs` V2 — roles/notice/gas/BUY expectations, V1 помечен incomplete.
`promo-automation.cjs` передаёт ops в normal admission; recovery старых долгов отдельный.
`promo-runtime-handoff.cjs` запрещает V2→V1. Шаблон требует явных значений, CLI без RPC.
`operational-profile.test.cjs` проверяет drift, оба frozen/claims, no-repeat, export/downgrade.
11 адресных сценариев +1catalog; изменённый сценарий перепроверен. Контракты не менялись.
[Пользовательские статусы](USER_STATUS_MODEL.md) — требования к будущему сайту, не готовый API.

29.09: `minimumMonthlyBudget()` фиксирует100000000raw в RobinhoodMonthlyController,
MonthlySettlement откатывает недостаточный бюджет после sync и до RNG; executor
возвращает currentFunding. Public admission проверяет минимум. Short числа сохранены
в launch plan, валидатор ловит drift. `short-launch-analysis.cjs` — точная модель,
`launch-rules.test.cjs` сверяет принятые basket/threshold/outcome с Solidity.
[Пользовательские правила](USER_RULES.md) ещё не подключённый сайт.


29.09: [Monthly V2](MONTHLY_RULES_EPOCHS.md) — `MonthlyOutcome.sol` + независимый
`monthly-outcome.cjs`; общий75/25, один winner с весом e/(e+1), Q128 cumulative selection.
`MonthlySettlement` фиксирует totalWeight при публикации, обрабатывает chunks и проверяет
результат. Dataset verifier и executor пересчитывают V2; public wrapper/admission
требуют новый profile. V1 local/historical алгоритм сохранён, межпоколенческое
announcement запрещено. Vault/RNG/Short math не менялись; public execution закрыто.


28.09 review 50704b7: [разбор funding lock](REHEARSAL_LOCK_INVESTIGATION.md). Сообщённый GPT EEXIST не воспроизведён: Windows baseline + Windows/Linux9p/Linuxext4 с усиленным runner complete, в каждом23/23 lock acquire/release без конфликтов; lock unit9/9. Причина GPT failure НЕ установлена, нужны полный failed JSON и trace. Runner теперь проверяет обе суммы/receipts/уникальность claims и сохраняет failure snapshot; найден и исправлен отдельный ENOENT отсутствующей.local при внешнем output. Lock/runtime/контракты не менялись. Далее сравнить failing trace, затем продолжить release profile/RPC.

28.09: [Составная релизная репетиция](RELEASE_REHEARSAL.md) добавлена: одна команда, матрица accepted/fixture/unresolved, replay сохранённого Infinity BUY → явный импорт 2 билетов → fresh Robinhood runtime, funding 90/5/5, оба draw/BLS/claims, source outage и known-claim restart. Прогон complete за86s: 1805.40 USDG призам =836.033330 выплат +969.366670 остатка; повтор без send. Это НЕ единая live/fork история: BUY saved, datasets/freeze helper, исторический drand; market evidence отдельно. Далее release profile/параметры и RPC, same-chain automatic proof остаётся gate; public sends закрыты.

28.09: [Operations funding](OPS_MARKET_EXECUTOR.md) завершён в согласованном объёме: journaled pay(slot1) получает существующий credit, fee caps/nonce/recovery общие со swap. Старые обязательства получают ETH на одно действие независимо от рынка, сохраняя swap.nativeFloor; новые freeze сохраняют полный forecast. 27 адресных продуктовых сценариев прошли отдельными запусками, не full. Fork credit→swap→refill прошёл; coordinator проверен отдельно. Далее общая релизная репетиция и реальные deployment/RPC параметры, без расширения funding. Public sends закрыты.

28.09: [Ops swap executor](OPS_MARKET_EXECUTOR.md) подключён опционально к PROJECT_NATIVE; общий main journal, отдельный source receipt dispatch, nonce/caps и handoff history. Fork helper→refill пройден; автоматический credit collection и полный watch market e2e ещё впереди.

28.09: [Read-only market quote](OPS_MARKET_QUOTE.md) — pinned CLQuoter, exact router eth_call/estimate, wait reasons, новый fork. [Public admission](DEPLOYMENT_ADMISSION.md) отдельно требует9000/500/500 для новых операций; obligations-only сохранён. Swap sender ещё отсутствует.

28.09: [PROJECT_NATIVE](PROMO_NATIVE_REFILL.md) — pinned slot1 через общий refill journal; отдельного swap executor пока нет. Приняты9000/500/500bps; [USDG→ETH fork proof](OPS_MARKET_PROOF.md) прошёл, production quote/recovery остаются.

28.09: observer обходит child failures/claimFailures/requests; source/beacon waits и rejected actions больше не дают ложный recovered. [Allocation/ETH design](OPS_REVENUE_FUNDING_DESIGN.md) — только проект; collector/refill/swap реализация не менялась.

28.09: [Ожидания и статус](PROMO_OPERATIONAL_WAITS.md): budget compatibility при prepareRuntime,
CLI status journal и события без дублей; status storage не управляет отправками.

28.09: [Bootstrap ETH refill общей автоматики](PROMO_NATIVE_REFILL.md): отдельный EOA →
executor, приоритет frozen/claims, единый pending и receipt accounting, лимиты и cooldown.
Local31337/rehearsal4663; public sends и автоматическая конверсия доли проекта не включены.

19.09.2026. Только состояние компонентов; ближайшая задача и результаты проверок
ведутся в [CURRENT_CONTEXT](CURRENT_CONTEXT.md), порядок работ — [ROADMAP](ROADMAP.md).

| Компонент | Что есть | Ограничение / подробности |
|---|---|---|
| Deployment admission | Offline profile, read-only pin/binding/timing checks, pre-begin/freeze gate и late freshness check | Public execution закрыт; production timing не выбран. [Модуль](DEPLOYMENT_ADMISSION.md) |
| Общая автоматика Short/Monthly | Один signer, общий journal/claims, оба drand consumer и совместный forecast frozen draws | Local31337/loopback; drain + проверяемый handoff после завершения jobs, без смены deployment/BUY policy. [Модуль](PROMO_AUTOMATION.md) |
| FeeRouter | TOKEN/USDG accounting, credits, одноразовый source с проверкой registered position/quote/NFT custody, атомарный rollover | Rollover — граница кампании; source epoch drift блокирует переход. [Отчёт](FEE_ROUTER_ROLLOVER_REPORT.md), [новый native launch proof](NATIVE_LAUNCH_PROOF.md) |
| PromoVault / DualControllerPromoVault | Free Short/Current/Next, funding, reserve/claimable, win/no-win, старые долги, immutable capabilities | Dual — USDG-only. Нет owner withdrawal и замены controllers. [Бухгалтерия](PROMO_VAULT_DESIGN.md), [архитектура](DUAL_CONTROLLER_ARCHITECTURE.md) |
| ParticipantRegistry | Публичный opt-in без backdating | Не доказывает уникальность человека. [Модуль](PARTICIPANT_REGISTRY.md) |
| BUY replay | Direct USDG (включая новый native mode1 fork с admission/registration) + отдельный PAIR V1 AUTO (1–2 legs), полный scan/replay, provenance, carry и nominal 100 USDG за entry | AUTO требует USDG funding и payer=recipient; public activation отсутствует. Не универсальный decoder/daemon. [Границы](DIRECT_BUY_REPLAY.md) |
| Attempts / builders | OPEN/FROZEN/CONSUMED, независимые Short/Monthly epochs, v4, public verification | Snapshot truth не доказывается on-chain. [Lifecycle](ATTEMPT_LIFECYCLE.md), [trust](INDEXER_TRUST_MODEL.md) |
| CutoffHistory | Permissionless authentic hash cache, aged begin/empty; FINALIZED_CHECKPOINT worker | Не finality oracle. [Модель и проверки](CUTOFF_HISTORY.md) |
| Short settlement | Dataset chunks, reserve при seal, один seed, bounded processing, canonical result, atomic finish/consume | Abstract core. [Dataset](SHORT_DATASET_PREPARATION.md), [epochs](SHORT_RULES_EPOCHS.md), [settlement](SHORT_SETTLEMENT.md) |
| Monthly settlement | Chunks, один seed, выбор кандидата, Next/Current переходы, независимые epochs | Abstract core. [Модель](MONTHLY_RULES_EPOCHS.md) |
| Robinhood controllers | Общее execution base, chain4663/drand/checkpoint wrappers; explicit genesis minimumUnit; bytecode22738/17943bytes | Public worker disabled; локальные BLS tests и partial fork, archive/timing/параметры не закрыты. [Модуль](PUBLIC_CONTROLLERS.md) |
| Local controllers | Исполняемые Short/Monthly с общим vault, ролями, async RNG transport | Только chainId 31337, mock provider. [Скелет](LOCAL_CONTROLLER_SKELETON.md) |
| BUY → Short integration | Два цикла из локальных транзакций, публичный verifier, recovery/reorg, claim | Упрощённый venue; не PAIR fork. [Сценарий](LOCAL_BUY_CYCLE.md) |
| Local Short executor | Single-job step/run, publisher/executor, readiness, restart, loopback CLI | Нет нового seed/cutoff, durable mempool journal или production daemon. [Исполнитель](LOCAL_SHORT_EXECUTOR.md) |
| Local Monthly executor | Monthly job из BUY builder, step/run, Next funding, win/no-win/recovery, общий CLI | Общий тест 2 Short + 2 Monthly; нет генератора jobs и production scheduler. [Контур](LOCAL_MONTHLY_EXECUTOR.md) |
| Local scheduler | Scan/replay/build → persisted jobs → Short/Monthly workers; empty epochs и повторные циклы | [Планировщик](LOCAL_PROMO_SCHEDULER.md). LOCAL_HEAD, полный rescan, тестовый RNG; аварийный recovery ограничен |
| ChainBlocks | На Robinhood 4663/46630 использует L2 ArbSys number/hash | Не finality, прочие Nitro сети требуют явного porting. [Границы](ROBINHOOD_BLOCK_SEMANTICS.md) |
| Drand | Реальная BN254 подпись проверена отдельно; binding counterexamples воспроизведены | Local adapter/future-round binding и delivery worker реализованы; production admission/timing ещё открыты. [Worker](DRAND_DELIVERY_WORKER.md), [Verifier](DRAND_FEASIBILITY.md), [binding](DRAND_BINDING_MODEL.md) |
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

26.09: source epoch/claimable transient read failures изолированы до следующего pass;
distribute/conversion продолжаются с degraded report. Contract errors/deficit/unknown
send сохраняют stop, coordinator journal и порядок workers не менялись.

26.09: [PAIR source health](PAIR_SOURCE_HEALTH.md), pair-source-health.cjs и
inspect-pair-source.cjs: independent manifest hash, runtime/implementation/bindings,
coherent read block, source drift отдельно от future launch. Read-only CLI/watch,
проверен на новом native launch fork; не admission/автоматический gate workers.

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

22.09: `scripts/local-coordinator-identity.cjs` используется runtime и `scripts/inspection-manifest.cjs`;
export/verify независимого deployment input и manifest support в inspector CLI.
Границы доверия и команды: [inspector](LOCAL_NATIVE_REFILL_INSPECTOR.md).

22.09: `scripts/review-runner.cjs`, `test/review-runner.test.cjs`, `npm run test:review` —
[изолированный review HEAD](REVIEW_TESTING.md), без изменения продуктового runtime.

23.09: общий coordinator identity builder канонизирует roles; точные pre-fix casing
кандидаты используются штатной migration с прежними pending и refill history guards.

23.09: test-launcher/test-artifact/test-profiles/test-timing-reporter — именованные
группы, свежая общая компиляция, строгий loader и per-file timing. Review runner
поддерживает группы/regex и сохраняет структурированные отчёты вне удаляемого worktree.

### Watch RPC recovery (23.09)

`scripts/local-rpc-watch.cjs` + `run-local-coordinator.cjs`: transport allowlist,
bounded backoff, known receipt polling, SIGINT/SIGTERM. Worker catches сохраняют
классификацию read errors; journal/send guards прежние. `test/local-rpc-watch.test.cjs`
и coordinator regressions; отдельный `watch` профиль не компилирует Solidity.
Границы/команды: [coordinator](LOCAL_PROMO_COORDINATOR.md).

23.09: direct-buy.cjs поддерживает opt-in scheduled routes и 0x060c0f,
validateRouteExtensionCandidate проверяет append-only расширение. Production rollout не подключён.
Подробности и проверки — [DIRECT_BUY_REPLAY](DIRECT_BUY_REPLAY.md).

Review 132b6af: миграция BUY manifest при исторических FREEZE не поддержана.
validateRouteExtensionCandidate проверяет лишь форму; v2 — для нового экземпляра.

24.09: buyPolicyHistory/direct-buy и cutoff domain/attempt-lifecycle поддерживают
историю manifests; старые FREEZE/EMPTY/TERMINAL сохраняются.

24.09, текущая цепочка: contracts/BuyPolicySource.sol публикует typed adapter ids
и future activation; buy-policy-format.cjs восстанавливает manifest.
buy-policy-admission.cjs проверяет immutable bindings, schema/genesis adapters,
полную commitment chain и finalized provenance; неизвестная версия запрещена
на/после activation, старый cutoff доступен. publish-buy-policy.cjs и
run-buy-policy-publication.cjs сохраняют preflight/journal, ABI обновлён.
buy-policy-runtime.cjs различает admitted/unadmitted; replay CLI/verifiers
показывают policyStatus. Scheduler проверяет jobs по их cutoff до новой политики.
[Границы и протокол](BUY_POLICY_ADMISSION.md). Новые routers/BUY формы не добавлены.

24.09: local-promo-scheduler.cjs — общий datasetInput для создания/перепроверки
request; перед первым begin полный RPC replay на cutoff, policy из контракта,
сверка всего artifact и proposal id. Никакого persisted verification flag;
начатые jobs проверяются workers против chain commitments.
[Пределы защиты](LOCAL_PROMO_SCHEDULER.md).

24.09: direct-buy.cjs добавил rh-ur-0a10-060b0e-v1 (PermitSingle + direct USDG BUY),
buy-policy-format.cjs знает новый id. replay-direct-buy.cjs проверяет фиксированный
Permit2 runtime на активном cutoff; старые cutoff не получают новую зависимость.
Локальные publication/replay проверены; production activation отсутствует.
[Точные границы и проверки](DIRECT_BUY_REPLAY.md#permit2-buy-adapter-24092026).

24.09: permit-buy-fork.cjs --integration вызывает permit-buy-integration.cjs:
реальный BUY на fork → typed admission → штатный scheduler → begin/publish.
Coherent budget tamper отвергается pre-begin replay до send. Production modules
не менялись; [evidence, воспроизведение и ограничения](PERMIT_BUY_INTEGRATION.md).

24.09: permit-buy-fork.cjs --source + fee-source-integration.cjs проверяют source
collect/claim и FeeRouter bind/harvest/rollover/pay на настоящем reference vault.
Штатная смена recipient только при LOCAL controller impersonation. FeeRouter.sol
не менялся. [Точные допущения и данные](FEE_SOURCE_INTEGRATION.md).

24.09: LocalScheduledPrizeConverter + IPrizePriceSource — новое локальное поколение:
timelocked adapter replacement, immutable price/destination bounds, expected route version.
Price fixture только в test/contracts; 9/9 converter scenarios. Старый converter и
prize-flow worker не изменены. [API, trust и открытые зависимости](SCHEDULED_PRIZE_CONVERTER.md).

24.09: [Short conversion trigger](CONVERSION_TRIGGER.md) — pure planner
scripts/short-conversion-trigger.cjs, 4/4 unit. Не подключён к prize-flow worker.

25.09: LocalMarketPrizeConverter и opt-in market-v1 в existing local-prize-flow:
trusted executor, positive minOut, exact deltas, TOKEN bucket, delayed route replacement.
Short forecast больше не блокирует продажи до target. [Модуль](CONVERSION_TRIGGER.md).
getSwapQuote — injected trusted boundary, реального provider/CLI wiring пока нет.

25.09: LocalV4PrizeAdapter, v4-market-quote.cjs и auto wiring в prize-flow через
job.marketQuote (в descriptor). Converter convert возвращает actual amountOut для
eth_call. CLI/coordinator используют общий путь; [fork и пределы](V4_MARKET_EXECUTION.md).

27.09: [Infinity3% fork proof](INFINITY_INTEGRATION_RESEARCH.md): новый TOKEN/USDG,
BUY/SELL, permissionless pull в local receiver; scripts/infinity-launch-fork.cjs.
Текущий FeeRouter не совместим с Creator Vault ABI; production collector ещё не реализован.

27.09: [InfinityCollector](INFINITY_COLLECTOR.md) — USDG-only standalone source bind,
policy fingerprint/counters, campaign accounting, atomic rollover и fixed Promo pay+sync.
Новый fork reaches GENERAL; отдельный production worker ещё не подключён. V2 не менялся.

27.09: [Infinity worker](INFINITY_WORKER.md): bounded pass + CLI/watch, pinned local job,
existing durable journal/locks, legacy witnesses, source lane isolation, gas/native waits.
Fork worker автоматически funded GENERAL; mainnet/coordinator/shared budget ещё отдельно.

27.09: `scripts/infinity-buy.cjs` — новый exact-input decoder/net debit; `direct-buy.cjs` — explicit automatic genesis. `replay-direct-buy.cjs` проверяет historical Infinity runtime; `buy-policy-format.cjs` знает genesis adapter id. `infinity-buy-integration.cjs` + fork `--entries`: actual refunded BUY → admission → scheduler begin/publish. Тесты `infinity-buy*.test.cjs`; [границы](INFINITY_BUY.md). Контракты не менялись.

27.09: `DrandRandomAdapter.sol` + pinned `contracts/vendor/drand`: real BLS request/prove/deliver без owner. `drand-preflight.cjs`/`drand-timing-readiness.cjs` подключены к Short/Monthly workers перед freeze; ready не доказывает finality. `rng-timing-observe.cjs` read-only. `drand-adapter.test.cjs` проверяет оба local controllers, claim и no-win с historical proof. [Детали и раздельные результаты](DRAND_ADAPTER.md). [Автоматический delivery worker](DRAND_DELIVERY_WORKER.md) добавлен: `drand-delivery-worker.cjs`, `run-drand-delivery.cjs`, два новых test files. Только31337/loopback; общий coordinator и production admission отдельно.

27.09: `infinity-launch-fork.cjs --payout` + `infinity-payout-integration.cjs` связывают fees/entries/drand/Short/claim в одном vault. Только test harness, ускоренный constructor clock и test timing, не новый production coordinator. `short-dataset.cjs`, `monthly-dataset.cjs`, `short-settlement.cjs` ограничивают публикации cutoff+1. [Прогон и ограничения](INFINITY_PAYOUT_PROOF.md).

27.09: `short-automation.cjs`/`run-short-automation.cjs` — local continuous Short funding/RNG/settlement/claim, durable event-discovered payouts и pre-seal native forecast. Старый V2 coordinator не заменён. Infinity/drand получили reconcile-only и общий guard; scheduler — выбор kinds/запрет новых jobs. [Проверки/границы](SHORT_AUTOMATION.md).

## RPC qualification 28.09

`scripts/public-rpc-qualification.cjs`: bounded read-only state/block/receipt/log probe,
fresh-process comparison и optional `scanWithRpc`/replay.
`scripts/public-infinity-reference-search.cjs`: bounded reference discovery.
`test/public-rpc-qualification.test.cjs`, profile `public-rpc` без compile.
[Результаты и ограничения](PUBLIC_RPC_QUALIFICATION.md); public execution не открыт.

## Robinhood runtime 28.09

`runtime-network.cjs` — явный async context сети, локальный default, public no-send
и Hardhat4663 rehearsal. `robinhood-automation.cjs` и `run-robinhood-automation.cjs` —
отдельный вход к существующим funding/drand/scheduler/executors/claims; без копии journal.
`robinhood-*` schemas, pinned deployment admission, transient RPC wait, explicit chainId.
`test/robinhood-runtime*.test.cjs`, profile `robinhood-runtime`.
[Проверки и оставшиеся границы](ROBINHOOD_RUNTIME.md); публичные отправки закрыты.

## Recovery admission28.09

`obligation-admission.cjs` — критические pins/bindings без revenue/BUY policy/publisher.
`promo-automation.cjs` — reconciliation-first, obligations-only, финальный action gate
и simulated source health; `local-promo-scheduler.cjs` — frozen commitments без повторного
BUY policy admission, строгий фильтр unfrozen jobs. `test/robinhood-recovery.test.cjs`,
profile `robinhood-recovery`. [Границы и проверки](RECOVERY_ADMISSION.md).

## Release profile report28.09

`scripts/public-launch-plan.cjs`: фиксированный список обязательных полей,
классификация источника решения, сверка принятых значений и честный статус
provided-not-verified. Не admission и не deployment tool. Два новых сценария в
`test/public-launch-checks.test.cjs`; [детали](PUBLIC_CONTROLLERS.md).

## Численный кандидат Infinity28.09

`scripts/infinity-product-model.py` — отдельный offline расчёт, использует существующий
`mvp-calendar-model.py`/`short_model.py`, переопределяет старую ставку, cumulative90/5/5,
Short cap и minimum Current.160 прогонов/38400шагов; не production budget executor.
[Параметры и выявленные пробелы](MVP_ECONOMIC_PROFILE.md). Контракты/config не менялись.

## FREE_SHORT28.09

`local-promo-scheduler.cjs` поддерживает opt-in FREE_SHORT без fixed shortBudget:
исторический freeShort, проверка совместимости maxBudget, readiness и replay бюджета.
Тесты в `local-scheduler.test.cjs`; [граница](LOCAL_PROMO_SCHEDULER.md).
Monthly75/25 внесён только в planning/product, не в контракт: выбор веса ещё открыт.

28.09: `local-promo-scheduler.cjs` обновляет unused FREE_SHORT cutoff при достаточном
новом finalized funding. `cutoff-scheduler.test.cjs` покрывает ожидание/пополнение/
финальность/reload/freeze/settlement;9 адресных сценариев passed. [Подробности](CUTOFF_HISTORY.md).
