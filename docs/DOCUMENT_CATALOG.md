# Каталог документов

Срез02.10.2026. Для ежедневной работы — [CURRENT_CONTEXT](CURRENT_CONTEXT.md),
не этот полный перечень. Файл модуля может содержать датированные эксперименты:
их PASS/ограничения относятся к указанной ревизии. Текущий порядок только в [ROADMAP](ROADMAP.md).

## Основные документы

| Документ | Назначение |
|---|---|
| [ARTIFACTS](ARTIFACTS.md) | Evidence, логи и история |
| [CURRENT_CONTEXT](CURRENT_CONTEXT.md) | Текущий контекст |
| [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md) | Карта реализации |
| [PRELAUNCH_VERIFICATION_PLAN](PRELAUNCH_VERIFICATION_PLAN.md) | Полная проверка перед запуском QIANQI |
| [PRODUCT_SPEC](PRODUCT_SPEC.md) | Promo — актуальные продуктовые правила |
| [README](README.md) | Навигация по документации |
| [REVIEW_TESTING](REVIEW_TESTING.md) | Каноническая локальная проверка |
| [ROADMAP](ROADMAP.md) | План до первого публичного запуска |

## Замеры индексатора

- [Checkpoint replay и компактный снимок](INDEXER_CHECKPOINTS_2026-10-02.md) — второй пакет, совместимость readers и измерения.

- [Рост истории: cache, restart, replay](INDEXER_HISTORY_SCALING_2026-10-02.md) — synthetic before/after и границы A4.

## Pons: модули и датированные доказательства

| Документ | Назначение |
|---|---|
| [ACTIVE_RELEASE_PATH](ACTIVE_RELEASE_PATH.md) | Активный путь Pons и резерв PAIR |
| [PONS_AUDIT_2026-10-02](PONS_AUDIT_2026-10-02.md) | Pons: пакетные покупки и проверка подготовленного контура |
| [PONS_AUTOMATION](PONS_AUTOMATION.md) | Pons: локальный постоянный исполнитель |
| [PONS_BATCH_ATTRIBUTION](PONS_BATCH_ATTRIBUTION.md) | Pons: роли в batch и непрямых покупках |
| [PONS_BROWSER_BRIDGE](PONS_BROWSER_BRIDGE.md) | Browser → local fork purchase |
| [PONS_BUY](PONS_BUY.md) | Pons: покупки на кривой |
| [PONS_CHANNEL_COVERAGE](PONS_CHANNEL_COVERAGE.md) | G10 — охват торговых маршрутов Pons |
| [PONS_GRADUATION_TRIAGE_2026-10-02](PONS_GRADUATION_TRIAGE_2026-10-02.md) | Сверка двух ответов GPT: границы proof и следующий EOA USDG BUY |
| [PONS_GRADUATION_REVIEW_2026-10-02](PONS_GRADUATION_REVIEW_2026-10-02.md) | Graduation: реальные маршруты Harmonic/PRIORS, hook fees, claim и границы учёта |
| [PONS_COLLECTOR](PONS_COLLECTOR.md) | Pons: локальный сбор комиссий и ручное исполнение |
| [PONS_DIRECT_PURCHASE](PONS_DIRECT_PURCHASE.md) | Прямой USDG BUY — локальный прототип |
| [PONS_EXECUTION_READINESS](PONS_EXECUTION_READINESS.md) | Газ ближайшего действия, ожидание ETH и исправления review |
| [PONS_INDEXED_COORDINATOR](PONS_INDEXED_COORDINATOR.md) | Pons: допуск политики и сохранённый индекс |
| [PONS_INDEXED_CYCLE](PONS_INDEXED_CYCLE.md) | Сквозной Pons coordinator с сохранённым индексом |
| [PONS_LAUNCH_PROFILE](PONS_LAUNCH_PROFILE.md) | Общий профиль покупок Pons |
| [PONS_PERSISTENT_INDEXER](PONS_PERSISTENT_INDEXER.md) | Постоянный BUY indexer Pons |
| [PONS_POOL_TERMINAL](PONS_POOL_TERMINAL.md) | Pons terminal: покупки после graduation |
| [PONS_PROMO_CYCLE](PONS_PROMO_CYCLE.md) | Pons: локальный цикл Promo |
| [PONS_PURCHASE_UI](PONS_PURCHASE_UI.md) | Локальный интерфейс покупки |
| [PONS_UI_ROUTING](PONS_UI_ROUTING.md) | Pons UI routing — 01.10.2026 |
| [PONS_V4_BUY](PONS_V4_BUY.md) | Pons: учёт curve и v4 BUY |
| [PONS_ENTRYPOINT_POOL_ADMISSION](PONS_ENTRYPOINT_POOL_ADMISSION.md) | Signed Alchemy 7702/UserOperation, genesis v4, parent delegation и index/API |
| [PONS_ZEROEX_POOL_ADMISSION](PONS_ZEROEX_POOL_ADMISSION.md) | Узкий 0x USDG pool BUY: fork proof, genesis v3, policy/index/API и ограничения |
| [PONS_ZEROEX_EXECUTION](PONS_ZEROEX_EXECUTION.md) | Реальные 0x calldata на fork: атрибуция, комиссии и split вне Pons pool |
| [SHARED_INDEX_CONFIG](SHARED_INDEX_CONFIG.md) | Общий индекс для Pons, координатора и API |

