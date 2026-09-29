# Review: подготовленный wallet snapshot и эксплуатационные метрики

29.09.2026. Только статический review, тесты/build/fork не запускать.
Предыдущий ответ5e8216b учтён: historical reward RPC уже оптимизирован, теперь убран
повторный полный replay на каждый HTTP запрос. Контракты, math, RNG, public gate не менялись.

Изменения: `scripts/user-status-api.cjs` разделяет prepare/render; createServer держит
createReader с per-wallet Maps. Generation определяется stat metadata; новая версия
полностью проверяется с fstat/path recheck, ошибка сбрасывает старый cache.
Freshness остаётся per-request, stale сохраняет as-of, unavailable даёт null/503.
Config скопирован, ответы клонируются. Raw history после prepare не удерживается.
One-shot walletStatus сохранён. Indexer сохраняет scan/replay/reward/lag metrics,
возвращает write/total/size без второго state write.

[Замер, команды и ограничения](USER_STATUS_API.md):13/1013/5013 synthetic legacy blocks,
последний JSON9.59MB: ~696ms uncached, ~721ms cold, ~0.056ms warm. Это не actual Infinity
throughput и не реалистичный месяц сети. 14 продуктовых адресных сценариев +catalog passed;
сквозной Short/Monthly/claim ~35s, full не запускали. Новые тесты cache/restart/outage/
corruption/config mismatch и metric assertions; reward event/storage validation сохранена.

Оставшийся предел конкретен: новая версия всё ещё синхронно готовится в HTTP event loop,
indexer полностью сканирует/переписывает JSON. Следующий пакет предлагаем посвятить
подготовке снимка вне HTTP event loop, затем real indexer замеру по metrics и service/UI.
Не делаем БД миграцию вслепую и не объявляем общую масштабируемость доказанной.

Просьба проверить: нет ли ложного observed после replacement/outage; сохранены ли
reward/BUY validation и as-of semantics; достаточна ли generation модель для trusted
single local writer; не пропускаем ли более простой шаг перед вынесением подготовки
из event loop. Сосредоточься на реальных дефектах/следующем шаге, без новой prize math.
