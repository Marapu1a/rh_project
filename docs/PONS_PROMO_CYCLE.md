# Pons: локальный цикл Promo

Runner: `node scripts/pons-collector-fork.cjs <new-report.json> --cycle`.
Флаг включает `--v4`, затем [pons-promo-cycle.cjs](../scripts/pons-promo-cycle.cjs).
Upstream доступен через read-only proxy; все транзакции идут в локальный Hardhat.
Для длинного `--cycle` по умолчанию используется официальный RPC; можно задать
`RH_FORK_RPC_URL`. Бесплатный blockreq last1024 не подходит для длинного прогона:
его историческое окно может закончиться до завершения fork.

## Что соединено

1. Настоящие Pons curve/Uniswap v4 swaps → RPC blocks/receipts → entry ledger.
2. Комиссии Pons → LocalPonsCollector90/5/5 → DualControllerPromoVault GENERAL.
3. Общая история покупок → отдельные артефакты Short и Monthly → публикация и freeze.
4. Покупка после freeze остаётся OPEN; зафиксированные попытки не меняются.
5. DrandRandomAdapter проверяет BLS-подписи именно запрошенных живых раундов.
6. Исполнители сверяют результаты независимо, завершают draws и позволяют claim.
7. Инвариант денег проверяется на переходах: баланс = свободные резервы + frozen +
   claimable + ещё не распределённые USDG. Итог учитывает все выполненные выплаты.

Short и Monthly используют текущие правила, веса и minimumUnit из launch plan.
Исход выбранного раунда сохраняется и при отсутствии выигрыша; перебора seed нет.
Порог entry100USDG, Monthly minimum100USDG и Next target100USDG сохранены.

## Восстановление

Job-файлы перечитываются перед каждым шагом. Доставка drand намеренно прерывается
после первого сохранённого proof и продолжается новым вызовом с тем же журналом.
После завершения повторный запуск не должен отправлять транзакции. Claim проверяет
реальный прирост USDG у получателя, обнуление долга и отказ повторного claim.
Это моделирование перезапуска вызовами исполнителей; не остановка ОС или сервера.
Сбои known/unknown hash и подписи дополнительно проверены соседними тестами.

## Явные тестовые условия

- Synthetic USDG только у покупателя, impersonation владельца и оператора Pons.
- ArbSys заменён локальным блоковым shim: это не проверка финальности Nitro.
- В памяти компилятора backdated только начальные часы Short/Monthly. Оригинальные
  Solidity-файлы не меняются. Не нужно ждать шесть часов и месяц перед первым draw.
- Drand настоящий; lead60 секунд служит тесту, не является launch timing approval.
- При нехватке Current/Next владелец делает явно записанные пожертвования; деньги
  не рисуются внутри vault и не берутся из frozen/claimable.
- V4 minOut=1 остаётся тестовым допущением. Публичный сервис Pons operator не доказан.

Это локальная интеграция существующих исполнителей, не готовый постоянно работающий
Pons coordinator. Source/policy admission, live UI routes и публичный запуск остаются
отдельными границами. PAIR сохранён, production конфигурация не переключена.

## Адресные проверки

01.10.2026: `node --test test/local-controllers.test.cjs test/drand-delivery-worker.test.cjs test/attempt-lifecycle-dual.test.cjs`
—16/16 PASS. Профиль `pons-cycle-neighbors`; не полный baseline.
Лог `.local/logs/pons-cycle-neighbors.txt`.

01.10: `RH_FORK_RPC_URL=https://rpc.mainnet.chain.robinhood.com node scripts/pons-collector-fork.cjs .local/logs/pons-promo-cycle-20261001-b.json --cycle`
(в PowerShell env задаётся через `$env:RH_FORK_RPC_URL`).
Результат **PONS_PROMO_CYCLE_PASSED**, anchor77287946,
hash `0x7f8370d918869f2606cea846aed4969babc63cec5ab064b0692f27a67c4c7e5b`.
Лог `.local/logs/pons-promo-cycle-run-b.txt`; полный отчёт содержит блоки/receipts,
job artifacts, journal resume results и подписанные drand beacons.

- Один реальный адрес покупателя на fork:86 попыток frozen для каждого вида;
  поздняя покупка100USDG дала87-ю, оставшуюся OPEN в обоих видах.
- Drand rounds21109376 и21109383: BLS проверены on-chain, обе доставки завершены.
  После первого prove — stopped; resume выполнил deliver/prove/deliver.
  Ещё один запуск:0 действий и неизменившийся nonce.
- Short выплатил7.319631USDG, Monthly100USDG. Повторные claims отклонены.
- Пожертвования: Current2.404918USDG и Next51.202459USDG. После них баланс
  vault346.392623USDG; после выплат239.072992USDG. Frozen/claimable0,
  freeShort139.072992, freeCurrent100, freeNext0. Равенство денег проверено.
- Fresh replay сохранённой истории совпал с hash финального ledger;
  checksums обоих сохранённых jobs валидны.86 consumed и1 OPEN каждого вида.

Первый запуск через blockreq остановился в EDR из-за last1024-window до freeze;
его промежуточный BUY PASS не является успешным Promo cycle. Повтор через официальный
RPC завершён. Для длинного `--cycle` этот RPC теперь выбран по умолчанию.

Следующий ограниченный пакет: постоянный Pons coordinator с журналом транзакций,
который связывает финансирование, scheduler, drand и выплаты. Его restart/failure
проверки нужны отдельно; текущий harness не выдаётся за готовый сервис.
