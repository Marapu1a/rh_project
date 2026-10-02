# Карта реализации

Состояние 02.10.2026. Карта тестового контура; не перечень публично развёрнутых сервисов.
История реализаций/замеров сохранена [целиком](archive/context-2026-10-02/docs/IMPLEMENTATION_STATUS.md).
Последовательность работ — [ROADMAP](ROADMAP.md), продукт — [PRODUCT_SPEC](PRODUCT_SPEC.md).

| Модуль | Основной код | Что есть / граница |
|---|---|---|
| Pons BUY profiles | scripts/pons-profiles.cjs, pons-curve-buy.cjs, pons-v4-buy.cjs, pons-batch-route.cjs, pons-launch-buy.cjs, pons-pool-batch-buy.cjs | Отдельные genesis-профили; новый launch-v2 включает точные pool batches. [Матрица](PONS_CHANNEL_COVERAGE.md) |
| Replay и policy | scripts/direct-buy.cjs, replay-direct-buy.cjs, buy-policy-*.cjs; contracts/BuyPolicySource.sol | Полный provenance, versioned admission; неизвестные маршруты не допускаются. [Policy](BUY_POLICY_ADMISSION.md) |
| Постоянный индекс | scripts/persistent-buy-indexer.cjs, local-scheduler-state.cjs | Новый suffix, canonical rollback/cache, idle reuse и engine revision; snapshot и новый replay ещё O(history). [Последняя проверка](PONS_AUDIT_2026-10-02.md) |
| Shared config | scripts/shared-index-config.cjs | Один writer и согласованные API/coordinator identities. [Модуль](SHARED_INDEX_CONFIG.md) |
| Билеты и snapshots | scripts/attempt-lifecycle.cjs, builders/verifiers; contracts/ParticipantRegistry.sol для legacy | Независимые Short/Monthly open/frozen/consumed; registry не требование нового Pons genesis. [Lifecycle](ATTEMPT_LIFECYCLE.md), [trust](INDEXER_TRUST_MODEL.md) |
| Pons funding | contracts/LocalPonsCollector.sol, IPonsVenue.sol; scripts/pons-collector-manual.cjs, pons-funding-pass.cjs | Доступный USDG → credits 90/5/5 → vault; ожидание источника отдельно от существующих выплат. [Коллектор](PONS_COLLECTOR.md) |
| Казна и draws | contracts/DualControllerPromoVault.sol, RobinhoodShortController.sol, RobinhoodMonthlyController.sol и bases | Резервы, settlement/claims; интегрированы локально. [Архитектура](DUAL_CONTROLLER_ARCHITECTURE.md), [цикл](PONS_INDEXED_CYCLE.md) |
| RNG и cutoff | contracts/DrandRandomAdapter.sol; scripts/drand-delivery-worker.cjs; CutoffHistory | Один round/result, journal, checkpoint; реальные timing/finality отдельно. [Worker](DRAND_DELIVERY_WORKER.md), [cutoff](CUTOFF_HISTORY.md) |
| Координатор | scripts/pons-automation.cjs, run-pons-automation.cjs, pons-transaction-journal.cjs, pons-gas-budget.cjs, local-promo-scheduler.cjs | Funding/scheduler/claims, pending journal, recovery/drain, local-only; газ ближайшей tx, schedule до admission. [Модуль](PONS_AUTOMATION.md), [ожидание ETH](PONS_EXECUTION_READINESS.md) |
| API / сервис | scripts/user-status-api.cjs, user-status-worker.cjs, public-observation.cjs, public-status.cjs, run-indexer-service.cjs | Проверенный snapshot, свежесть/покупки/билеты/rewards; тестовый shared path. [API](USER_STATUS_API.md), [проекция](PUBLIC_STATUS_API.md) |
| Сайт / кошелёк | web/, web/concepts/hk/, web/purchase-demo/; scripts/pons-direct-purchase.cjs, pons-browser-bridge.cjs | Сайт/подключение и локальная purchase rehearsal; реальный полный Buy/Claim ещё отдельная задача. [Сайт](WEBSITE.md), [bridge](PONS_BROWSER_BRIDGE.md) |
| Fork/harness | scripts/pons-*-fork.cjs, pons-*-rehearsal.cjs, verify-pons-wallet-api.cjs | Только тестовые инструменты; synthetic funding/finality/clock должны называться в отчёте |
| 0x execution diagnostics | scripts/pons-zeroex-fork.cjs, pons-zeroex-evidence.cjs | Три локальных обмена; различает wallet debit, посредника и целевой pool. Не eligibility adapter. [Доказательства](PONS_ZEROEX_EXECUTION.md) |
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
