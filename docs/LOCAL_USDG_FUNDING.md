# Локальный путь USDG из FeeRouter в призовую казну

20.09.2026. Первый участок соединения дохода с продуктом. Новые контракты,
права администратора и денежная математика не добавлены.

## Что работает

`PAIR source → collect/harvest → FeeRouter credits → pay → PromoVault.syncUSDG → free reserves`.
Collect/harvest выполняются существующими методами; их автоматический вызов теперь
соединён с этим worker через [revenue pass](LOCAL_USDG_REVENUE.md). Новый worker автоматически
обслуживает уже полученный FeeRouter USDG и уже переведённые в PromoVault средства.
Он не обращается к внешнему источнику: отказ PAIR не мешает выплатить существующие credits.

FeeRouter уже делит creator revenue между тремя recipient slots. Slot 0 в этом локальном
профиле — PromoVault; прочие slots остаются заданными политикой получателями вне prize custody.
Это не Short/Current/Next. Проценты берутся из явно заданного job и сверяются с политикой.
Worker не назначает новых процентов и не удерживает ещё одну комиссию при переводе.

Призовая часть поступает прямым переводом и распределяется по существующему GENERAL.
Job обязан явно выбрать этот профиль. Использование GENERAL для creator revenue и
конкретные creator shares пока **локальная конфигурация**, не утверждённая production экономика.
Тестовые 80/20 и 50/50 не являются продуктовыми решениями.

## API и исполнение

`scripts/local-usdg-funding.cjs`: `validateFundingJob`, `stepFunding`, `runFunding`.
В step передаются `{provider, router, vault, executor, job, signal?, receiptTimeoutMs?}`.
Run принимает те же options и `{maxSteps=32, onStep, signal}`. Один шаг — максимум одна tx.

Порядок действий:

1. Признать ранее доставленные в PromoVault USDG, если есть unrecognized balance.
2. Признать новый USDG на FeeRouter через sync.
3. Выплатить существующий credit первому из заданных получателей; затем перечитать состояние.
4. При отсутствии работы вернуть idle. Успешные переводы не повторяются.

Это несколько транзакций, не общая атомарная операция. Каждая денежная операция атомарна
в своём контракте. После остановки между pay и syncUSDG деньги уже находятся в prize custody;
их может признать worker, любой syncUSDG или существующий путь reserve/seal.
Timeout не отменяет tx; её hash нужно проверить до следующего запуска.

Пример JSON job (адреса заменить данными своего локального deployment):

```json
{
  "schema": "local-usdg-funding-v1",
  "chainId": "31337",
  "router": "0x...",
  "vault": "0x...",
  "token": "0x...",
  "quote": "0x...",
  "campaignId": "1",
  "recipients": ["0x...vault", "0x0000000000000000000000000000000000000000", "0x...project"],
  "bps": [8000, 0, 2000],
  "distribution": "GENERAL",
  "maxGasPrice": "1000000000000"
}
```

`npm run local:funding -- --job .local/funding-job.json --rpc http://127.0.0.1:8545 --executor 1`

Общий CLI допускает только loopback HTTP и chainId 31337; ключи не читает.
`--watch` повторяет проход через 10 секунд, пока нет ошибки/SIGINT.
Проверяются адреса контрактов, TOKEN/USDG, campaign и policy. Чтения для выбора действия
привязаны к одному блоку; перед отправкой проверяется его hash и текущий campaign.
Gas cap и pending nonce могут вернуть waiting. Есть ограничение числа шагов и receipt timeout.

## Сохранность учёта и границы

- Sponsor funding поступает прямо в vault: worker не создаёт project fee с этих денег.
- Reserved/claimable не перераспределяются; новые поступления увеличивают только free reserves.
- TOKEN не переводится и не конвертируется. Нельзя направлять его в USDG-only vault как замену swap.
- Rounding остаётся cumulative в FeeRouter; остаток до двух raw units закрывается существующим
  rollover в пользу slot 0. GENERAL сохраняет собственную фазу распределения.
- Job не выполняет rollover и не принимает новую кампанию молча. Старые credits сохраняются;
  при смене адресов recipients они по-прежнему выплачиваются через permissionless FeeRouter.pay.
  Новый job обслуживает только перечисленных в нём получателей.
- Проверка campaign перед tx не блокирует её смену до inclusion. Это известная граница локального
  orchestration: on-chain sync следует текущей policy, pay — уже возникшему credit. Job не является
  on-chain гарантией неизменности policy между отдельными транзакциями.
- Определённый отказ перевода изолируется на один pass с сохранением credit.
  runFunding возвращает degraded/failures; неизвестный результат отправки останавливает writes.
  Подробная классификация и общий skip двух funding-фаз — в [revenue](LOCAL_USDG_REVENUE.md).
- Job не подписан, не pin-ит bytecode и не является production deployment manifest.
- Draw scheduler и отдельный revenue pass реализованы локально; общего supervisor,
  TOKEN swap, ops split/refill и production RNG ещё нет. Idle означает «нет доступной работы здесь», не «внешний source пуст».

## Проверка

`npm run test:local:funding`: поступления, source outage, отказ перевода, restart,
campaign transition, rounding, sponsor funding и сохранность frozen/claimable.

Общий `local-buy-cycle` теперь получает дополнительное prize funding через FeeRouter:
4004 raw USDG → 2002 в казну + 2002 проекту. Далее те же два Short, два Monthly и claims.
Источник комиссий — MockPairVault с явно внесённым revenue, а не комиссии реального AMM:
торговый fixture создаёт BUY evidence, но не начисляет это revenue автоматически.
Весь цикл локальный, стартовые резервы fixture сохраняются.

20.09 проверено: `node --test --test-concurrency=1 test/local-usdg-funding.test.cjs test/local-buy-cycle.test.cjs test/fee-router.test.cjs`
— **24/24**, ~185 s, включая CLI для idle funding job и обоих terminal draw jobs.
Лог `.local/logs/usdg-funding-tests.log`. Основной набор теперь 186, полностью не повторялся.

**Открытый блокер TOKEN-интеграции:** permissionless FeeRouter.pay позволяет любому
выплатить TOKEN credit в USDG-only vault, где нет пути его использования/конвертации.
Отсутствие TOKEN-выплат в worker не защищает эту связку. [Воспроизведение](AUTOMATION_REVIEW_2026-09-20.md).
