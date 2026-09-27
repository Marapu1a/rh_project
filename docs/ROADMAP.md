# План разработки

27.09: [Infinity BUY → automatic entries](INFINITY_BUY.md) реализован отдельной genesis policy: net USDG debit с fees минус refunds, без регистрации; V2 не изменён. Новый fork:2BUY→2entries+6.60carry→admitted scan→scheduler begin/publish; повторный replay стабилен. Адресно43/43 + saved evidence2/2, без full. Ближайший шаг — production RNG и сквозное исполнение до выплаты; integration budget/RNG пока локальные fixtures.

27.09 review worker: исправлена диагностика deficit при последнем pay; адресно2/2. [Ограничение автоматизации](INFINITY_WORKER.md): максимум8 legacy witnesses, новый job/state после rollover; до релиза закрыть обход старых долгов и обновление job. Следующий продуктовый шаг — Infinity decoder/automatic genesis после выбора базы билетов.

27.09: [Infinity worker/CLI/watch](INFINITY_WORKER.md) реализован с existing state lock/journal/receipt boundary. Pull→pay→GENERAL, source drift не блокирует старые credits, unknown sends не повторяются, gas/native shortages→wait. Worker7/7 + additions2/2, shared17pass, saved1/1; final reconciliation2/2 повторно. Новый fork+3USDG в reserves, rerun0tx. Только local31337/loopback: mainnet admission/keys/shared budget ещё отдельно. Далее Infinity decoder/automatic genesis; база билетов требует решения.

27.09: [InfinityCollector + GENERAL funding](INFINITY_COLLECTOR.md) реализованы отдельно от V2. Atomic rollover, source fingerprint до/после claim, old credits доступны при drift; fixed Promo pay+sync. Новый fork complete:5.934270USDG в reserves (fees+18raw direct). Адресно52pass, fixture failure исправлен1/1, добавления2/2; не единый55/55 и не full. Далее review и узкий worker с existing reconciliation; Infinity entries/genesis отдельно, gross basis пока не утверждена.

27.09: пользователь выбрал Infinity3% для первого релиза. [План и вопросы GPT](GPT_REVIEW_REQUEST.md) обновлены с учётом review beeef4e. Ближайший пакет — USDG collector/campaign boundary и fixed funding; API/bind/policy drift обсуждаем до кода. Далее Infinity decoder+automatic eligibility, workers и сквозной proof. V2 не развиваем параллельно, старый код сохраняем.

27.09: выбраны3% Infinity creator fee. [Новый USDG fork](INFINITY_INTEGRATION_RESEARCH.md) complete: launch→BUY→contract claim→SELL→contract claim; receiver получил5.934252USDG. Offline4/4, full не запускался. Это локальный fixture, не production collector. Далее ограниченная модель collector/campaign boundary и подключение к funding; decoder/admission отдельно.

27.09: [Infinity source/receipt research](INFINITY_INTEGRATION_RESEARCH.md): BUY/SELL fee formulas подтверждены, дополнительный pool fee в примере1.1098%. Creator recipient может быть контрактом, но текущий FeeRouter ABI несовместим. Следующий research proof — новый USDG launch + contract claim на fork; переход сети/venue и ставка ещё не выбраны.

27.09: по запросу пользователя сравнили Infinity policy fees1–5%: [расчёты](INFINITY_FEE_SCENARIOS.md). Документация описывает дополнительные0.3% protocol и отдельный pool fee. Внутренние10/90 — кандидат; ставка и переход на Infinity не выбраны. До продолжения integration уточнить реальный hook/vault/fee base; automatic eligibility остаётся следующим продуктовым пакетом.

26.09: native BUY/admission/replay завершён: существующий direct decoder подходит
новому mode1 TOKEN/USDG pool, реальные fork receipts воспроизводят ticket ledger.
Следующий bounded шаг — спроектировать и реализовать версию automatic eligibility:
явная граница новых правил, неизменность старых snapshot/carry и честные условия сайта.
Автоматические выплаты — после этого; PAIR UI/новые маршруты не считаются доказанными.

26.09: [pinned source manifest/monitor](PAIR_SOURCE_HEALTH.md) реализован и проверен
на новом native fork. Read-only diagnostics, без auto-accept и общего coordinator stop.
Следующий bounded шаг — native BUY→admission/replay; затем версионированная automatic
eligibility без registration gate и payout worker. Production deployment admission отдельно.

26.09: узкая [source-read isolation](LOCAL_PRIZE_FLOW.md) реализована без новых прав
и без ослабления transaction reconciliation. Pinned source health реализован выше;
далее native BUY eligibility и automatic payout. Recovery постоянной поломки
source остаётся отдельным решением, transient RPC handling его не заменяет.

26.09: выполнен [native launch proof](NATIVE_LAUNCH_PROOF.md): новый проект без PAIR
impersonation, bootstrap, проверенный bind, BUY→collect→claim→GENERAL. Неверная
позиция больше не расходует одноразовую привязку. Source read failure isolation добавлена;
pinned health check затем реализован выше; native BUY eligibility и automatic payout до релиза.

