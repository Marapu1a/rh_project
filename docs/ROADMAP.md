# План разработки

20.09.2026. Порядок работ, не перечень автоматических разрешений на deployment.
Один шаг за раз. Детали следующего шага уточняются по существующему коду.

## 1. Выполнено локально: автоматический исполнитель Short

[Реализация и ограничения](LOCAL_SHORT_EXECUTOR.md), 19.09: library + loopback CLI,
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

[Результат](LOCAL_MONTHLY_EXECUTOR.md): два Short, два Monthly из BUY-истории,
win/no-win, Next funding, прямые переводы, независимый progress и старые claims.
Пустой текущий набор отбрасывает builder до freeze. Автоматическое создание jobs
и закрытие пустых draining epochs остаются задачей будущего scheduler, не worker.

Подключить реальную локальную BUY-историю к Monthly builder и автоматическому исполнению.
Проверить независимый прогресс, win/no-win, следующий jackpot, пустой/неготовый цикл,
сохранение старых claims и восстановления. Переиспользовать уже реализованные epochs.

## Контрольная точка 19.09: стабилизация локальных workers

Выполнен [ограниченный review](LOCAL_STABILIZATION_REVIEW.md): исправлены ожидание
receipt без срока и граница cutoff перед begin; добавлены пять отказных регрессий.
Укрепление согласованности чтения старых workers остаётся в списке улучшений,
но по решению пользователя 20.09 не блокирует достройку целого скелета.

## 3. Достроить целый контур продукта, затем укреплять участки

Приоритет пользователя 20.09: сначала увидеть всю работающую картину. Допустима
последующая переработка частей; локальные допущения не объявлять готовностью к запуску.

### 3а. Первый участок дохода: USDG funding

[Локальный worker](LOCAL_USDG_FUNDING.md) соединяет уже полученный USDG FeeRouter
с выплатой получателям и GENERAL-признанием в PromoVault. Проценты явно задаются
локальной конфигурацией; контракты и существующий учёт не изменены.
Collect/harvest позже соединены с funding отдельным revenue pass (ниже); TOKEN swap
и автоматические ops расходы не реализованы.
Проверка 20.09: 24/24 (FeeRouter, funding, общий BUY-cycle), пять новых регрессий.

### 3б. Реализовано локально: автоматическая подготовка jobs

[Планировщик](LOCAL_PROMO_SCHEDULER.md) связывает полный scan/replay/build с обоими
workers. State сохраняется до отправки; schedule, пустые наборы, empty draining epochs,
funding и pending RNG обрабатываются без ручного изготовления каждого job.
LOCAL_HEAD и тестовый RNG остаются явными ограничениями; это не production finality.
Проверка 20.09: **11/11** (scheduler, прежний BUY-cycle, регрессии workers).
Обычный restart продолжает сохранённую работу. Аварийный stale lock/потеря state
требуют recovery; все детали и проверки — в документе модуля.

### 3в. Реализовано локально: автоматический collect/harvest USDG

[Revenue pass](LOCAL_USDG_REVENUE.md): сначала выплатить старые credits, затем один
collect, harvest доступного USDG и повторный funding. Известный отказ collect не мешает
старому claim; неизвестный receipt/broadcast outcome останавливает отправки. Epoch drift
блокирует новую collection, но не старый bound-epoch claim. Watch имеет явный интервал.
Источник остаётся MockPairVault в тестах; live PAIR canary не проводился.
Проверка 20.09: **31/31** (FeeRouter, funding/revenue, BUY-cycle).

### Контрольная проверка 20.09 — новые модули приостановлены

[Review связок](AUTOMATION_REVIEW_2026-09-20.md): reorg-повтор begin исправлен локально;
TOKEN custody и остановка collection из-за project recipient остаются открытыми.
Проверка: 21/21, включая два воспроизведения открытых проблем; полного запуска 201 не было.
Изоляция определённого отказа recipient реализована отдельным шагом (см. LOCAL_USDG_REVENUE).
Проверено 37/37 + 10/10 + 5/5; полный набор 215 не запускался.
Неизвестная отправка по-прежнему останавливает writes. Следующая TOKEN-связка должна
устранить permissionless pay в несовместимую custody, а не просто добавить swap worker.

### 3г. Оставшиеся связи до заявления о полном скелете

Контрактный локальный [TOKEN → USDG proof](LOCAL_PRIZE_CONVERTER.md) реализован:
immutable destination, shared inventory, fixed test adapter/floor, balance delta,
независимый USDG forward. Converter 5/5, tx/CLI 11/11, BUY-cycle 1/1 без исходной .local; полного запуска 221 не было. Отдельный converter на campaign не требуется.
Реализован отдельный [local-prize-flow-v1](LOCAL_PRIZE_FLOW.md): оба source assets,
converter pay/forward/convert и bounded legacy list; 11/11 новых + 35/35 регрессионных проверок.
Полный набор 232 не запускался.
Старый job recipient=vault сохранён отдельно; unsafe legacy TOKEN debt не платим.
Перед coordinator исправлены stale error attribution и глобальная остановка scheduler
на unknown tx; известные отказы остаются изолированы. Prize-flow bound 123 <= 128 закреплён.
Проверки: 42/42, основной набор240 полностью не запускался.
Следующий ограниченный участок — совместное локальное исполнение revenue и draw jobs
с разделением signer/nonce и отдельным project gas budget; scope уточнить до реализации.
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
Подробности и доказательства — [карта кода](IMPLEMENTATION_STATUS.md).

## Позже, вне текущего MVP

Спонсорские/физические призы отдельным слоем; новые сети/площадки новым deployment.
Исследования Luck, монолитного контроллера и старых payout-моделей не являются backlog.
