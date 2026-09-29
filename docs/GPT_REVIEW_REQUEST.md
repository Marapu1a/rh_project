# Review: постоянное read-only накопление BUY

29.09.2026. Тесты не запускать. [Описание и границы](PERSISTENT_INDEXER.md).
Предыдущий operational V2 не изменялся. Сейчас добавлен отдельный once/watch процесс
поверх scanWithRpc/replay/withState, без второй математики, send или scheduler integration.

Проверь cache canonicality/rollback, неизменность последнего хорошего снимка при ошибке,
идентичность повторного ledger, отсутствие ложного admission и обещаний масштаба.
Тесты:8/8 продуктовых +catalog; cache fixture legacy/mock, соседний decoder Infinity.
Самостоятельный service/API сайта и scheduler snapshot consumption ещё не готовы.
Следующий пакет — интеграция с lifecycle/scheduler без пересмотра frozen результатов.

Alchemy прошёл bounded repeat65requests/0errors и historical state до864000blocks;
в первом проходе1HTTP403, точный запрос затем3/3 успешен. Не SLA/production proof.
Ключ только в.local. Не предлагай обход frozen, reseed или gas-гарантии.
