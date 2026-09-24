# Навигация по документации

## Для продолжения работы

1. [CURRENT_CONTEXT](CURRENT_CONTEXT.md) — где остановились и ближайший кусок.
2. [ROADMAP](ROADMAP.md) — последовательность работ и критерии завершения.
3. [PRODUCT_SPEC](PRODUCT_SPEC.md) — действующие продуктовые решения.
4. [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md) — карта кода и команды проверок.

Достаточно первых двух файлов и документа нужного модуля. Полный архив при старте не читать.

## Модули и проверки — по необходимости

| Задача | Документы |
|---|---|
| Локальный сквозной путь | [Monthly и общий контур](LOCAL_MONTHLY_EXECUTOR.md), [исполнитель Short](LOCAL_SHORT_EXECUTOR.md), [BUY cycle](LOCAL_BUY_CYCLE.md), [контроллеры](LOCAL_CONTROLLER_SKELETON.md) |
| Экономический профиль (кандидат) | [Таблица и первый расчёт](MVP_ECONOMIC_PROFILE.md), [календарная проверка](MVP_CALENDAR_CHECK.md) |
| Казна и кампании | [Vault](PROMO_VAULT_DESIGN.md), [FeeRouter](FEE_ROUTER_ROLLOVER_REPORT.md), [dual architecture](DUAL_CONTROLLER_ARCHITECTURE.md) |
| BUY policy admission | [Контракт, публикация и применение правил](BUY_POLICY_ADMISSION.md) |
| Билеты и проверяемость | [Registry](PARTICIPANT_REGISTRY.md), [BUY](DIRECT_BUY_REPLAY.md), [lifecycle](ATTEMPT_LIFECYCLE.md), [trust](INDEXER_TRUST_MODEL.md) |
| Short | [Dataset](SHORT_DATASET_PREPARATION.md), [epochs](SHORT_RULES_EPOCHS.md), [settlement](SHORT_SETTLEMENT.md), [basket](SHORT_PRIZE_BASKET.md), [model](SHORT_MODEL.md) |
| Monthly | [Epochs и settlement](MONTHLY_RULES_EPOCHS.md) |
| Воспроизводимое review | [Канонический runner](REVIEW_TESTING.md) |
| Диагностика refill / manifest | [Inspector и deployment manifest](LOCAL_NATIVE_REFILL_INSPECTOR.md) |
| RNG / сеть | [Drand verifier](DRAND_FEASIBILITY.md), [нерешённый binding](DRAND_BINDING_MODEL.md), [L2 blocks](ROBINHOOD_BLOCK_SEMANTICS.md) |
| Ранние компоненты Short | [Commitment](SHORT_DRAW_COMMITMENT.md), [outcome](SHORT_OUTCOME_VERIFICATION.md) — сохранённые API/тесты, не основной полный pipeline |

## История

[Архив](archive/README.md) содержит прежние планы, ревью, сравнения и снимки.
[Research](../research/README.md) — сырые evidence, vectors и воспроизводимые эксперименты;
они могут использоваться тестами и не считаются мусором.
[Обращение к GPT](GPT_REVIEW_REQUEST.md) — один файл для конкретного очередного ревью,
его текст и ответы не переопределяют принятые правила.

Новый этап обновляет контекст/план и документ модуля. Не создаём ещё одну «актуальную
спецификацию» с датой в имени. Примеры чисел и старые результаты имеют статус исследования.

Текущая контрольная проверка: [самопроверка и переносимость](LOCAL_REVIEW_AND_PORTABILITY.md).
Предыдущая проверка отдельных workers: [ограничения](LOCAL_STABILIZATION_REVIEW.md).

Доход и призовые резервы: [локальный USDG funding](LOCAL_USDG_FUNDING.md).

Автоматическая подготовка и повторение локальных циклов: [Short/Monthly scheduler](LOCAL_PROMO_SCHEDULER.md).

Источник комиссий и распределение дохода: [локальный USDG revenue pass](LOCAL_USDG_REVENUE.md).

Предыдущая проверка связок: [automation review 20.09](AUTOMATION_REVIEW_2026-09-20.md).

- [Текущая PAIR fee policy: V1/V2](PAIR_CURRENT_FEE_POLICY.md) — внешние правила и граница применимости.

- [Local Prize Converter](LOCAL_PRIZE_CONVERTER.md) — локальный TOKEN → USDG; подключён к prize-flow worker.

- [Local Prize Flow](LOCAL_PRIZE_FLOW.md) — автоматический collect/harvest/pay/convert/forward и legacy debt.

- [Local Promo Coordinator](LOCAL_PROMO_COORDINATOR.md) — совместный запуск денежного и draw-контуров, pending marker и restart.

- [Local Execution Budget](LOCAL_EXECUTION_BUDGET.md) — native forecast, приоритет frozen draws, network profile и ops settings.

- [Execution Gas Calibration](LOCAL_EXECUTION_CALIBRATION.md) — измерения 100/1 000/10 000 участников, профиль и проверка бюджета.

- [Local Native Refill](LOCAL_NATIVE_REFILL.md) — planner, bounded local executor и typed receipt recovery; автоматическое funding через coordinator/CLI.

- [Native refill recovery](LOCAL_NATIVE_REFILL_RECOVERY.md) — реальные process-death checkpoints, RPC outage и границы ручного восстановления.

- [Native refill inspector](LOCAL_NATIVE_REFILL_INSPECTOR.md) — read-only CLI, projected receipt accounting и безопасный следующий шаг.

- [PAIR/network read-only dossier 23.09](PAIR_PROFILE_EVIDENCE_2026-09-23.md).
- [Публичный TOKEN/USDG reference и BUY route gap](PAIR_USDG_REFERENCE_2026-09-23.md).
