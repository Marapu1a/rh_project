# Текущий запрос GPT: понятные gas waits и события восстановления

28.09.2026. Продолжение review `9792087`. Пользователь уточнил приоритет:
не угадывать будущую цену газа и не держать вечный точный баланс; дорогой gas —
ждать, ETH не хватает — bounded refill или ждать пополнения, затем продолжить
с сохранённого состояния. Призовую казну и правила результата не трогаем.

## Реализация

1. В prepareRuntime добавлена validateBudgetCompatibility: ops.nativeFloor покрывает
   оба child floors; ops.gasUnits для pull/pay/prove/deliver покрывают child bounds.
   Второе расхождение нашли сами: до estimate child использует свой bound.
   Это проверка согласованности, не новый прогнозный движок. Равные maxGasPrice
   не требуются, отправка проходит обе проверки цены. Ошибка профиля до исполнения,
   без изменения identity/автоматического reset истории.
2. Прежняя модель осталась: перед новым freeze — приблизительный консервативный
   запас; frozen/claims исполняются по текущему действию и могут идти частями.
   Refill не стал обязательным поддержанием постоянного целевого баланса.
3. refillBudget сохранился в API, но теперь возвращает constraint sourceBalance /
   periodCap / attemptCap, чтобы отличать пустой source от лимита.
4. Оба CLI подключили наблюдатель к runWatch. STATE.status — отдельный файл только
   телеметрии с существующим atomic save/checksum/lock helper. Main и child денежные
   journals не изменены. operational.state/reasons/resumeWhen/event идут в JSON.
   Причины сортируются, неизменные состояния не генерируют новых событий даже после
   restart. Последние32 события сохраняются до выдачи stdout; id/sequence для дедупликации.
5. Ошибка записи статуса даёт statusObservationError и не меняет execution result,
   retry policy или unknown send. Успех одной lane не должен маскировать другую
   RPC/source проблему. Stopped не считается recovered; обычный seed/расписание
   не считаются аварией. Clear — отсутствие распознанной эксплуатационной проблемы
   в данном проходе, не production readiness и не гарантия будущего газа.
6. Получение rehearsal signer в Robinhood CLI перенесено внутрь watch-pass:
   startup RPC discovery outage теперь также повторяется штатным watch. Inspect
   остаётся VoidSigner, без ключей/публичных транзакций.

## Чего не делали

Нет Telegram/email/webhook: канал не выбран и внешние сообщения не отправляем.
Это законченный локальный протокол событий, не обещание exactly-once доставки:
при падении после save до stdout событие есть в status history; старше32 событий
вытесняются. Обычные heartbeat JSON строки не подавляются — потребитель уведомлений
должен смотреть event. Новый runtime после handoff имеет собственную историю
наблюдений; денежный accounting переносится прежним handoff независимо от неё.

Не менялись контракты, prize math, allocation, converter, public gate, unknown-send
правила или lock recovery. Повторную диагностику lock окружения не выполняли.
Ошибки парсинга/несовместимого профиля — явный startup failure, не бесконечный retry.

## Проверки

28 различных адресных сценариев +1catalog отдельными запусками:
19 быстрых budget/status/watch,6 CLI,3 интеграции4663. Подробные команды и пределы:
[PROMO_OPERATIONAL_WAITS.md](PROMO_OPERATIONAL_WAITS.md).

Новая интеграция: неправильный floor отклонён, затем согласованный повышенный floor;
нулевой executor + дорогой gas → без переводов; повторный запуск → без нового event;
gas снизился → refill → finish обоих draws → claims → recovered. Отдельно повторены
пустой source/top-up и period cap. Проверен настоящий новый OS process для dedup,
реальный HTTP RPC outage, disk failure мониторинга и запрет retry unknown send.
4663 — Hardhat/ArbSys/historical BLS fixture с заранее frozen datasets, не live BUY.
Full suite/fork/live sends не запускались.

## Что проверить

- Закрывают ли floor + pre-estimate gas bounds оба случая вечного nativeFunding?
- Нет ли ложного recovered, когда дочерняя lane продолжает ждать gas/ETH/RPC?
- Может ли сбой наблюдателя или новый startup путь изменить денежное retry поведение?
- Достаточно ли этого простого event-протокола до выбора внешнего канала?

После этого хотим двигаться к creator allocation и эксплуатационной доле USDG→ETH,
параллельно закрывая реальные RPC/deployment prerequisites. Не предлагай новый общий
framework мониторинга или усложнение прогнозов без конкретного дефекта.
