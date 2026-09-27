# Общая автоматизация Short и Monthly

27.09.2026. Один процесс и один signer обслуживают оба контроллера. Это расширение
[автоматического Short](SHORT_AUTOMATION.md), без изменения контрактов и призовой математики.

## Запуск и совместимость

`node scripts/run-promo-automation.cjs --config CONFIG.json --state STATE --rpc http://127.0.0.1:8545 --executor 0 --watch`

CONFIG сохраняет fundingJob, deliveryJob, schedulerConfig и ops. Новый профиль
`ops.schema = local-promo-automation-v1` включает оба вида розыгрышей. Дополнительно
обязательны gasUnits для beginMonth, publishMonth, sealMonth, processMonth, finishMonth.
Остальные поля и ограничения ops описаны в Short-документе. Один signer должен быть
publisher обоих контроллеров; никаких новых контрактных прав нет.

Общая реализация: `scripts/promo-automation.cjs`, API `runPromoAutomation(options, hooks)`.
Старые `short-automation.cjs`, `run-short-automation.cjs` и экспорт runShortAutomation
сохранены как совместимые входы. Старый local-short-automation-v1 остаётся только Short.
Его identity и state paths не меняются. Новый профиль намеренно имеет другую identity:
нельзя просто переключить schema внутри существующего runtime с pending.

Для перехода использовать проверяемый handoff ниже. Подмена schema в старом state
или копирование одного журнала вместо четырёх не являются миграцией.

## Runtime/campaign handoff (28.09)

`scripts/promo-runtime-handoff.cjs`, API `handoffRuntime(previousOptions, nextOptions)`.
Одна сеть31337, тот же RPC/signer/collector/vault/controllers/adapter и тот же BUY/lifecycle
policy. Можно сменить ops profile и funding campaign, уже существующую on-chain.
Отключить Monthly в ранее общем runtime нельзя. Контрактный rollover команда не отправляет.

1. Перезапустить прежний worker с `--drain --watch`. Он завершает существующие jobs,
   сверяет pending и выплачивает rewards, но не создаёт новые jobs. Не запускать второй
   процесс с тем же signer. Незамороженные уже опубликованные jobs тоже должны завершиться.
2. Остановить drain-worker. Подготовить следующий CONFIG и новый STATE. Для новой кампании
   сначала должен состояться разрешённый контрактом rollover, затем CONFIG описывает его
   фактическую policy и нужные legacy witnesses.
3. Выполнить однократную команду:

   `node scripts/run-promo-automation.cjs --config OLD.json --state OLD_STATE --rpc http://127.0.0.1:8545 --executor 0 --handoff-to NEW.json --next-state NEW_STATE`

4. После complete запустить обычный `--watch` с NEW.json/NEW_STATE. Сохранить прежние
   файлы: это доказательство истории и блокировка повторного запуска старой конфигурации.

Handoff не отправляет транзакций. Он удерживает основной и три дочерних lock старого
runtime, затем locks назначения. Проверяет checksums/config identity, отсутствие pending
во всех журналах и nonce signer, отсутствие active/frozen draws, состояния старых jobs,
canonical receipts/cursors, новую on-chain campaign policy/source/anchors. Нельзя потерять
неоплаченный creator credit прежнего recipient: он должен остаться в новой policy либо
иметь корректный legacy witness. Предел8 witnesses прежнего worker остаётся ограничением.

Сначала записывается durable handoff-marker старого runtime. После него обычный worker
возвращает runtimeRetired и ничего не отправляет. Затем создаётся новый основной journal
с predecessor/token. Новый worker заново сканирует terminal rewards обоих контроллеров,
поэтому долги не зависят от переноса локальной очереди. Старые журналы не удаляются.

При исключении между этими записями повторяется та же команда: старый runtime остаётся
выключенным, допускается только тот же successor. Нельзя использовать существующее чужое
назначение или пересекающиеся имена файлов, включая .lock/.tmp. Повтор завершённой операции
проверяет lineage; активная работа/новые pending могут потребовать сначала остановить worker.
После жёсткого завершения процесса оставшийся lock требует явной диагностики владельца;
это не автоматическое снятие stale lock и не распределённый wallet lock. Потеря/ручное
удаление старых журналов не позволяет доказать отсутствие неизвестных отправок.

## Порядок прохода

1. Reconcile общий pending и оба child journals до любых новых отправок.
2. Сканировать canonical AttemptsConsumed обоих контроллеров; выплатить старую очередь.
3. Доставить drand обоим pending draws, используя их единственный зафиксированный round.
4. Продолжить уже созданные scheduler jobs, затем обнаружить и выплатить новые результаты.
5. Выполнить funding и разрешить создание следующих jobs после завершения сканирования.

У Short и Monthly отдельные курсоры payout discovery, но одна очередь с kind/drawId,
один лимит claims, один signer и единая остановка при неизвестной отправке. Проверка
Monthly требует Terminal phase=5 и совпадения resultHash. В очередь попадает только
ненулевой winner. Claim проверяет текущий reward и переводит USDG фиксированному адресату.
No-win не создаёт выплату. Старый долг не зависит от нового scheduler job.

