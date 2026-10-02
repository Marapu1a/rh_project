> Исторический снимок до уборки 02.10.2026. Не текущий план. [Актуальный контекст](../../../CURRENT_CONTEXT.md).

# Навигация по документации

[Pons: pool batch→index/API и проверка подготовленных пакетов02.10](../../../PONS_AUDIT_2026-10-02.md).

[Pons terminal после graduation: USDG/ETH, последовательные вызовы и self-batch](../../../PONS_POOL_TERMINAL.md).

[Общий профиль Pons: curve self-batch и прямой v4 BUY](../../../PONS_LAUNCH_PROFILE.md).

02.10: [Pons batch attribution](../../../PONS_BATCH_ATTRIBUTION.md) — диагностический inspector ролей/flows; новый допуск покупок не включён.

02.10: [G10 — охват торговых маршрутов Pons](../../../PONS_CHANNEL_COVERAGE.md) обязателен перед окончательным G04: terminal payload/receipt, адаптеры, неизвестные маршруты и сквозной учёт. Статическая инвентаризация готова; live/UI admission ещё не закрыт.

01.10: [Общий индекс Pons / API / координатора](../../../SHARED_INDEX_CONFIG.md): два связанных конфига, неизменные journal identities, отдельный статус публичной проекции.

[Активный Pons-план и явно выделенный резерв PAIR](../../../ACTIVE_RELEASE_PATH.md).

[R0: актуальная карта реализации, ролей и недоделок](../../../RELEASE_INVENTORY.md) — статическая инвентаризация01.10, не live audit.

[Полная проверка перед запуском: этапы и критерии допуска](../../../PRELAUNCH_VERIFICATION_PLAN.md).

[Разбор indexed review и следующий timing-пакет](../../../PONS_INDEXED_REVIEW_TRIAGE.md).

[Полный indexed coordinator cycle](../../../PONS_INDEXED_CYCLE.md) — локальный PASS01.10; следующий шаг — независимое review.

[Pons: допуск политики и чтение сохранённого индекса](../../../PONS_INDEXED_COORDINATOR.md) — локальная связка проверена; полный indexed draw cycle следующий.

Pons: [постоянный индексатор, restart и reorg](../../../PONS_PERSISTENT_INDEXER.md).

Pons: [browser → настоящий local fork, exact payload и recovery](../../../PONS_BROWSER_BRIDGE.md).

Pons: [локальный browser purchase flow и проверки](../../../PONS_PURCHASE_UI.md).

Pons: [прямой USDG BUY — локальный planner и wallet rehearsal](../../../PONS_DIRECT_PURCHASE.md).

Pons: [проверка UI routing и границы учёта](../../../PONS_UI_ROUTING.md).

Pons: [разбор внешнего review и следующий пакет](../../../PONS_REVIEW_TRIAGE.md).

Pons: [локальный coordinator, journal и recovery](../../../PONS_AUTOMATION.md).

Pons полный локальный цикл: [покупки, funding, Short/Monthly, drand, выплаты и восстановление](../../../PONS_PROMO_CYCLE.md).

Pons curve + v4 BUY: [маршруты Universal Router, учёт hook fees, fork evidence и ограничения](../../../PONS_V4_BUY.md).

Pons BUY: [учёт прямых покупок на кривой, проверки и ограничения](../../../PONS_BUY.md).

Текущая адаптация: [Pons migration](../../../PONS_MIGRATION.md); PAIR сохранён как резерв. Локальные collector и BUY adapters реализованы; публичные entrypoints/deployment ещё не квалифицированы.

## Для продолжения работы

1. [CURRENT_CONTEXT](../../../CURRENT_CONTEXT.md) — где остановились и ближайший кусок.
2. [ROADMAP](../../../ROADMAP.md) — последовательность работ и критерии завершения.
3. [PRODUCT_SPEC](../../../PRODUCT_SPEC.md) — действующие продуктовые решения.
4. [IMPLEMENTATION_STATUS](../../../IMPLEMENTATION_STATUS.md) — карта кода и команды проверок.

Достаточно первых двух файлов и документа нужного модуля. Полный архив при старте не читать.

[Правила для пользователей](../../../USER_RULES.md) и [статусы](../../../USER_STATUS_MODEL.md) — основа будущего сайта, без обещания публичной готовности.

## Модули и проверки — по необходимости

