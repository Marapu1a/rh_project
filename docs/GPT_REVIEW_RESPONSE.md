# Постоянный ответ GPT — RPC qualification

28.09.2026. Независимое ревью `1ff66c3`. Прочитал новый инструмент, изменения `scan`, тесты и четыре сохранённых live отчёта. Лично запустил `node --test test/public-rpc-qualification.test.cjs test/infinity-buy.test.cjs test/direct-buy.test.cjs`: **37/37**, exit 0, ~1,6 с. Новых сетевых запросов и полного suite в этом ревью не делал.

## Вывод

Три разных сигнала разделены честно. У Official повторились три полных блока и receipts (`repeatable:true`), **но** historical state не читался (`sampledDataAvailable:false`). У Blockreq доступны две близкие высоты, старый диапазон отклонён и полный repeat=false. Во всех отчётах `publicLaunchReady:false`, replay на публичном eligible BUY не запускался. Ни один частичный успех не превращён в готовность проекта. Слово `repeatable` само по себе можно ошибочно прочесть шире, однако документация и `limits` прямо ограничивают его блоками/receipts; при дальнейшем использовании UI или автоматикой эти поля следует оценивать вместе.

`scan(url)` теперь лишь создаёт прежний HTTP reader и передаёт его `scanWithRpc`; runtime pins, чтение всех receipts, проверка canonical head и сам decoder остались на прежнем пути. `direct-buy.replay` проверяет contiguous branch, tx/receipt/log provenance, уникальные log indices и chainId; новый sample-инструмент дополнительно сравнивает `eth_getLogs` с receipts. Дублированная доставка не меняет ledger. В fixture положительный BUY есть, но там синтетические адреса проекта и сохранённые реальные runtime bytes: это не живой USDG BUY. Ограничение replay до 32 finalized blocks и отсутствие `BuyPolicySource` admission явно названы.

Allowlist методов, бюджет запросов, HTTP timeout, отказ без blind retry и очистка provider errors делают этот CLI подходящим **для диагностики одного endpoint**. Это не постоянный индексатор, SLA и не тест аварийного восстановления worker. Повторный процесс перепроверяет фиксированные headers/receipts; historical state probe при этом берёт новые относительные высоты. Бюджет вызовов не измеряет оплачиваемые provider compute units.

## Практический следующий шаг

Сейчас **не вижу обязательного нового кодового пакета до выбора archive provider**. Иначе будем строить public runtime вокруг неиспытанной инфраструктуры. Проверить платный/archive endpoint тем же CLI на нужной глубине, затем на *нашем* deployed `cutoffHashes` с `blockTag=finalized`, на полном диапазоне с первого BUY и на нагрузке двух draw/restart. Отдельно закрепить тариф/лимиты и запас на outage. После этого ограниченно переносить runtime на 4663, сохраняя один signer, durable unknown-send journal и независимый replay; local `31337`/loopback guards не снимать массово. Параметры timing и экономика всё ещё не приняты.

Поисковые 100 из 106 Swap tx без подходящего вызова adapter ничего не говорят об отсутствии рынка; оставшиеся транзакции и периоды не просмотрены. Этот пакет аккуратно **снимает неопределённость о возможностях двух публичных RPC**, но не закрывает инфраструктурный блокер релиза.
