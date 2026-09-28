# Cutoff history: ранняя запись, поздняя подготовка

28.09.2026. Реализовано в общем контрактном ядре и локальном executor. Публичный запуск
по-прежнему закрыт; local-only guards сохранены. Призовая математика не менялась.

## Решение

Вместо provisional proposal сохраняем только подлинный hash блока. Это устраняет
зависимость скорости полного replay от окна256. Никаких новых стадий самого draw,
состояния «занята подготовка» или полномочий на сброс frozen draw не добавлено.

`CutoffHistory` наследуется ShortDatasetPreparation и MonthlySettlement:

- `checkpointCutoff(number)` permissionless: получает hash через ChainBlocks, пока блок
  completed и не старше256. Hash не передаётся вызывающим, подделать его через аргументы нельзя.
- `cutoffHashes(number)` — неизменяемая запись. Повторный вызов идемпотентен, в том числе
  после старения. Нет setter, очистки, admin или внешнего доверенного сервиса.
- `validCutoff(number, hash)` принимает свежий подлинный hash ИЛИ ранее записанный hash.
  Нулевые/чужие hashes и непроверенные старые блоки не принимаются.
- Begin обоих draw и оба closeEmpty используют одну проверку. Epoch/schedule/budget/
  last-terminal ограничения и права publisher сохраняются.

Хранилище локально каждому controller. Любой желающий может оплатить добавление подлинного
блока, но не выбрать cutoff за worker, заблокировать слот или изменить резерв. Нет обхода
всей mapping, поэтому посторонние записи не увеличивают стоимость поиска.

## Последовательность worker

Новый явный `schedulerConfig.cutoffMode: FINALIZED_CHECKPOINT` требует admitted BUY policy.
Старый LOCAL_HEAD остаётся локальной совместимостью, не рекомендуемым публичным режимом.

1. Дождаться product interval. По finalized истории проверить наличие OPEN либо draining
   эпохи. На пустом текущем наборе не тратить газ на checkpoint.
2. Выбрать свежий completed block как head−1 (cutoffDelayBlocks применяется к begin, не к записи). Сохранить
   `{number, hash}` в scheduler journal до отправки checkpointCutoff.
3. Дождаться finalized покрытия блока И наличия той же записи в storage на finalized
   checkpoint. Только latest storage недостаточно. Проверить canonical hashes повторно.
4. Загрузить BUY policy именно для зафиксированного cutoff. Полностью пересобрать историю
   и snapshot, сохранить job. До этого никаких begin/publish/Ready/reserve/RNG нет.
5. До begin повторить независимый replay существующим механизмом. Дальнейшие publish →
   seal → RNG → settlement не меняются. Сохранённый hash не истекает во время replay.

Общая автоматика требует явный `ops.gasUnits.checkpointCutoff`, проверяет controller target,
цены/баланс/лимит транзакций и deployment profile, если подключён. Отправка проходит ту же
intent/nonce/hash/receipt boundary, что другие действия. Unknown send останавливает весь
signer даже если hash уже виден on-chain. Standalone scheduler не заменяет durable общий
executor; запускать публичную отправку через него нельзя.

## Recovery и пустые эпохи

- У неподтверждённого кандидата истекло окно до записи: сохранить причину discard, выбрать
  новый свежий блок на следующем тике. Proposal/резерва/случайного результата ещё нет.
- Cutoff удалён reorg: on-chain запись в потомке также откатится; worker сверяет hash,
  отбрасывает только предварительный кандидат. Если откатилась одна запись, а блок выжил,
  запись можно повторить, пока он свежий; иначе кандидат истёк.
- Между выбором и подготовкой активирована новая rules boundary: старый кандидат,
  не покрывающий её, отбрасывается с причиной. Готовые jobs так не переписываются.
- Пустая draining эпоха после finalized replay закрывается через тот же cached cutoff.
  Нет RNG/резерва/движения призовых часов.
- Невалидный dataset не получает автоматического supersede в этом пакете: replay отказывает,
  существующий begun/frozen job требует прежнего явного recovery. Cache не создаёт таких
  proposals заранее и не вводит нового случая вечной блокировки.
- Начатый job, исчезнувший после rollback, по-прежнему не перезапускается автоматически.

## Граница доверия

Контракт доказывает происхождение hash в канонической истории исполнения, а НЕ финальность,
истинность состава участников или честность RPC. Publisher остаётся доверенной ролью для
snapshot/empty assertions, проверяемых независимым replay. Permissionless seal сохранён:
после Ready посторонний caller может вызвать его без worker preflight. Мы устранили ранний
Ready у честного worker, но не добавляли контрактный finality oracle или гарантию wall clock.

Перед deploy нужны публичные controllers/профиль/timing и работающий постоянный сервис.
Повторные full scans остаются дорогими по RPC: incremental indexer нужен для эксплуатации,
но теперь его скорость не обязана укладываться в256 блоков. В outage worker ждёт/повторяет
проверку; не подменяет finalized на latest. Короткая выборка timing1800s не стала SLA.

