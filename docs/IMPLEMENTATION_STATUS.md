# Карта реализации

Состояние 03.10.2026. Карта тестового контура; не перечень публично развёрнутых сервисов.
История реализаций/замеров сохранена [целиком](archive/context-2026-10-02/docs/IMPLEMENTATION_STATUS.md).
Последовательность работ — [ROADMAP](ROADMAP.md), продукт — [PRODUCT_SPEC](PRODUCT_SPEC.md).

| Модуль | Основной код | Что есть / граница |
|---|---|---|
| Deployment handoff | scripts/pons-launch-preflight.cjs, deployment-signing-plan.cjs, deployment-immutable-layout.cjs, deployment-prefix-evidence.cjs, deployment-signing-queue.cjs, deployment-console.cjs | [Подготовка3A](PONS_PREFLIGHT_HANDOFF_2026-10-03.md): read-only preflight,6 CREATE/MetaMask queue, receipt timestamp/runtime checks; первые6 CREATE подтверждены |
| Launch continuation | scripts/deployment-continuation.cjs, deployment-policy-runtime.cjs, deployment-continuation-rehearsal.cjs | [Очередь](PONS_CONTINUATION_QUEUE_2026-10-03.md):4 ручные подписи, genesis по реальному launch receipt, полная сверка policy runtime, CALL/value и restart; ожидает публичных подписей |
| Off-server pull | ops/pull-backups.ps1, ops/backup-public.sh | [Windows hourly task](PONS_PREFLIGHT_HANDOFF_2026-10-03.md), complete archive + SHA256; signed-in Windows required |
| Operations wrapper | scripts/ops-session.cjs, ops-backup.cjs, service-credentials.cjs, ops-notify.cjs, verify-runtime-release.cjs, ops/*.service | [Public preparation](PONS_OPERATIONS_PACKAGE_2026-10-03.md): credentials, disabled/gated units, Telegram adapter, offline restore; financial activation и реальная доставка отдельно |
| Exact deployment rehearsal | scripts/pons-exact-deployment-rehearsal.cjs, config/pons-deployment-candidate.json | [Пакет10tx](PONS_DEPLOYMENT_PACKAGE_2026-10-03.md), обычные конструкторы, раздельные роли, early BUY/index/funding; unsigned fork evidence, не broadcaster; --resume-prefix продолжает реальные6 CREATE с исходным salt |
| Pons public execution | scripts/pons-public-execution.cjs, run-pons-public.cjs, pons-automation.cjs | [Отдельный режим](PONS_PUBLIC_EXECUTION_2026-10-03.md), общий journal/gas, раздельный new-work/drain; [release-репетиция](PONS_RELEASE_REHEARSAL_2026-10-03.md) PASS на local fork; scripts/pons-public-release-rehearsal.cjs; production deployment отдельно |
| Dependency inventory | scripts/inspect-pons-dependencies.cjs | [Read-only slots/runtime/roles](PONS_EXTERNAL_DEPENDENCIES.md); USDG implementation закреплён в public profile и obligations guard |
| Pons public inspection | scripts/pons-public-profile.cjs, inspect-pons-public.cjs | [Read-only profile](PONS_PUBLIC_PROFILE_2026-10-03.md), config/roles/runtime/timing; отчёт сам по себе не разрешает отправки |
| Runtime package | scripts/build-runtime.cjs, runtime-artifact.cjs, pons-deployment-config.cjs, check-runtime.cjs | [Изолированная сборка](RUNTIME_PACKAGE_2026-10-03.md), strict artifact loader, единый rehearsal export; публичный executor не включён |
| Scheduler state / capacity probe | scripts/local-promo-scheduler.cjs, benchmark-pons-coordinator.cjs, benchmark-scheduler-storage.cjs, benchmark-scheduler-load.cjs | Запись job только при изменении; [общий scheduler10k с Pons journal/gas](SCHEDULER_LOAD_2026-10-03.md): synthetic31337, отдельный process resume, stale-file restore; внешний Pons loop — [малый fork](COORDINATOR_CAPACITY_2026-10-03.md); [cold restart без истории](PUBLICATION_HISTORY_RECOVERY_2026-10-03.md) — fault-режим того же стенда |
| Pons BUY profiles | scripts/pons-profiles.cjs, pons-curve-buy.cjs, pons-v4-buy.cjs, pons-batch-route.cjs, pons-launch-buy.cjs, pons-pool-batch-buy.cjs, pons-zeroex-buy.cjs, pons-entrypoint-buy.cjs | Отдельные genesis-профили; launch-v4 включает v3 и узкую EntryPoint/Alchemy USDG покупку. [Матрица](PONS_CHANNEL_COVERAGE.md) |
| Replay и policy | scripts/direct-buy.cjs, replay-direct-buy.cjs, pons-bloom-evidence.cjs, buy-policy-*.cjs; contracts/BuyPolicySource.sol | Полный provenance кандидатов, hash-bound absence headers Pons; отдельная проверка omission в BUY/lifecycle/rewards. Versioned admission, неизвестные маршруты не допускаются. [Ремонт04.10](PONS_INDEXER_HOTFIX_2026-10-04.md), [Policy](BUY_POLICY_ADMISSION.md) |
| Постоянный индекс | scripts/persistent-buy-indexer.cjs, local-scheduler-state.cjs | Suffix scan/replay checkpoints, полный rollback/audit, bounded cache, компактный SHA-256 snapshot с legacy read; запись/consumer replay ещё O(history). [Пакет](INDEXER_CHECKPOINTS_2026-10-02.md), scripts/benchmark-indexer-history.cjs, indexer-checksum.cjs; scripts/benchmark-pons-admitted.cjs — [admitted load/API/restore](PONS_ADMITTED_LOAD_2026-10-03.md) |
| Shared config | scripts/shared-index-config.cjs | Один writer и согласованные API/coordinator identities. [Модуль](SHARED_INDEX_CONFIG.md) |
| Билеты и snapshots | scripts/attempt-lifecycle.cjs, builders/verifiers; contracts/ParticipantRegistry.sol для legacy | Независимые Short/Monthly open/frozen/consumed; registry не требование нового Pons genesis. [Lifecycle](ATTEMPT_LIFECYCLE.md), [trust](INDEXER_TRUST_MODEL.md) |
| Проверка набора draw | scripts/verified-draw-cache.cjs, local-short-executor.cjs, local-monthly-executor.cjs | Private proof на provider/kind, pinned publication, live progress/chunk hash, independent finish; scheduler сохраняет active proof при обходе старых jobs. [Границы и проверки](VERIFIED_DRAW_EXECUTION_2026-10-03.md) |
| Pons funding | contracts/LocalPonsCollector.sol, IPonsVenue.sol; scripts/pons-collector-manual.cjs, pons-funding-pass.cjs | Доступный USDG → credits 90/5/5 → vault; ожидание источника отдельно от существующих выплат. [Коллектор](PONS_COLLECTOR.md) |
| Казна и draws | contracts/DualControllerPromoVault.sol, RobinhoodShortController.sol, RobinhoodMonthlyController.sol и bases | Резервы, settlement/claims; интегрированы локально. [Архитектура](DUAL_CONTROLLER_ARCHITECTURE.md), [цикл](PONS_INDEXED_CYCLE.md) |
| RNG и cutoff | contracts/DrandRandomAdapter.sol; scripts/drand-delivery-worker.cjs; CutoffHistory | Один round/result, journal, checkpoint; реальные timing/finality отдельно. [Worker](DRAND_DELIVERY_WORKER.md), [cutoff](CUTOFF_HISTORY.md) |
| Координатор | scripts/pons-automation.cjs, run-pons-automation.cjs, pons-cadence.cjs, pons-transaction-journal.cjs, pons-gas-budget.cjs, local-promo-scheduler.cjs | Funding/scheduler/claims, pending journal, recovery/drain, local-only; газ ближайшей tx, schedule до admission. [Модуль](PONS_AUTOMATION.md), [ожидание ETH](PONS_EXECUTION_READINESS.md), [паузы и лимиты](PONS_CADENCE_2026-10-03.md) |
| API / сервис | scripts/user-status-api.cjs, user-status-worker.cjs, public-observation.cjs, public-status.cjs, run-indexer-service.cjs | verified-buy-replay.cjs: собственный проверенный BUY-prefix API в памяти; полный lifecycle. [Замер](API_VERIFIED_REPLAY_2026-10-03.md). Проверенный snapshot, свежесть/покупки/билеты/rewards; тестовый shared path. [API](USER_STATUS_API.md), [проекция](PUBLIC_STATUS_API.md) |
| Сайт / кошелёк | web/, web/concepts/hk/, web/purchase-demo/; scripts/pons-direct-purchase.cjs, pons-browser-bridge.cjs | web/claim.js: pinned local Claim, общий lock journal/check/send, проверка recovery hash; scripts/site-wallet-rehearsal.cjs: локальный RPC/стенд для расширения; внешний Buy, покупки в кабинете. [Пакет](WEBSITE_WALLET_ACTIONS.md); ручной MetaMask проверен; scripts/verify-wallet-browser.cjs проверяет настоящий API/кабинет до и после indexed cycle. [Сквозной отчёт](PONS_WALLET_CYCLE.md). [Сайт](WEBSITE.md), [bridge](PONS_BROWSER_BRIDGE.md) |
| Гипотеза роста (не runtime) | scripts/experiments/segmented-history.cjs | Изолированный storage prototype до5млн64-byte строк; не BUY replay. [План и границы](STORAGE_GROWTH_PLAN_2026-10-03.md) |
| Fork/harness | scripts/pons-*-fork.cjs, pons-*-rehearsal.cjs, verify-pons-wallet-api.cjs; rehearsal-backup.cjs | `pons-joint-load.cjs` / `--joint-load`: [128 дополнительных кошельков: BUY/index/API/draw/restore PASS](PONS_JOINT_REHEARSAL_2026-10-03.md). --restore-drill: [backup старых journals → сверка с продвинувшейся цепочкой](PONS_RESTORE_CYCLE_2026-10-03.md). Только тестовые инструменты; synthetic funding/finality/clock должны называться в отчёте |
| EntryPoint / account proof | scripts/pons-entrypoint-codec.cjs, pons-entrypoint-buy.cjs, pons-entrypoint-rehearsal.cjs; replay-direct-buy.cjs | Signed local fork, parent delegation, одна операция, account вместо bundler; [границы](PONS_ENTRYPOINT_POOL_ADMISSION.md) |
| 0x execution / admission | scripts/pons-zeroex-fork.cjs, pons-zeroex-buy.cjs, pons-zeroex-evidence.cjs | Direct holder BUY до index/API; source/runtime/fees, sender-only отказы; прочие оболочки отдельно. [Границы и проверки](PONS_ZEROEX_POOL_ADMISSION.md) |
| Резерв PAIR/Infinity | config/reserve/, прежние PAIR/Infinity adapters и FeeRouter | Сохранённые реализации и evidence; не Pons runtime. [Граница](ACTIVE_RELEASE_PATH.md) |

## Проверки и доказательства

- Текущие адресные исправления: [газ, scanner и CLI verifier](PONS_EXECUTION_READINESS.md).
- Предыдущий пакет: [аудит02.10](PONS_AUDIT_2026-10-02.md), 239/239 расширенных tests;
  отдельный fixture 4/4. Рабочее дерево поверх b9b7e04; не полный RC baseline.
- Fresh local fork78099955: четыре pool terminal ветки до policy/index/API.
  [Evidence](evidence/PONS_POOL_BATCH_INDEX_API_2026-10-02.json).
- Предыдущий полный локальный indexed draw cycle: [отчёт](PONS_INDEXED_CYCLE.md).
  Он не переобъявляется прогоном нового adapter.
- Группы/команды: [REVIEW_TESTING](REVIEW_TESTING.md), scripts/test-profiles.json.
  Docs-only не требует продуктовых тестов; результаты разных запусков не суммировать.

Все специальные legacy/API/исследовательские документы доступны в [каталоге](DOCUMENT_CATALOG.md).

Исследование предела draw: scripts/benchmark-draw-worker.cjs — измерение двух реальных шагов каждого исполнителя; [повторный обход dataset](DRAW_CAPACITY_FOLLOWUP_2026-10-03.md). scripts/benchmark-draw-capacity.cjs — отдельный локальный harness Short/Monthly, уникальные адреса, gas/calldata и независимая сверка результатов. [Результат и ограничения](DRAW_CAPACITY_2026-10-03.md). Runtime не менялся.

Отказы/задержки: `scripts/pons-delay-status.cjs` объясняет CLI result без изменения
исполнения; `verify-wallet-reward-completeness.cjs` сверяет все награды API с raw
vault events. [Проверки и границы](PONS_FAILURE_READINESS_2026-10-03.md).

Legacy RPC transaction evidence: scripts/transaction-chain.cjs проверяет подпись/hash/from
при отсутствующем chainId type0/v27-28; direct-buy использует его до admission.
[Проверки04.10](PONS_LEGACY_INDEXER_FIX_2026-10-04.md).
