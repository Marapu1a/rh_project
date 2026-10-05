# Pons: локальный постоянный исполнитель

03.10 добавлен [отдельный публичный режим](PONS_PUBLIC_EXECUTION_2026-10-03.md)
с тем же coordinator/journal. Описанный ниже старый CLI остаётся loopback-only.

05.10: [локальная готовность сканера и sender](PAYOUT_SENDER_READINESS_2026-10-05.md).
Очередь выплат читает окна до10000 блоков, максимум100000 за вызов; завершённые
страницы сохраняются только после обеих проверок. Public sender сохраняет подписанный
hash до broadcast; resolved output исключает raw tx. После локальных проверок
[перенесён и включён отдельно](AUTOMATION_ACTIVATION_2026-10-05.md)05.10. Старые10-block ограничения ниже
и результаты прежних crash-прогонов относятся к датированным версиям.

[Pons: допуск политики и чтение сохранённого индекса](PONS_INDEXED_COORDINATOR.md) — локальная связка; [indexed draw cycle](PONS_INDEXED_CYCLE.md) проверялся отдельно.

Актуализация 02.10: [газ ближайшего действия и ожидание пополнения](PONS_EXECUTION_READINESS.md).
Результаты fork ниже относятся к прежнему датированному прогону.

Статус 01.10.2026: локальный coordinator и сквозной fork прошли проверку. Это прототип на идентифицированном Hardhat fork Robinhood. Публичная отправка и production deployment не разрешены этим модулем. PAIR сохранён.

`scripts/run-pons-automation.cjs` объединяет существующий scheduler Short/Monthly, drand worker, очередь выплат и Pons collector. Правила билетов и призов не меняются.

## Исполнение

```powershell
node scripts/run-pons-automation.cjs --config CONFIG.json --state STATE.json --rpc http://127.0.0.1:8545
```

`--watch` повторяет проходы: после подтверждённой работы, ограниченной числом отправок/итераций, продолжает без pollSeconds; при ожидании сохраняет настроенную паузу. Подробнее: [cadence и лимиты](PONS_CADENCE_2026-10-03.md). `--drain` обслуживает существующие обязательства без новых розыгрышей и сбора комиссий. Нужен отдельный unlocked signer локального fork; CLI не принимает приватный ключ. Публичный RPC отклоняется до доступа к signer.

Конфигурация `pons-rehearsal-automation-v1` фиксирует Hardhat instance, BUY manifest/lifecycle, адреса и runtime hashes collector/escrow/controllers/adapter, executor, campaign 1, получателей 90/5/5, газовые лимиты, максимум транзакций за проход и drand job. Рабочий пример генерирует rehearsal в `.local/logs/`; он действителен только пока жив соответствующий fork.

Порядок прохода: восстановление журналов → известные выплаты → drand → завершение существующих розыгрышей → выплаты → доступные комиссии → новые задания scheduler. Sweep, pull и pay проверяются отдельно: ожидание конвертации TOKEN у Pons не блокирует уже начисленный USDG. Неподтверждённая отправка останавливает новые транзакции.

## Восстановление и границы

01.10, после review: основной transaction journal вынесен без изменения формата и
порядка записи в [pons-transaction-journal.cjs](../scripts/pons-transaction-journal.cjs).
Coordinator использует его же `createBoundary/reconcilePending`, проверенные новым
process-crash тестом. Это не новая миграция journal и не расширение public admission.

### Проверка настоящего process crash

`node --test test/pons-crash-recovery.test.cjs` —1/1 PASS, шесть сценариев внутри
теста: main/drand × потерянный hash / сохранённый hash / receipt status0.
Лог `.local/logs/pons-crash-final.txt`, данные `.local/logs/pons-crash-*`.
В каждом сценарии отдельный дочерний Node-процесс принудительно завершается
SIGKILL после реальной отправки, пока исходный Hardhat узел продолжает работать.

- До записи hash остаётся intent, после записи hash — известная pending tx.
- Повторный запуск со stale lock сначала отказывается работать. Только тестовый
  родитель после подтверждённого выхода владельца снимает свой конкретный lock;
  байты journal не меняются. Это явная процедура оператора, не автоматический unlock.
- Unknown hash остаётся blocked; known hash сверяется по receipt без повторной tx.
  Для status0 специально отправляется принятая узлом транзакция с недостаточным
  execution gas; до mining pendingReceipt, после mining сохраняется status0.
- Основной журнал обслуживает реальный collector pay; drand worker использует
  настоящий adapter и сохранённый BLS vector. После known-hash recovery drand
  завершает deliver, следующий запуск не отправляет ничего.
- Одновременно существуют ненулевые Short reserved и уже назначенный Monthly
  claimable; оба значения сохраняются через crash/reconciliation/delivery.

**Границы:** это изолированная сеть31337, синтетические balances/participants и
исторический drand vector. Не новый Pons4663 fork и не полный coordinator CLI/watch
при process kill. Основной журнал проверяется через тот же выделенный helper;
бюджеты/scheduler orchestration не воспроизводятся в этом дочернем процессе.
Главный и drand журналы убиваются по отдельности, не вложенные locks одновременно.
Отказ диска/питания, kill во время atomic rename, отдельное окно после receipt до
save, полный reorg/restart indexer ещё не покрыты этим тестом. Existing unit guards
на reorg не равны такому интеграционному доказательству.