## Общее ядро, API, UI и вспомогательные модули

Ранние local-* документы описывают свой компонент/стенд, а не весь сегодняшний
Pons. Сводную актуальную связь даёт [карта реализации](IMPLEMENTATION_STATUS.md).

| Документ | Назначение |
|---|---|
| [ATTEMPT_LIFECYCLE](ATTEMPT_LIFECYCLE.md) | Попытки: доступно, заморожено, использовано |
| [BUY_POLICY_ADMISSION](BUY_POLICY_ADMISSION.md) | BUY policy: типизированные расширения и admission |
| [CUTOFF_HISTORY](CUTOFF_HISTORY.md) | Cutoff history: ранняя запись, поздняя подготовка |
| [DIRECT_BUY_REPLAY](DIRECT_BUY_REPLAY.md) | Direct BUY → билеты: decoder и replay v1 |
| [DRAND_ADAPTER](DRAND_ADAPTER.md) | Drand adapter и операционная проверка перед freeze |
| [DRAND_BINDING_MODEL](DRAND_BINDING_MODEL.md) | Drand timing/binding: локальная модель и контрпримеры |
| [DRAND_DELIVERY_WORKER](DRAND_DELIVERY_WORKER.md) | Автоматическая доставка drand |
| [DRAND_FEASIBILITY](DRAND_FEASIBILITY.md) | Drand evmnet: проверка подписи и стоимость |
| [DUAL_CONTROLLER_ARCHITECTURE](DUAL_CONTROLLER_ARCHITECTURE.md) | Два фиксированных контроллера — 17.09.2026 |
| [INDEXER_SERVICE](INDEXER_SERVICE.md) | Постоянный read-only сервис indexer/API |
| [INDEXER_TRUST_MODEL](INDEXER_TRUST_MODEL.md) | Собственный indexer: публичная проверяемость |
| [LOCAL_BUY_CYCLE](LOCAL_BUY_CYCLE.md) | Покупка → билеты → Short → следующий цикл |
| [LOCAL_CONTROLLER_SKELETON](LOCAL_CONTROLLER_SKELETON.md) | Локальный скелет контроллеров |
| [LOCAL_EXECUTION_BUDGET](LOCAL_EXECUTION_BUDGET.md) | Локальный эксплуатационный бюджет |
| [LOCAL_EXECUTION_CALIBRATION](LOCAL_EXECUTION_CALIBRATION.md) | Локальная калибровка execution gas |
| [LOCAL_MONTHLY_EXECUTOR](LOCAL_MONTHLY_EXECUTOR.md) | Локальный Monthly executor и совместный BUY-контур |
| [LOCAL_NATIVE_REFILL](LOCAL_NATIVE_REFILL.md) | Local native refill planner |
| [LOCAL_NATIVE_REFILL_INSPECTOR](LOCAL_NATIVE_REFILL_INSPECTOR.md) | Read-only native refill inspector |
| [LOCAL_NATIVE_REFILL_RECOVERY](LOCAL_NATIVE_REFILL_RECOVERY.md) | Проверка отказов и восстановления native refill |
| [LOCAL_PRIZE_CONVERTER](LOCAL_PRIZE_CONVERTER.md) | Локальный призовой конвертер |
| [LOCAL_PRIZE_FLOW](LOCAL_PRIZE_FLOW.md) | Автоматический локальный prize flow |
| [LOCAL_PROMO_COORDINATOR](LOCAL_PROMO_COORDINATOR.md) | Локальный coordinator |
| [LOCAL_PROMO_SCHEDULER](LOCAL_PROMO_SCHEDULER.md) | Локальный планировщик Short и Monthly |
| [LOCAL_REVIEW_AND_PORTABILITY](LOCAL_REVIEW_AND_PORTABILITY.md) | Самопроверка и переносимость |
| [LOCAL_SHORT_EXECUTOR](LOCAL_SHORT_EXECUTOR.md) | Локальный автоматический исполнитель Short |
| [LOCAL_STABILIZATION_REVIEW](LOCAL_STABILIZATION_REVIEW.md) | Ограниченная проверка локального контура |
| [LOCAL_USDG_FUNDING](LOCAL_USDG_FUNDING.md) | Локальный путь USDG из FeeRouter в призовую казну |
| [LOCAL_USDG_REVENUE](LOCAL_USDG_REVENUE.md) | Сбор USDG и funding одним локальным проходом |
| [MONTHLY_RULES_EPOCHS](MONTHLY_RULES_EPOCHS.md) | Monthly: исход 75/25, веса и версии правил |
| [MVP_CALENDAR_CHECK](MVP_CALENDAR_CHECK.md) | Календарная проверка экономического кандидата |
| [MVP_ECONOMIC_PROFILE](MVP_ECONOMIC_PROFILE.md) | Численные правила первого Infinity запуска |
| [OPS_MARKET_EXECUTOR](OPS_MARKET_EXECUTOR.md) | Durable operations swap → ETH refill |
| [OPS_MARKET_PROOF](OPS_MARKET_PROOF.md) | USDG → ETH: первый fork proof |
| [OPS_MARKET_QUOTE](OPS_MARKET_QUOTE.md) | Read-only USDG→ETH quote и точная симуляция |
| [OPS_REVENUE_FUNDING_DESIGN](OPS_REVENUE_FUNDING_DESIGN.md) | Creator revenue → эксплуатация → ETH: проект решения |
| [PERSISTENT_INDEXER](PERSISTENT_INDEXER.md) | Постоянное накопление BUY history |
| [PRICE_SOURCE_RESEARCH](PRICE_SOURCE_RESEARCH.md) | Источник цены TOKEN → USDG: исследование 24.09.2026 |
| [PROMO_AUTOMATION](PROMO_AUTOMATION.md) | Общая автоматизация Short и Monthly |
| [PROMO_NATIVE_REFILL](PROMO_NATIVE_REFILL.md) | ETH refill общей автоматики |
| [PROMO_OPERATIONAL_WAITS](PROMO_OPERATIONAL_WAITS.md) | Ожидание газа и эксплуатационный статус |
| [PROMO_VAULT_DESIGN](PROMO_VAULT_DESIGN.md) | PromoVault — USDG funding и обеспеченные призы |
| [PUBLIC_STATUS_API](PUBLIC_STATUS_API.md) | Резервы, розыгрыши и сервер |
| [RECOVERY_ADMISSION](RECOVERY_ADMISSION.md) | Допуск старых обязательств и восстановление Robinhood runtime |
| [REHEARSAL_LOCK_INVESTIGATION](REHEARSAL_LOCK_INVESTIGATION.md) | Проверка сообщения о funding lock |
| [ROBINHOOD_BLOCK_SEMANTICS](ROBINHOOD_BLOCK_SEMANTICS.md) | L2 block identity для Short/Monthly |
| [SCHEDULED_PRIZE_CONVERTER](SCHEDULED_PRIZE_CONVERTER.md) | Замена prize swap adapter с задержкой |
| [SHORT_AUTOMATION](SHORT_AUTOMATION.md) | Автоматический Short: funding → RNG → выплата |
| [SHORT_DATASET_PREPARATION](SHORT_DATASET_PREPARATION.md) | Подготовка полного Short dataset |
| [SHORT_DRAW_COMMITMENT](SHORT_DRAW_COMMITMENT.md) | Атомарная фиксация Short |
| [SHORT_MODEL](SHORT_MODEL.md) | Локальная модель Short |
| [SHORT_OUTCOME_VERIFICATION](SHORT_OUTCOME_VERIFICATION.md) | Проверяемый результат Short |
| [SHORT_PRIZE_BASKET](SHORT_PRIZE_BASKET.md) | Short: расчёт обеспеченной корзины на Solidity |
| [SHORT_RULES_EPOCHS](SHORT_RULES_EPOCHS.md) | Версии правил Short: граница mint и завершение старого набора |
| [SHORT_SETTLEMENT](SHORT_SETTLEMENT.md) | Canonical Short settlement |
| [USER_RULES](USER_RULES.md) | Как работают билеты и розыгрыши |
| [USER_STATUS_API](USER_STATUS_API.md) | Read-only API покупок и билетов |
| [USER_STATUS_MODEL](USER_STATUS_MODEL.md) | Статусы для будущего сайта |
| [WEBSITE](WEBSITE.md) | Одностраничный сайт QIANQI |

