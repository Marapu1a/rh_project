# План работы: сначала тестовый контур, затем боевой

Актуально 03.10.2026. Предыдущая хронология и незакрытые release-пункты сохранены
в [снимке](archive/context-2026-10-02/docs/ROADMAP.md). Текущее состояние — [контекст](CURRENT_CONTEXT.md).
Gxx — идентификаторы прежней gap-карты, Rxx — виды проверок; это не две конкурирующие очереди.

## Этап A — правильная работа в тестовом окружении (текущий)

[Последнее review разобрано](PONS_JOINT_REVIEW_TRIAGE_2026-10-03.md): исправлены пути
артефактов, хеши подтверждены. Следом — адресная полнота наград API и минимальный
режим задержки, затем оставшиеся обязательные проверки/A5. По решению пользователя
не расширяем этот этап в архитектуру под мировой масштаб или новые большие прогоны
без конкретной ошибки/риска.

Перед финальным baseline — проверка перегруза. [Замеры50k/100k](DRAW_CAPACITY_FOLLOWUP_2026-10-03.md), [cache исполнителей](VERIFIED_DRAW_EXECUTION_2026-10-03.md), [малый Pons coordinator и записи scheduler](COORDINATOR_CAPACITY_2026-10-03.md) завершены. [Общий scheduler10k + Pons journal/gas](SCHEDULER_LOAD_2026-10-03.md) PASS: оба draw, cold process resume, выплаты и stale-file restore. Внешний Pons loop/BUY/API под такой нагрузкой не проверен. [Паузы и лимит отправок](PONS_CADENCE_2026-10-03.md) завершены:21 адресный test, малый Pons fork, stop/resume2/8, одинаковые итоги и stale-file restore PASS. [Cold restart без publication history](PUBLICATION_HISTORY_RECOVERY_2026-10-03.md) завершён:10k в каждом draw,4 fail-closed сценария, восстановление и выплаты PASS; независимый RPC failover не реализован. [Совместный BUY/index/API/draw прогон](PONS_JOINT_REHEARSAL_2026-10-03.md) PASS через сохранённый Alchemy:396 BUY,129 участников в каждом draw,11 выплат, API и restore без повторных отправок. Исправлен только бюджет ожидания стенда; runtime не менялся. Далее — понятный режим задержки. Для этого решения повторный полный100k driver не требуется. Production не затрагиваем.


03.10 подготовлен [новый запрос GPT](GPT_REVIEW_REQUEST.md) по накопленному diff.
Ответ разобран: [исправления Claim](CLAIM_REVIEW_FIXES_2026-10-03.md). A4: [admitted curve load/локальный restore](PONS_ADMITTED_LOAD_2026-10-03.md) проверены до10000 покупок. [Обновление API ускорено](API_VERIFIED_REPLAY_2026-10-03.md) собственным проверенным prefix. [Запасной план роста](STORAGE_GROWTH_PLAN_2026-10-03.md) и изолированный prototype до5млн строк завершены; внедрение масштабного хранения сейчас не планируем. [Direct cycle и restore](PONS_RESTORE_CYCLE_2026-10-03.md) завершены. Далее — сверка оставшихся границ A4 и общий baseline A5; не объявлять все маршруты/finality/перенос проверенными.

| Порядок | Пакет | Статус и результат |
|---|---|---|
| A1 / G02 | Общий indexer/API/coordinator config | Выполнен локально; [описание](SHARED_INDEX_CONFIG.md) |
| A2 / G10 | Каналы покупки Pons | В работе: direct/self-batch, прямой 0x и узкий EntryPoint USDG pool BUY проверены до index/API; дальше wallet UX/статусы |
| A3 / G03 | Полный пользовательский путь | [Кабинет/Claim](WEBSITE_WALLET_ACTIONS.md), ручной MetaMask и [общий цикл с UI/API](PONS_WALLET_CYCLE.md) проверены; ручная смена аккаунта и общий RC baseline отдельно |
| A4 / G05–G07 | Реальные условия и длительная работа | Выполнены [bounded cache](INDEXER_HISTORY_SCALING_2026-10-02.md) и [replay checkpoints / формат снимка](INDEXER_CHECKPOINTS_2026-10-02.md); [admitted curve load](PONS_ADMITTED_LOAD_2026-10-03.md) выполнен; план роста исследован отдельно без внедрения; [quiescent restore](PONS_RESTORE_CYCLE_2026-10-03.md) пройден; остаются all-route workload, реальные timing/finality/permissions/conversion и межузловой restore |
| A5 / G08, R1–R8 | Закрепить тестовый кандидат | Review кода/инвариантов, согласованные happy/fault прогоны, полный baseline конкретной ревизии, закрытые findings |

