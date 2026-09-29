# Review: инкрементальная проверка reward accounting

Review349fe3b подтверждён и закрывается этим пакетом. Тесты не запускать.
[Схема/границы](USER_STATUS_API.md). Reward checkpoint сохраняет vault/height/hash.
Продолжение использует только новые события и читает только touched draws/rewards.
Исходные blocks всё ещё проходят существующий scanner/replay и canonical checks.
Поздний claim требует события и storage,0reward не доказывает выплату сам по себе.
При indexer reorg/старом формате полный rebuild+storage audit. CLI audit принудительно
перечитывает весь reward storage до обработанного cutoff; новый STATE нужен для
независимого RPC перечитывания evidence. Никакого безусловного доверия чужому checkpoint.

Модель120draws/1200rewards:1320initial calls,0idle/empty extension,2late claim,
1320full audit/reorg; restart через JSON, ошибка не мутирует previous. Не live benchmark.
Полный BUY/JSON и API replay остаются линейными. Общий snapshot по-прежнему ждёт
успешной reward проверки; старые frozen исполняются отдельно.

Сквозной payout test раньше предполагал выигрыш при seed0; обнаружилась нестабильность.
Теперь только LocalRandomFixture получает детерминированный seed выплатной ветки,
production RNG не изменён. Проверь индуктивную корректность checkpoint, rollback и
честность coverage: старый storage не называется заново прочитанным на каждом blockTag.
Далее общий performance/service, без новой prize math и без бесконечного аудита деталей.