## Подготовка будущего боевого этапа

Справочники/кандидаты для этапа B. Не текущий deployment backlog; применимые
проверки сети можно выполнять read-only или на тестовом стенде в этапе A.

| Документ | Назначение |
|---|---|
| [DEPLOYMENT_ADMISSION](DEPLOYMENT_ADMISSION.md) | Deployment profile и допуск нового розыгрыша |
| [FINAL_CHECKPOINTS](FINAL_CHECKPOINTS.md) | Финальные контрольные точки QIANQI |
| [LAUNCH_PREPARATION](LAUNCH_PREPARATION.md) | Подготовка публичного запуска |
| [OPERATIONAL_LAUNCH_PROFILE](OPERATIONAL_LAUNCH_PROFILE.md) | Операционный профиль первого запуска |
| [PUBLIC_CONTROLLERS](PUBLIC_CONTROLLERS.md) | Публичное поколение контроллеров: Robinhood + drand |
| [PUBLIC_NETWORK_TIMING](PUBLIC_NETWORK_TIMING.md) | Публичная сеть: timing и граница cutoff |
| [PUBLIC_RPC_QUALIFICATION](PUBLIC_RPC_QUALIFICATION.md) | Проверка RPC для публичного runtime |
| [RELEASE_REHEARSAL](RELEASE_REHEARSAL.md) | Составная репетиция перед запуском |
| [ROBINHOOD_RUNTIME](ROBINHOOD_RUNTIME.md) | Robinhood runtime: общий исполнитель и локальная репетиция |

