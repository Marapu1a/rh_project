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
Следующий bounded пакет: автоматический сбор актуальных obligations и вызов funding из
coordinator с сохранением frozen-first приоритета. Сейчас обычный pass только восстанавливает
refill receipts; отправку вызывает trusted caller под тем же lock.
Конверсия доли проекта и real DEX/RNG отдельно; runtime volume не синхронизировать с checkout.
Provenance calibration (commit/dirty/toolchain/generators) остаётся небольшим открытым хвостом.

Finish/назначение награды и permissionless claim различаются: coordinator не отправляет
claims за победителей. Кто финансирует их gas — отдельная UX/ops политика.

## 3. Укрепить обычную эксплуатацию

Прежний intermittent handoff finding отозван без нового trace evidence. Диагностика
по runId/PID и CLI assertions сохранена. Подтверждённый PID-write/close initialization
cleanup исправлен, fault tests проверяют освобождение своего lock/fd и отказ чужому.
Relevant-action block-limit bug также исправлен и покрыт регрессиями.

Fault tests: storage errors до/после broadcast и receipt, abrupt process death,
receipt-read outage, mined revert через coordinator. Затем ограниченный recovery design
для stale lock/hashless tx/replacement и сохранности state. Не выдавать force-clear за
reconciliation. Сохранить независимость действий при доказанном отказе.

Сохранить разделение identity/ops; текущая история содержит pending/lastResolved, а не полный journal.
Укрепить согласованность RPC чтения. Определить один владеющий signer процесс/lease
и мониторинг; checksum файла не является защитой от оператора, меняющего данные.

## 4. Заменить внешние заглушки по отдельности

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
