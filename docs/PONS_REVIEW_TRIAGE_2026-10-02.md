# Разбор двух ответов GPT по Pons — 02.10.2026

Сверены review9059f23 (код26f90fe) и cost-reviewb166d91 (код9059f23).
Первый ответ сохранён [отдельно](archive/GPT_REVIEW_RESPONSE_PONS_PACKAGE_2026-10-02.md),
второй — [текущий ответ](GPT_REVIEW_RESPONSE.md). Это статическая сверка с кодом
и арифметикой committed receipts; новые tests/fork/RPC не запускались. Код не менялся.

Этот текст сохраняет исходный разбор до исправлений. **Статус после пакета 02.10:**
CLI verifier, лишние parent-code reads и порядок schedule/admission исправлены.
По отдельному решению пользователя прогнозный ETH-резерв заменён оценкой ближайшей
транзакции и ожиданием пополнения. [Реализация и выполненные проверки](PONS_EXECUTION_READINESS.md).
Замер роста истории, будущий rollover и консервативный недопуск authorization остаются
за границами этого пакета; прежнее предложение «резерв пока не менять» больше не план.

## Подтверждено по коду

| Замечание | Вывод / действие |
|---|---|
| Standalone API verifier передаёт scheduler config вместо shared indexConfig | Реальное расхождение: CLI verify-pons-wallet-api.cjs не вызывает buildIndexConfigs, а новый writer/встроенный verifier вызывают. Hash полного config различается. Исправить и проверить отдельным процессом на новом saved snapshot без изменения его байтов; runtime-воспроизведение ещё не выполнено |
| Parent account code читается для всех self-calls | scanner запрашивает code до receipt; чужой аккаунт может зря нагрузить/остановить индекс. Сначала получить receipt, затем parent evidence только для целевого кандидата. Все receipts, исторические venue pins и правила execution сохранить |
| Policy admission раньше проверки расписания | local-promo-scheduler.cjs:180–184 подтверждает порядок. Новые jobs сначала проверять по времени, затем выполнять тот же admission. Сохранённые/frozen jobs обслуживать прежним ранним путём |
| Полная история JSON/write и новый replay | Уже известный рост O(history). Сначала метрики на типичной/длинной истории, затем выбор изменения. Независимую реконструкцию перед begin не удалять |
| Большой native reserve | Формула действительно использует calls × gasLimit × maxGasPrice. При20 ×3млн ×10gwei получается0.6ETH плюс floor. Это резерв, не расход; частота лишних ожиданий не доказана. Нужны фактический gasUsed, оценки по действиям и runway frozen обязательств |
| Старые credits при rollover | inspect видит старые адреса, ACTIONS платит текущим ролям. Coordinator закреплён за campaign1: ограничение будущего rollover, не доказанная потеря денег сейчас |
| Валидная подпись payer с неприменимым nonce | Type2 conservatively rejects same-block authorization без проверки применимости nonce. Безопасный недопуск; не ошибка начисления. Не ослаблять без доказательства nonce/order/trace. Исправление invalid signatures не означает поддержку всех invalid tuples |

## Gas evidence сверено

Из PONS_POOL_BATCH_INDEX_API_2026-10-02.json повторно сложены receipt.gasUsed:
USDG sequential320444 / batch272280; ETH559134 /395133; отдельная authorization36844.
Цифры GPT совпали. Это локальные независимые сценарии, не прогноз комиссии пользователя
и не замер установленного MetaMask. Сам batch не создаёт доказанной переплаты в этом evidence.

## Следующий ограниченный пакет до0x

1. Исправить самостоятельный CLI verifier и добавить запуск новым процессом с immutable snapshot.
2. Убрать parent-code reads чужих self-calls; адресно проверить foreign failure,
   настоящий BUY без parent evidence, type2/type4 и reorg того же tx.
3. Проверять расписание новых jobs до policy admission; до срока не читать тяжёлую
   policy, на границе срока читать полностью. Проверить оба вида и старые обязательства.
4. Добавить счётчики/замер RPC и CPU/save/size для пустых блоков и BUY. Оценку газа
   собирать из receipts; резерв ETH и хранение истории пока не перепроектировать.

Затем продолжить G10/0x. Новый launch-v2 через полный lifecycle-v4 draw cycle на одной
ревизии, wallet UX и unknown-route observability остаются отдельными тестовыми границами.
Боевой перенос — этап B. Отсутствие найденного обхода admission в review не является
доказательством отсутствия всех ошибок.
