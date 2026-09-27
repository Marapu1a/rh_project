# Review: реальная сеть и cutoff/finality

28.09.2026. Начни с CURRENT_CONTEXT, ROADMAP и PUBLIC_NETWORK_TIMING.
Пользователь поручил нам самим выбирать следующий пакет; твой ответ — независимая проверка.

Добавлены bounded read-only survey и сохранённые12 наблюдений двух RPC.
Finalized lag919–1000s,9139–9923 blocks; contracts допускают begin только до256blocks.
Существующий scheduler выбирает finalized checkpoint: на живой сети это несовместимо.
Локальные Nitro тесты подтверждают, что после своевременного begin ждать >256 до seal можно.
4 offline survey +2 Nitro tests прошли; contracts не менялись, public sends не было.

Проверь предлагаемый следующий шаг: provisional recent cutoff → ожидание finality и
независимая проверка dataset/policy → freeze. Не ослабляем final admission, не меняем призы.
Вопросы: может ли невалидный/reorged proposal навсегда заблокировать epoch в текущем коде?
Успеем ли подготовить begin в256blocks без incremental indexer? Нужна ли отдельная
фиксация cutoff до dataset, и как ограничить захват этой стадии без нового администратора?
Посмотри код самостоятельно: обсуждение не является утверждённой архитектурой.
Timing1800s — кандидат по короткой выборке, не SLA и не утверждённый production профиль.
