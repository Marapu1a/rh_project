# Передача на финальное тестирование —30.09.2026

Пакет после50f925c. Результаты ниже получены в рабочем дереве по мере реализации,
НЕ полный baseline финального commit. [Задача GPT](GPT_REVIEW_REQUEST.md).

| Проверка | Результат | Граница |
|---|---|---|
| SITE_TEST_PATH=/concepts/hk/ node --test web/site.test.cjs web/wallet.test.cjs web/overview.test.cjs |19/19|Synthetic wallet/API, не реальные extension подписи|
| node --test web/site.test.cjs |3/3|Сохраненный исходный дизайн|
| node --test test/indexer-service.test.cjs test/user-status-cache.test.cjs test/public-status.test.cjs |15/15|Адресные service/cache/API|
| node --test test/public-observation.test.cjs test/public-status.test.cjs |4/4|Локальные EVM и fixtures|
| reward-observation / persistent-buy-indexer |3/3 и6/6|Адресные проверки предыдущего шага|
| node --test test/launch-source-preflight.test.cjs |3/3|Source reads/отказы, не deploy|
| node --test test/prepare-pair-launch.test.cjs test/pair-launch-preview.test.cjs |3/3|Calldata/preview, не signing|
| node --test test/infinity-buy.test.cjs |4/4|Saved fork BUY evidence|
| node --test --test-name-pattern="planning|plan|filled|allocation|rules|accepted" test/public-launch-checks.test.cjs |5/5|Только выбранные плановые сценарии|
| Live HTTPS/API/service/404/mobile и certbot renewal dry-run |Passed ранее30.09|API standby503, не индексирование|
| Collector и PAIR live eth_call/estimate + sequential local fork |Passed|Только2операции, draft metadata, без Promo/BUY|

Локальные сырые результаты находятся в .local/logs и не включены в git.
[Санитизированное evidence](../research/public-deployment/qianqi-launch-review-20260930.json)
содержит block, estimates, локальные tx и явные пределы; local tx hashes не искать
в mainnet explorer. Это отчет, не reproducible full-system proof. Команда для
нового read-only draft: node scripts/prepare-pair-launch.cjs NEW_OUTPUT.json.

## Еще не выполнено

- Полный npm run test:review на новом committed HEAD и разбор каждого failure.
- Сквозной прогон текущих public contracts с принятыми odds90/5/5 и live-like config:
  deployment→покупка→обе кампании→drand→выплата→индексатор→реальный frontend.
- Failure injection/restarts на тех же artifacts, а не только разрозненные fixtures.
- Реальное подключение нескольких wallet extensions/подпись review page.
- PAIR registration/indexing после прямого launch и совместимость PAIR UI BUY.
- Archive RPC, signer custody, operations address, immutable params и окончательная
  metadata; полная стоимость deployment/операционного запаса.

До этих проверок public sends остаются закрыты. Эта передача не объявляет продукт
production-ready. Приоритеты/разбиение следующего пакета ожидаются от review GPT.

Ответ GPT получен61663a8; исполняемый порядок и критерии оформлены в [FINAL_CHECKPOINTS](FINAL_CHECKPOINTS.md). Все новые точки пока TODO.
