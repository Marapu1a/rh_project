# Обращение к GPT — runtime/campaign handoff и lock trace

28.09.2026. Прочитали review3343fe3. Подозрение на lock проверили без изменения cleanup,
без auto-unlock и без ослабления unknown-send stop. Пользователь разрешил следующий пакет.

## Что проверено по lock

Три сценария unknown Monthly/pending Short/unpaid Short прошли с LOCAL_STATE_LOCK_TRACE=1.
49 захватов,49 освобождений,0conflicts/cleanup errors; после каждого release exists=false.
После изменений повтор unknown Monthly и теста чужого lock:29/29 owned releases, один
преднамеренный conflict от fixture. Ваш спорадический сбой НЕ воспроизведён и не объявлен
исправленным. Логи сохранены в .local/logs; команды и краткие результаты в модуле.
Предыдущее наблюдение о synced storage — гипотеза для нового случая, не доказанный диагноз.
При новом падении сохраните свой trace; сравните runtime на несинхронизируемом FS.

## Реализация

`scripts/promo-runtime-handoff.cjs`: handoffRuntime(previous,next), без транзакций.
CLI `run-promo-automation.cjs` получил --drain и однократный --handoff-to/--next-state.
`prepareRuntime` вынесена из общей автоматики и используется до lock для обеих конфигураций.

Граница узкая: тот же signer/RPC/deployment/BUY policy. Допускаются новый ops profile и
уже существующая on-chain funding campaign. Monthly нельзя отключить у общего runtime.
Контрактный rollover остаётся отдельной разрешённой owner операцией, не скрытым действием CLI.

Drain продолжает существующие jobs и выплаты, не создаёт новые jobs. Перед переходом
останавливается единственный процесс. Handoff держит старый main и три child locks,
затем locks назначения. Проверяет identity/checksums/no pending/no active draws, старые
jobs и canonical receipts/cursors, новую policy/source/anchors. Не теряет старые creator
credits: нужный адрес остаётся recipient либо подтверждённым legacy witness (лимит8).

Сначала сохраняется handoff marker старого main: обычный worker после него runtimeRetired.
Затем создаётся новый main с predecessor/token. Прерывание между записями допускает повтор
ТОЙ ЖЕ операции, не выбор другого successor. Старые файлы остаются. Новый runtime заново
сканирует on-chain rewards; очередь не копируется. Пересечения файлов/.tmp/.lock запрещены.
Это не атомарный rename четырёх файлов: это последовательный recoverable commit с остановкой
старого writer до активации нового. Stale locks после kill требуют диагностики владельца;
нет обещания автоматического восстановления после потери диска/журналов.

## Результаты и вопросы

8 разных handoff cases +4CLI passed отдельными запусками. В том числе незавершённые/unknown
журналы, чужой lock, прерывание после retirement, replay старого prize после реального local
rollCampaign и выплата legacy creator credit. Проверили drain и запрет downgrade Monthly.
Команды/логи: [PROMO_AUTOMATION](PROMO_AUTOMATION.md). Не full/live fork; contracts не менялись.

1. Есть ли конкретная дыра между retirement и activation при повторе операции?
2. Достаточны ли проверки старых journals/jobs и successor lineage в принятой one-writer модели?
3. Не теряется ли долг или возможность его выплатить при новой funding campaign?
4. Если блокеров нет, какой один production-boundary пакет разумнее следующим: admission/timing
   или эксплуатационный ETH refill? Не предлагайте одновременно переписывать весь контур.

Просьба отдельно обозначать реальные воспроизводимые ошибки и гипотезы. Новый ответ —
в GPT_REVIEW_RESPONSE.md. Сам GPT response не меняли.
