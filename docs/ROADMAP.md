# План работы: сначала тестовый контур, затем боевой

Актуально 03.10.2026. Предыдущая хронология и незакрытые release-пункты сохранены
в [снимке](archive/context-2026-10-02/docs/ROADMAP.md). Текущее состояние — [контекст](CURRENT_CONTEXT.md).
Gxx — идентификаторы прежней gap-карты, Rxx — виды проверок; это не две конкурирующие очереди.

## Этап A — правильная работа в тестовом окружении (текущий)

[Итоговая проверка кандидата](TEST_CANDIDATE_2026-10-03.md) завершена:
на чистом1a29a13 full893/894, единственная ошибка каталога тестов исправлена
и launcher5/5 прошёл; отдельно browser35/35 и Python39/39 PASS.
В итоговом baseline runtime не менялся; после review исправлена только проекция
waiting/clear. Полного зелёного повторного baseline после fixes не заявляем.
Открыто отдельное замечание по build/test dependencies (audit:8 high,2 moderate,10 low).
[Итоговое GPT review разобрано](FINAL_REVIEW_TRIAGE_2026-10-03.md).
Подтверждённая мелкая ошибка waiting/clear исправлена:3/3 адресных tests PASS.
Новых блокирующих ошибок учёта/выплат review не выявило. Dependency triage
остаётся обязательным для боевой упаковки: динамический solc fallback подтверждён.
Фронт и изолированная runtime-сборка завершены; следующий — публичный профиль
исполнения и deployment-конфигурация. Сам перенос не начат, guards не сняты.

Проверка перегруза перед финальным baseline завершена. [Замеры50k/100k](DRAW_CAPACITY_FOLLOWUP_2026-10-03.md), [cache исполнителей](VERIFIED_DRAW_EXECUTION_2026-10-03.md), [малый Pons coordinator и записи scheduler](COORDINATOR_CAPACITY_2026-10-03.md) завершены. [Общий scheduler10k + Pons journal/gas](SCHEDULER_LOAD_2026-10-03.md) PASS: оба draw, cold process resume, выплаты и stale-file restore. Внешний Pons loop/BUY/API под такой нагрузкой не проверен. [Паузы и лимит отправок](PONS_CADENCE_2026-10-03.md) завершены:21 адресный test, малый Pons fork, stop/resume2/8, одинаковые итоги и stale-file restore PASS. [Cold restart без publication history](PUBLICATION_HISTORY_RECOVERY_2026-10-03.md) завершён:10k в каждом draw,4 fail-closed сценария, восстановление и выплаты PASS; независимый RPC failover не реализован. [Совместный BUY/index/API/draw прогон](PONS_JOINT_REHEARSAL_2026-10-03.md) PASS через сохранённый Alchemy:396 BUY,129 участников в каждом draw,11 выплат, API и restore без повторных отправок. Исправлен только бюджет ожидания стенда; runtime не менялся. Режим задержки и адресная проверка отказов завершены; далее — сверка условий. Для этого решения повторный полный100k driver не требуется. Production не затрагиваем.


03.10 подготовлен [новый запрос GPT](GPT_REVIEW_REQUEST.md) по накопленному diff.
Ответ разобран: [исправления Claim](CLAIM_REVIEW_FIXES_2026-10-03.md). A4: [admitted curve load/локальный restore](PONS_ADMITTED_LOAD_2026-10-03.md) проверены до10000 покупок. [Обновление API ускорено](API_VERIFIED_REPLAY_2026-10-03.md) собственным проверенным prefix. [Запасной план роста](STORAGE_GROWTH_PLAN_2026-10-03.md) и изолированный prototype до5млн строк завершены; внедрение масштабного хранения сейчас не планируем. [Direct cycle и restore](PONS_RESTORE_CYCLE_2026-10-03.md) завершены. Далее — сверка оставшихся границ A4 и общий baseline A5; не объявлять все маршруты/finality/перенос проверенными.

| Порядок | Пакет | Статус и результат |
|---|---|---|
| A1 / G02 | Общий indexer/API/coordinator config | Выполнен локально; [описание](SHARED_INDEX_CONFIG.md) |
| A2 / G10 | Каналы покупки Pons | В работе: direct/self-batch, прямой 0x и узкий EntryPoint USDG pool BUY проверены до index/API; дальше wallet UX/статусы |
| A3 / G03 | Полный пользовательский путь | [Кабинет/Claim](WEBSITE_WALLET_ACTIONS.md), ручной MetaMask и [общий цикл с UI/API](PONS_WALLET_CYCLE.md) проверены; ручная смена аккаунта и общий RC baseline отдельно |
| A4 / G05–G07 | Реальные условия и длительная работа | Выполнены [bounded cache](INDEXER_HISTORY_SCALING_2026-10-02.md) и [replay checkpoints / формат снимка](INDEXER_CHECKPOINTS_2026-10-02.md); [admitted curve load](PONS_ADMITTED_LOAD_2026-10-03.md) выполнен; план роста исследован отдельно без внедрения; [quiescent restore](PONS_RESTORE_CYCLE_2026-10-03.md) пройден; остаются all-route workload, реальные timing/finality/permissions/conversion и межузловой restore |
| A5 / G08, R1–R8 | Закрепить тестовый кандидат | [Прогон завершён](TEST_CANDIDATE_2026-10-03.md), ошибка catalog исправлена адресно; [Review разобрано](FINAL_REVIEW_TRIAGE_2026-10-03.md), status fix3/3; dependency triage отнесён к боевой упаковке |

