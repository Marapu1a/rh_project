# Review: постоянный read-only indexer/API service

29.09.2026. Только статический review, тесты/build/fork не запускать.
Предыдущий ответ86bbab8 учтён. Пользователь уточнил границу: решаем обычные конкретные
отказы и идём к завершению продукта, не ищем бесконечно экзотические пересечения.

[Runbook и реализация](INDEXER_SERVICE.md). Один supervisor держит HTTP API и запускает
последовательные indexOnce в отдельных OS children. Full scan вне HTTP. Poll10s,
catch-up сразу, timeout120s; RPC failure/child exit повторяются. Service owner lock
и существующий pass lock исключают два service owners/одновременные passes.
Owned leftover lock снимается только после exit своего child и точного PID match;
unknown lock/storage/corrupt state требуют attention, не reset. Parent SIGKILL/power loss
могут оставить service lock: описана ручная проверка, auto-delete нет.

Health отдельно показывает fresh snapshot, lag к последнему прочитанному finalized,
policyMode, время/bytes прохода. Исследовательский unadmitted не ready. Last-pass health
не называется live finality или wallet worker readiness. Только loopback; полный статус
пишется JSON без RPC URL/errors. Никаких signer/денежных операций/public sends.
Unit systemd подготовлен, не установлен; deployment/signing/HTTPS/alerts ещё впереди.

18 адресных tests +catalog passed: настоящие child processes, mock HTTP RPC/legacy
история, outage/resume, restart, killed child+owned lock, timeout, unknown lock/corrupt
state, соседи indexer/API. Не full/live/admitted Infinity. Измерение реальной истории
перенесено в предрелизную проверку (или при конкретном lag), не объявляем throughput.

Просьба проверить реальные ошибки shutdown/lock ownership/retry и честность health.
Не требовать гарантированной безотказности или новой БД без измеренного препятствия.
Следующий продуктовый пакет предлагаем посвятить сайту и общему списку розыгрышей,
затем actual deployment и сквозному предрелизному прогону.
