# Review: wallet API cache + worker isolation

29.09.2026. Только статический review, не запускать tests/build/fork.
После ответа5e8216b сделаны два последовательных пакета:56ccf3e cached prepared view
и текущий worker isolation. Контракты/math/RNG/public activation не менялись.

[Полные границы и измерения](USER_STATUS_API.md). createReader проверяет новый файл
(checksum/config/admission/BUY+lifecycle/reward projection) и строит per-wallet Maps;
повторные чтения проверяют file generation/freshness. Ошибка не возвращает прежний success.
Теперь createAsyncReader держит этот reader в одном worker_threads worker; main получает
только wallet response и перепроверяет generation асинхронным stat. Full JSON/replay не
блокирует HTTP event loop. Queue64, timeout30s: overload→unavailable; timeout/crash
снимают все pending, worker завершается, следующий запрос запускает новый. Close окончательный.

Синтетические5013blocks/9.59MB: прежний uncached~696ms, cache warm~0.056ms.
Worker cold~868ms, main timer maxgap16ms, warm round-trip~0.27ms (100known wallet reads).
Не actual Infinity/RPC qualification. Полный indexer scan/JSON остаётся линейным;
метрики прохода/lag/size добавлены предыдущим пакетом. Прежняя подготовка в HTTP
потоке была отдельным bottleneck; теперь она изолирована, а не magically ускорена.

Текущий scoped run:8cache/worker tests +1сквозной indexer/lifecycle/Short/Monthly/claim
прошли. Проверены outage/replace/restart/stale/corruption, bound queue/timeout/close,
main-thread responsiveness и детерминированная замена файла во время доставки ответа.
Предыдущий пакет отдельно проверял indexer/reward module; full не запускался.

Проверь реальные дефекты: гонки поколений/late worker messages, shutdown/restart,
ложный observed/нулевые balances, потеря reward validation. Не добавляй новый admin,
prize math или требования гарантировать gas. Следующий пакет предлагаем: постоянный
service/runbook с локальной репетицией restart/outage, потом real admitted indexer
measurement; actual deployment/signing/frontend ещё открыты, public sends закрыты.