| Задача | Документы |
|---|---|
| Pons escrow collector | [Локальная реализация и границы](../../../PONS_COLLECTOR.md) |
| Альтернативный запуск Pons V2 | [Исследование и local fork диагностика](../../../PONS_V2_RESEARCH.md) |
| КТ1: непрерывный BUY/indexer | [Runner и блокировка PAIR implementation](../../../KT1_BUY_REHEARSAL.md) |
| Финальные контрольные точки | [КТ1–КТ7 и критерии PASS](../../../FINAL_CHECKPOINTS.md) |
| Репетиция запуска | [Команда, профиль, доказательства и оставшиеся границы](../../../RELEASE_REHEARSAL.md) |
| Локальный сквозной путь | [Общая автоматика Short/Monthly](../../../PROMO_AUTOMATION.md), [автоматический Short](../../../SHORT_AUTOMATION.md), [Infinity→USDG proof](../../../INFINITY_PAYOUT_PROOF.md), [Monthly и общий контур](../../../LOCAL_MONTHLY_EXECUTOR.md), [исполнитель Short](../../../LOCAL_SHORT_EXECUTOR.md), [BUY cycle](../../../LOCAL_BUY_CYCLE.md), [контроллеры](../../../LOCAL_CONTROLLER_SKELETON.md) |
| Creator allocation / USDG→ETH (design) | [Доли, custody, маршрут и открытые проверки](../../../OPS_REVENUE_FUNDING_DESIGN.md), [USDG→ETH fork proof](../../../OPS_MARKET_PROOF.md), [read-only quote](../../../OPS_MARKET_QUOTE.md), [durable sender](../../../OPS_MARKET_EXECUTOR.md) |
| Принятый экономический профиль | [Infinity fork3%](../../../INFINITY_INTEGRATION_RESEARCH.md), [Infinity 1–5%](../../../INFINITY_FEE_SCENARIOS.md), [Принятые параметры и модель малого числа участников](../../../MVP_ECONOMIC_PROFILE.md), [историческая календарная проверка](../../../MVP_CALENDAR_CHECK.md) |
| Казна и кампании | [Infinity collector](../../../INFINITY_COLLECTOR.md), [worker](../../../INFINITY_WORKER.md), [Vault](../../../PROMO_VAULT_DESIGN.md), [FeeRouter](../../../FEE_ROUTER_ROLLOVER_REPORT.md), [dual architecture](../../../DUAL_CONTROLLER_ARCHITECTURE.md) |
| BUY policy admission | [Контракт, публикация и применение правил](../../../BUY_POLICY_ADMISSION.md) |
| Сайт QIANQI | [Локальный запуск, кошелёк и границы](../../../WEBSITE.md) |
| Пользовательский API | [Покупки, билеты, свежесть](../../../USER_STATUS_API.md), [резервы/розыгрыши и сервер](../../../PUBLIC_STATUS_API.md) |
| Постоянный сервис / восстановление | [Запуск, health, locks, systemd](../../../INDEXER_SERVICE.md) |
| Постоянное накопление | [Indexer once/watch и ограничения](../../../PERSISTENT_INDEXER.md) |
| Билеты и проверяемость | [Infinity automatic BUY](../../../INFINITY_BUY.md), [Registry](../../../PARTICIPANT_REGISTRY.md), [BUY](../../../DIRECT_BUY_REPLAY.md), [lifecycle](../../../ATTEMPT_LIFECYCLE.md), [trust](../../../INDEXER_TRUST_MODEL.md) |
| Short | [Dataset](../../../SHORT_DATASET_PREPARATION.md), [epochs](../../../SHORT_RULES_EPOCHS.md), [settlement](../../../SHORT_SETTLEMENT.md), [basket](../../../SHORT_PRIZE_BASKET.md), [model](../../../SHORT_MODEL.md) |
| Monthly | [Epochs и settlement](../../../MONTHLY_RULES_EPOCHS.md) |
| Воспроизводимое review | [Канонический runner](../../../REVIEW_TESTING.md) |
| Ожидания gas / события | [Эксплуатационный статус](../../../PROMO_OPERATIONAL_WAITS.md) |
| Диагностика refill / manifest | [Inspector и deployment manifest](../../../LOCAL_NATIVE_REFILL_INSPECTOR.md) |
| Старые обязательства / source drift | [Recovery admission](../../../RECOVERY_ADMISSION.md) |
| Robinhood runtime / rehearsal | [Отдельный4663 исполнитель](../../../ROBINHOOD_RUNTIME.md) |
| RPC / historical replay | [Проверка RPC](../../../PUBLIC_RPC_QUALIFICATION.md) |
| Операционный профиль | [V2, роли, notice, gas, timing/RPC evidence](../../../OPERATIONAL_LAUNCH_PROFILE.md) |
| Допуск deployment / timing | [Публичные controllers и launch plan](../../../PUBLIC_CONTROLLERS.md), [профиль и проверки](../../../DEPLOYMENT_ADMISSION.md) |
| Подготовка реального запуска | [Источник PAIR, кошельки/RPC и недостающие параметры](../../../LAUNCH_PREPARATION.md) |
| Cutoff / финальность | [История подлинных cutoff и worker](../../../CUTOFF_HISTORY.md) |
| RNG / сеть | [Delivery worker](../../../DRAND_DELIVERY_WORKER.md), [Drand adapter и операционная граница](../../../DRAND_ADAPTER.md), [Drand verifier](../../../DRAND_FEASIBILITY.md), [нерешённый binding](../../../DRAND_BINDING_MODEL.md), [L2 blocks](../../../ROBINHOOD_BLOCK_SEMANTICS.md) |
| Ранние компоненты Short | [Commitment](../../../SHORT_DRAW_COMMITMENT.md), [outcome](../../../SHORT_OUTCOME_VERIFICATION.md) — сохранённые API/тесты, не основной полный pipeline |