## PAIR/Infinity и резервные варианты

Сохранённый код и исследования. Не доказывают готовность Pons; не удалять fixtures.

| Документ | Назначение |
|---|---|
| [CONVERSION_TRIGGER](CONVERSION_TRIGGER.md) | Автоматическая порционная конвертация |
| [DIRECT_INFINITY_RESEARCH](DIRECT_INFINITY_RESEARCH.md) | Самостоятельный запуск на Infinity: исследование |
| [FEE_ROUTER_ROLLOVER_REPORT](FEE_ROUTER_ROLLOVER_REPORT.md) | FeeRouter: атомарная граница кампаний |
| [FEE_SOURCE_INTEGRATION](FEE_SOURCE_INTEGRATION.md) | Reference source → FeeRouter: fresh local fork |
| [INFINITY_BUY](INFINITY_BUY.md) | Infinity BUY → автоматическое участие |
| [INFINITY_COLLECTOR](INFINITY_COLLECTOR.md) | Infinity collector: USDG → campaigns → GENERAL |
| [INFINITY_FEE_SCENARIOS](INFINITY_FEE_SCENARIOS.md) | Infinity: комиссия и масштаб призов |
| [INFINITY_INTEGRATION_RESEARCH](INFINITY_INTEGRATION_RESEARCH.md) | Infinity: исходники и реальные комиссии |
| [INFINITY_PAYOUT_PROOF](INFINITY_PAYOUT_PROOF.md) | Infinity → Short → USDG: сквозной fork |
| [INFINITY_WORKER](INFINITY_WORKER.md) | Infinity worker: bounded pass, journal и watch |
| [KT1_BUY_REHEARSAL](KT1_BUY_REHEARSAL.md) | КТ1: PAIR → BUY → постоянный индексатор |
| [NATIVE_LAUNCH_PROOF](NATIVE_LAUNCH_PROOF.md) | Native PAIR launch → FeeRouter → USDG reserves |
| [PAIR_CURRENT_FEE_POLICY](PAIR_CURRENT_FEE_POLICY.md) | PAIR: текущая граница fee policy |
| [PAIR_DEPENDENCY_BOUNDARY](PAIR_DEPENDENCY_BOUNDARY.md) | PAIR: денежная цепочка и границы изменений |
| [PAIR_LAUNCH_COMPATIBILITY](PAIR_LAUNCH_COMPATIBILITY.md) | PAIR: совместимость профиля запуска, 25.09.2026 |
| [PAIR_PROFILE_EVIDENCE_2026-09-23](PAIR_PROFILE_EVIDENCE_2026-09-23.md) | PAIR / Robinhood: read-only compatibility dossier |
| [PAIR_SOURCE_HEALTH](PAIR_SOURCE_HEALTH.md) | Pinned PAIR source: manifest и read-only monitor |
| [PAIR_USDG_REFERENCE_2026-09-23](PAIR_USDG_REFERENCE_2026-09-23.md) | Публичный TOKEN/USDG reference: 23.09.2026 |
| [PARTICIPANT_REGISTRY](PARTICIPANT_REGISTRY.md) | Публичная регистрация участия |
| [PERMIT_BUY_INTEGRATION](PERMIT_BUY_INTEGRATION.md) | Permit2 BUY → admission → Short dataset: local fork |
| [ROUTE_RESEARCH_2026-09-24](ROUTE_RESEARCH_2026-09-24.md) | Маршруты покупки: граница поддержки промо |
| [V4_MARKET_EXECUTION](V4_MARKET_EXECUTION.md) | V4 TOKEN → USDG: adapter, симуляция и fork |

