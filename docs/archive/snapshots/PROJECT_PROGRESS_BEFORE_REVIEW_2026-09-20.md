# Исторический снимок до самопроверки 20.09.2026

Не текущий план. Содержит накопленные промежуточные статусы, местами противоречащие друг другу.
Актуальные входные файлы: [контекст](../../CURRENT_CONTEXT.md) и [план](../../ROADMAP.md).

## Snapshot: CURRENT_CONTEXT.md

# Текущий контекст

Обновлено 20.09.2026. Читать первым; подробная история не нужна для обычного продолжения.

## Где находимся

Собираем локальный MVP: спекулятивный TOKEN + отдельное добровольное промо,
6-часовой Short и месячный jackpot, денежные призы только USDG. Публичного deployment нет.
Приоритет пользователя: сначала достроить целый скелет, затем доводить по участкам.
Допускается переработка частей; локальные допущения не выдавать за production готовность.

Работает локальная цепочка:
`BUY → scan/replay → scheduler/builders → сохранённые jobs → Short/Monthly workers → prize/claim → следующий цикл`.
Отдельно соединено `source collect/harvest USDG → FeeRouter credits/pay → призовые резервы + recipients проекта`.
Это не PAIR fork. BUY-стенд упрощённый, RNG управляемый тестовый; контроллеры только chainId 31337.

## Последний результат

- Добавлен [локальный coordinator](../../LOCAL_PROMO_COORDINATOR.md): последовательный
  prize-flow → Short/Monthly scheduler, общий signer без параллельных writes,
  сохраняемый pending intent до broadcast и hash после ответа RPC. Unknown останавливает
  оба контура и restart; известный hash проверяется по receipt перед продолжением.
  Hashless crash/outage требует диагностики, force-clear нет. Solidity не менялся.
  `npm test`: 244/247 (~1142 s); все прежние **240/240** прошли. Три новых restart
  сценария обнаружили undefined metadata/checksum mismatch; сериализация исправлена.
  После фикса отдельный `test/local-coordinator.test.cjs`: **7/7**, fail 0 (~144 s).
  Полный набор после этой локальной правки повторно не запускали.

- Исправлен stale action/hash в prize-flow: lastConfirmed отделён от ошибки текущего intent.
  Scheduler теперь глобально останавливается на unknown tx/RPC, сохраняя stage/hash;
  Short/Monthly/closeEmpty используют явный estimate/broadcast/confirm. Общего coordinator нет.
  Bound default prize-flow закреплён формулой 123 <= 128 и maximal-legacy интеграцией.
  **42/42** проверок прошли; основной набор **240**, полностью не запускался.

- [Prize flow](../../LOCAL_PRIZE_FLOW.md): **11/11** новых проверок с реальным локальным CLI,
  **35/35** соседних регрессий. Основной набор **232**, целиком не запускался.
  Доход обоих активов автоматически проходит новый custody path; old recipient debt
  обслуживается по bounded списку. Real DEX и live PAIR не подключены.

- Добавлен LocalPrizeConverter и fixed swap fixture; модель/ограничения —
  [LOCAL_PRIZE_CONVERTER](../../LOCAL_PRIZE_CONVERTER.md). Converter **5/5**, tx/CLI **11/11**, BUY-cycle **1/1** из cwd без `.local`;
  runtime 4 556 bytes.
  Основной список **221**, целиком не запускался.
- После GPT review исправлены создание `.local` в BUY-тесте и структурированный
  CLI error с code/stage/transactionHash. Неизвестная tx по-прежнему останавливает writes.

- Recipient isolation: **37/37** FeeRouter/funding/BUY, **10/10** классификация tx,
  **5/5** соседние worker-регрессии. Основной набор **215**, целиком не запускался.
  C закрыт в локальном worker; TOKEN custody A остаётся открытым. Подробности —
  [LOCAL_USDG_REVENUE](../../LOCAL_USDG_REVENUE.md).

- [Review последних связок](../../AUTOMATION_REVIEW_2026-09-20.md): исправлен автоматический
  повтор begin после reorg с сохранившимся cutoff. На момент review были открыты два дефекта: permissionless
  TOKEN pay в USDG-only vault и блокировка нового collect неисправным project recipient.
  Второй затем исправлен; см. следующий шаг ниже.
  TOKEN-маршрут текущего deployment-профиля не готов для реальных средств.
  Затронутый набор **21/21** (~304 s); два теста подтверждают ещё открытые дефекты.
  Основной список теперь **201**, полного запуска 201 не было.

