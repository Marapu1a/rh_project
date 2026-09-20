# Обращение к GPT — локальный конвертер и следующий шаг автоматизации

20.09.2026. Ответ перезаписывать в docs/GPT_REVIEW_RESPONSE.md; указать реально
просмотренный commit. Не менять код автоматически. Предыдущая история доступна в git.

## Контекст, который важно сохранить

Продукт: спекулятивный TOKEN, отдельное добровольное Promo, Short каждые 6 часов,
Monthly jackpot. Все денежные призы USDG; Luck удалён, sponsor layer позже отдельно.
Проект получает свою долю до prize custody. Prize funds невозвратны проекту;
free/reserved/claimable раздельны. Нет reroll/reset, proxy, admin withdrawal.

Пользователь просит последовательно собрать скелет, затем укреплять по участкам;
маленький шаг с проверками, без возврата к каждой исторической идее. Штатные операции
должны автоматизироваться, permissionless API само не является автоматизацией.
Объём и комиссии заранее неизвестны; budget только фактически полученный USDG.
Неудачный swap не должен мешать завершению уже frozen draw.

Начать с CURRENT_CONTEXT и ROADMAP, затем LOCAL_PRIZE_CONVERTER. Карта кода —
IMPLEMENTATION_STATUS, правила — PRODUCT_SPEC. Архив читать только по конкретному вопросу.

PAIR: V1/Launch V2 — поколения продукта, не L1/L2. 70/30 относится к V1 и не является
универсальной V2 экономикой; фактическая policy/source entitlement требуют live проверки.
См. PAIR_CURRENT_FEE_POLICY. Тестовые 80/20, 50/50 не утверждают реальные доли.

## Что произошло после твоего ответа c13eb30

1. C подтверждён review и остаётся исправленным: определённый recipient failure
   изолирован на один общий revenue pass; unknown outcome останавливает writes.
2. BUY-test теперь создаёт .local сам. CLI top-level catch выводит JSON с message,
   code, stage, transactionHash и ненулевым exit; добавлена проверка вывода.
3. Создан локальный LocalPrizeConverter, интерфейс IPrizeSwapAdapter и тестовый
   PrizeSwapFixture. Код денежного FeeRouter/PromoVault не менялся.

## Выбранная модель converter

Общий адрес для одинакового конечного назначения. Отдельный адрес на каждую campaign
не обязателен: FeeRouter размечает начисления, converter не обещает P&L swap по campaign.
При смене destination создаётся новый converter; старый не перенаправляет свои credits
или inventory новому vault. Изменяемого setVault/setAdapter нет.

Constructor только chainId 31337. Immutable TOKEN/USDG/vault/adapter/floor ratio,
maxInput и maxHorizon. Floor задан в raw units как локальное допущение; это НЕ market
oracle и НЕ production slippage/MEV protection. Fixture обменивает заранее внесённый
USDG по искусственному курсу. Реальный DEX не интегрирован.

sync наблюдает donations/pay без выдуманного sender provenance. convert сначала sync,
затем exact input; allowance ровно amount только fixed adapter, после swap ноль.
Сам converter рассчитывает minOut с округлением вверх, проверяет TOKEN/USDG balance
deltas. Executor не выбирает recipient/route/minOut. Revert сохраняет inventory.
ReentrancyGuard на всех mutating APIs.

forwardQuote отдельно от swap, permissionless, только immutable vault; transfer +
vault.syncUSDG атомарны. USDG можно forward даже при отказавшем adapter. Счётчики:
tokenObserved = tokenSold + balance, quoteObserved = quoteForwarded + balance после
sync. Неучтённые direct donations до sync находятся сверх этих сумм.

## Ограничения, которые нельзя потерять

- Старые funding/revenue jobs требуют vault в slot 0. Они НЕ умеют converter.
  Новый безопасный custody profile пока проверяется контрактными вызовами в тестах.
- Legacy recipients после смены policy не находятся текущим worker автоматически.
  Тест доказывает старый permissionless pay/convert/forward, не daemon для истории.
- Fixed adapter без выбранной recovery policy может навсегда остановить TOKEN swap;
  отсутствие admin rescue не означает гарантированной liveness.
- Полнота publisher snapshot доверенная, LOCAL_HEAD не finality, RNG тестовый;
  production adapter/future-round binding, supervisor/journal/ops refill ещё не готовы.
- Нельзя считать старый test профайл TOKEN→USDG-only vault исправленным только потому,
  что рядом появился новый контракт. Следующий шаг должен связать worker с новым профилем.

## Что просим проверить

1. Нужны конкретные counterexamples к inventory/delta/allowance/forward accounting,
   включая donation, short output, wrong recipient, partial input и повтор после revert.
2. Нет ли скрытого способа изменить конечное назначение или переиспользовать old credit?
3. Разумно ли разделены swap и forward? Какие ограничения потребуются реальному
   адаптеру сверх честно названного fixed local floor? Не требуем выбрать live DEX сейчас.
4. Следующий небольшой пакет: минимальный job/API для converter и ограниченная обработка
   legacy recipients. Предложи порядок работы, который не остановит USDG forward/collect
   из-за отказа swap и не отправит TOKEN старому несовместимому recipient.
5. Учитывай текущий C error classifier и stage/hash: unknown transaction нельзя повторять.
   Не предлагается новый общий framework/supervisor в рамках ближайшего шага.

Не присваивай production-ready. Отдели реальные блокирующие дефекты от тестовых
ограничений и отложенной эксплуатации. Вопрос о shared converter vs per-campaign закрыт
до появления нового экономического требования; не возвращай его по инерции.

## Проверки 20.09.2026

- `node --test test/local-prize-converter.test.cjs`: **5/5**, ~32 s.
  Проверены third-party pay, общая казна, неизменность frozen reserve, баланс/allowance,
  положительный output ниже floor, отказ/reentrancy/partial input/wrong recipient,
  retry swap/forward, donation, late credits и смена immutable destination.
- `node --test test/local-transaction.test.cjs`: **11/11**, включая structured CLI error.
- Runtime LocalPrizeConverter: **4 556 bytes**, optimizer runs=200, solc из package lock.

Первый общий запуск выявил неверный адрес controller в новом тестовом PromoVault;
исправлен fixture, затем весь набор converter повторён успешно. Код FeeRouter и PromoVault
не менялся. Основной набор теперь **221** тест, полного запуска 221 не было.
Лог финального converter набора: `.local/logs/local-converter-final.log` (ignored).

BUY-cycle: **1/1**, ~101 s, из изолированного cwd с junctions на исходники и dependencies,
копиями package/config и отсутствующим `.local` перед запуском. Тест сам создал runtime
каталог. Это проверка устранения скрытой filesystem precondition, не отдельная установка
npm dependencies с нуля. Лог `.local/logs/converter-clean-buy.log` (ignored).
Итого 17 уникальных проверок в трёх наборах; полный набор 221 не запускался.
