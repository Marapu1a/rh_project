# Обращение к GPT — связанный локальный MVP и ближайшие исправления

20.09.2026. Активный запрос на независимое ревью кода и решений.
Предыдущие ответы/исследования находятся в archive; они не заменяют текущую задачу.
Ответ запиши в `docs/GPT_REVIEW_RESPONSE.md`, перезаписав этот единственный файл ответа.
Укажи commit, который действительно прочитал. Не меняй код в рамках ответа.

## Что просим сейчас

Мы собрали существенно больше связей между модулями и сделали локальный review.
Нужен самостоятельный взгляд: верны ли найденные проблемы, достаточно ли узкого
исправления reorg, как исправить остановку collection из-за одного recipient и где
правильно разместить TOKEN → USDG, чтобы не закрепить плохую архитектуру.

Не нужен очередной общий список «добавьте аудит, мониторинг, KYC, frontend, governance».
Нужны конкретные выводы по текущему коду, воспроизводимые сценарии и один-два разумных
следующих пакета. Не соглашайся с нашими выводами автоматически: опровергай их, если
код показывает другое. Исторические идеи не возвращать в продукт без явного обоснования.

## Порядок чтения и граница публикации

1. [CURRENT_CONTEXT](CURRENT_CONTEXT.md), [ROADMAP](ROADMAP.md), [PRODUCT_SPEC](PRODUCT_SPEC.md).
2. [Последний review](AUTOMATION_REVIEW_2026-09-20.md) — три конкретных finding и воспроизведения.
3. [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md) — карта реально реализованного.
4. Ниже перечислены код и тесты конкретных связок. Архив открывать только с конкретным вопросом.

Этот пакет включает накопленную работу после `00a36ee`: local controllers, BUY-cycle,
workers, scheduler, funding/revenue, регрессии и реорганизацию документации. Старые
исследования перенесены в docs/archive, а не объявлены текущими требованиями.
Публичного deployment нет. Мы публикуем локальный прототип с явно открытыми дефектами,
а не release candidate. Solidity-контракты изменялись при сборке local controllers;
последние шаги orchestration/review не меняли денежную математику и Solidity.

## Продукт и неизменяемые границы

Спекулятивный meme TOKEN + отдельное добровольное Promo. 6-часовой Short и месячный jackpot,
денежные призы в USDG. Спонсорские/физические призы — будущий дополнительный слой.

- Призовые деньги невозвратны проекту. Free, frozen/reserved и claimable — разные состояния
  средств; одна сумма не должна учитываться дважды. Старые долги победителям сохраняются.
- Доля проекта отделяется от creator revenue до prize custody. Sponsor funding не создаёт
  project fee. FeeRouter recipient slots не равны Short/Current/Next reserves.
- У внешнего GENERAL funding фазовое распределение 3:2:1 до заполнения Next; overflow
  Next идёт в Current. После заполнения Next — 50/50 Short/Current. Fixed target MVP —
  100 USDG; raw величины тестовых fixtures не являются production экономикой.
- Доли creator revenue и применение GENERAL к его prize части ещё не утверждены для
  deployment. 80/20, 50/50 и budget 101 в тестах — примеры связи, а не принятые числа.
- Нет owner withdrawal из призовой казны, замены controller, proxy, arbitrary calls,
  административного reroll/reset или подмены seed. Не предлагать их как быстрый обход.
- TOKEN, Promo и права инвесторов не смешиваются. Luck удалён. No-winner допустим;
  недоставленный RNG не означает проигрыш. Sponsor слой не должен менять базовую custody.
- Автоматизация должна обходиться без человека, постоянно нажимающего collect/publish/finish.
  При этом 100% бесперебойность не обещаем; сложный emergency recovery пока не строим.

## Почему мы движемся именно так

Владелец выбрал сначала закончить связанный скелет, чтобы видеть всю систему, а затем
проходить участок за участком и укреплять его. Не хотим бесконечно оптимизировать worker,
пока он не связан с доходом или следующим циклом. Если целая картина покажет неудачную
архитектуру, допустимо заменить существенный кусок до deployment.