26.09: пакет PAIR/AUTO прошёл [ревью GPT](GPT_REVIEW_RESPONSE.md); launch/bind замечания
закрыты пакетом выше. В релизном плане сохранить automatic eligibility/payout из прежнего
обсуждения: пока register-before-BUY и отсутствие payout-worker остаются фактом кода.

26.09: fresh native mode1 graph и денежная цепочка сверены; подтверждена внешняя
граница CTO/recipient replacement. [Аудит и порядок укрепления](PAIR_DEPENDENCY_BOUNDARY.md).
Launch→FeeRouter на local fork выполнен; далее worker source-failure
isolation и pinned health check. Recovery epoch/source требует отдельного accounting
решения; не считать произвольную замену source готовой или безопасной.

25.09 launch compatibility: AUTO относится к V1, текущий FeeRouter source — к V2 native.
Единого launch profile пока нет. Рекомендован к проверке V2 native TOKEN/USDG
с единственным recipient=FeeRouter; это ещё не утверждённый режим запуска.
Fresh release graph и создание такой связки на fork проверены 26.09, см. выше.
[Сверка и ограничения](PAIR_LAUNCH_COMPATIBILITY.md).

25.09: PAIR выбран. Manual/AUTO research и узкий V1 AUTO adapter завершены локально:
USDG funding, 1–2 legs, registration/admission/scan/replay на fork, tests 55/55.
Следующий ограниченный шаг — соответствие выбранного launch release/fee mode
и фактического UI маршрута поддержанному профилю; публичная активация отдельно.
[Границы](DIRECT_BUY_REPLAY.md). Conversion guards/RNG/релиз этим не закрыты.

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
JSON заменён typed ids; остаточная власть publisher описана в BUY_POLICY_ADMISSION.
24.09: [сквозной Permit2 fork](PERMIT_BUY_INTEGRATION.md) связал BUY, future activation,
admission, dataset и pre-begin gate scheduler; оригинал прошёл begin/publish.
Deployment bindings/finality/notice остаются открыты. 24.09 [reference source fork](FEE_SOURCE_INTEGRATION.md)
проверил collect/claim и, при LOCAL назначении FeeRouter штатным policy API, harvest/rollover/pay.
Это условная source integration, не наши публичные права над reference vault.
Следующий отдельный пакет — реальный venue TOKEN→USDG converter и price/slippage guard.
Наш токен ещё не запущен, local guards сохраняются.

- Источник комиссий и venue BUY: проверяемая интеграция конкретной площадки, сохранение
  rollover semantics, code/binding evidence и воспроизводимый decoder.
- Реальный swap: ликвидность/price guard/slippage/deadline и immutable prize destination.
  24.09 выбран объявляемый с задержкой replacement adapter без смены назначения денег.
  [Механизм и обязательные price checks](SCHEDULED_PRIZE_CONVERTER.md) реализованы локально,
  9/9 tests. Отдельно выбрать реальный источник цены и подключить venue/worker нового ABI.
  Immutable priceSource остаётся внешней границей доступности; burn не добавлен.
  [Исследование цены 24.09](PRICE_SOURCE_RESEARCH.md): reference hook stale;
  pre-swap sampling расходится с post-swap интервалами. Не выбран production oracle.
  25.09 пользователь выбрал market execution с доверенным executor, без обязательного
  oracle. [Порционная модель](CONVERSION_TRIGGER.md) реализована локально в converter/worker.
  [V4 venue/quote](V4_MARKET_EXECUTION.md) + wiring CLI/coordinator проверены локально
  и на reference fork. Далее launch bindings, параметры ликвидности/cost и executor recovery.
  Публичный запуск не готов.
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
Независимый replay persisted dataset до begin реализован в scheduler/coordinator:
полный artifact сравнивается с историей, begun jobs остаются на chain commitments.
Standalone workers этой проверки не добавляют; production publication отдельно.
Подтверждённый Permit2 adapter завершён ниже; дальнейшее расширение — по новым evidence.
Сайт/объявления/частотная статистика отдельно; публичный запуск не разрешён.

24.09: positive 0x0a10/0x060b0e USDG BUY получен на controlled local fork
настоящего router/Permit2 и существующего reference pool. Historical block недоступен,
свежий fork работает после mining local Cancun block. Подробности в ROUTE_RESEARCH.
Узкий decoder rh-ur-0a10-060b0e-v1, negative vectors и typed future activation
реализованы и проверены локально. Existing policies не активируют его автоматически.
Review ffad0e0 принят, интеграционный fork описан в §4; публичные authority/notice/
finality и deployment по-прежнему не утверждены.

24.09, уточнение следующего swap-пакета: [CONVERSION_TRIGGER](CONVERSION_TRIGGER.md).
Принят expected funding trigger / actual USDG accounting. Planner проверен 4/4;
следом quote + worker integration нового ABI, без отмены price guard.

25.09: Short-only gate отменён; порционное GENERAL funding — актуальный план.