Адресные проверки идут вместе с каждым пакетом. Повторный full run без нового риска
не нужен. Точные проверки — [план R0–R9](PRELAUNCH_VERIFICATION_PLAN.md),
команды и пределы — [REVIEW_TESTING](REVIEW_TESTING.md).

### Предыдущие пакеты A2–A4: выполненные шаги и сохранённые границы

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

## Этап B — подготовка переноса (публикация отдельно)

Согласован порядок: фронт → runtime/config → эксплуатация → репетиция поставки → контролируемый запуск.

B1 [фронт](FRONT_LAUNCH_READINESS_2026-10-03.md) завершён локально:19/19 browser,
адаптивность/ссылки/404; тексты сохранены, поправлены устаревшие факты.
B2 [упаковка и config](RUNTIME_PACKAGE_2026-10-03.md) проверены изолированно;
публичный manifest/executor/site-actions ещё не готовы. Следующий стык — G04/G01,
потом public execution и Linux service rehearsal. [Эксплуатационная обвязка](OPERATIONS_READINESS_2026-10-03.md)
подготовлена локально (38 адресных tests, offline restore). [Серверный staging](SERVER_STAGING_2026-10-03.md)
установлен и проверен отдельно: API/site only, старый сайт сохранён.
На сервере public execution остаётся выключен; indexer/operator ещё не включены. Остальные обязательные части:

G04/G01: [read-only Pons inspector](PONS_PUBLIC_PROFILE_2026-10-03.md) и
[отдельный public sender](PONS_PUBLIC_EXECUTION_2026-10-03.md) реализованы;
36 адресных tests, EVM drain/restart и проверка перед intent PASS.
[Release-репетиция](PONS_RELEASE_REHEARSAL_2026-10-03.md) PASS: локальный HTTPS/keystore,
funding/new-freeze обоих draw,22 signed tx, выплаты и idle без повторов;25 адресных tests.
[Подготовка deployment](PONS_DEPLOYMENT_PREPARATION.md): принятые данные и порядок
собраны; [executor создан, off-server recovery проверен](PONS_EXECUTOR_CUSTODY.md).
[Collector/deployment review](PONS_COLLECTOR_DEPLOYMENT_REVIEW.md):10/10 tests,
разделены policy/dataset publisher, порядок зависимостей и свежий RPC snapshot.
[Первый deployment-пакет](PONS_DEPLOYMENT_PACKAGE_2026-10-03.md): USDG pin закрыт,
27 tests и10tx fork PASS, early BUY сохранён. Source gaps приняты владельцем.
[Пакет2 эксплуатации](PONS_OPERATIONS_PACKAGE_2026-10-03.md) подготовлен отдельно на сервере;
23 адресных checks, credentials/RPC и перенос backup PASS, metadata опубликованы.
Финансовые units disabled; Telegram delivery/dedup PASS, monitor timer enabled,
штатные проверки ждут activation marker. [Пакет3A](PONS_PREFLIGHT_HANDOFF_2026-10-03.md):
hourly off-server pull на Windows, свежий preflight/deployment fork и signing queue
первых6 CREATE проверены и подписаны: completed6/pending=null.
[Продолжение deployment](PONS_DEPLOYMENT_CONTINUATION_2026-10-03.md): реальные receipts,
сохранение salt/адресов и fork четырёх оставшихся вызовов PASS; ранние билеты/funding
проверены. Anchor — фактический предшественник launch receipt.
[Ручная очередь](PONS_CONTINUATION_QUEUE_2026-10-03.md) готова:4tx/8restart fork PASS,
14 адресных tests и live prepare. Владелец подписал4/4, [публичные receipts](PONS_PUBLIC_LAUNCH_2026-10-03.md)
сверены, launch block79377860. [Activation preflight04.10](PONS_ACTIVATION_2026-10-04.md):
actual config/profile matched; исправлен лишний запрос пустой policy history.
[Ремонт scanner04.10](PONS_INDEXER_HOTFIX_2026-10-04.md) проверен локально и установлен
отдельным read-only сервисом; догон продолжается. Далее: подтвердить caughtUp/API,
закрыть getLogs limits финансового контура и реальные storage/RPC границы; source verification,
finality и gas executor; сервисы только после проверки manifest.
Токен запущен, автоматика и контрольная покупка пока нет. [Token security check](PONS_TOKEN_SECURITY_2026-10-03.md) PASS
в обозначенных границах: исходники/исполняемый код и полный обратный SELL на fork.
После launch — source verification/GoPlus именно QIANQI; до фронта — пояснение
base1% + creator3% и snipe3s, без изменения продуктовых правил.



