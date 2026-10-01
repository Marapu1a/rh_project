> Архив indexed-cycle review. Текущий запрос: [G02](../GPT_REVIEW_REQUEST.md).

# GPT review: Pons, сохранённый индекс и coordinator

01.10.2026. Независимый статический review накопленного пакета после1b70082.
Назови реально прочитанный commit и доступность working tree. Если новые файлы
отсутствуют, укажи это: пакет может ещё не быть опубликован в удалённой репе.

Не запускай тесты, compile, fork, установку зависимостей и транзакции.
Следуй [REVIEW_TESTING.md](../REVIEW_TESTING.md). Не меняй продуктовые правила.
Ответ — docs/GPT_REVIEW_RESPONSE.md, если доступна запись, иначе текстом.

## Область

- [Indexed cycle](../PONS_INDEXED_CYCLE.md), [policy admission](../PONS_INDEXED_COORDINATOR.md): scripts/pons-automation.cjs, pons-automation-rehearsal.cjs, pons-collector-fork.cjs, buy-policy-format.cjs.
- persistent-buy-indexer.cjs, local-promo-scheduler.cjs, buy-policy-admission.cjs, buy-policy-runtime.cjs, cutoff-checkpoint.cjs: доверенная политика, config identity, ветка, cutoff, snapshot.
- test/pons-policy-indexer.test.cjs, pons-persistent-indexer.test.cjs, cutoff-scheduler.test.cjs, cutoff-automation.test.cjs, pons-automation.test.cjs: что реально доказывают проверки.
- Соседний накопленный пакет: pons-transaction-journal.cjs, pons-crash-recovery.test.cjs, pons-direct-purchase.cjs, pons-browser-bridge.cjs, web/purchase-demo/. Документы через README.md. PAIR сохранён.

## Вопросы

1. Возможны ли чтение другой политики/ветки, stale/behind snapshot, обход admission или fallback на research scan?
2. Корректны ли finalized cutoff, checkpoint history, lifecycle replay и проверка перед begin? Где reorg может нарушить обязательства?
3. Может ли отстающий/недоступный индекс блокировать frozen settlement/claims? Разделяй новые draws и уже созданные обязательства.
4. Достаточны ли identity и журналы для resume без повторной отправки при unknown hash или смене конфига?
5. Где слишком благоприятна локальная модель: закреплённый finalized, последовательный index refresh, synthetic funding, impersonation, lead60s? Предложи один ограниченный следующий тест.
6. JSON и полный CPU replay: есть ли риск корректности помимо известной линейной стоимости? Не предлагай новую инфраструктуру без конкретной причины.

## Неизменяемые границы

100 USDG подходящих покупок накопительно дают Short+Monthly. Creator3%; полученные
USDG90/5/5. Pending TOKEN не призовой бюджет. Frozen/claimable не идут на ops;
reset/reroll/замена RNG запрещены. BUY policy admission не означает аудит исходников
Pons или гарантию его оператора. Public sends закрыты.

## Ответ

Findings по серьёзности: файл/строка, сценарий, последствие, минимальное исправление
и тест. Затем пробелы evidence и один следующий шаг. Отделяй подтверждённый баг
от гипотезы и известного ограничения. Локальный PASS не означает production
readiness; исторический ответ GPT не является разрешением публичного запуска.

## Текущее evidence

[Indexed cycle report](../evidence/PONS_INDEXED_CYCLE_2026-10-01.json) содержит anchor, SHA256 полного локального отчёта, действия, drand rounds, суммы и ограничения.21 адресная проверка PASS; не full suite. Два остановленных прогона, ошибка метода в третьем и исправления модели стенда раскрыты в PONS_INDEXED_CYCLE.md. Особое внимание: могла ли модель finalized скрыть проблему реальной связки?
