# План разработки

21.09.2026. Один ограниченный пакет за раз. Публичный запуск — отдельное решение.
Основание текущего порядка: [самопроверка и переносимость](LOCAL_REVIEW_AND_PORTABILITY.md).

## 1. Уже связано локально

FeeRouter atomic rollover/credits; три USDG reserves; Short/Monthly controllers;
registry/BUY replay/builders; persisted scheduler jobs; prize-flow/converter;
последовательный coordinator с pending marker и receipt reconciliation.
Повторные циклы и claims проверены в локальном стенде; внешние интеграции тестовые.
Последние результаты проверок — [CURRENT_CONTEXT](CURRENT_CONTEXT.md), карта —
[IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md).

## 2. Реализовано локально: project gas model/readiness

[Execution budget](LOCAL_EXECUTION_BUDGET.md) включается через ops profile: остаток
process/finish для frozen Short/Monthly, текущая подготовка/кандидат, RNG fee отдельно,
один native balance на фактический адрес. Draw-first/frozen-first, ожидание native funding
и дорогого gas, preflight до estimate и перед prepared intent.

Network/deployment identity и signer roles отделены от poll/timeout/gas threshold.
Проверяемая миграция старого state допускается только без unresolved marker. Settings
сохраняются в intent; повышение наблюдаемого gas повышает прогноз, а не запрещает навсегда
исполнение по старой оценке. Два локальных fee profiles и example JSON есть в модуле.

Это off-chain gate выбранного coordinator, не escrow, не автообмен и не запрет прямого
permissionless seal. Начальная калибровка ещё не доказана для всех максимальных datasets.
Нельзя объявлять физическое завершение гарантированным по результатам fixture-тестов.
Призовые средства не оплачивают эксплуатацию. Creator shares не утверждены.

[Первая калибровка](LOCAL_EXECUTION_CALIBRATION.md) выполнена для N100/1k/10k,
chunks64, normal10/admitted64 и двух seed. Отдельные Short/Monthly на N1k; бюджет
на границе и 34 clean CLI handoffs при фиксированных 2 gwei. Это sampled envelope,
не общий MAX_N и не доказательство worst-case. Пример calibrated profile отдельный.

[Чистый native refill planner](LOCAL_NATIVE_REFILL.md) готов: source floor, low/target,
gas и caps, cooldown/period, priority/partial funding, anchor/pending/history domain.
Готовы pure intent/hash/receipt transitions и actual expense ledger; mined revert включает
cooldown. Приоритет committed → candidate → buffers. Typed pending защищён от generic recovery.
Bootstrap-native executor готов: source/provider binding, anchored balances, estimate/head/nonce
revalidation, durable intent/hash и typed receipt recovery в coordinator; один перевод за вызов.
Fee-envelope fix выполнен: known hash при mismatch, actual receipt accounting и durable stop.
Автосбор committed/candidate obligations и bounded refill подключены к coordinator и CLI.
Общий snapshot anchor, один refill за pass, source/domain config binding, frozen-first и idle buffers.
22.09: pre-migration admission исправлен: target coverage и history domain проверяются
до записи новой identity; rejected upgrade оставляет state неизменным.
22.09: review admission и inspector учтён; общий identity builder и независимый inspection manifest готовы локально.
Конверсия доли проекта и real DEX/RNG отдельно; runtime volume не синхронизировать с checkout.
Provenance calibration (commit/dirty/toolchain/generators) остаётся небольшим открытым хвостом.

Finish/назначение награды и permissionless claim различаются: coordinator не отправляет
claims за победителей. Кто финансирует их gas — отдельная UX/ops политика.

## 3. Укрепить обычную эксплуатацию

22.09: добавлен [единый review runner](REVIEW_TESTING.md): detached HEAD, отдельный
runtime, npm ci из lockfile, полный npm test и сохранение failure/cleanup evidence.
Полный канонический baseline на e0407e1 — 334/334, cleanup OK. 23.09: role-casing identity исправлен, canonical baseline 0e5d8ea — 336/336, cleanup OK. Далее независимое review пакета.
Manifest redesign/venue/RNG/recovery не смешивать с процедурой review.
23.09: принят соразмерный объём тестирования (AGENTS/REVIEW_TESTING); full не обязателен
для каждого шага. Группы/фильтры, compile-once и per-file timing готовы: 341/341 на 4efca7d,
18m49s compilation+tests вместо 24m27s. Малые шаги проверять адресно по карте REVIEW_TESTING.
Snapshot reuse и concurrency — отдельные будущие оптимизации, сейчас не требуются.

Прежний intermittent handoff finding отозван без нового trace evidence. Диагностика
по runId/PID и CLI assertions сохранена. Подтверждённый PID-write/close initialization
cleanup исправлен, fault tests проверяют освобождение своего lock/fd и отказ чужому.
Relevant-action block-limit bug также исправлен и покрыт регрессиями.

