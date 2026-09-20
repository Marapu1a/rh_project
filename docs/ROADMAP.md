# План разработки

20.09.2026. Один ограниченный пакет за раз. Публичный запуск — отдельное решение.
Основание текущего порядка: [самопроверка и переносимость](LOCAL_REVIEW_AND_PORTABILITY.md).

## 1. Уже связано локально

FeeRouter atomic rollover/credits; три USDG reserves; Short/Monthly controllers;
registry/BUY replay/builders; persisted scheduler jobs; prize-flow/converter;
последовательный coordinator с pending marker и receipt reconciliation.
Повторные циклы и claims проверены в локальном стенде; внешние интеграции тестовые.
Последние результаты проверок — [CURRENT_CONTEXT](CURRENT_CONTEXT.md), карта —
[IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md).

## 2. Следующий пакет: project gas budget и readiness

Сначала короткий API/model: network/deployment identity отдельно от разрешённых
операционных настроек. Не строить универсальный framework. Существующий state guard
не обходить новым path или сбросом pending ради изменения gas cap/poll interval.

Затем локальная модель бюджета:
- separate balances для gas publisher/executor и RNG fee в controller;
- стоимость оставшегося исполнения, запас и одновременные Short/Monthly обязательства;
- started draws приоритетнее новых freeze и необязательных операций;
- ждать при дорогом gas/недостатке средств, не обещать расходование prize balances;
- источник финансирования — bootstrap и только свободная доля проекта.

Различать finish/назначение награды и отдельный permissionless claim: coordinator
пока не отправляет claims за победителей. Кто финансирует их gas — явная UX/ops политика.

Готово: при недостаточном ops budget новый draw не замораживается; уже начатые
обязательства учитываются без двойного использования одной суммы; пополнение/снижение
цены возобновляет исполнение. Проверить два различных локальных fee-профиля.
Это расчёт/проверки/локальная связка. Реальный обмен проектных средств в native и
автопополнение — следующий отдельный пакет после модели, не скрытое расширение этого.
Creator shares и конкретные production лимиты требуют явного выбора.

## 3. Укрепить обычную эксплуатацию

Fault tests: storage errors до/после broadcast и receipt, abrupt process death,
receipt-read outage, mined revert через coordinator. Затем ограниченный recovery design
для stale lock/hashless tx/replacement и сохранности state. Не выдавать force-clear за
reconciliation. Сохранить независимость действий при доказанном отказе.

Разделить immutable identity и ops settings с проверяемой историей применённой политики.
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
