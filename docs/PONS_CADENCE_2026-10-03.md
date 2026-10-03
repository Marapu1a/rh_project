# Pons: паузы и смена лимита отправок

03.10.2026. Только идентифицированный локальный fork; production не меняется.

## Поведение

- `--max-transactions N` (целое 1–128) задаёт предел текущего прохода.
  Без параметра используется прежний config.maxTransactions. API:
  `runPonsAutomation({...options,maxTransactions:8})`.
- Это operational override, не редактирование config. Основной journal identity,
  scheduler config, policy, контракты, sender и RPC остаются прежними. Миграция
  checksum не нужна; существующие журналы читаются как раньше.
- Для CLI: остановить текущий процесс штатно, дождаться выхода, запустить с теми же
  config/state/RPC и новым `--max-transactions`. Не запускать второго writer.
  Изменение самого config.maxTransactions по-прежнему меняет identity и отклоняется.
- Известные выплаты идут перед RNG/settlement; frozen обслуживается до funding/new jobs.
  Если последний основной receipt относится к Short, scheduler начинает с Monthly.
  Порядок восстанавливается из существующего lastResolved, нового cursor нет.
- `continueImmediately` разрешается только после подтверждённой отправки, без
  pending/error и при исчерпании transaction budget либо scheduler maxTicks.
  Нехватка ETH, gas bound/price, pending nonce, funding error исключают ускорение.
  Вложенный executionBudget также проверяется. Обычный poll, расписание, ожидание
  RNG/индекса без готовой ограниченной работы сохраняют pollSeconds.
- `--watch` использует interruptible timer даже при нулевой паузе. Без подтверждённой
  отправки быстрый повтор не разрешается: пустой цикл не крутится бесконечно.
  blocked/error по-прежнему завершает CLI для разбора, а не делает blind retry.
- Вывод содержит maxTransactions, continueImmediately, elapsedMs, nextDelayMs и
  confirmedTransactions. Это метрики прохода, не SLA и не измерение indexer lag.

Unknown hash и pending receipt не очищаются сменой лимита; старый журнал и lock
нельзя удалять ради продолжения. Gas budget остаётся по ближайшей транзакции,
frozen/claimable не используются на эксплуатацию.

## Проверки

21 уникальный адресный test PASS (не полный baseline):

```text
node --test --test-concurrency=1 test/pons-cadence.test.cjs test/pons-automation.test.cjs test/pons-gas-budget.test.cjs test/pons-crash-recovery.test.cjs
node --test test/pons-cadence.test.cjs
node --test test/pons-cadence-orchestration.test.cjs
node --test --test-name-pattern="scheduler persists before|unknown Monthly send" test/local-scheduler.test.cjs
```

Первый пакет14 PASS; после добавления сценариев финальный cadence5 PASS,
реальный coordinator control flow с моделируемыми RPC/contracts/workers3 PASS,
соседние scheduler2 PASS. Automation6 и gas4 не менялись после первого запуска.
Process-kill1 включает main/drand × unknown/known/status0 на реальной локальной EVM.
Для Solidity использован прежний неизменённый artifact с RH_TEST_ARTIFACT/SHA256.
Логи: `.local/logs/pons-cadence-tests.log`, `pons-cadence-final-tests.log`,
`pons-cadence-final-controls.log`, `pons-cadence-orchestration-final.log`,
`pons-cadence-scheduler.log`.

Orchestration проверяет сохранение identity при2→8→2, подтверждённую остановку,
очередность Short/Monthly, приоритет существующей выплаты, idle/gas wait и
unknown intent при новом лимите. Это настоящий код runPonsAutomation и file journal,
но подставные chain/workers: не доказательство контрактного исполнения.
Первый orchestration test обнаружил отсутствие реакции на signal в test double
scheduler; после исправления double3/3 PASS. Не выдаётся за runtime-дефект.

Fork-команда: `node scripts/pons-collector-fork.cjs .local/logs/pons-cadence-cycle-b.json --coordinator-benchmark`.
Попытка `pons-cadence-cycle.json` на Blockreq public, fork79028203, exit1:
после curve/pool replay EDR panic на старом eth_getStorageAt — окно1024 блока.
Лог сохранён; до проверки нового coordinator эта попытка не дошла.
Повтор `-b` использует официальный RPC, fork79029978. Сравнение coordinator:
3/3 PASS, начальные лимиты2/8/32, затем каждый вариант продолжает с2/8 и idle
на исходном лимите. Все копии main/.rng/.scheduler переносятся без смены configHash.
Каждый вариант:8 уникальных отправок,5 проходов (включая stop, paused и idle),
одинаковые resultHash, итоговый nonce82 и vault331.785001 тестовых USDG.
Один участник в каждом draw; это проверка семантики, не throughput comparison.
Время активных вызовов17.95/16.14/16.23s, без watch sleeps.

После запуска fork добавлен только дополнительный запрет ускорения при вложенных
claimFailures/drand failures/error. Финальные cadence+orchestration8/8 PASS:
`.local/logs/pons-cadence-final-guard.log`. Fork не повторялся ради этого
консервативного условия; использованная им версия helper сохранена отдельно
`.local/logs/pons-cadence-fork-tested.cjs`. Отличие и hashes фиксируются в evidence.
CLI timer проверен на отмену, но длительный watch wall-time отдельно не измерялся.

Итог полного повторного fork: exit0, `PONS_INDEXED_AUTOMATION_PASSED`.
Short WINNER, Monthly NO_WINNER по настоящему drand; выплачено14.640926 тестовых USDG.
После восстановления frozen backup: `RESTORED_WITHOUT_SENDS`, nonce82,
0 новых отправок, balance331.785001, reserved/claimable0. HTTP API после replay:
8 наблюдаемых покупок,1 reward, по1 OPEN и86 CONSUMED каждого вида. Бухгалтерия
и resultHash сохранились. Это маленький direct curve/pool цикл, не all-route load.
Каталоги `.local/logs/pons-cycle-3CVg8x` и `pons-cycle-3CVg8x-before-restore`;
[сводка и SHA-256](evidence/PONS_CADENCE_2026-10-03.json).

## Пределы

Не обещаем fairness при бесконечном поступлении приоритетных claims. Очередность
Short/Monthly устраняет постоянное начало с Short при малом остатке бюджета,
не вводя новый планировщик приоритетов. `maxTransactions` остаётся верхней границей,
а не обещанием отправить столько транзакций: maxTicks, RNG и readiness сохраняются.
CLI меняет override при перезапуске; hot reload файлов намеренно не добавлен.

Отказ исторических RPC reads, большой смешанный BUY/index/API/draw прогон и
межузловой restore остаются следующими самостоятельными проверками.
