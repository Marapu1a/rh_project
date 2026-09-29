# Review: admitted indexer snapshot → scheduler/lifecycle

29.09.2026. Ответ7ad0bfc учтён. Только статический review, тесты не запускать.
[Модуль](PERSISTENT_INDEXER.md). Новая настройка config.indexer включает consumer:
checksum/config identity, admitted policy, freshness, покрытие cutoff, prefix manifest
и канонический block hash. Старые minted totals не источник open attempts:
используются исходные blocks и прежний replayAttempts/buildFromHistory.
INDEXER_WAIT не препятствует другой lane; frozen не зависит от indexer. Без настройки
остаётся прежний RPC scan. Настройка входит в существующую runtime identity,
не разрешает менять живой журнал или включать public sends/handoff.

Watch при backlog продолжает bounded порции без10s sleep; idle/failure ждут10s.
Не заявляем производительность: JSON/full replay остаются линейными.
Проверь границы cutoff/policy/freshness, расход использованных attempts, возможность
ошибочно блокировать frozen и изоляцию ожиданий. Не расширять призовую математику.

Локальный сквозной сценарий с admitted policy: missing cache→wait; sync→оба draw;
cache недоступен→оба frozen завершаются; следующий цикл→empty без новых jobs.
Consumer negatives и соседний прежний scheduler проверяются адресно, не full/live/fork.
Следующий пакет — API статусов с происхождением данных, затем сервер/supervisor и
квалификация actual Infinity deployment. Alchemy sampled history passed, SLA не заявлен.