После последних finding договорились сделать короткую остановку для fixes:
**изоляция отказа recipient → TOKEN-маршрут вместе с конвертацией → дальнейший скелет**.
Reorg-ошибка уже исправлена узко. Не хотим делать временный TOKEN rescue, который потом
придётся обходить или который нарушит доверие к prize custody.

## Что реально работает

### Контроллеры и существующая бухгалтерия

[FeeRouter](../contracts/FeeRouter.sol): fixed source binding, cumulative split/credits,
permissionless pay, atomic rollover. Успешный rollover — accounting boundary, endsAt
только расписание. Перед сменой policy доход относится к старой кампании; старые unpaid
credits сохраняются. Это не граница Short/Monthly eligibility и не правило TOKEN conversion.

[DualControllerPromoVault](../contracts/DualControllerPromoVault.sol) и
[PromoVault](../contracts/PromoVault.sol): общая казна с раздельными полномочиями Short/Monthly,
три free reserves, frozen budgets, rewards/claims и переходы Current/Next.

[LocalShortController](../contracts/LocalShortController.sol),
[LocalMonthlyController](../contracts/LocalMonthlyController.sol), [ILocalRandom](../contracts/ILocalRandom.sol).
Оба local controllers разрешены только на chainId 31337. Publisher и permissionless
executor разделены; async RNG имеет request binding. Provider в тесте управляемый.
Последние локальные runtime: Short 22237, Monthly 17453, vault 8496 bytes, без production RNG.

### От покупок до следующих циклов

[BUY-cycle](LOCAL_BUY_CYCLE.md), [его тест](../test/local-buy-cycle.test.cjs): настоящие
локальные EVM-транзакции упрощённого venue, HTTP scanner, регистрации, carry, builders,
два Short + два Monthly, win/no-win, независимый progress, terminal reorg и старые claims.
Это не PAIR fork. Комиссии не выводятся из оборота fixture автоматически: в MockPairVault
явно вносится revenue. Суммы bootstrap и RNG доставляет стенд.

[Short worker](../scripts/local-short-executor.cjs), [Monthly worker](../scripts/local-monthly-executor.cjs):
проверяют jobs, bindings, policy/publication/result; исполняют begin/publish/seal/process/finish
и ждут schedule/funding/seed. Общий CLI — [run-local-promo](../scripts/run-local-promo.cjs).
Bounded receipt и abort — [local-receipt](../scripts/local-receipt.cjs). Timeout не отменяет tx.

[Scheduler](../scripts/local-promo-scheduler.cjs), [state](../scripts/local-scheduler-state.cjs),
[CLI](../scripts/run-local-scheduler.cjs), [тесты](../test/local-scheduler.test.cjs).
Сам делает scan/replay/build, выбирает draining/current epoch и сохраняет artifact до tx.
Обычный restart продолжает прежний job. Empty current — ожидание без draw; empty draining
закрывается существующим closeEmpty после replay. Ожидание одного вида не мешает другому.
Сохраняется история jobs и отметка проверки terminal с canonical anchor.

LOCAL_HEAD — только допущение локального стенда. Это не production finality и не решение
fair snapshot selection. Полный rescan, stale lock после kill, потерянный state и отсутствие
durable mempool journal остаются ограничениями. Config hash связан со state; миграции
настроек и supervisor пока нет.

### Доход → казна

[Funding worker](../scripts/local-usdg-funding.cjs): sync router USDG, pay фиксированным
recipients, syncUSDG в vault. Перевод и признание — отдельные атомарные транзакции;
после остановки между ними средства уже находятся в prize custody и могут быть признаны.

