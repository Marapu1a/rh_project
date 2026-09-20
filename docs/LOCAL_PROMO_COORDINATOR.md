# Локальный coordinator

20.09.2026. Только chainId 31337, loopback RPC, LOCAL_HEAD, тестовый RNG/обмен.
Solidity, распределение денег и права доступа не меняются.

## Один ограниченный проход

Без ops: `prize-flow → draw scheduler (Short/Monthly)` последовательно, с ожиданием receipt каждой
транзакции. Один provider, связанные TOKEN/USDG/vault, явно заданные unlocked signers.
С `--ops FILE` включается [эксплуатационный бюджет](LOCAL_EXECUTION_BUDGET.md): draw идёт
перед prize-flow, frozen jobs первыми внутри tick, native forecast проверяется до sends.
До state и чтений через runners проверяется, что каждый executor/publisher имеет тот же
provider object и методы getAddress/estimateGas/sendTransaction. Переданные router,
Short и Monthly должны иметь runner=provider либо runner.provider=provider. Даже второй
provider того же chainId не принимается: один объект — явный контракт локального API.
Это проверка wiring доверенных runners, не attestation произвольного JavaScript wrapper.
Призовой worker сохраняет изоляцию definite recipient failures, scheduler — независимость
Short/Monthly при definite rejection. Error/abort заканчивает общий проход. Неизвестная
отправка блокирует оба контура, включая последующие запуски.

CLI:

```powershell
node scripts/run-local-coordinator.cjs --job prize.json --config scheduler.json --state .local/coordinator.json --scheduler-state .local/scheduler.json --rpc http://127.0.0.1:8545 --publisher 0 --executor 0 --watch
```

Без `--watch` выполняется один проход. Watch ждёт `ops.settings.pollSeconds` в budget mode
либо `job.pollSeconds` в legacy mode между проходами;
это также задержка повторной проверки draw. Blocked/error завершает CLI с кодом 1,
а не автоматически перезапускает его. SIGINT прерывает ожидание, но не отменяет tx.
Статус `complete` означает завершённый проход; draws могут штатно ожидать seed/schedule.

## Маркер незавершённой отправки

Общий `sendLocalTransaction` имеет опциональную AsyncLocalStorage boundary только для
coordinator. Самостоятельные workers продолжают работать как раньше.

1. После estimate, до broadcast сохраняются worker/action/target/calldata.
2. После ответа RPC сохраняются tx hash/from/nonce.
3. Receipt исходной tx (success либо доказанный status 0) снимает pending; `lastResolved`
   хранит последнюю разрешённую операцию. Неизвестный outcome сохраняет pending.
4. Restart с известным hash читает receipt и проверяет blockHash текущей цепи. Пока
   receipt отсутствует, новых sends нет. После подтверждения workers читают актуальные
   балансы/credits/controller state: уже обработанные деньги/начатые draws не повторяются.
   Новый collect или обмен оставшегося/нового TOKEN допустим — это не повтор прежней выплаты.
5. Если hash получить не удалось (включая crash между отправкой и записью hash),
   автоматического resume нет. Пустой mempool/равные nonce не доказывают, что tx не было.
   Требуется отдельная диагностика; команды force-clear/retry в этом шаге нет.

Успешное сохранение prepared intent — **commit point текущей попытки отправки**.
Если проверка signal перед сохранением замечает abort, marker и send не создаются.
После успешного сохранения abort допускает одну уже подготовленную
отправку; её hash сохраняется, ожидание и последующие операции останавливаются.
Если процесс/RPC откажет после commit point, marker остаётся для reconciliation — это
не обещание, что отправка обязательно состоится. Durable cancel prepared intent не добавлен.

State использует существующую checksum/config-binding + atomic replacement + lock
реализацию `withState`; envelope остаётся `local-scheduler-state-v1`, внутри config
идентифицирует `local-coordinator-v1` без ops либо `local-coordinator-budget-v1` с ops.
Переход без pending и изменяемые settings описаны в LOCAL_EXECUTION_BUDGET.
Jobs этого envelope пусты; реальные draw jobs
остаются в отдельном scheduler state. Изменение job/config/signers/state path требует
осознанного перехода, не обходит незавершённый intent. Повреждённый state блокирует запуск.

## Границы

- Это минимальный локальный pending marker, не полноценный transaction journal.
  Нет истории всех intents, replacement recovery, production finality или crash-proof storage.
- Lock защищает один state path. Все указанные signers должны принадлежать только этому
  процессу. Нельзя параллельно запускать standalone workers или второй coordinator с другим
  state path на тех же accounts. Проверка pending nonce — дополнительный барьер, не mutex.
- SIGKILL может оставить stale lock; автоматического удаления/перехвата lock нет.
- Hashless failure блокирует до диагностики. Удаление state/lock не является доказательством
  безопасного recovery. Потеря/откат локальных файлов отдельно не решены.
- Ошибка RPC при reconciliation также останавливает запуск. Один receipt в LOCAL_HEAD
  не даёт production finality. Reorg после разрешения receipt остаётся отдельной границей.
- Локальный native forecast/gate доступен через ops. Autorefill, live DEX/price guard,
  real RNG не реализованы; прямой seal вне coordinator не получает off-chain gate.

После provider-binding fix: coordinator + transaction classifier — **20/20**, fail 0,
~151 s; 9 integration и 11 classifier checks. Включены неверные/missing providers у всех
signers/contracts и abort сразу после сохранения prepared intent с restart. Полный 249
в этом шаге не запускался. Команда — в CURRENT_CONTEXT.

Предыдущие проверки: `node --test --test-concurrency=1 test/local-coordinator.test.cjs` — **7/7**, fail 0,
144 s, 20.09.2026. Реальная локальная цепь, shared signer, оба pending пути, abort,
hashless restart, known refusal, lock, CLI и corrupt/config-mismatched state.
Первый общий прогон выявил optional `undefined` в metadata: checksum учитывал поле,
которое JSON не сохранял. Исправлено исключением отсутствующих полей перед save;
все семь интеграций после этого пройдены повторно. Результат общего набора — в CURRENT_CONTEXT.
