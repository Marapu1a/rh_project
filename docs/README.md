# Документация QIANQI

Начать с [CURRENT_CONTEXT](CURRENT_CONTEXT.md): текущее состояние и ближайшая задача.
**Сейчас доводим тестовый контур. Боевой перенос — следующий самостоятельный этап.**

## Основные документы

| Вопрос | Единственный основной источник |
|---|---|
| Где остановились | [Текущий контекст](CURRENT_CONTEXT.md) |
| В каком порядке работаем | [Roadmap](ROADMAP.md) |
| Какие правила продукта приняты | [Product spec](PRODUCT_SPEC.md) |
| Где реализация | [Карта кода](IMPLEMENTATION_STATUS.md) |
| Как проверять | [План проверок](PRELAUNCH_VERIFICATION_PLAN.md), [команды/границы](REVIEW_TESTING.md) |

## Модули текущего тестового контура

| Задача | Документы |
|---|---|
| Pons маршруты и текущий допуск | [Матрица G10](PONS_CHANNEL_COVERAGE.md), [EntryPoint admission](PONS_ENTRYPOINT_POOL_ADMISSION.md), [0x pool admission](PONS_ZEROEX_POOL_ADMISSION.md), [0x execution](PONS_ZEROEX_EXECUTION.md), [graduation/fees](PONS_GRADUATION_REVIEW_2026-10-02.md), [pool batch и аудит](PONS_AUDIT_2026-10-02.md), [policy](BUY_POLICY_ADMISSION.md) |
| Индекс/API/coordinator | [Shared config](SHARED_INDEX_CONFIG.md), [индекс](PERSISTENT_INDEXER.md), [API](USER_STATUS_API.md), [public projection](PUBLIC_STATUS_API.md) |
| Сбор и распределение | [Pons collector](PONS_COLLECTOR.md), [автоматика](PONS_AUTOMATION.md), [газ/ожидание](PONS_EXECUTION_READINESS.md), [индексированный цикл](PONS_INDEXED_CYCLE.md) |
| Билеты/резервы/draws | [Lifecycle](ATTEMPT_LIFECYCLE.md), [trust](INDEXER_TRUST_MODEL.md), [dual controllers](DUAL_CONTROLLER_ARCHITECTURE.md), [Short](SHORT_SETTLEMENT.md), [Monthly](MONTHLY_RULES_EPOCHS.md) |
| RNG/finality/recovery | [Drand](DRAND_ADAPTER.md), [delivery](DRAND_DELIVERY_WORKER.md), [cutoff](CUTOFF_HISTORY.md), [recovery](RECOVERY_ADMISSION.md) |
| Пользовательский путь | [Общий цикл с UI/API](PONS_WALLET_CYCLE.md), [Кабинет/Claim](WEBSITE_WALLET_ACTIONS.md), [Сайт](WEBSITE.md), [purchase review](PONS_PURCHASE_UI.md), [bridge](PONS_BROWSER_BRIDGE.md), [правила](USER_RULES.md), [статусы](USER_STATUS_MODEL.md) |
| Нагрузка/длительная работа | [Замер истории](INDEXER_HISTORY_SCALING_2026-10-02.md), [checkpoint/снимок](INDEXER_CHECKPOINTS_2026-10-02.md), [Indexer service](INDEXER_SERVICE.md), [ограничения последнего аудита](PONS_AUDIT_2026-10-02.md) |

## Остальные материалы

- [Полный каталог документов](DOCUMENT_CATALOG.md): модули, будущий deployment, резерв, отчёты.
- [Артефакты и логи](ARTIFACTS.md): docs/evidence, research, fixtures, .local/logs.
- [Архив](archive/README.md) и [снимок перед уборкой02.10](archive/context-2026-10-02/README.md).
- [Текущий запрос GPT](GPT_REVIEW_REQUEST.md): статическое review admission/indexer/Claim/общего цикла; [ответ разобран и Claim исправлен](CLAIM_REVIEW_FIXES_2026-10-03.md).
- [Прежний разбор graduation](PONS_GRADUATION_TRIAGE_2026-10-02.md): история исследований маршрутов.
- [Разбор GPT review](PONS_REVIEW_TRIAGE_2026-10-02.md): замечания и статус исправлений.

Контекст/roadmap/карту обновлять по состоянию, не добавлять одинаковую хронологию
во все три файла. Доказательства и подробности хранить в одном отчёте модуля.
Правила ведения — [AGENTS.md](../AGENTS.md). Полный каталог и архив при каждом старте не читать.