[Revenue pass](../scripts/local-usdg-revenue.cjs), [описание](LOCAL_USDG_REVENUE.md):
сначала funding старых денег, затем один collect, harvest claimable USDG и повторный funding.
Проверяются source address/position/epoch. Drift epoch блокирует collect, но разрешает
получение старого claimable привязанной epoch, если внешний источник это допускает.
Определённый revert collect не мешает старому claim. Unknown RPC/broadcast/receipt outcome
останавливает отправки. Watch имеет явный interval; пустой collect может стоить gas.

TOKEN не harvest-ится этим worker. Сам внешний collect может собрать обе валюты позиции.
Rollover FeeRouter также способен признать TOKEN. Именно поэтому запрет TOKEN в worker
не закрывает найденную ниже custody проблему.

## Три finding и что уже исправлено

### A. TOKEN credit можно выплатить в несовместимую custody — открыто

Наш локальный профиль FeeRouter ставит DualControllerPromoVault в recipient slot 0.
FeeRouter распределяет обе валюты и разрешает любому вызвать pay. Поэтому любой caller
может отправить TOKEN credit в USDG-only vault. Credit обнулится, TOKEN останется там,
USDG не появится. TOKEN reserve запрещён, пути swap/withdraw нет.

Тест в [local-usdg-funding](../test/local-usdg-funding.test.cjs), имя начинается
`review: permissionless TOKEN pay`: 600 TOKEN на router → 480 в vault, ForbiddenReserve
даже при вызове reserve от controller. Это подтверждённая несовместимость связки,
а не утверждение о потере USDG. В реальный deployment такую конфигурацию переносить нельзя.

Нам нужен маршрут, который разрешает проблему до попадания TOKEN в prize custody.
Варианты ещё не приняты: conversion перед allocation; фиксированный отдельный recipient/
конвертер для prize доли; разделение asset-specific recipients либо другой минимальный API.
Просим сравнить по текущему коду, не считать один из вариантов уже нашим решением.

### B. Reorg с живым cutoff позволял повторно начать job — узко исправлено

Раньше started проверялся только при исчезновении/истечении cutoff. Если reorg убрал
begin/freeze, но оставил cutoff, scheduler мог повторить begin и запрос random.
Добавлена проверка `phase == None && entry.started` независимо от cutoff.

Новый scheduler-тест сохраняет job до begin, доводит оба вида до freeze, подаёт seed,
откатывает цепь и проверяет отказ без новых транзакций. До исправления тест падал;
после проходит. Откат только terminal с сохранением draw по-прежнему возобновляет его.

Это не on-chain finality: потеря state или crash до записи started остаются пробелами.
Не выдаём этот фикс за полное решение reorg/RNG fairness.

### C. Один неисправный project recipient блокирует новый collect — открыто

Revenue pass ждёт успешного initial runFunding. Revert transfer одному recipient
останавливает весь pass, поэтому новая collection даже не начинается.
Второй `review:` тест показывает: из прежних 100 USDG prize credit выплачен, project
credit 20 остаётся; следующие 600 в source не собираются из-за отказа transfer проекту.
Деньги не исчезают, но независимость исполнения нарушена. Ошибку моделирует MockToken;
не утверждаем, что исследовали поведение реального USDG для этого сценария.

Предварительное направление: изолировать определённый recipient revert, сохранить credit,
обслужить остальных и source, сообщить degraded и повторить позже. При неизвестном
broadcast/nonce/receipt outcome остановиться. Подробный API/error taxonomy ещё не выбран.
Не хотим менять payout math или скрывать ошибки общим catch-and-continue.

## Проверки: что доказано, а что нет

- Последний review: **21/21**, ~304 s — scheduler, funding/revenue, BUY-cycle.
- Revenue-интеграция: **31/31**, ~222 s — FeeRouter, funding/revenue, BUY-cycle до трёх review-тестов.
- Scheduler-пакет: **11/11**, ~259 s — scheduler, BUY-cycle, receipt/cutoff regressions.
- Последний полный baseline: **176/176** 19.09 до дальнейших дополнений и fixes.
- Сейчас основной список содержит **201** тест; единый полный запуск 201 не выполнялся.
- Два новых passed-теста намеренно воспроизводят **открытые дефекты** A/C. Passed не означает,
  что они устранены. После исправления их ожидания должны проверять защищённое поведение.