1. G04/G01: production manifest, реальные роли/pins/custody/параметры и публичный
   исполнитель с собственными guards; тестовые обходы не переносить.
2. Runtime-сборка: проверенные ABI/artifacts без динамической компиляции, отдельные
   runtime dependencies, изолированный install/start smoke и advisory reachability.
3. G07: серверные сервисы, signer/RPC, наблюдаемость, backup/restore, эксплуатационные лимиты.
4. R9: preflight, контролируемый запуск и наблюдение. Не менять frozen/claimable при переносе.

Технические материалы этого этапа сохранены в [каталоге](DOCUMENT_CATALOG.md),
но наличие черновика или готового VPS не делает deployment следующим действием.

## Сохранённые решения

PAIR — резерв. Порог/математика — [PRODUCT_SPEC](PRODUCT_SPEC.md). Нет reroll/reset,
подмены RNG или вывода призовой казны. Новые сети и дополнительные функции сайта —
отдельные будущие решения, не расширение текущего пакета.

## Контрольная точка04.10: эксплуатация после QuickNode

[Build проверен](QUICKNODE_PAID_2026-10-04.md), [read-only RPC переключён](QUICKNODE_CUTOVER_2026-10-04.md).
[Эксплуатационная проверка и fixes](OPERATIONS_FOLLOWUP_2026-10-04.md): индексатор
достиг lag0, но API воспроизвёл OOM. Порционная запись/checksum исправлены,
сервис восстановлен с прежним checkpoint. Финансовая автоматика выключена.
[История проекта](PROJECT_HISTORY_2026-10-04.md): новый режим хранит значимые
транзакции и хвост129 высот вместо пустых блоков; полнота пропусков доверяет RPC.
Серверная миграция до79513933:345.7MB→1.8MB, BUY/lifecycle/rewards совпали.
Финансовая автоматика выключена. Следующий пакет — разбор53 неподдержанных BUY
кандидатов; новый формат сохраняет их исходники. RPC readers paged10000.

## Ночной пакет04.10 — завершён в согласованных границах

[Отчёт](NIGHT_PACKAGE_2026-10-04.md): Sourcify match опубликован, fork BUY/SELL
PASS,53 записи разобраны (52 BUY+1 SELL), authorizations и SELL classification
исправлены,23/23 адресных tests. Новые router admissions не включены.
Далее: один проверенный adapter с явным решением по policy; explorer/GoPlus
обновление остаётся внешней зависимостью. Автоматика выключена.

## Позднее подтверждение покупок04.10 — тестовый пакет

[Механизм](PURCHASE_RECOGNITION.md), [проверки и границы](PURCHASE_RECOGNITION_2026-10-04.md).
Решение пользователя: старую подтверждённую покупку учитывать один раз только
для будущих draws. Реализованы commitment source, проверка router65050 proof,
carry по блоку подтверждения, API/UI pending/credited и сохранение evidence.
54 адресных tests и14 browser tests PASS;28 реальных покупок прошли read-only
проверку. В локальном replay с синтетическим подтверждением —14 ticket pairs;
24 других покупки остаются pending. Это НЕ начисление на боевом сервере.
[Review разобран](PURCHASE_RECOGNITION_REVIEW_2026-10-04.md): исправлен preparer
(дубли регистра, full replay пакета, source preflight, свежий admitted индекс);
15/15 адресных tests PASS. Решение владельца04.10: QuickNode достаточно; второй
RPC не является условием запуска. Доверие RPC раскрываем явно. До боевого confirm
остаются проверка полноты через QuickNode,24ч от публичного объявления и доступность
bundle. Следующий этап — подготовка первого малого подтверждения по плану review.
Перенос/автоматика этим пакетом не выполнялись.

[Source deployment подготовлен](RECOGNITION_DEPLOYMENT_2026-10-04.md): одна подпись
на локальной консоли4177, publisher executor, live preflight PASS.13 адресных tests
и исправленный catalog1/1 PASS. Владелец подписал: CREATE successful в79859732,
точный runtime/адрес/издатель совпали. Finality подтверждена
при finalized79876906; очередь completed1/pending=null.
[Объявление опубликовано](RECOGNITION_PUBLICATION_2026-10-04.md)04.10 в11:07:49UTC.
Первый confirm не раньше05.10 11:30UTC (14:30МСК) и после готовности readers,
полноты истории и bundle availability. Автоматика не включалась.