## Исторические отчёты и завершённые review

| Документ | Назначение |
|---|---|
| [AUTOMATION_REVIEW_2026-09-20](AUTOMATION_REVIEW_2026-09-20.md) | Проверка последних связок — 20.09.2026 |
| [FINAL_TESTING_HANDOFF](FINAL_TESTING_HANDOFF.md) | Передача на финальное тестирование —30.09.2026 |
| [GPT_PROMO_REVIEW_REQUEST_2026-09-12](GPT_PROMO_REVIEW_REQUEST_2026-09-12.md) | Старое обращение к GPT перенесено в архив |
| [GPT_REVIEW_REQUEST](GPT_REVIEW_REQUEST.md) | Текущий запрос: Pons graduation, 0x attribution и ограничения fee collection |
| [GPT_REVIEW_RESPONSE](GPT_REVIEW_RESPONSE.md) | Постоянный ответ GPT — общий indexer/coordinator/API config (G02) |
| [PONS_INDEXED_REVIEW_TRIAGE](PONS_INDEXED_REVIEW_TRIAGE.md) | Разбор indexed review — 01.10.2026 |
| [PONS_MIGRATION](PONS_MIGRATION.md) | Перенос первого выпуска на Pons V2 |
| [PONS_REVIEW_TRIAGE](PONS_REVIEW_TRIAGE.md) | Разбор review Pons MVP — 01.10.2026 |
| [PONS_V2_RESEARCH](PONS_V2_RESEARCH.md) | Pons V2: первичная проверка альтернативы |
| [PONS_VERIFICATION](PONS_VERIFICATION.md) | Pons: проверка исходников и действующей автоматики |
| [PROMO_CURRENT_SPEC_2026-09-12](PROMO_CURRENT_SPEC_2026-09-12.md) | Документ перенесён: текущая спецификация |
| [RELEASE_INVENTORY](RELEASE_INVENTORY.md) | R0: состав релиза и недостающие связи |
| [SHARED_CONFIG_REVIEW_TRIAGE](SHARED_CONFIG_REVIEW_TRIAGE.md) | G02: разбор ответа GPT |

## За пределами верхнего уровня docs

[Архив](archive/README.md), [снимок контекста02.10](archive/context-2026-10-02/README.md),
[research](../research/README.md). Сырые JSON/receipts, fixtures и logs — [ARTIFACTS](ARTIFACTS.md).
