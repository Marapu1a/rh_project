# Постоянный BUY indexer Pons

> Актуализация02.10: это модуль с датированными этапами/evidence, а не текущая очередь работ. Подтверждённые curve/pool self-batches теперь подключены к index/API новым genesis v2; scanner читает новый suffix, idle replay устранён. [Текущая матрица](PONS_CHANNEL_COVERAGE.md), [аудит](PONS_AUDIT_2026-10-02.md), [план](ROADMAP.md).

[Pons: допуск политики и чтение сохранённого индекса](PONS_INDEXED_COORDINATOR.md) — локальная связка проверена; полный indexed draw cycle следующий.

01.10.2026: существующий `persistent-buy-indexer.cjs` проверен с Pons curve/v4,
отдельными процессами, disk state и заменой ветки. Read-only, local research;
public BUY policy admission не открыт этим результатом.

## Изменение реализации

Существующие checksum/config identity, writer lock, fsync+rename, bounded batches,
rollback и ledger replay сохранены. Добавлен cache для `eth_call` строго на
числовой hex-высоте, без state overrides. Pons вызывает эти reads для проверки
factory/curve/hook bindings на каждом блоке. `latest`/`finalized` не кешируются;
policy resolve всё ещё работает через свежий RPC.

Cache читается после проверки canonical хвоста. При reorg строки выше общего
предка отбрасываются, включая bindings: новая ветка проходит проверки заново.
Старые state-файлы совместимы; отсутствующие eth_call entries заполнятся при чтении.
Ошибка чтения/валидации сохраняет прежний index и выставляет waiting, а не нулевой
ledger. Накопленные попытки не объявляются свободными после расходования в draws.

## Проверки

`node --test test/pons-persistent-indexer.test.cjs test/persistent-buy-indexer.test.cjs test/pons-curve-buy.test.cjs test/pons-v4-buy.test.cjs`:
20/21 PASS в первом запуске. В оставшемся тесте сравнивался старый observedAt
после успешного resume; исправлено сравнение с последним хорошим snapshot.
Повторён только этот тест,1/1 PASS. Итого21 адресный сценарий, не full suite.
Логи `.local/logs/pons-indexer-tests.txt` и `pons-indexer-test-final.txt`.

Новые scenarios:60+40 в порциях; повтор без исторических bindings/receipts/code
RPC reads; замена блока с40USDG убирает билет и возвращает carry60USDG; заменённый
curve binding на новой ветке блокирует публикацию; outage/deep rollback сохраняют
предыдущий ledger. Соседние tests покрывают config/checksum и readSnapshot gate.

Real-runtime fork:

```powershell
$env:RH_FORK_RPC_URL='https://rpc.mainnet.chain.robinhood.com'
node scripts/pons-collector-fork.cjs .local/logs/NEW_FILE.json --persistent-indexer
```

`pons-indexer-rehearsal.cjs` начинает с batchSize2, затем запускает CLI once
в трёх отдельных Node-процессах: catch-up, повторный старт и восстановление после
outage. Отдельный localhost RPC разрешает только чтение и только для теста
отображает finalized на local latest. Это НЕ доказательство mainnet finality.

**PONS_PERSISTENT_INDEXER_PASSED**, anchor77435048, processed head77435087.
Повтор не запрашивает старые full blocks/code/receipts/eth_call.
После дополнительного v4 BUY40 локальный snapshot откатывается и вместо покупки
майнится пустой блок. RemovedBlocks1; wallets возвращаются к прежнему состоянию,
ledgerHash совпадает с canonical replay. Outage/resume сохраняет тот же ledger.
Research snapshot остаётся unadmitted; production readSnapshot его отвергает.
[Компактное evidence](evidence/PONS_PERSISTENT_INDEXER_2026-10-01.json).
Полный отчёт `.local/logs/pons-indexer-20261001-a.json`; рядом indexer-config/state.

## Пределы и следующий шаг

- Это orderly process restarts, не SIGKILL/power-loss test; stale lock не удаляется
  автоматически. Унаследована политика `withState`.
- Cache экономит RPC; CPU replay и запись JSON всё ещё растут с полной историей.
  Не выдавать прототип за масштабируемую БД.
- Synthetic USDG/ETH и impersonation только локальные. Старые frozen datasets,
  RNG и claims не изменяются при rollback read-only ledger.
- Watch CLI уже существует; новый долговременный watch/нагрузочный тест не выполнен.
- Coordinator Pons ещё не переключён на этот snapshot: следующий ограниченный
  пакет — policy admission Pons и проверяемое чтение snapshot в coordinator.
  Публичный сервис/deployment/sender пока не включены.
