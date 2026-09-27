# Автоматический Short: funding → RNG → выплата

Продолжение: [единый исполнитель Short/Monthly](PROMO_AUTOMATION.md). Старый профиль ниже сохраняет Short-only поведение.

27.09.2026. `short-automation.cjs` + `run-short-automation.cjs` — один последовательный
исполнитель Short с постоянным watch. Только local31337/loopback; не mainnet daemon.
Контракты, продуктовая математика, permission model и старый V2 coordinator не менялись.

## Порядок прохода

1. Проверить deployment bindings/runtime и единственный signer=Short publisher.
2. Сверить собственный pending intent, затем выполнить reconciliation-only старых
   Infinity/drand журналов. Unknown hash блокирует ВСЕ новые sends; known hash проверяется
   по canonical receipt, sender/nonce/target/calldata. Не заменять pending новым state.
3. Прочитать ограниченный диапазон AttemptsConsumed(kind=Short), сохранить cursor и
   очередь. Выплатить старые награды, насколько позволяют лимиты.
4. Доставить Short RNG, продолжить уже начатую публикацию/settlement, снова собрать
   и выплатить только что начисленные награды.
5. Выполнить funding и запустить/продолжить Short scheduler. Monthly в этом исполнителе
   не запускается, его попытки остаются открытыми.

Обычный статус waiting означает ожидание расписания, seed, газа или следующего прохода,
а не обязательно ошибку. Source drift/определённый source failure не отменяет старые
призы: они обслуживаются первыми. Unknown send и неоднозначный receipt останавливают
все последующие действия; не считаются изолированным сбоем получателя.

## Очередь выплат

Поиск начинается с firstBlock genesis Short policy и идёт ограниченными диапазонами.
Событие сверяется с terminal phase/resultHash. Сохраняются drawId, canonical block/hash,
resultHash и фиксированные winners. Перед claim проверяются terminal/result и reward.
Получатель всегда из on-chain результата; произвольного адреса вывода нет.

Reward0 означает отсутствие неполученной награды: no-win и самостоятельный claim
не порождают новую отправку. Подтверждённый отказ claim оставляет долг и не мешает
другим получателям/funding. Обход получателей вращается между проходами, лимит maxClaims
общий для обоих обходов в одном проходе. Один recipient не повторяется в том же проходе.
Новый draw не стирает старые долги. Cursor/origin reorg → остановка для reconciliation,
а не попытка восстановить выплату догадкой.

## Journals, signer и газ

Четыре файла: STATE, STATE.funding, STATE.rng, STATE.scheduler. Используется прежний
withState/lock/checksum/fsync; источник и RNG сохраняют свои журналы. Scheduler/claims
используют общий coordinator intent. Нового формата подписи транзакций нет.

Один процесс должен эксклюзивно владеть signer и всем набором файлов. Нельзя параллельно
запускать standalone workers или другой coordinator с тем же signer: файловый lock
не является блокировкой кошелька во всей сети. Pending nonce проверяется перед sends.
Не удалять lock/pending для обхода остановки. Config/ops привязаны к identity журнала;
смену конфигурации и кампании нельзя проводить поверх неразобранного pending.

Общий transaction guard применяется также внутри funding/drand workers до estimate и
перед intent. Ограничивает target/action, gas price, gas units, native floor и количество
транзакций за проход. Перед seal дополнительно резервируется модельный native budget:
prove + deliver + оставшиеся process chunks + finish + максимальное число призовых
мест и уже известных unpaid winners. Extra fee/safety factor задаются явно.
До завершения первичного discovery новые freezes ждут, чтобы не игнорировать старые долги.

Это консервативный расчёт по конфигурации, не гарантия будущей цены газа или успешного
callback. Начатые обязательства могут продолжаться по доступности газа для текущего
действия; новый freeze проходит расширенную проверку. Нехватка ETH/дорогой газ → wait.
Prize USDG, frozen и claimable не расходуются на эксплуатацию. Автопополнение ETH в
этом исполнителе пока не подключено; пополнение баланса позволяет продолжить очередь.

## CLI и профиль

```text
node scripts/run-short-automation.cjs --config CONFIG.json --state .local/runtime/short.json --rpc http://127.0.0.1:8545 --executor 3 --watch
```

CONFIG содержит fundingJob прежнего Infinity worker, deliveryJob прежнего drand worker,
schedulerConfig и ops. Ops.schema=`local-short-automation-v1`; maxGasPrice,
reserveGasPrice, nativeFloor, extraFeePerTx — целые строки в wei; safetyBps10000–30000;
maxTransactions1–128, maxClaims1–64, scanBlocks1–2000, pollSeconds1–86400.
Gas units для pull/pay/prove/deliver/begin/publish/seal/processShort/finishShort/closeEmpty/claim
обязательны и положительны. Reserve price не ниже cap. Публичные RPC/сети отклоняются.
Пример config сохранён внутри evidence; его адреса относятся только к тому fork.

## Проверки

- Первые5/5: настоящий local Short/drand/claim, source drift не блокирует старую награду,
  known/unknown claim send restart, no-win, native wait и самостоятельный claim.
- Добавления2/2: хватает на seal, но не на весь Short → freeze не происходит;
  определённый claim failure сохраняется и оплачивается следующим проходом.
- Добавление1/1: timeout processShort → global receipt reconciliation → finish/claim один раз.
- Соседние Infinity/drand6/6: стандартный проход, известный/неизвестный hash, оба RNG consumers.
- Соседний default Short/Monthly scheduler1/1 за9.8s: оба kind продолжают штатную работу.
- CLI/profile2/2, saved automation evidence2/2. Результаты раздельных адресных запусков,
  не единый full baseline. Обычные contract tests используют неизменённый bytecode.

Команды: launcher для `test/short-automation.test.cjs`; дополнительные --test-name-pattern
`whole Short gas|failed claim remains` и `scheduler receipt timeout` с SHA-проверенным
artifact из `.local/logs/test-run-3pWkAE/compiled.json`. Первая compilation26.6s,5tests88.3s;
дополнения32.6s и19.3s; соседние14s. Логи `.local/logs/short-automation-*.log`.

## Новый fork

`node scripts/infinity-launch-fork.cjs NEW_OUTPUT.json --automation`:
[evidence](../research/infinity-source-audit/automation-fork-2026-09-27.json).
Один непрерывный programmatic runWatch выполнил pull/pay/begin/publish/seal/prove/deliver/
processShort/finishShort/claim за9проходов. Harness не вызывает claim или RNG delivery.
Настоящий drand round20996799. Fees11.934252USDG, выплата0.999999USDG,
остаток10.934253USDG; сумма совпала.2Short consumed,2Monthly open. Queue/pending пусты,
повторный проход0tx. Upstream477requests/4retries/0errors.

Сохраняются допущения предыдущего [fork](INFINITY_PAYOUT_PROOF.md): initial Short
constructor timestamps ускорены in-memory, test lead60s/odds/budget5USDG,100% fees→Promo,
buyer storage funding. Локальный miner поддерживает часы, но не доказывает публичную
finality. Сам CLI проверен отдельно по аргументам; непрерывный fork использует тот же
runWatch/runShortAutomation программно, не внешний CLI process. Mainnet timing/admission,
production economics, native refill и Monthly e2e остаются открытыми.