Адресные проверки идут вместе с каждым пакетом. Повторный full run без нового риска
не нужен. Точные проверки — [план R0–R9](PRELAUNCH_VERIFICATION_PLAN.md),
команды и пределы — [REVIEW_TESTING](REVIEW_TESTING.md).

### Сейчас: review накопленного A2/A3 и подготовка A4

Предыдущее review завершено, [замечания сверены](PONS_REVIEW_TRIAGE_2026-10-02.md).
Пакет до 0x выполнен в тестовом контуре: CLI verifier/shared config, parent-code reads
только для кандидатов, schedule перед admission, газ ближайшего действия и ожидание
пополнения. [Результат и адресные проверки](PONS_EXECUTION_READINESS.md).
Независимый [подпакет A4](INDEXER_HISTORY_SCALING_2026-10-02.md) выполнен во время ожидания GPT:
рост истории измерен, RPC cache ограничен; [следующий пакет](INDEXER_CHECKPOINTS_2026-10-02.md)
добавил replay checkpoints и компактный снимок. Полная запись/consumer replay ещё линейны.
Новый полный fork-cycle этим пакетом не заявлен.

1. **Выполнено частично по охвату:** [три исполнения 0x](PONS_ZEROEX_EXECUTION.md),
   payer/recipient, approvals и debit подтверждены. Graduated-пример покупает токен
   вне Pons pool; это не основание учитывать любой aggregator. Refund-ветка не воспроизведена.
2. **Исследовано:** [graduation, hook fees и реальные маршруты](PONS_GRADUATION_REVIEW_2026-10-02.md).
   Целевые pool receipts найдены, включая 0x и EntryPoint; это ещё не admission.
3. **Выполнено в тестовом контуре:** [0x → один целевой USDG/Pons pool](PONS_ZEROEX_POOL_ADMISSION.md).
   Fork BUY, pinned runtime/call/fee proof, genesis v3, policy/index/API, repeat/reorg.
   Refund/partial и произвольный split не допускаются; sender-only отказ в API не
   выдаётся за доказанного payer. 84 адресных теста PASS; полного RC baseline нет.
   **Следующий подпакет выполнен:** [EntryPoint/Alchemy 7702](PONS_ENTRYPOINT_POOL_ADMISSION.md),
   signed fork BUY и genesis v4 до index/API. 100 адресных tests; parent delegation,
   UserOperation attribution, bundler isolation, restart/reorg. Native/multi-op/paymaster
   остались вне допуска. **Далее:** wallet behavior и понятный пользовательский путь.
4. **Кабинет/Claim реализован локально:** [описание и границы](WEBSITE_WALLET_ACTIONS.md).
   Выбор provider не привязан к MetaMask. Стенд установленного расширения готов:
   signed HTTP RPC/browser smoke PASS; ручной MetaMask Claim70/30, wrong network,
   отказ/повтор и reload завершены (UI — скриншоты/сообщение пользователя;
   выплаты проверены независимо). Смена аккаунта пока только автоматическая.
   [Общий indexer/API/кабинет](PONS_WALLET_CYCLE.md) проверен на свежем fork,
   включая оба draw, выплаты, API outage/restart и idle. Далее — review накопленного
   пакета и оставшиеся A4 условия перед RC baseline. Неизвестные маршруты не объявлять
   поддержанными; native/split/multi-op развивать отдельными доказанными пакетами.

[Матрица охвата и критерии](PONS_CHANNEL_COVERAGE.md).

### Выход из этапа A

Выбранный тестовый кандидат воспроизводимо проходит пользовательский и денежный путь,
оба draw, повторный цикл и восстановление после сбоев. Границы поддержки и остаточное
внешнее доверие описаны. Есть отчёт по точной ревизии, а не сумма PASS разных версий.
Нет неразобранных ошибок, влияющих на учёт/выплаты. Fixture-допущения перечислены явно.
Этот результат позволяет начать подготовку переноса, сам перенос не выполняет.

## Этап B — перенос на боевой (не текущая работа)

После этапа A, отдельным пакетом и решением:

1. G04/G01: production manifest, реальные роли/pins/custody/параметры и публичный
   исполнитель с собственными guards; тестовые обходы не переносить.
2. G07: серверные сервисы, signer/RPC, наблюдаемость, backup/restore, эксплуатационные лимиты.
3. R9: preflight, контролируемый запуск и наблюдение. Не менять frozen/claimable при переносе.

Технические материалы этого этапа сохранены в [каталоге](DOCUMENT_CATALOG.md),
но наличие черновика или готового VPS не делает deployment следующим действием.

## Сохранённые решения

PAIR — резерв. Порог/математика — [PRODUCT_SPEC](PRODUCT_SPEC.md). Нет reroll/reset,
подмены RNG или вывода призовой казны. Новые сети и дополнительные функции сайта —
отдельные будущие решения, не расширение текущего пакета.