- Revenue-интеграция 20.09: **31/31** (~222 s): FeeRouter, funding/revenue и полный BUY-cycle.
  Добавлены семь отказных/интеграционных проверок. На этом шаге список содержал **198**;
  весь набор 198 не запускали. Solidity и денежная математика не менялись.

- [Локальный планировщик](../../LOCAL_PROMO_SCHEDULER.md): общий CLI, сохранение job до tx,
  restart из state, независимые Short/Monthly, schedule/empty/funding/seed waits,
  закрытие пустой draining epoch по replay и обновление лишь неначатого истёкшего cutoff.
  Два Short + два Monthly теперь проверены без ручного изготовления jobs; terminal reorg
  возвращает прежний job в работу. Аварийный stale lock/потеря state требуют recovery.
- [USDG funding](../../LOCAL_USDG_FUNDING.md): полученный доход распределяется существующими
  контрактами. [Revenue pass](../../LOCAL_USDG_REVENUE.md) теперь автоматизирует collect/harvest,
  сперва платит старые credits, изолирует известный отказ source и останавливается при
  неоднозначной отправке. Проценты и GENERAL для creator revenue —
  явно тестовая конфигурация, не утверждённая production экономика.
- [BUY cycle](../../LOCAL_BUY_CYCLE.md): carry, регистрация без backdating, новые BUY после cutoff,
  независимый расход Short/Monthly, win/no-win, старые claims и conservation USDG.
- Проверка 20.09: **11/11** (~259 s): пять scheduler-тестов, пять регрессий workers
  и прежний сквозной BUY-cycle. В основной список добавлены пять scheduler-тестов.
- Предыдущий затронутый набор funding: 24/24 (~185 s), 20.09. Полный baseline 19.09:
  176/176 до исправлений workers; затем отдельные 6/6 на receipt/cutoff и BUY-cycle.
  На шаге scheduler список содержал 191 тест; полного запуска 191 не было.
- Локальные runtime: Short 22 237, Monthly 17 453, vault 8 496 bytes; real RNG не включён.
  В шаге scheduler Solidity не менялся.

## Следующий ограниченный шаг

[Локальный prize-flow worker](../../LOCAL_PRIZE_FLOW.md) связал FeeRouter, converter и USDG vault:
collect/harvest обоих активов, pay/forward до swap, bounded legacy recipients,
изоляция definite отказов и stop на unknown tx. Отдельный local-prize-flow-v1 job/CLI.
Старые USDG jobs не изменены; unsafe legacy TOKEN→USDG-only credit только диагностируется.

Совместное локальное исполнение реализовано в coordinator, с минимальным pending marker.
Следующий разумный кусок — отдельный project gas budget: readiness, native buffer и
лимиты расхода из доли проекта. Не использовать frozen/claimable и не объявлять
coordinator полноценным journal/autorefill/production supervisor. Real DEX/price guard и RNG
остаются отдельными архитектурными решениями; fixed floor только для chainId 31337.

После этого остаются эксплуатационное финансирование и настоящий RNG с безопасной привязкой.
Draw scheduler и revenue worker пока запускаются отдельно; общего supervisor нет.

## Незакрытые границы

- Полнота snapshot доверена publisher; replay обнаруживает подлог, не блокирует его on-chain.
- Scheduler LOCAL_HEAD — допущение стенда, не finality. Fixed lead drand не решает stale
  clock/reorg-after-reveal; production future-round binding/adapter ещё не выбран.
- Есть локальные scheduler/workers, но нет incremental indexer, supervisor, durable mempool
  journal, autorefill и production контроллеров. Полная история перечитывается из RPC.
- Creator shares, формула D, K/weights, admission и execution budgets не утверждены для deployment.
- Локальная readiness не гарантирует газ на всё завершение; bootstrap тестовый.

## Опорные правила

Призы невозвратны проекту; free, reserved и claimable раздельны. Старые долги сохраняются.
После freeze нет reroll, замены random или административного reset. No-winner допустим,
недоставленный random не равен проигрышу. Luck удалён. Sponsor layer позже и отдельно.
FeeRouter recipient slots не являются Short/Current/Next accounting.

Правила — [PRODUCT_SPEC](../../PRODUCT_SPEC.md); код — [IMPLEMENTATION_STATUS](../../IMPLEMENTATION_STATUS.md).
Архив открывать только с конкретным вопросом. Перед продолжением проверить git status:
локальные изменения предыдущих шагов могут ещё не быть закоммичены.

## Последние продуктовые уточнения

