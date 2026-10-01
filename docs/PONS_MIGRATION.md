# Перенос первого выпуска на Pons V2

01.10: локальный Pons coordinator завершён: fork77338337 PONS_AUTOMATION_PASSED, 13 проходов/22 уникальные транзакции, live drand, stop/resume, оба draw и claims. Выплачено114.657578USDG; reserved/claimable=0; повторный проход без отправок,86 consumed+1 OPEN каждого вида.25/25 scheduler/locks и7/7 новых адресных проверок PASS (не full suite). Далее — сверка фактического BUY routing UI Pons; публичный admission/service ещё закрыты. [Evidence и границы](PONS_AUTOMATION.md).

01.10: сквозной локальный Promo cycle выполнен: funding, frozen attempts, live drand, оба результата/claims и resume. Это закрывает интеграционный прогон пункта2 ниже, но не постоянный Pons runtime. Далее coordinator/journal, затем launch tooling и публичные границы. [Результаты и допущения](PONS_PROMO_CYCLE.md).

01.10: локальные curve/v4 BUY adapters готовы для прямого curve и узкого Universal Router маршрута. Общий учёт подтверждён fork77277186;55/55 tests. Далее пункт2: Promo cycle/draw/payout/recovery. Не означает поддержку всех маршрутов UI/агрегаторов или public admission. [Детали](PONS_V4_BUY.md).

01.10: curve BUY real-runtime fork77265497 PASS: BUY101 и частичный graduation/refund → entry → открытые Short/Monthly; вместе с funding27 шагов. Только локальный fork, без draws/public sends. [Evidence и границы](PONS_BUY.md).

01.10: curve BUY adapter реализован локально; net USDG/refund и открытые Short/Monthly проверены адресно49/49. Пункт curve BUY ниже закрыт в локальном объёме; v4 BUY и public admission остаются. [Подробности](PONS_BUY.md).

01.10: [денежный пакет](PONS_COLLECTOR.md) прошёл7/7 и real-runtime fork: curve/pool
sweep, claim/pay и GENERAL; независимый claim при waiting operator доказан. Ручное
исполнение local-only. Следом BUY adapters; полный сквозной Promo ещё не проверен.

01.10: [escrow-only прототип](PONS_COLLECTOR.md) реализован и проверен4/4; методы
curve/hook sweep и ручной runner ещё впереди. /transparency/ готова локально.

Уточнение01.10: перед реализацией collector — [внешнее исследование GPT](GPT_REVIEW_REQUEST.md).
Владелец допускает ручной/полуручной сбор доступного USDG; pending ждёт и не считается
призовым бюджетом. Полная независимость от оператора не обязательна для разработки.

30.09: перенос придержан по решению владельца до внешней проверки. Hook runtime воспроизведён; реальные TOKEN→USDG conversion и escrow credits подтверждены. Factory source не собирается, source escrow/operator не найден; независимый вызов operator-контракта не доказан. [Проверка и вопросы Pons](PONS_VERIFICATION.md).

Решение владельца 30.09.2026: начать адаптацию под Pons, сохранить PAIR для возврата.
Это локальная разработка, не разрешение публичных финансовых транзакций.

## Шаг 1 — сохранение и отделение: выполнен

- [PAIR snapshot](archive/pair-before-pons-20260930/README.md): рабочий код оставлен
  на месте, полный локальный архив и проверяемый manifest созданы до изменений.
- [Профиль Pons](../config/pons-migration-draft.json) отдельный, не подменяет
  `robinhood-launch-plan.json` и не потребляется действующей автоматикой.
- [Pons ABI](../scripts/integrations/pons-v2.cjs) выделен из диагностического runner;
  runner использует тот же ABI без изменения операций и параметров.
- Публичный сайт, сервисы, PAIR pins и Promo contracts не переключены.

## Следующий ограниченный шаг — PonsCollector

Отдельный контракт, без наследования PAIR-specific source checks. Проверяемая
привязка factory/token/quote/escrow/curve/recipient, claim USDG и совместимое
с действующим collector накопительное распределение 90/5/5. Призовой получатель —
настоящий PromoVault, с `syncUSDG`; тестовый ProbeRecipient не переносить в production.
Нужны адресные тесты partial/failed claim, source drift, округления, повторного
pull/pay и сохранения ранее начисленных credits при остановке источника.

Конвертацию TOKEN после graduation выполняет Pons operator. Не считать pending
TOKEN доступным USDG, не финансировать призы ожидаемыми комиссиями. Недоступность
оператора должна задерживать новое финансирование, не блокировать выплату уже
признанных credits или расходовать frozen/claimable. Проверка доступности и
условий работы оператора остаётся открытой перед запуском.

## Затем

1. Отдельные curve/v4 BUY adapters: доказанные payer/recipient, net debit USDG,
   возвраты на graduation, запрет двойного учёта, reorg и неподдержанные маршруты.
2. Collector → PromoVault GENERAL → билеты → Short/Monthly → выплаты и restart.
3. Обновление launch tooling и публичных текстов по проверенному охвату.
4. Свежие on-chain pins/source review, итоговая репетиция и конкретный launch plan.

Creator tax остаётся 3%; распределяется весь фактически полученный доход 90/5/5.
Дополнительные 70% base fee и зависимость conversion описаны в
[исследовании](PONS_V2_RESEARCH.md). Их нельзя считать неизменными без admission.
Математика призов, порог 100 USDG и расходование резервов не меняются.

Проверка шага 1: 30.09.2026 — ZIP integrity + все SHA-256; синтаксис JS,
тождество вынесенного ABI исходному снимку, разбор JSON и `git diff --check`.
Повторный fork/full suite не нужен для переноса неизменённого ABI; предыдущий
диагностический PASS не доказывает работоспособность будущего collector.
