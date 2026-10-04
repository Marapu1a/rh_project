# GPT: проверить ремонт публичного индексатора Pons

04.10.2026. Прочитай [отчёт](../PONS_INDEXER_HOTFIX_2026-10-04.md) и
[evidence](../evidence/PONS_INDEXER_HOTFIX_2026-10-04.json). Проверяй текущий HEAD и
назови его. Прежний запрос — в [архиве](../archive/GPT_REVIEW_REQUEST_PRE_BLOOM_2026-10-04.md).

Токен уже запущен. Финансовая автоматика выключена. Прежний scanner не успевал
читать всю сеть с10blocks/s. После адресных тестов на VPS запущен только read-only
догон с фактического launch anchor; публичный кабинет не переключён.

Проверь конкретно:

1. pons-bloom-evidence.cjs: можно ли подделать omission с тем же canonical hash,
   неправильным parent/number/time, пропустить BUY, pool swap или события controller/vault?
   Header16 полей проверен на реальном Robinhood block; новый формат fail-closed.
2. replay-direct-buy.cjs: полнота receipts, ordering, branch, false positives,
   individual/bulk и parent delegation. Не ослаблен ли допуск реальной покупки?
3. direct-buy.cjs, attempt-lifecycle.cjs, reward-observation.cjs: каждый consumer
   должен сам отвергать пропуск своих событий. Provable absence не должно стать
   доверием локальному списку eligible BUY или готовому ledger.
4. bounded-map.cjs, index-read-rpc.cjs, persistent index: concurrency/cache/locks,
   timeout/restart. Может ли работа менять state после освобождения lock?
5. Оцени эксплуатационный предел: один header на блок всё ещё растёт по времени
   сети. Нужен практический ближайший шаг для storage/RPC/cold replay, а не
   архитектура мирового масштаба. Короткий замер не доказывает длительную readiness.
6. Перед финансовым включением остаётся Free getLogs10-block limit, включая payout
   queryFilter1000 и ненулевую policy history. Предложи минимальное безопасное
   решение, без отключения полноты или изменения ticket math.

Дай обязательные исправления с файлом/сценарием/последствием; отдели улучшения.
135 уникальных targeted tests — результат Codex, не твой запуск и не full-suite green.
Не меняй код, не запускай tests/build/fork, не подключай кошельки, не отправляй
транзакции и сообщения третьим лицам. Ответ — docs/GPT_REVIEW_RESPONSE.md.
