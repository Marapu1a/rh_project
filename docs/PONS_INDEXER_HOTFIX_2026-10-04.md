# Чтение публичной истории Pons: ремонт04.10.2026

Отдельный ремонт индексатора после запуска токена, без изменения билетов,
правил или финансовых контрактов. [Evidence](evidence/PONS_INDEXER_HOTFIX_2026-10-04.json).

## Причина и реализация

Старый scanner читал полные транзакции и отдельные receipts всей сети, затем
проверял bindings/runtime всех Pons dependencies в каждом блоке. У Robinhood
около10 блоков/с; даже без нашего оборота этот путь не успевал за цепочкой.

Новый opt-in `indexer.scanMode = pons-bloom-receipts-v1`:

- Читает header каждого блока. Отрицательный logsBloom для token/curve/registry,
  нужного pool (manager AND poolId) и lifecycle sources/vault позволяет не читать
  чужие транзакции. Сохраняется `ponsOmission`: полный RLP header, Keccak которого
  обязан совпасть с blockHash. Это не произвольный флаг «ничего не было».
- BUY replay самостоятельно проверяет hash/parent/number/timestamp и отсутствие
  своих событий. Lifecycle и rewards отдельно проверяют свои адреса. Positive
  bloom, включая false positive, требует полного чтения блока.
- В кандидатном блоке сохраняются все tx и receipts, полный порядок, log indexes,
  parent delegation и остальные проверки маршрутов. Для небольших блоков receipts
  читаются отдельно с ограниченной параллельностью, от25 tx — eth_getBlockReceipts.
  Количество/индексы/hash/branch квитанций сверяются с блоком.
- Исторические Pons bindings/runtime проверяются в блоках с фактическими событиями
  проекта. На конце прохода bindings/runtime проверяются независимо от событий.
  Нет допуска новых маршрутов, билетов по одному Transfer или смены anchor.
- Работы имеют ограниченную параллельность и завершаются до возврата ошибки/
  освобождения state lock. Cache height теперь локален запросу; это необходимо
  для параллельных чтений и rollback.
- Read-only RPC имеет общий pacing по весам методов и до3 повторов временных
  отказов. Ошибки валидации не повторяются, отправки запрещены. Replay revision
  обновлён; старые checkpoints пересчитываются. Batch size задаётся env
  `RH_INDEXER_BATCH_SIZE` (1..1000), не меняя identity сохранённого config.

Сверка bloom: [go-ethereum bloom9.go](https://github.com/ethereum/go-ethereum/blob/master/core/types/bloom9.go).
Реальный header launch79377860 воспроизводит hash, сохранён в test fixture.
Поддержан фактический16-field header сети. Новый несовместимый формат останавливает
проход. Это проверка относительно canonical/finalized RPC, не независимое доказательство
консенсуса. Старый reader без проверки ponsOmission не подходит для нового snapshot.

Alchemy различает billing CU и throughput CU: у block receipts throughput weight500,
поэтому один HTTP-запрос не обязательно дешевле отдельных receipt-запросов.
[Стоимость методов](https://www.alchemy.com/docs/reference/compute-unit-costs),
[окно ограничения](https://www.alchemy.com/docs/reference/throughput).
Pacing450 CU/s — ограничитель клиента, не гарантия квоты провайдера. Официальные
страницы приводят разные Free limits; реальные429 сохраняют отказ/повтор, а не
превращаются в пустые данные. Покупка платного тарифа не выполнялась.

## Результаты и границы

- Первые100 actual blocks:23.78s,93 omission headers, admitted.
- Следующие1000 со всеми block receipts:206.71s. Следующие1000 с выбором individual/
  bulk receipts:101.30s. Это разные участки с разной нагрузкой, не чистый A/B speedup.
- Всего локально2100 blocks с launch anchor79377859,78 торговых решений;
  checkpoint continuation. Первые10 blocks дают одинаковый ledger hash с полным
  receipt reader. Это ограниченная реальная эквивалентность плюс тесты, не full-chain audit.
- Свежий отдельный suffix1000:50.55s,19.78blocks/s при103s времени цепочки,
  997 omission headers, ошибок RPC0. Это только throughput-проба: ей не заменяли
  рабочую историю и не начисляли билеты от нового anchor.
- В локальном prefix:2 eligible BUY (накопления2 и6 USDG),29 SELL и47 unsupported
  routes. Последние не названы покупками с билетами. Расширение admission под
  фактические сторонние вызовы требует отдельного доказательства маршрута.

Проверки:129 cases в19 затронутых/соседних файлах (`node --test`, лог
`.local/logs/bloom-final-tests.log`), ещё1 новый large-receipt case,4 service cases,
1 catalog case —135 уникальных PASS. Поздний запуск receipt-scan10/10 включает
повторы, не ещё10 новых cases. Full suite/новый contract deployment не запускались.
Повторяемый профиль: `npm run test:group -- --profile pons-receipt-scan`.
Проверены omission tampering/positive bloom, полный BUY/lifecycle/reward replay,
batch/EntryPoint/0x, reorg, cache, restart, incomplete receipts, API completeness,
transient retries и draining in-flight operations.

## Отдельный серверный шаг

После локальных проверок установлен root-owned runtime
`/opt/qianqi/releases/indexer-bloom-20261004`,305 hashes verified,9 runtime dependencies.
`/opt/qianqi/prepared` переключён на него; старая поставка сохранена.
Actual config/profile matched; identity локального snapshot совпала с серверным
config. Передача13MB snapshot сверена SHA256.

`qianqi-public-indexer.service` enabled/active на loopback8789. Отдельный drop-in
[readonly gate](../ops/qianqi-public-indexer-readonly.conf) требует `indexer-approved`;
общего `activation-approved` нет. Batch1000, pass timeout300s, память2G.
Первый серверный проход1000 blocks —73.92s, failures0. Затем snapshot4100 blocks
проверен отдельным полным replay и lifecycle replay, checksum/config matched.
Сервис штатно остановлен и запущен без reset; checkpoint4100 сохранён.
После restart:4 успешных прохода,0 failures, head79385959 (8100 blocks),
последний batch1000 —43.15s, admitted/catchingUp. Loopback wallet API затем
вернул observed на head79386959 с явным indexerState=catchingUp; это не caughtUp.

Публичный кабинет/API8787 не переключались. Financial service disabled/inactive,
финансовых отправок0. Монитор денег и backup timer остаются в прежнем gated состоянии.
Read-only catch-up ещё не означает readiness кабинета или финансового исполнителя.

## Что ещё обязательно

Дождаться фактического догона, проверить API из нового snapshot, затем отдельная
активация фронта/финансового контура. История headers всё ещё растёт со скоростью
сети; omission сокращает payload, но не делает storage/replay постоянными по размеру.
Нужны реальные замеры роста/RPC бюджета и предел cold replay до заявления о длительной
эксплуатации. Короткая throughput-проба не гарантирует работу при любом обороте.

На Free остаётся ограничение getLogs10 blocks: до включения финансов проверить
queryFilter диапазоны, в частности payout scan в pons-automation.cjs до1000 blocks.
Ненулевой BuyPolicy publishedCount по-прежнему требует доступной истории notices.
Эти пути не обходились и не исправлялись изменением правил в этом пакете.
Source verification QIANQI, gas executor и контролируемый BUY остаются отдельными
незавершёнными launch gates.
