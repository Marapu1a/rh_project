# Резервы, розыгрыши и сервер

30.09.2026. Read-only пакет опубликован, реальные контракты проекта ещё не развёрнуты.
Сайт подключён к API в standby. Это не live запуск розыгрышей.

## Данные

`persistent-buy-indexer.cjs` при явном `config.publicStatus: true` вызывает
`public-observation.cjs` на том же blockTag, что BUY/reward snapshot. Проверяются
runtime hashes USDG/vault/controllers, обратные связи, decimals. Pins берутся из
manifest/lifecycle, не latest API. Включение меняет config identity: использовать
новый согласованный runtime/state, не переписывать identity работающего журнала.

Наблюдаются freeShort/freeCurrent/freeNext, nextStartTarget, reserved/claimable,
баланс казны, контрактные интервалы/последнее завершение. Short minimum получен из
weights × minimumUnit активной/дренируемой политики; Monthly minimum из контракта.
Сбой сохраняет последний успешный снимок со статусом waiting.

`public-status.cjs` связывает lifecycle/reward projection с наблюдением, проверяет
block hash/height, asset и manifest hash. `/v1/overview?offset=0&limit=10` возвращает
schema promo-overview-v1, observed/stale/unavailable, asset, reserves, SHORT/MONTHLY,
history (inProgress/winner/noWinner, budget/awarded/paid, freeze/terminal tx), provenance.
Пагинация limit1..100; плохая query400, POST405, unavailable503/no-store.
Архивный snapshot без publicObservation продолжает обслуживать wallet; overview503.

Wallet/overview используют общий кеш/worker и generation checks. Разные HTTP-запросы
могут попасть на разные снимки: UI показывает отдельные блок/время. awaitingChecks
проверяет только funding/time, НЕ execution admission (нет gas/RNG/publisher preflight).
Снимок остаётся публикацией индексатора, checksum не доказывает честность данных.
Источник поступлений fee/donation отдельно не классифицируется, показаны резервы казны.

## UI

`web/overview.js`: суммы, активный закреплённый бюджет, funding/time/checks, история
и Older draws; Monthly noWinner показан как rollover. Stale явно помечается,
недоступные числа заменяются прочерками. Open и frozenByDraw показываются отдельно
с количеством и полным draw ID. Суммы наград — только для совпадающего проверенного
asset/decimals; assignment/payment имеют отдельные ссылки. Buy/Claim не подключены.
Для4663 используется explorer из [официальной документации](https://docs.robinhood.com/chain/connecting/):
https://robinhoodchain.blockscout.com. Произвольные URL из API не исполняются.

## Эксплуатация

Timeweb201.51.22.244, qianqi.site, release data-20260930:

- фронт `/var/www/qianqi/releases/data-20260930`, symlink `/var/www/qianqi/current`;
- API `/opt/qianqi-api/releases/data-20260930`, symlink `/opt/qianqi-api/current`;
- systemd `qianqi-api`, пользователь qianqi, Node22.22.1, loopback127.0.0.1:8787;
- Nginx `/v1/` проксирует API; конфиг `/etc/nginx/sites-available/qianqi`;
- unit и ethers-only lockfile: `deploy/public-api/`;
- state `/var/lib/qianqi`, environment `/etc/qianqi/api.env`.

`start-public-service.cjs` без RH_INDEXER_CONFIG работает в standby: health503
awaitingDeployment, без RPC, индексирующих passes, signer и synthetic balances.
Для indexing нужен проверенный CONFIG с `publicStatus: true`, абсолютным statePath,
accepted freshness и реальными pins, плюс RH_RPC_URL. В api.env задать
RH_INDEXER_CONFIG=/etc/qianqi/indexer.json и RH_RPC_URL (секреты вне git), обеспечить
чтение qianqi и запись state; `systemctl restart qianqi-api` запускает supervisor.
Выдумывать deployment config нельзя; публичный индексатор ждёт настоящих контрактов.
Реальная пропускная способность mainnet не квалифицирована.

Проверка: `systemctl status qianqi-api`, `journalctl -u qianqi-api`,
`curl http://127.0.0.1:8787/healthz`. Standby503 ожидаем, не readiness.
Перезапуск службы проверен; failed units нет, порт8787 извне не слушает.
Rollback: прежний фронт front-20260930 сохранён. Переключить current на него,
вернуть `/etc/nginx/sites-available/qianqi.before-data-20260930`, nginx -t/reload,
остановить API. Старый preview109.73.196.111 не изменялся.

DNS синхронизирован; обычный браузер без IP override работает.
`certbot renew --dry-run --no-random-sleep-on-renew` прошёл для обоих имён.

## Проверки 30.09

- `node --test test/public-status.test.cjs test/public-observation.test.cjs`:4/4.
  Observer на реальных локальных EVM contracts с тестовыми активами/параметрами:
  historical block, funding delta, wrong pins/decimals. Lifecycle/API fixture
  синтетический, не публичный BUY→draw proof.
- `node --test test/indexer-service.test.cjs test/user-status-cache.test.cjs test/public-status.test.cjs`:15/15;
  после финальной query validation отдельно public-status3/3.
- reward-observation3/3 и persistent-buy-indexer6/6 в соседнем адресном запуске.
- `SITE_TEST_PATH=/concepts/hk/ node --test web/site.test.cjs web/wallet.test.cjs web/overview.test.cjs`:19/19;
  `node --test web/site.test.cjs` исходного корня3/3.
- `.local/logs/data-live-check.cjs`: обычный HTTPS,4ширины, wallet/overview503,
  неизвестные балансы, отсутствие JS ошибок,404. Скриншоты `.local/logs/data-live-*`.
  Публичная проверка standby, не mainnet контрактов/настоящих wallet extensions.

Полный suite не запускался: contracts и финансовый executor не изменены.