Определённый отказ одного claim оставляет его в очереди и позволяет другим выплатам
продолжиться. Нехватка газа — ожидание; unknown send — общая остановка до reconciliation.
Reorg не исправляется автоматическим переигрыванием. Локальный lock не защищает от
постороннего процесса с тем же кошельком: signer и все четыре файла принадлежат одному процессу.

## Общий gas forecast

Перед seal/sealMonth проверяется запас на сам freeze, оставшиеся prove/deliver,
process chunks, finish и максимум выплат нового draw. Дополнительно учитываются
оставшиеся операции уже frozen Short и Monthly, а также обнаруженные unpaid claims.
Так два розыгрыша не получают разрешение заморозиться за счёт одного и того же запаса ETH.

Для pending Processing считаются только оставшиеся chunks и finish/claims. Пока draw
ждёт seed, conservatively резервируются prove и deliver, даже если proof уже отправлен.
Для Monthly возможен максимум один claim; для Short — количество prize slots.
Границы gasUnits должны помещаться в текущий block gas limit. Перепроверка оценки
конкретной операции остаётся перед каждой отправкой.

Это условие старта, не обещание неизменности цены газа. USDG призовых резервов не
используется для эксплуатации; автоматическое пополнение ETH этим пакетом не добавляется.

## Границы проверки

Локальные тесты используют обычные контракты, сохранённую настоящую BLS-подпись drand,
упрощённый BUY venue и тестовые prize odds. Для детерминированного выбора сохранённого
round операционная wall-clock preflight подменяется только внутри теста; on-chain проверка
BLS остаётся настоящей. Это не свежий Infinity fork и не production finality/admission proof.

Проверено 27.09.2026: **17 адресных сценариев в отдельных запусках**, не единый full run.

- `node scripts/test-launcher.cjs --profile promo-automation`: ordinary compile18.05s,
  8 прежних Short + 2 прежних CLI passed. Три первых Monthly cases упали из-за выбора
  другого historical round тестовыми часами; исправлен только fixture. Лог
  `.local/logs/promo-automation-tests.log`, отчёт `.local/logs/test-run-hk3ElO/result.json`.
- С SHA256-checked reuse того же compiled.json: `node --test --test-concurrency=1
  test/promo-automation.test.cjs` — no-win, receipt recovery, совместный gas forecast,
  старый Short долг passed; winner auto-prepare потребовал уточнения тестового clock hook.
  Лог `.local/logs/promo-monthly-tests.log` (4 passed, 1 fixture failure).
- После исправления clock hook и добавления conservation/unknown-send assertions:
  `node --test --test-reporter=tap --test-name-pattern="Monthly automation|unknown Monthly"
  test/promo-automation.test.cjs` — **3/3 passed**,105.74s, тот же проверенный artifact.
  Лог `.local/logs/promo-monthly-final.log`. Таким образом все6 новых сценариев проверены.
- `node --test test/short-automation-cli.test.cjs` — **3/3 passed**,0.66s, включая новый
  профиль и CLI. Старые Short tests после успеха не повторялись.
- `git diff --check`,235 относительных ссылок в изменённых docs и test profile paths OK.

Для повторения всего затронутого пакета: `npm run test:group -- --profile promo-automation`.
Это адресный профиль, не full. Новый live fork не запускался.

Production timing, ключи,
эксплуатация и внутренние доли creator fees остаются
следующими задачами. Не включать публичную сеть снятием одного chainId guard.

## Проверки handoff и lock (28.09.2026)

Сбой GPT локально не воспроизведён. Историческое наблюдение о синхронизируемом filesystem
не доказывает причину нового инцидента. Код withState/unlink не меняли; исключений для
stale lock и автоматического удаления нет.

- С `LOCAL_STATE_LOCK_TRACE=1` и SHA256-проверенным compiled.json из предыдущего пакета:
  `node --test --test-reporter=tap --test-name-pattern="unknown Monthly|pending Short|unpaid Short" test/promo-automation.test.cjs`
  —3/3,82.29s.49 acquire/acquired/release/released,0conflicts,0cleanup errors, после каждого
  release файл отсутствовал. `.local/logs/promo-lock-trace.log`, `promo-lock-summary.json`.
- Handoff: `node --test --test-reporter=tap test/promo-runtime-handoff.test.cjs` — первые4/4,
  41.24s; затем фильтр `rediscovers|drain suppresses` —2/2,33.24s; `creator credit` —1/1,
  12.55s; `disabling Monthly` —1/1,10.51s. Итого8 разных сценариев, в отдельных запусках.
  Логи `.local/logs/promo-handoff-{tests,extra,credit,admission}.log`.
- После усиления проверки пересекающихся .tmp/.lock имён: фильтр `overlapping paths|unknown Monthly`
  по handoff и automation tests —2/2,38.58s, trace `promo-handoff-final-trace.log`.
  29 owned acquisitions/releases; один ожидаемый conflict от намеренно созданного чужого
  lock в тесте,0release errors. Не считать этот injected conflict воспроизведением сбоя GPT.
- `node --test test/short-automation-cli.test.cjs` —4/4,1.08s, включая параметры handoff.

Contracts не менялись. Полный suite, live fork и публичная сеть не запускались.
Для повторения всего затронутого контура: `npm run test:group -- --profile promo-automation`.
В среде GPT при повторном сбое нужен original trace с PID/runId/path и сравнением
несинхронизируемого runtime каталога; без него нельзя утверждать конкретную причину.
