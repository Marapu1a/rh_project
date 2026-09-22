# Проверка отказов и восстановления native refill

22.09.2026. Локальный стенд chain31337. Runtime-код в этом пакете не менялся:
добавлены проверки настоящего завершения процесса и временного отказа чтения receipt.
[Модель и API](LOCAL_NATIVE_REFILL.md), [общий coordinator](LOCAL_PROMO_COORDINATOR.md).

## Что проверено

Родительский тест держит Hardhat/RPC живым, отдельный Node-процесс выполняет настоящий
native transfer через штатные executeNativeRefill + withState. Test-only checkpoint отмечает
точную границу; родитель принудительно завершает свой child и ждёт события exit.
Это не исключение внутри функции: finally дочернего процесса не освобождает lock.
Новый child читает тот же файл, а не копию state в памяти.

| Момент завершения процесса | Состояние журнала | Результат после подтверждённого освобождения тестового lock |
|---|---|---|
| После сохранения prepared, до send | Pending без hash, расход ещё не учтён | unknownHash, новой отправки нет; даже нулевой nonce не разрешает retry |
| После send, до сохранения hash | Pending без hash, деньги уже могли уйти | unknownHash; исходный перевод в тесте прошёл, второго нет |
| После сохранения hash | Known pending | Исходный receipt учитывается один раз, pending очищается |
| После чтения receipt, перед atomic final save | Known pending со старым расходом | Новый процесс заново учитывает исходный receipt один раз |
| После atomic final save, до освобождения lock | Расход сохранён, pending отсутствует | Повтор не меняет расход и не отправляет деньги |
| RPC не отдаёт receipt известного hash | Known pending остаётся | Ошибка не меняет файл; после восстановления RPC и перезапуска учитывается исходный перевод |

Во всех пяти crash-сценариях первый restart с оставшимся lock отвергается; файл остаётся
побайтно неизменным. Только тестовый harness после exit собственного child проверяет PID в
lock и абсолютный путь внутри своей уникальной .local-директории, затем удаляет этот lock.
Это НЕ новый runtime recovery API и НЕ инструкция автоматически удалять lock по одному PID.

Проверяются число eth_sendTransaction, баланс получателя, фактическое списание source,
точный nativeRefillHistory.spent и неизменность уже финализированного state при повторе.
Автомайнинг включён: после send в этих сценариях tx уже mined. Pending/mempool timeout и
mined revert дополнительно покрываются существующими executor/coordinator тестами.

Отдельная coordinator regression временно ломает getTransactionReceipt после mining:
оба workers не отправляют tx, state неизменен, lock освобождается обычным finally.
После восстановления RPC новый вызов coordinator учитывает receipt и продолжает работу.

## Что это значит для эксплуатации

- Обычные нехватка native, cooldown, дорогой gas и stale snapshot дают waiting; watch опрашивает снова.
- Известный hash можно сверить с receipt после восстановления RPC и запуска процесса.
- Неизвестный hash, сохранившийся lock и fee-policy halt требуют разбора; force-clear не является reconciliation.
- Сейчас необработанная receipt RPC ошибка завершает CLI с ошибкой. Встроенного reconnect-loop
  или внешнего supervisor этот пакет не добавляет. Продолжение проверено после нового запуска.
- После SIGKILL процесс сам не запускается и оставшийся lock сам не снимается.

Таким образом, защита от повторной выплаты подтверждена в этих сценариях, но полностью
безоператорское восстановление ещё не заявлено. Отдельный ограниченный recovery design должен
сначала определять владельца lock и исход отправки; нельзя подменять это сбросом pending.

## Границы доказательства

Это не power-loss/OS crash, не проверка диска или directory fsync, не production reorg/finality,
не отказ самого RPC-сервера вместе с chain state. Процессные тесты используют refill executor
и настоящий shared journal helper, а не убивают весь Short/Monthly coordinator посреди draw.
Общий coordinator проверяется отдельно на receipt-read outage. Призовая математика, RNG,
распределения и перевод дохода проекта в native не менялись.

## Запуск

```powershell
node --test --test-concurrency=1 test/local-native-refill-process.test.cjs test/local-state-lock.test.cjs test/local-native-refill-state.test.cjs test/local-native-refill-executor.test.cjs
node --test --test-name-pattern='native refill pending|hashless broadcast failure|refill admission' test/local-coordinator.test.cjs
```

Process suite включён в npm test и test:local:refill. Полный npm test/fork в этом пакете не запускались.
22.09: 31/31 process/state-lock/refill-state/executor (17.7 s), 3/3 targeted coordinator
RPC-recovery/hashless/admission (80.6 s). Логи отдельных запусков — .local/logs.