22.09: process-death проверки refill в пяти точках + receipt RPC outage прошли;
[матрица восстановления](LOCAL_NATIVE_REFILL_RECOVERY.md). Это child refill + shared journal,
не kill всего draw/prize coordinator; stale lock в runtime не снимается автоматически.
Storage faults и mined revert покрыты предыдущими тестами. Read-only inspector добавлен:
[диагностика](LOCAL_NATIVE_REFILL_INSPECTOR.md), JSON/nextAction без изменения state.
23.09: CLI --watch получает ограниченный retry временных RPC read outages,
с backoff и обязательной сверкой known pending перед новой работой. Unknown send,
state/config/lock ошибки остаются stop. Проверка этого пакета адресная.
23.09: после принятого watch review ближайший шаг — [численный профиль MVP](MVP_ECONOMIC_PROFILE.md),
обсуждение кандидатов и затем economic/farming sweep. Новые цифры пока не утверждены.
По указанию владельца sponsor/merchant обсуждение отложено в отдельную ветку:
[архив](archive/studies/SPONSOR_PARTNERSHIP_DISCUSSION_2026-09-23.md), без реализации.
Первый economic slice выполнен: 72 single-draw concentration сценария и 9 funding;
[Calendar/carry/concentration](MVP_CALENDAR_CHECK.md) проверены 520 модельными прогонами
по 120 дней. Окончательные параметры и реальные расходы исполнения ещё не закрыты.
Recovery design для stale lock/hashless tx/replacement и сохранности state остаётся
до production, с привязкой к выбранному deployment runtime/supervisor. Не выдавать force-clear за
reconciliation. Сохранить независимость действий при доказанном отказе.

Сохранить разделение identity/ops; текущая история содержит pending/lastResolved, а не полный journal.
Укрепить согласованность RPC чтения. Определить один владеющий signer процесс/lease
и мониторинг; checksum файла не является защитой от оператора, меняющего данные.

## 4. Заменить внешние заглушки по отдельности

23.09: [read-only dossier](PAIR_PROFILE_EVIDENCE_2026-09-23.md) готов с явными unknown.
23.09: [TOKEN/USDG reference](PAIR_USDG_REFERENCE_2026-09-23.md) найден у чужого
deployment: LP binding и реальные BUY receipts сохранены. Выявлен другой route
0x060c0f. Adapter и негативные fixtures реализованы opt-in (см. DIRECT_BUY_REPLAY).
24.09: versioned BUY policy в pure lifecycle replay готова, старый snapshot domain
сохраняется по cutoff. 24.09 [публикация BUY policy](BUY_POLICY_ADMISSION.md)
соединена: source → prepare/publish → admission + completeness → builders → scheduler.
Далее deployment bindings/finality/notice и review риска авторизованного неверного
JSON; source collect/claim на fork остаётся отдельной интеграцией.
Наш токен ещё не запущен, local guards сохраняются.

- Источник комиссий и venue BUY: проверяемая интеграция конкретной площадки, сохранение
  rollover semantics, code/binding evidence и воспроизводимый decoder.
- Реальный swap: ликвидность/price guard/slippage/deadline и immutable prize destination.
  Отдельно решить судьбу застрявшего inventory при отказе immutable adapter.
- RNG: finality/future-round binding, delivery/fees, production provider/adapter;
  без fallback seed или reroll. Доказать readiness до freeze, измерить runtime/gas заново.

RNG и swap можно проектировать независимо, но ни один не считается закрытым за счёт mock.
После выбора production RNG повторно проверить полный бюджет исполнения из пункта 2.

## 5. Доказать переносимость и устойчивость всего контура

Переиспользовать ядро reserves/credits/settlement. Для каждого deployment явно задать
chainId/instance/assets/decimals/source/BUY route/block model/fees/RNG/swap/compiler.
Второй локальный профиль должен обнаруживать скрытые допущения первого; затем fork/canary
выбранной сети. Неизвестный профиль не становится поддержанным после замены chainId.

Постоянный incremental indexer, reorg/restart, публичный verify и publisher trust model;
не смешивать сетевые thresholds/finality с правилами распределения призов.
Общий тест: BUY → доход → funding → draw → claim → следующий цикл, с реальными adapters.

## 6. Подготовить проверяемый выпуск

CI/reproducible builds, deployment manifest/code hashes/verification, RPC backups,
observability/runbook, invariant/fuzz и внешний аудит, интерфейс над устойчивыми API.
Проверить EVM revision и размеры всех runtime с настоящим RNG, не только local skeleton.
Условия промо для выбранных юрисдикций оценить отдельно перед публичным запуском.

## Не входит в ближайшие пакеты

Sponsor/physical prizes — отдельный слой. Межсетевой bridge/общая казна и не-EVM порт
не спроектированы. Luck и старые payout-модели не backlog. Поддержка новых сетей не даёт
прав менять старую custody, выводить средства или заменять уже зафиксированный random.

Исторические шаги и их промежуточные test counts сохранены
[в снимке](archive/snapshots/PROJECT_PROGRESS_BEFORE_REVIEW_2026-09-20.md).

23.09: welcome bonus отклонён. Scheduled direct decoder 0x060c0f реализован
локально; versioned policy history теперь поддержана pure replay. Обычная замена
manifest всё ещё недопустима. Публикация/admission связаны локально в 55b23a0.
24.09: [исследование маршрутов](ROUTE_RESEARCH_2026-09-24.md) завершает read-only
разведку перед расширением. Typed source/admission реализованы: ids расширяемы
без JSON и без candidate registry, старый cutoff изолирован от неизвестной версии.
Далее независимый replay persisted dataset до begin и один подтверждённый route
adapter с future activation. Новые способы BUY в этом пакете не добавлены.
Replay persisted dataset перед первым begin остаётся отдельным незакрытым пунктом.
Сайт/объявления/частотная статистика отдельно; публичный запуск не разрешён.