Все денежные призы остаются USDG; TOKEN ждёт обмена до попадания в USDG-резервы.
Общий конвертер не запрещён: отдельный адрес на каждую campaign пока не принят.
Учёт начислений по campaign не равен обещанию отдельного USDG результата её продажи.
[Актуальная PAIR policy](../../PAIR_CURRENT_FEE_POLICY.md): V1 70/30 не переносится на Launch V2.
[Обращение к GPT](../../GPT_REVIEW_REQUEST.md) передаёт текущий контекст и границы шага;
ответ GPT — вспомогательный материал, не автоматическое задание.


## Snapshot: ROADMAP.md

# План разработки

20.09.2026. Порядок работ, не перечень автоматических разрешений на deployment.
Один шаг за раз. Детали следующего шага уточняются по существующему коду.

## 1. Выполнено локально: автоматический исполнитель Short

[Реализация и ограничения](../../LOCAL_SHORT_EXECUTOR.md), 19.09: library + loopback CLI,
возобновляемый job, полный BUY-cycle и проверки отказов. Затронутый набор 18/18.
Это single-job worker, не production daemon или автоматический генератор новых draws.

Вход: проверяемый dataset artifact, deployment bindings, доступ к локальной цепи.
Использовать существующие begin/publish/verify/seal/process/finish и recovery.
Сначала короткий draw. Ожидание seed — нормальное состояние, без ручного выбора исхода
или автоматического fallback. Разделить роль publisher и permissionless execution.

Готово, когда остановка между действиями и повторный запуск продолжают тот же draw,
не повторяют расход билетов/денег, а цикл из BUY завершается без ручной подачи каждого chunk.
Проверить readiness failure, pending RNG, повторный запуск и смену исполнителя.
Не включать в этот шаг drand/finality redesign, swap, frontend и спонсорские призы.

## 2. Выполнено для локальных jobs: Short + Monthly контур

[Результат](../../LOCAL_MONTHLY_EXECUTOR.md): два Short, два Monthly из BUY-истории,
win/no-win, Next funding, прямые переводы, независимый progress и старые claims.
Пустой текущий набор отбрасывает builder до freeze. Автоматическое создание jobs
и закрытие пустых draining epochs остаются задачей будущего scheduler, не worker.

Подключить реальную локальную BUY-историю к Monthly builder и автоматическому исполнению.
Проверить независимый прогресс, win/no-win, следующий jackpot, пустой/неготовый цикл,
сохранение старых claims и восстановления. Переиспользовать уже реализованные epochs.

## Контрольная точка 19.09: стабилизация локальных workers

Выполнен [ограниченный review](../../LOCAL_STABILIZATION_REVIEW.md): исправлены ожидание
receipt без срока и граница cutoff перед begin; добавлены пять отказных регрессий.
Укрепление согласованности чтения старых workers остаётся в списке улучшений,
но по решению пользователя 20.09 не блокирует достройку целого скелета.

## 3. Достроить целый контур продукта, затем укреплять участки

Приоритет пользователя 20.09: сначала увидеть всю работающую картину. Допустима
последующая переработка частей; локальные допущения не объявлять готовностью к запуску.

### 3а. Первый участок дохода: USDG funding

[Локальный worker](../../LOCAL_USDG_FUNDING.md) соединяет уже полученный USDG FeeRouter
с выплатой получателям и GENERAL-признанием в PromoVault. Проценты явно задаются
локальной конфигурацией; контракты и существующий учёт не изменены.
Collect/harvest позже соединены с funding отдельным revenue pass (ниже); TOKEN swap
и автоматические ops расходы не реализованы.
Проверка 20.09: 24/24 (FeeRouter, funding, общий BUY-cycle), пять новых регрессий.

### 3б. Реализовано локально: автоматическая подготовка jobs

[Планировщик](../../LOCAL_PROMO_SCHEDULER.md) связывает полный scan/replay/build с обоими
workers. State сохраняется до отправки; schedule, пустые наборы, empty draining epochs,
funding и pending RNG обрабатываются без ручного изготовления каждого job.
LOCAL_HEAD и тестовый RNG остаются явными ограничениями; это не production finality.
Проверка 20.09: **11/11** (scheduler, прежний BUY-cycle, регрессии workers).
Обычный restart продолжает сохранённую работу. Аварийный stale lock/потеря state
требуют recovery; все детали и проверки — в документе модуля.

### 3в. Реализовано локально: автоматический collect/harvest USDG

[Revenue pass](../../LOCAL_USDG_REVENUE.md): сначала выплатить старые credits, затем один
collect, harvest доступного USDG и повторный funding. Известный отказ collect не мешает
старому claim; неизвестный receipt/broadcast outcome останавливает отправки. Epoch drift
блокирует новую collection, но не старый bound-epoch claim. Watch имеет явный интервал.
Источник остаётся MockPairVault в тестах; live PAIR canary не проводился.
Проверка 20.09: **31/31** (FeeRouter, funding/revenue, BUY-cycle).

