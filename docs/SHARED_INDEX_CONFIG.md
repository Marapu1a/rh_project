# Общий индекс для Pons, координатора и API

01.10.2026. Локальная реализация G02; публичная активация и перенос состояния не выполнены.

## Конфиги и идентичность

`scripts/shared-index-config.cjs` экспортирует `buildIndexConfigs(schedulerConfigFor(ponsConfig))`.
Результат содержит независимые глубоко замороженные `schedulerConfig` и `indexConfig`.
Первый совпадает с прежним конфигом заданий; второй добавляет только `publicStatus:true`.
Индексатор и API получают один и тот же indexConfig. Pons coordinator вычисляет его тем же builder и передаёт scheduler как runtime option, вне identity задания и родительского журнала.
Проверяется равенство полного конфига, а не выборочный список полей. Несовпадение запрещает чтение для новых заданий.

Один процесс индексатора пишет snapshot; API и координатор только читают его. Общий builder не запускает фоновые процессы.

## Отказы

После обязательного BUY/reward replay публичная проекция читается на той же высоте.
Только типизированный RPC_READ_UNAVAILABLE (ошибка соединения/таймаут либо HTTP 408/429/502/503/504) сохраняет новый BUY snapshot с publicObservation=null и отдельным unavailable status. Обзор отдаёт unavailable и null вместо старых сумм; покупки остаются доступны координатору.
Ошибки ABI, runtime, binding, баланса, JSON, RPC и неизвестные ошибки закрывают весь новый snapshot: предыдущий сохраняется, состояние waiting блокирует новый допуск. Frozen задания могут завершаться без BUY-индекса.
История BUY policy разрешается на высоте snapshot; observation сохраняет hash всей истории.

## Явный переход со старого индекса

1. Остановить единственного writer и новые проходы coordinator; зафиксировать пути, hashes конфигов и резервную копию состояния.
2. Не менять scheduler/parent journals, job identities, frozen artifacts и on-chain obligations. Не исправлять configHash вручную.
3. Экспортировать indexConfig из builder для индексатора и API. Проверить неизменность schedulerConfig и parent config.
4. Архивировать только прежний derived index и пересобрать его по тому же statePath. До окончания catch-up новые задания ждут; старые frozen обязательства сохраняются.
5. Сверить policy, canonical head, ledger/rewards и API, затем возобновить routine execution. Не удалять lock без проверки отсутствия writer. Unknown transaction hash требует отдельного recovery, не reset.

Автоматической миграции нет. Новый writer отклонит старую identity; такая остановка ожидаема до явной пересборки.

## Проверки и границы

Адресный профиль: `npm run test:group -- --profile shared-index`. Результаты текущего пакета записаны в CURRENT_CONTEXT.
Интеграционный тест использует реальные локальные контроллеры chain 31337, simulated finality и тестовый RNG; проверяет общий snapshot, optional outage, fail-closed decoding, восстановление, frozen settlement без файла индекса и claims.
Это не новый Pons mainnet fork, не production watch и не full-suite baseline. Реальные timing, публичный executor, Buy/Claim UI и deploy manifest остаются отдельными шагами.

Evidence 01.10: `.local/logs/shared-index-tests.txt` (37/38, выявлен policy-history стык); `.local/logs/shared-index-final.txt` (6 выбранных кейсов PASS); `.local/logs/shared-readers-final.txt` (reader/cache/builder PASS); `.local/logs/shared-rpc-check.txt` (9 PASS). Повторный `real local contracts: pinned` PASS в `.local/logs/shared-index-recheck.txt`; тот запуск ещё содержал исправленное позднее ожидание finality в соседнем интеграционном тесте.