Новый bytecode требует нового deployment и pins. Нет proxy/in-place upgrade. Существующие
выданные призы и старые immutable deployment этим изменением не мигрируются.

## Проверки

Собрана обычная Solidity сборка; дальнейшие адресные тесты используют SHA256-проверенный
артефакт этой сборки. LocalShortController22540 bytes, LocalMonthlyController17745 bytes,
оба ниже EIP-17024576; это размер локальных wrappers, не ещё отсутствующего public поколения.

- `node --test test/cutoff-history.test.cjs test/nitro-blocks.test.cjs`:9/9.
  Nitro offset, оба вида draw после10000blocks, forged/unknown hashes, reorg,
  abandoned checkpoints, supersede до freeze, empty closure, прежнее окно1..256.
- `node --test test/cutoff-scheduler.test.cjs`:3 сценария прошли в общем запуске;
  исправлен только тестовый assert отсутствующего файла на empty/no-write, затем
  `--test-name-pattern="does not spend gas"`:1/1. В сумме4 адресных сценария; дополнительный `--test-name-pattern="maximum begin delay"`:1/1
  проверил cutoffDelayBlocks256 без истечения записи до отправки.
  BUY→оба draw→terminal при modeled delayed finalized, checkpoint storage finality,
  empty draining, pre-proposal reorg/expiry, пустой current без отправки.
- `node --test test/cutoff-automation.test.cjs`:2/2; дополнительный
  `--test-name-pattern="checkpoint gas bound"`:1/1, gas wait до broadcast. Общий gas/journal для обоих targets,
  отсутствие duplicate writes, unknown checkpoint send останавливает signer.
- `node --test test/local-controllers.test.cjs`:3/3. Старые unpaid credits/claim failure,
  RNG request failure/rollback, роли, callback/reentrancy и следующий цикл.

- `node --test --test-name-pattern="scheduler persists before sending|unsubmitted expiry|independent pre-begin replay|unknown Monthly send" test/local-scheduler.test.cjs`:4/4.
  Прежние два цикла/restart/CLI, неподтверждённый expiry без cache, общий unknown-send stop,
  независимая проверка поддельного snapshot.
- `node --test --test-name-pattern="profile catalog" test/test-launcher.test.cjs`:1/1,
  все новые тесты включены в full и адресный профиль `cutoff-history`.

Итого24 продуктовых сценария отдельными адресными запусками +1 проверка каталога.
Для повторного review: `node scripts/test-launcher.cjs --profile cutoff-history`.
Профиль включает также сохранённый timing survey; приведённые результаты относятся
к указанным выше командам, а не к единому запуску этого профиля.

Это адресная проверка, не full baseline и не live/fork deployment. Nitro fixture моделирует
ArbSys; delayed finalized моделируется локальным RPC. Публичных транзакций не было.

## FREE_SHORT: выход из ожидания funding28.09

При недостаточном историческом freeShort неиспользованный кандидат сохраняется,
пока более свежий finalized блок тоже не обеспечивает корзину. Это не создаёт новый
checkpoint на каждом poll. Latest-only пополнение не является основанием обновления.

Когда корзина обеспечена на новом finalized блоке, worker повторно сверяет его hash,
записывает lastCutoffDiscard с причиной и fundingBlock/hash, удаляет только локальный
ещё не использованный candidate. Следующий проход обычным prepareCutoff сохраняет
свежий completed block и ждёт финальности как блока, так и checkpoint transaction.
Старый on-chain cutoffHashes остаётся историей; никакой draw не отменяется.

Ветка доступна только после prepareCutoff=ready и до создания job. Сохранённый job
обрабатывается раньше и не попадает сюда. Pending transaction guard и reconciliation
общей автоматики не изменены. Нет сброса pending send, смены seed или бюджета после
публикации. Отсутствующий archive state по-прежнему не подменяется latest.

Проверка на рабочем дереве поверх5491a55: новый сценарий сначала воспроизвёл старое
зависание, затем прошёл после исправления. FINALIZED_CHECKPOINT с синтетическим
finalized head в локальном EVM: нехватка → повторные polls без новых транзакций →
latest funding без refresh → finalized funding → новый candidate → job с3000raw →
позднее funding4000raw → reload → freeze старых3000 → settlement. Attempt1 сохранена.
Это общий scheduler путь, не proof финальности Robinhood или новый live/fork запуск.

Команды и результаты28.09 (9 разных сценариев, не full baseline):

```text
node --test --test-name-pattern="FREE_SHORT finalized" test/cutoff-scheduler.test.cjs
node --test --test-name-pattern="finalized checkpoint scheduler|checkpoint candidate recovers|does not spend gas|maximum begin delay" test/cutoff-scheduler.test.cjs
node --test --test-name-pattern="FREE_SHORT" test/local-scheduler.test.cjs
```

1/1 новый сценарий26.8s,5/5 cutoff-соседей49.8s,3/3 LOCAL_HEAD14.7s.
Логи `.local/logs/free-short-finalized-{red,green}.log`,
`free-short-cutoff-neighbors.log`, `free-short-local-regression.log`.
Solidity не менялся; использован обычный artifact предыдущего пакета с проверкой SHA256.
