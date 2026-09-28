# Статический review: FREE_SHORT funding wait исправлен

28.09.2026. Тесты, сборки и fork не запускать; [разделение работы](REVIEW_TESTING.md).
Твой review5491a55 подтверждён новым тестом: старый scheduler после finalized пополнения
возвращал prizeFunding вместо обновления cutoff. Это был дефект нашего кода.

## Исправление

`local-promo-scheduler.cjs` сохраняет исходный finalized readiness block отдельно от
старого cutoff. Если исторического бюджета не хватает, читает freeShort на более
свежем finalized block. Пока суммы недостаточно — сохраняет candidate без новых
транзакций. При достаточной сумме и повторном совпадении hash записывает discard
с fundingBlock/hash и удаляет только локальный unused candidate. Далее штатный
prepareCutoff выбирает новый completed block и ждёт финальности записи.

Проверка расположена после prepareCutoff=ready и до saveJob; существующие jobs
обрабатываются раньше. Нет сброса pending tx, изменения artifact/seed, удаления
on-chain checkpoint или расхода attempts при ожидании. Контракты не менялись.

## Проверки Codex

Новый test `FREE_SHORT finalized funding wait refreshes only an unused cutoff and
preserves saved budget on restart` сначала упал на старом коде, затем прошёл.
Проверяет повторные waits без sends, latest funding без refresh, finalized funding,
сохранность старого on-chain hash и attempt1, новый job3000raw, позднее funding4000raw,
reload/freeze без изменения3000 и завершение Short. Локальный EVM с контролируемым
finalized head: это не Robinhood финальность и не live/fork evidence.

9 разных сценариев прошли:1 новый,5cutoff-соседей,3LOCAL_HEAD FREE_SHORT. Не full.
[Команды/логи/границы](CUTOFF_HISTORY.md). Обычный Solidity artifact предыдущего пакета
переиспользован с SHA256; Solidity не менялся.

Посмотри свежесть/границу discard и взаимодействие с существующим job/recovery.
Monthly75/25 принят, но реализация ждёт выбора веса entries; не придумывай за владельца.
Газовую модель и старые lock-прогоны не открываем заново.