Соседние проверки01.10:24/24 collector/automation/drand прошли; первоначальный batch
24/25 выявил ошибку тестового gas override (ниже intrinsic gas), не дефект journal.
После исправления только crash тест повторён и прошёл. Итого25 адресных tests,
не full suite. Новый профиль `pons-recovery` содержит эти четыре test-файла.

### Рабочие ограничения

- Главный журнал записывает намерение до отправки, затем hash/nonce и подтверждённый receipt. Scheduler и drand используют дочерние журналы `.scheduler` и `.rng`.
- Известный hash сверяется с каноническим блоком, sender, nonce, адресом, calldata, value и статусом. При неизвестном hash, незавершённом receipt или реорганизации автоматическая повторная отправка запрещена: требуется разбор состояния. Не удалять журнал для обхода остановки.
- Файлы защищены локальной блокировкой и привязаны к конфигурации. Это не распределённая блокировка кошелька: один executor, один комплект журналов, один процесс. После аварийного завершения stale lock требует проверки.
- Ограничены цена газа, размер транзакции и число отправок за проход. Для Pons баланс проверяется по estimateGas ближайшей транзакции с 20% запасом gas units и текущей ценой, без резерва будущего цикла. Нехватка означает ожидание; frozen/claimable не используются на газ. Поле nativeFloor сохраняется для совместимости config/journal, но не является Pons gate.
- Здесь `LOCAL_HEAD` допустим только внутри проверенного `robinhood-rehearsal`, с `ponsRehearsal` и unadmitted Pons manifest. Это не замена публичному admission/finality.

## Проверки

01.10: `PONS_AUTOMATION_PASSED`, fork77338337 (`0x3b11b2ce1e5df74857922b8c1a3f44f8f8b5aad815cfebcd2168b98bcfa40033`). Команда: `node scripts/pons-collector-fork.cjs .local/logs/pons-automation-20261001-f.json --automation`. Отчёт и журналы — `.local/logs/pons-automation-20261001-f.json`, `pons-automation-run-f.txt`, каталог `cycle.directory` внутри отчёта.

- 13 проходов, 22 уникальные транзакции, не более двух за проход; финальный проход без отправок и изменения nonce.
- Свежий escrow собран, кредиты 90/5/5 выплачены; scheduler сам создал и зафиксировал Short/Monthly.
- Живые drand rounds21111138/21111139; остановка после первого prove и продолжение с сохранённым журналом.
- Выплаты114.657578USDG: Short14.657578, Monthly100. Баланс346.425927 →231.768349, reserved/claimable=0; сумма учётных частей равна балансу.
- По86 попыток consumed и1 OPEN каждого вида после поздней покупки; frozen=0.
- Адресно25/25 прежних scheduler/locks (`pons-coordinator-tests.txt`; первоначально весь batch30/31 из-за порядка валидации нового теста). После исправления7/7 новых проверок: `node --test test/fork-empty-storage.test.cjs test/pons-automation.test.cjs`, лог `pons-automation-final-tests.txt`. Это32 адресных проверки, не full suite.

Ранние прогоны выявили тестовый лимит газа, остановившиеся часы локального fork и потерю исторического RPC state. Окончательный результат относится к прогону `-f`; промежуточные отчёты не доказывают завершение полного цикла.

Адресные проверки:

```powershell
node --test test/pons-automation.test.cjs test/local-scheduler.test.cjs test/local-state-lock.test.cjs
node scripts/pons-collector-fork.cjs .local/logs/pons-automation.json --automation
```

Fork проверяет реальные Pons curve/v4 контракты, сбор свежего escrow, создание обоих розыгрышей scheduler, живой drand, остановку после prove и продолжение, выплаты и повторный проход без транзакций. Лимит две транзакции за проход заставляет восстанавливаться между стадиями.

Тестовые допущения наследуются из [сквозного цикла](PONS_PROMO_CYCLE.md): synthetic USDG/ETH, impersonated Pons operator для локальной конвертации, ArbSys shim, backdated constructor clocks и сокращённое ожидание drand. Это не доказательство работы внешнего оператора или публичного UI routing. Automation fork дополнительно выпускает блоки каждую секунду: иначе паузы локальной сети закономерно закрывают drand freshness gate. Сами ограничения свежести не меняются. Production service не установлен.

Длинный fork: RPC может удалить историческое состояние до конца прогона. Для новых локальных контрактов runner получает eth_getProof на исходном блоке и кеширует нулевое базовое storage только при пустых storageHash/codeHash. Ответы RPC принимаются в той же модели доверия, что и прочие fork reads; криптографическая проверка accountProof отдельно не реализована. Записи EDR не меняются; другие адреса/блоки идут в upstream. Проверка: node --test test/fork-empty-storage.test.cjs (1/1 PASS, 01.10).