## История

[Архив](../../README.md) содержит прежние планы, ревью, сравнения и снимки.
[Research](../../../../research/README.md) — сырые evidence, vectors и воспроизводимые эксперименты;
они могут использоваться тестами и не считаются мусором.
[Обращение к GPT](../../../GPT_REVIEW_REQUEST.md) — один файл для конкретного очередного ревью,
его текст и ответы не переопределяют принятые правила.

Новый этап обновляет контекст/план и документ модуля. Не создаём ещё одну «актуальную
спецификацию» с датой в имени. Примеры чисел и старые результаты имеют статус исследования.

Текущая контрольная проверка: [самопроверка и переносимость](../../../LOCAL_REVIEW_AND_PORTABILITY.md).
Предыдущая проверка отдельных workers: [ограничения](../../../LOCAL_STABILIZATION_REVIEW.md).

Доход и призовые резервы: [локальный USDG funding](../../../LOCAL_USDG_FUNDING.md).

Автоматическая подготовка и повторение локальных циклов: [Short/Monthly scheduler](../../../LOCAL_PROMO_SCHEDULER.md).

Источник комиссий и распределение дохода: [локальный USDG revenue pass](../../../LOCAL_USDG_REVENUE.md).

Предыдущая проверка связок: [automation review 20.09](../../../AUTOMATION_REVIEW_2026-09-20.md).

- [Текущая PAIR fee policy: V1/V2](../../../PAIR_CURRENT_FEE_POLICY.md) — внешние правила и граница применимости.

- [Local Prize Converter](../../../LOCAL_PRIZE_CONVERTER.md) — локальный TOKEN → USDG; подключён к prize-flow worker.
- [Порционная конвертация](../../../CONVERSION_TRIGGER.md) — market executor, лимиты и opt-in prize-flow; V4 venue/quote проверены на reference fork.
- [Scheduled Prize Converter](../../../SCHEDULED_PRIZE_CONVERTER.md) — объявленная замена adapter, фиксированные destination и price checks; отдельное локальное поколение.

- [Local Prize Flow](../../../LOCAL_PRIZE_FLOW.md) — автоматический collect/harvest/pay/convert/forward и legacy debt.

- [Local Promo Coordinator](../../../LOCAL_PROMO_COORDINATOR.md) — совместный запуск денежного и draw-контуров, pending marker и restart.

- [Local Execution Budget](../../../LOCAL_EXECUTION_BUDGET.md) — native forecast, приоритет frozen draws, network profile и ops settings.

- [Execution Gas Calibration](../../../LOCAL_EXECUTION_CALIBRATION.md) — измерения 100/1 000/10 000 участников, профиль и проверка бюджета.

- [ETH refill общей автоматики](../../../PROMO_NATIVE_REFILL.md) — отдельный bootstrap ETH source, единый journal, приоритет frozen и claims.
- [Local Native Refill](../../../LOCAL_NATIVE_REFILL.md) — planner, bounded local executor и typed receipt recovery; автоматическое funding через coordinator/CLI.

- [Native refill recovery](../../../LOCAL_NATIVE_REFILL_RECOVERY.md) — реальные process-death checkpoints, RPC outage и границы ручного восстановления.

- [Native refill inspector](../../../LOCAL_NATIVE_REFILL_INSPECTOR.md) — read-only CLI, projected receipt accounting и безопасный следующий шаг.

- [PAIR/network read-only dossier 23.09](../../../PAIR_PROFILE_EVIDENCE_2026-09-23.md).
- [Публичный TOKEN/USDG reference и BUY route gap](../../../PAIR_USDG_REFERENCE_2026-09-23.md).
- [Составные маршруты покупки и граница поддержки промо](../../../ROUTE_RESEARCH_2026-09-24.md).
- [Permit2 BUY → admission → Short dataset на fork](../../../PERMIT_BUY_INTEGRATION.md).
- [Reference collect/claim → FeeRouter и rollover на fork](../../../FEE_SOURCE_INTEGRATION.md).
- [PAIR: денежная цепочка, CTO и устойчивость к изменениям](../../../PAIR_DEPENDENCY_BOUNDARY.md).
- [Новый native launch → FeeRouter → призовые резервы на fork](../../../NATIVE_LAUNCH_PROOF.md).
- [Pinned PAIR source manifest и read-only health monitor](../../../PAIR_SOURCE_HEALTH.md).
- [Источники цены TOKEN/USDG и ограничение PAIR TWAP](../../../PRICE_SOURCE_RESEARCH.md).

- [V4 market execution](../../../V4_MARKET_EXECUTION.md) — настоящий маршрут, simulation quote, CLI/coordinator и fork.

- [Публичная сеть: timing и cutoff](../../../PUBLIC_NETWORK_TIMING.md) — измерения и текущий блокер begin/finality.
