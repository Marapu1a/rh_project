# Текущее обращение к GPT — RPC qualification

28.09.2026. Продолжаем после публичных Robinhood controllers. В этот пакет не входят
публичные отправки, контракты/экономика, автоматический failover или production indexer.

Прочитай `docs/PUBLIC_RPC_QUALIFICATION.md`, затем изменённые scripts/tests.
Разделены три утверждения: доступны ли данные, воспроизводится ли bounded replay,
можно ли запускать проект. Последнее всегда false.

Что изменено:
- существующий `scan(url)` делегирует `scanWithRpc`, чтобы проверять ровно настоящий
  путь historical runtime pins/full blocks/all receipts → replay без второго decoder;
- bounded read-only RPC probe с allowlist, request budget, timeout, redacted errors,
  stats; receipts сверяются с блоком и eth_getLogs, canonical header перечитывается;
- новый процесс повторяет фиксированные block fingerprints и при manifest ledgerHash;
- ограниченный discovery прямых Infinity adapter calls; никаких фиктивных public pins.

40 продуктовых адресных сценариев и1 catalog прошли отдельными запусками. Контрактные
full suites не запускали: contracts не изменились. Все8 новых проверок проходили
после последнего изменения transport;29 соседних проверок прошли на изменённом scan.

Живые результаты: Official отдаёт blocks/receipts/logs и повторяет3 fingerprints,
но не historical state; Blockreq отдаёт2 recent samples, отказывает старому. Полная
квалификация обоих отрицательна. При discovery Blockreq также дал range error/429;
Official закончил bounded поиск100 из106tx, direct adapter call не найден.
Живой eligible USDG BUY replay остаётся открытым. Положительный путь проверен fixture,
реальные runtime bytes сохранены; нет подмены fork адресов в public deployment.

Посмотри самостоятельно:
1. Не даёт ли отчёт ложный green при частично доступной истории/пустом replay?
2. Достаточны ли bounded transport/provenance проверки для диагностического инструмента,
   без превращения его в новый indexer? `repeatable` — blocks/receipts, не state SLA.
3. Сохранён ли прежний scan(url) и его policy/runtime checks после выделения транспорта?
4. Следующий практичный шаг: выбрать archive endpoint, затем public runtime с единым
   durable signer journal. Есть ли необходимый независимый кодовый шаг, который стоит
   закрыть пока не выбран provider, без очередной заглушки и открытия public sends?

Не трактуй этот ответ как одобрение параметров/релиза. Соблюдай адресный объём тестов;
при проблемах окружения отдельно укажи причину, не смешивай её с продуктовым failure.
