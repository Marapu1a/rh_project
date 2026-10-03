# Покупка → индекс → розыгрыш → кабинет

Тестовый пакет02.10.2026. Расширяет существующий
[indexed cycle](PONS_INDEXED_CYCLE.md) браузером на том же снимке и API.

## Что проверяется

`scripts/pons-collector-fork.cjs --indexed-automation --wallet-browser` выполняет
локальный запуск Pons, curve/pool покупки, накопление, сбор комиссий, индексирование
и оба draw через координатор. Флаг добавляет `scripts/verify-wallet-browser.cjs`:

1. До proposals кабинет читает билеты и покупки из persistent snapshot через
   настоящий `user-status-api` worker и HTTP proxy сайта.
2. После settlement/автоматических выплат тот же путь показывает remaining open
   tickets и Paid. Значения сверяются с независимым lifecycle replay.
3. API действительно останавливается: сайт показывает unavailable и очищает данные.
   Новый API worker на том же порту восстанавливает кабинет после Refresh.
4. Проверяются ширины1440/390, отсутствие page errors и неизменность snapshot bytes.

Нет перехвата browser HTTP (`page.route`) и подстановки JSON. Provider для подключения
в браузере тестовый, только read requests; подписи в браузере этот прогон не делает.
Ручной MetaMask/Claim подтверждён [отдельным локальным прогоном](WEBSITE_WALLET_ACTIONS.md).
Здесь выплаты автоматические, поэтому кнопка повторного Claim отсутствует.

## Воспроизведение и границы

Предварительно скомпилировать обычный test artifact и передать его абсолютный путь
и SHA256 через `RH_TEST_ARTIFACT` / `RH_TEST_ARTIFACT_SHA256`. Это не даёт каждому
worker заново компилировать contracts во время ограниченного RNG-окна.

```text
node scripts/pons-collector-fork.cjs <новый report.json> --indexed-automation --wallet-browser
```

`RH_FORK_RPC_URL` — read-only источник fork; все транзакции идут в in-process Hardhat.
Тестовые допущения существующего harness остаются явными: synthetic funding,
impersonation, operator conversion на fork, локальный ArbSys, backdated constructor
clocks, управляемый finalized и сокращённый lead RNG. Live drand proof не заменяется.
Это выбранный direct curve/pool путь, не одновременная квалификация всех 0x/7702
обёрток и не проверка production finality или доступности внешнего Pons operator.

## Найденная проблема стенда

Первый прогон `pons-wallet-cycle-20261002-a` прошёл покупки, индекс и браузер до
draws, включая HTTP outage/restart. Затем остановлен: RNG корректно вернул
`chainClockAhead`. Измерение локального RPC показало +12секунд относительно wall
clock; публичный read-only RPC в тот же момент — 0. Interval mining вместе с
automine отдельных транзакций искусственно добавлял секунды каждому блоку.

Для `--wallet-browser` добавлен отдельный Hardhat config
`test/fixtures/pons-wallet-cycle-hardhat.config.cjs`: блокам разрешено иметь один
timestamp в пределах одной секунды. Боевые контракты, параметры RNG и проверки
свежести не менялись. Прогон `a` не считается успешным циклом; его лог сохранён.

## Результат02.10.2026

Повторный прогон `pons-wallet-cycle-20261002-b`: **PONS_INDEXED_AUTOMATION_PASSED**,
fork78518737. Обе browser точки — PONS_WALLET_BROWSER_PASSED; отдельная HTTP/worker
сверка — PONS_SAVED_CYCLE_HTTP_PASSED. [Evidence](evidence/PONS_WALLET_CYCLE_2026-10-02.json).

- До draws: по86 OPEN Short/Monthly, 6 наблюдаемых покупок, призов ещё нет.
- После: 7 покупок, по86 consumed и1 OPEN каждого типа (покупка после freeze).
- Два приза Paid, выплачено107337115 raw =107.337115 тестовых USDG.
- Reserved/claimable=0; остаток239.088812 USDG полностью сходится с free reserves.
- 13 проходов координатора, включая stop после prove и resume. Последний проход —
  0 транзакций, nonce не изменился.
- До и после draw проверены реальная остановка/перезапуск API, восстановление
  кабинета, неизменность snapshot, desktop1440/mobile390 и отсутствие page errors.

Полный локальный отчёт: `.local/logs/pons-wallet-cycle-20261002-b.json`;
лог: `.local/logs/pons-wallet-cycle-20261002-b.log`; snapshots/screenshots:
`.local/logs/pons-cycle-RMQVmH/`. Рабочее дерево с накопленными изменениями,
не полный RC baseline. Набор маршрутов и тестовые допущения перечислены выше.