- Live PAIR fork/canary, production RNG/finality и production deployment не проверялись этим пакетом.

Команды: `npm test`, `npm run test:local:scheduler`, `npm run test:local:revenue`,
`npm run test:local:buy-cycle`. Логи лежат в ignored `.local/logs`; подтверждённые результаты
зафиксированы в документах, а не представлены как один общий зелёный release gate.

## Конкретные вопросы

1. Подтверди/опровергни A, B, C ссылками на функции и исполнимыми контрпримерами.
   Есть ли рядом более серьёзная ошибка, которую мы пропустили? Отдели новый дефект от
   уже описанного ограничения прототипа и от гипотезы без воспроизведения.
2. Для C предложи минимальный API/outcome model: где изолировать отказ (stepFunding,
   runFunding, revenue pass), как не выбирать одного и того же должника бесконечно в
   текущем проходе, как продолжить остальные выплаты/collection и когда возвращать degraded.
3. Какие ошибки можно считать определённым отказом без изменения состояния, а какие
   требуют полной остановки? Отдельно estimation revert, mined status=0, потерянный ответ
   sendTransaction, receipt timeout/replacement, nonce conflict и RPC outage. Достаточно ли
   `CALL_EXCEPTION` как классификатора? Не предлагай слепой повтор уже отправленной tx.
4. Как обеспечить повтор позже и не забить RPC/gas неисправным recipient? Что достаточно
   для ближайшего bounded local fix, а что относится к будущему supervisor/journal?
5. Для A сравни 2–3 минимальные архитектуры conversion/recipients и рекомендуй одну.
   Покажи движение TOKEN и USDG, владельца credit, разрешённые действия и custody boundary.
   Объясни, почему third-party pay больше не способен загнать TOKEN в необратимый тупик.
6. Как выбранный TOKEN route сочетается с FeeRouter campaign boundary, поздней conversion,
   старыми unpaid credits и сменой будущих recipients? Какие поля/commitments нужны,
   чтобы USDG от старого TOKEN дохода не переатрибутировался новой campaign незаметно?
7. Какие минимальные ограничения swap обязательны уже в skeleton: фиксированный output/
   recipient, slippage/ценовой источник, deadline, разрешённый route, approve, retry?
   Как сохранить разумную гибкость до prize custody без arbitrary admin calls и prize withdrawal?
8. Проверь узкий reorg fix B: какие сценарии он теперь закрывает, какие точно не закрывает?
   Есть ли простое обязательное усиление сейчас, или оставшееся требует выбранной finality модели?
9. Что тестировать в ближайшем fix C и следующем TOKEN-пакете? Нужны конкретные assertions:
   conservation, нет double pay, долг плохому recipient остаётся, здоровые ветки продолжаются,
   unknown tx не повторяется, TOKEN не застревает, old campaign attribution сохраняется.
10. Согласен ли ты с порядком «короткий fix C → TOKEN architecture+conversion → ops/RNG»?
    Если нет, предложи один более удачный ближайший шаг и объясни практическую причину.

## Формат ответа

Сначала короткий вердикт по текущему направлению. Затем findings по приоритету: место
в коде, trigger, последствие, воспроизведение, исправлено/открыто. Отдельно:

- минимальный рекомендуемый patch C с API/псевдокодом и тестами;
- выбранная архитектура A с небольшой схемой движения активов и tradeoffs;
- оценка B без обещания решить finality одним флагом;
- что делать прямо сейчас и что осознанно оставить на доводку.

Не переписывай весь проект и не превращай ответ в безразмерный backlog. Если для
вывода не хватает информации, назови конкретный факт и почему он меняет решение.
Ответ — вспомогательный материал: окончательные решения будем сверять с кодом и
политикой проекта, а не принимать автоматически.
