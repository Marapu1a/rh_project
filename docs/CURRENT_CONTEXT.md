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

- [Review последних связок](AUTOMATION_REVIEW_2026-09-20.md): исправлен автоматический
  повтор begin после reorg с сохранившимся cutoff. Открыты два дефекта: permissionless
  TOKEN pay в USDG-only vault и блокировка нового collect неисправным project recipient.
  TOKEN-маршрут текущего deployment-профиля не готов для реальных средств.
  Затронутый набор **21/21** (~304 s); два теста подтверждают ещё открытые дефекты.
  Основной список теперь **201**, полного запуска 201 не было.

- Revenue-интеграция 20.09: **31/31** (~222 s): FeeRouter, funding/revenue и полный BUY-cycle.
  Добавлены семь отказных/интеграционных проверок. На этом шаге список содержал **198**;
  весь набор 198 не запускали. Solidity и денежная математика не менялись.

- [Локальный планировщик](LOCAL_PROMO_SCHEDULER.md): общий CLI, сохранение job до tx,
  restart из state, независимые Short/Monthly, schedule/empty/funding/seed waits,
  закрытие пустой draining epoch по replay и обновление лишь неначатого истёкшего cutoff.
  Два Short + два Monthly теперь проверены без ручного изготовления jobs; terminal reorg
  возвращает прежний job в работу. Аварийный stale lock/потеря state требуют recovery.
- [USDG funding](LOCAL_USDG_FUNDING.md): полученный доход распределяется существующими
  контрактами. [Revenue pass](LOCAL_USDG_REVENUE.md) теперь автоматизирует collect/harvest,
  сперва платит старые credits, изолирует известный отказ source и останавливается при
  неоднозначной отправке. Проценты и GENERAL для creator revenue —
  явно тестовая конфигурация, не утверждённая production экономика.
- [BUY cycle](LOCAL_BUY_CYCLE.md): carry, регистрация без backdating, новые BUY после cutoff,
  независимый расход Short/Monthly, win/no-win, старые claims и conservation USDG.
- Проверка 20.09: **11/11** (~259 s): пять scheduler-тестов, пять регрессий workers
  и прежний сквозной BUY-cycle. В основной список добавлены пять scheduler-тестов.
- Предыдущий затронутый набор funding: 24/24 (~185 s), 20.09. Полный baseline 19.09:
  176/176 до исправлений workers; затем отдельные 6/6 на receipt/cutoff и BUY-cycle.
  На шаге scheduler список содержал 191 тест; полного запуска 191 не было.
- Локальные runtime: Short 22 237, Monthly 17 453, vault 8 496 bytes; real RNG не включён.
  В шаге scheduler Solidity не менялся.

## Следующий ограниченный шаг

Новые модули приостановлены для review. Сначала разобрать [найденные проблемы](AUTOMATION_REVIEW_2026-09-20.md).
Ближайшее небольшое исправление — изоляция определённого отказа выплаты одному recipient,
с сохранением его credit и остановкой на неизвестном broadcast/receipt outcome.

Затем TOKEN → USDG: выбрать место конвертации/получателя до prize custody. Любой caller
может вызвать FeeRouter.pay(TOKEN, vault), поэтому off-chain пропуска TOKEN недостаточно.
При необходимости переработать связку recipients, не добавляя вывод prize funds.
[План](ROADMAP.md). Доводка остальных частей не заменяет устранения этих дефектов.

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

Правила — [PRODUCT_SPEC](PRODUCT_SPEC.md); код — [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md).
Архив открывать только с конкретным вопросом. Перед продолжением проверить git status:
локальные изменения предыдущих шагов могут ещё не быть закоммичены.
