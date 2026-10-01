> Архив: запрос до indexed cycle; заменён [текущим обращением](../GPT_REVIEW_REQUEST.md). Исторические относительные ссылки разрешаются от docs/.

# Обращение к GPT: независимый review локального Pons MVP

01.10.2026. Проверь текущий HEAD относительно 67cc1aa: накопленный переход на Pons, особенно coordinator и восстановление. Ответ на русском в docs/GPT_REVIEW_RESPONSE.md. Укажи фактически прочитанный HEAD и ограничения инструментов.

## Режим работы

Статический review кода, связей модулей и evidence по [правилам review](../REVIEW_TESTING.md). Не запускай тесты, сборку, fork/rehearsal, не устанавливай зависимости и не отлаживай окружение. Предлагай конкретные проверки Codex. Не меняй продуктовый код, не отправляй транзакции, сообщения или deployment. Внешние docs/RPC — только read-only и при конкретном вопросе; отсутствие доступа укажи прямо.

## Пакет и решения

Реализованы LocalPonsCollector с раздельными sweep/pull/pay, ручной runner, curve и Universal Router v4 BUY adapters, интеграция с ticket lifecycle, сквозной Promo cycle и постоянный coordinator с журналами. Общий scheduler получил ограниченный rehearsal-путь. Добавлена статическая /transparency/. PAIR сохранён. Публичный signer/admission/service для Pons ещё не открыт.

Creator tax3%; фактически полученный USDG распределяется90/5/5: призы/ops/команда. Pending TOKEN/комиссии не считаются призовыми деньгами. Каждые100USDG подходящих покупок дают по попытке Short/Monthly; остаток накапливается, продажи попыток не дают. Порог, призовую математику и RNG менять не надо. Frozen/claimable не тратятся на эксплуатацию; reset/reroll/вывод призовой казны запрещены.

## Карта кода

Начни с этого обращения и diff67cc1aa..HEAD. Весь архив читать не нужно.

- [Coordinator](../PONS_AUTOMATION.md): scripts/pons-automation.cjs, run-pons-automation.cjs, local-promo-scheduler.cjs. Смежные границы: local-scheduler-state.cjs, local-receipt.cjs, drand-delivery-worker.cjs, runtime-network.cjs.
- [Collector](../PONS_COLLECTOR.md): contracts/LocalPonsCollector.sol, IPonsVenue.sol, scripts/pons-collector-manual.cjs.
- [Curve BUY](../PONS_BUY.md), [v4 BUY](../PONS_V4_BUY.md): pons-curve-buy.cjs, pons-v4-buy.cjs, direct-buy.cjs, replay-direct-buy.cjs; существующий attempt-lifecycle.cjs.
- [Полный цикл](../PONS_PROMO_CYCLE.md): pons-collector-fork.cjs, pons-promo-cycle.cjs, pons-automation-rehearsal.cjs, read-only-fork-rpc.cjs.
- Tests: pons-automation, fork-empty-storage, pons-collector, pons-curve-buy, pons-v4-buy; соседние local-scheduler, local-state-lock, drand-delivery-worker.
- [Продукт](../PRODUCT_SPEC.md), [переход](../PONS_MIGRATION.md); web/transparency/ и footer HK. Проверь честность пользовательских формулировок и актуальность статусов.

## Evidence и пределы

[Компактный отчёт](../evidence/PONS_AUTOMATION_2026-10-01.json): исходный report SHA256, fork anchor, допущения, действия/tx, ledger, баланс, хеши исходников на момент передачи. Это данные Codex, не твой независимый запуск; tx относятся к локальной ветке, не публичному explorer. Полный .local/ через Git не передаётся. Хеши исходников сняты при handoff, не в момент начала предыдущих тестов.

Последний coordinator fork77338337: PONS_AUTOMATION_PASSED;13 проходов,22 уникальные транзакции, максимум2 за проход. Live drand21111138/21111139, остановка после prove и продолжение из журналов. Выплачено114.657578USDG; баланс346.425927 →231.768349; reserved/claimable=0.86 consumed+1 OPEN каждого вида; финальный проход без транзакций и изменения nonce.

Адресные проверки:25/25 scheduler/locks и7/7 новых. Первоначальный batch был30/31 из-за порядка валидации нового теста; исправление проверено отдельно. Ранее BUY55/55, collector7/7 и cycle-neighbors16/16 — отдельные исторические запуски, не один full baseline. Полный набор на текущем HEAD не заявляем и ради передачи не повторяем.

Допущения: synthetic USDG/ETH; impersonated Pons operator; ArbSys shim; constructor clocks backdated только в памяти; drand lead60s; swap minOut1 только в тесте. Периодический mining воспроизводит ход времени. Для новых CREATE-адресов заранее снимали eth_getProof на fork anchor и кешировали пустой base storage: доверие RPC без самостоятельной криптографической проверки proof. Записи EDR не подменяются. Ранние прогоны останавливались из-за газа/часов/удаления historical RPC state; только финальный -f завершён.

## Приоритетные вопросы

1. Деньги: conservation, повторный pull/sync/pay/claim, кредитование фактического delta,90/5/5, доступность escrow при pending TOKEN, permissions/binding и изоляция funding failure от действующих обязательств.
2. Recovery: окна до/после broadcast, потеря hash, timeout/revert/reorg, сбой сохранения после receipt; главный и дочерние журналы, lock/stale lock, конфигурация и nonce. Возможны ли двойная отправка или необратимое зависание? Нужны конкретный путь и охват тестами.
3. Coordinator: приоритет обязательств, drain/watch/SIGINT, газовый резерв двух lanes, лимит отправок включая failed RNG tx, частичные выплаты/отклоняющий получатель, starvation, offline RPC/drand/Pons operator. Лимиты и артефакты должны переживать restart.
4. BUY: net USDG/refund, net TOKEN после hook fees, payer/recipient, commands/pool pins, duplicates/reorg/cutoff, graduation и late BUY. Не перепутана ли лабораторная calldata с фактическим UI Pons?
5. Исключения стенда: возможен ли unadmitted/LOCAL_HEAD с public signer? Не маскируют ли backdating, mining, empty storage cache или сценарий реальные дефекты? Отличи воспроизведение пустого исходного состояния от необоснованной подмены.
6. Пробелы evidence: один кошелёк, один цикл, кооперативная остановка после prove — что это НЕ проверяет? Выбери полезные сценарии с разными участниками, отказами и настоящим process crash. Бессистемный full run не заменяет анализ.
7. Следующий шаг: сначала найденные дефекты, затем фактический UI routing Pons или иная граница? Предложи один ограниченный пакет с критериями PASS; прочие улучшения отдельно. Не возвращай проект к исследованию launchpad без новой причины.

## Формат ответа

- Краткий вердикт о локальном MVP отдельно от допуска к реальным средствам.
- Findings по важности: файл:строка → триггер → последствие → evidence → минимальное исправление и тест. Отличай доказанный дефект от гипотезы/известного ограничения. Если критических дефектов не нашёл, скажи прямо.
- Пробелы покрытия и3–5 проверок для Codex с ожидаемым результатом; что обязательно до запуска, что позже.
- Один следующий пакет без изменения продуктовых правил.

Предыдущие [запрос](../archive/GPT_REVIEW_REQUEST_PONS_RESEARCH_2026-10-01.md) и [ответ](../archive/GPT_REVIEW_RESPONSE_PONS_RESEARCH_2026-10-01.md) сохранены как история; они не являются review новой реализации.