### Контрольная проверка 20.09 — новые модули приостановлены

[Review связок](../../AUTOMATION_REVIEW_2026-09-20.md): reorg-повтор begin исправлен локально;
TOKEN custody и остановка collection из-за project recipient остаются открытыми.
Проверка: 21/21, включая два воспроизведения открытых проблем; полного запуска 201 не было.
Изоляция определённого отказа recipient реализована отдельным шагом (см. LOCAL_USDG_REVENUE).
Проверено 37/37 + 10/10 + 5/5; полный набор 215 не запускался.
Неизвестная отправка по-прежнему останавливает writes. Следующая TOKEN-связка должна
устранить permissionless pay в несовместимую custody, а не просто добавить swap worker.

### 3г. Оставшиеся связи до заявления о полном скелете

Контрактный локальный [TOKEN → USDG proof](../../LOCAL_PRIZE_CONVERTER.md) реализован:
immutable destination, shared inventory, fixed test adapter/floor, balance delta,
независимый USDG forward. Converter 5/5, tx/CLI 11/11, BUY-cycle 1/1 без исходной .local; полного запуска 221 не было. Отдельный converter на campaign не требуется.
Реализован отдельный [local-prize-flow-v1](../../LOCAL_PRIZE_FLOW.md): оба source assets,
converter pay/forward/convert и bounded legacy list; 11/11 новых + 35/35 регрессионных проверок.
Полный набор 232 не запускался.
Старый job recipient=vault сохранён отдельно; unsafe legacy TOKEN debt не платим.
Перед coordinator исправлены stale error attribution и глобальная остановка scheduler
на unknown tx; известные отказы остаются изолированы. Prize-flow bound 123 <= 128 закреплён.
Проверки: 42/42, основной набор240 полностью не запускался.
Совместное локальное исполнение реализовано в [coordinator](../../LOCAL_PROMO_COORDINATOR.md):
последовательные sends, сохраняемый pending marker, receipt reconciliation перед restart.
Один state path/эксклюзивные signers; hashless crash не получает автоматического retry.
Проверки: прежние 240/240 в общем прогоне; новые 7/7 после исправления metadata checksum.
Общий прогон до фикса 244/247, после локальной правки повторён только coordinator.
Следующий ограниченный участок — отдельный project gas budget; scope уточнить до реализации.
Production DEX/price guard, поддержка изменения маршрутов и live PAIR binding не закрыты.

Эксплуатация: доля проекта → native buffer/RNG/executor, bootstrap и
лимиты расхода; frozen/claimable не используются. Creator shares требуют решения.
Случайность: явная finality/future-round модель и реальный adapter. Тестовая подача seed
позволяет проверять связи, но не закрывает эту часть продукта. Блокирующие проблемы
RNG решать как архитектурную задачу, а не скрывать за новым mock.

Готовый скелет означает связанный путь от покупки/дохода до повторного цикла и выплаты,
с перечисленными внешними зависимостями и без ручного выполнения каждого штатного шага.
Это ещё не production готовность и не завершённый аудит.

## 4. Укрепить границы для production

Выбрать явную publisher trust model, правила cutoff/finality и future-round binding;
проверить известные контрпримеры. Интегрировать настоящий verifier/adapter без подмены seed.
Собрать production-варианты контроллеров и повторно измерить весь deployment graph.
Сделать постоянный indexer: incremental replay, reorg/restart, сохранность данных,
независимый verify, резервные RPC. Локальный skeleton не заменяет эту работу.

## 5. Подготовить проверяемый выпуск

Единая воспроизводимая сборка/CI, явные результаты RPC-проверок, release manifest,
deployment/verification, мониторинг и runbook. Конкретный PAIR canary, отказные и
invariant/fuzz проверки, внешний аудит; интерфейс над устойчивыми API.
Перед публичным запуском отдельно оценить условия промо для целевых юрисдикций.
Продвижение к запуску — отдельное решение; срок не задан.

## Уже сделано

FeeRouter rollover/credits; три USDG-резерва; immutable dual capabilities;
registry и узкий BUY replay; Short/Monthly attempts и epochs; canonical settlement;
локальные контроллеры, async RNG stand-in, два Short-цикла из BUY до claim.
Подробности и доказательства — [карта кода](../../IMPLEMENTATION_STATUS.md).

## Позже, вне текущего MVP

Спонсорские/физические призы отдельным слоем; новые сети/площадки новым deployment.
Исследования Luck, монолитного контроллера и старых payout-моделей не являются backlog.
