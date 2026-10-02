# Pons terminal: покупки после graduation

Обновление02.10: следующий пакет ниже уже выполнен — новый genesis v2 допускает подтверждённые pool self-batches и проверен до index/API на свежем fork. Исторические результаты v1 ниже сохранены. [Актуальный отчёт](PONS_AUDIT_2026-10-02.md).

Проверка 02.10.2026 использует исходные функции текущего frontend [Pons](https://www.ponsfamily.com/launchpad/0xa84d0Caa63d1A92FD0c5B237EE9Bc322E38d1DDf). Все47 JS chunks скачиваются заново и сверяются с SHA-256 discovery. Инструментируется только регистрация exports; функции формирования транзакций не заменяются.

`scripts/pons-pool-terminal-rehearsal.cjs` вызывает `buildPonsV2TradePlan`, `quotePonsV2Funding`, `buildPonsV2FundingCalls`, `sendWalletCallBundle`. Quoter и allowances читаются на свежем локальном fork для реально запущенного и graduated тестового токена; API конвертации ETH/USDG — живой ответ Pons. Это проверка функций терминала и исполнения, не клики в UI и не установленное расширение MetaMask.

## Форматы

- USDG: ERC20 approve(Permit2) → Permit2 approve(Universal Router) → router.execute.
- ETH: WETH deposit → WETH approve(funding router) → funding swap → три вызова выше.
- Pool BUY: commands `0x10`, actions `0x060c0f`, slippage1% из оригинального frontend.
- При недостаточных разрешениях dispatcher передаёт всю последовательность в sendCalls. Здесь это зафиксировано wallet-заглушкой; исполнение пакета проверяется отдельно настоящей локальной type2 подписью на ранее авторизованном7702 executor.

Для каждого способа оплаты рассматриваются независимые ветки одного snapshot: последовательные вызовы и self-batch. Публично транзакции не отправляются. В остальном setup использует synthetic funding, локальный impersonation и локальную копию контрактов; не выдавать это за запуск нашего токена в mainnet.

## Границы допуска

Существующий общий профиль допускает прямые single-hop v4 покупки. Он не допускает v4 self-batch только потому, что обмен исполнился: нужны versioned decoder и подтверждение полных вызовов/исполнителя/расчётов. Для ETH нельзя брать общий net balance USDG кошелька как стоимость BUY: receipt пакета содержит предварительное получение USDG от конвертации. Считать нужно подтверждённый платёж за наш токен без второго начисления за funding swap.

Терминал также содержит выбор 0x после graduation. В текущем source `pickPonsBestRoute` выбирает aggregator при улучшении не менее10bps либо отсутствии прямой котировки. Отсутствие маршрута для локально созданного токена не доказывает недоступность 0x в целом; API отдельно проверяется на существующих публичных активах.

## Повторение

```powershell
node scripts/pons-pool-terminal-fork.cjs .local/logs/NEW-pool-terminal.json
```

Runner использует отдельную Prague VM и общий профиль. Исходные calldata, source hashes, reads и receipts сохраняются в `NEW-pool-terminal.json.terminal.json`. Основной отчёт содержит локальный launch/graduation и подписанную type4 авторизацию. Коллектор, draw lifecycle и index/API здесь не запускаются: проверяется ограниченный terminal→execution→decoder путь.

Попытка `pons-terminal-pool-20261002-a` не завершена: USDG sequential/batch прошли, затем Blockreq прекратил обслуживать anchor старше1024 блоков и EDR аварийно остановился на ETH. В попытке `b` основной RPC также потерял историческое state до окончания длинного collector setup. Частичные файлы со статусом RUNNING не являются PASS. Поэтому выделен короткий runner без повторения коллекторного цикла; проверка runtime и оригинальные terminal minOut сохранены.

## Результат

`PONS_POOL_TERMINAL_MATRIX_PASSED`, 02.10.2026, fork78091768 / `0x6d5eb0731c68ec940c04ac9a06fb17fd0d0a95b2f64185921093ab03beb1ff01`. [Полные capture/receipts, manifest, authorization и 0x responses](evidence/PONS_POOL_TERMINAL_2026-10-02.json).

| Оплата/исполнение | Исполнение исходных calls | Решение общего профиля |
|---|---|---|
| USDG, последовательные3 calls | PASS | Один ELIGIBLE BUY,101 USDG |
| USDG, self-batch3 calls | PASS, подписанная type2 | Один UNSUPPORTED_ROUTE / NOT_DIRECT_ROUTER_CALL |
| ETH, последовательные6 calls | PASS | Один ELIGIBLE BUY; USDG равен funding.minOut |
| ETH, self-batch6 calls | PASS, подписанная type2 | Один UNSUPPORTED_ROUTE / NOT_DIRECT_ROUTER_CALL |

Каждая ветка исполнена независимо от восстановленного snapshot; это не четыре накопленных покупки. Один target pool Swap на ветку; его USDG debit совпадает с платёжным Transfer в manager. Полученный net TOKEN не ниже оригинального terminal minOut. Исходные terminal calls совпадают с последовательными транзакциями либо декодированным self-batch. Вложенный funding swap не создаёт вторую покупку. Новых допусков/начислений для batch не включено.

3/3 адресных fixture-проверки PASS: `node --test test/pons-pool-terminal.test.cjs`, лог `.local/logs/pons-pool-terminal-tests.log`. Тест включён в full и pons-channels профили; полный набор не запускался. Короткая попытка `c` остановилась на пробном изменении storage при synthetic funding; восстановление snapshot при невалидном пробном слоте исправлено. Подтверждённый итог относится к `d`.

0x endpoint вернул HTTP200 с price для USDG→RDH и USDG→WETH; отдельные quote-запросы с тестовым taker вернули `transaction.to` и `allowanceTarget` = `0x0000000000001ff3684f28c67538d4d072c22734`. Это отдельный entrypoint; quotes не исполнялись. RDH в этой выборке остаётся curve token, поэтому quote не доказывает post-graduation0x route для нашего токена или победу агрегатора в выборе цены. Готовые payload сохранены для следующего отдельного execution/attribution прогона.

Следующий пакет: versioned v4 self-batch adapter для подтверждённых3/6 calls, с точным account/executor/approval/funding/settlement proof и сквозным index/API тестом. Отдельно —0x execution и source/runtime review; нельзя допустить произвольный aggregator только по Transfer или calldata. G10 остаётся частично открытым.
