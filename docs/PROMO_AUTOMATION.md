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

Для перехода остановить старый процесс, сверить все его журналы и завершить неизвестные
отправки; сохранить четыре старых state-файла. Новый профиль запускается с новым STATE,
когда старые scheduler jobs завершены (включая незамороженные публикации). Он заново
обнаруживает terminal rewards из цепи; уже оплаченные пропускает. Автоматической миграции
незавершённых jobs в этом пакете нет. Новый state сам по себе не подтверждает отсутствие
pending в старом: эту границу необходимо проверить до запуска.

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
эксплуатация, внутренние доли creator fees и безопасная смена campaign jobs остаются
следующими задачами. Не включать публичную сеть снятием одного chainId guard.
