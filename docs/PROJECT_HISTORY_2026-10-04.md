# История проекта вместо копирования пустых блоков

04.10.2026. Решение владельца: сначала убрать рост от истории всей сети;
маршруты BUY разбирать отдельно. Порог, admission и призовая математика не меняются.

## Формат и границы

`pons-project-events-v1` читает `eth_getLogs` по token/curve/registry,
контроллерам Short/Monthly, vault и источнику BUY policy; для manager используется
фильтр конкретного poolId. На найденных высотах проверяются полные блоки и receipts,
затем сохраняются только транзакции с соответствующими событиями. Receipt такой
транзакции остаётся целиком: промежуточные переводы нужны для атрибуции и будущего
разбора неизвестных маршрутов. Индексы транзакций/логов не перенумеровываются.

Постоянно сохраняются события покупок, переводов проектного токена, политики,
билетов/розыгрышей/наград и данные их проверки. Неподдержанные кандидаты не удаляются
и не получают билеты автоматически. Служебные данные: фиксированный genesis anchor,
последняя обработанная высота/hash, policy, производный учёт и checksum.

Пустые старые блоки и чужие транзакции не накапливаются. Для rollback остаётся
скользящий хвост из 129 высот (head и 128 предшественников). Это ограниченная
служебная информация, а не вечная история сети. Исторический cutoff розыгрыша
сохраняется как отдельная ссылка `{number, hash, timestamp}` рядом с его событием.
Одинаковые высоты с разными hash запрещены. Слишком глубокий reorg останавливает
индексатор с последним корректным snapshot; автоматического reset/reroll нет.

Пустые промежутки опираются на полноту ответа RPC. **Это не криптографическое
доказательство отсутствия событий** и не прежние bloom/header proofs. Собственный
checksum защищает файл от повреждения, но не доказывает честность провайдера.
API явно отдаёт `historyCompleteness=trusted-rpc-log-selection; gaps-not-independently-proven`.
Независимый проверяющий может заново прочитать тот же диапазон своим RPC.
Receipt, chain, runtime/binding, порядок, политика и monetary replay проверяются
прежними правилами. Финансовые полномочия этот формат не добавляет.

Это пока один JSON со **значимой историей проекта**, а не новая СУБД. Размер и
стоимость полного replay растут с активностью проекта. Предел 384MiB и disk guard
сохранены. Для миллионов значимых покупок потребуется отдельный этап хранения;
рост на каждый пустой блок устранён, бесконечная масштабируемость не заявляется.

## Миграция

`scripts/migrate-project-history.cjs CONFIG STATE NEW_CONFIG NEW_STATE` работает
офлайн. Новые пути должны отсутствовать; исходники не перезаписываются. Перед
запуском писатель должен быть остановлен либо вход скопирован неизменяемым снимком.
Проверки: checksum/config identity → полный BUY replay → сравнение ledgerHash →
полный lifecycle/rewards → compact → повторные replay и точное сравнение хешей.
Сохранённый anchor не переносится вперёд, carry/билеты не импортируются как произвольные
начальные остатки. Новый config получает отдельный statePath/scanMode; сервис не
активируется командой миграции. После прерванного экспорта незавершённые outputs
проверяют отдельно; повтор не перезаписывает их.

Код: `project-history.cjs`, `migrate-project-history.cjs`, `replay-direct-buy.cjs`,
`persistent-buy-indexer.cjs`; sparse replay в direct-buy/lifecycle/reward-observation.

## Проверка на сохранённой реальной истории

Локальный неизменяемый snapshot до79480507:

- 280119788 → 1795861 bytes; 102648 → 226 записей блоков; 166 транзакций сохранены.
- BUY ledgerHash до/после:
  `0xd8bf49b42db23dcb31654c4079dccdade13037ed504f5dae96c57c3e42450543`.
- Lifecycle hash до/после:
  `0x553dafb8406889e457a5ef77aaf2b6e1977d9916e6c2b5a09c4378b11c8b7cb5`.
- Награды совпали. На этом mainnet-снимке draws/rewards пусты; ненулевые награды
  и оба draw отдельно проверены синтетической моделью, не боевой выплатой.
- Следующие 1000 блоков через QuickNode: 226 retained records, 2366529 bytes вместе
  с RPC cache, pass13.55s, save0.11s. Cold API после pass69ms, carry6USDG сохранён.
  Прежний cold API56.48s измерен на старом формате отдельно, не одновременно.

Логи и большие исходники: `.local/logs/project-*`, в Git не включаются.

## Адресные проверки

`node --test test/project-history.test.cjs test/persistent-buy-indexer.test.cjs
test/attempt-lifecycle-events.test.cjs test/attempt-lifecycle.test.cjs
test/reward-observation.test.cjs test/public-status.test.cjs test/indexer-service.test.cjs`
— **38/38 PASS**. Проверены restart/idle/reorg, отказ при глубоком reorg,
искажённый RPC log, удаление чужих tx без перенумерации, оба freeze/consume,
ненулевые paid rewards, старый пустой cutoff и ShortEpochEmpty, неизменность
source и запрет перезаписи миграции, чтение cutoff внутри пропуска.

Соседний прогон Pons receipt/persistent, dual lifecycle и API cache: 37/38;
единственная ошибка была в новом тесте (служебные ссылки добавлялись в dense fixture
до повторного dense replay), исправлена; новый файл повторно прошёл в38/38.
Это частичная проверка, не полный baseline. Каталог тестов дополнен новым файлом
и пропущенным в предыдущем пакете operations-rpc-storage; catalog check1/1 PASS.

## Серверный перенос

После локальных проверок отдельно установлен runtime
`/opt/qianqi/releases/project-events-20261004` (312 файлов verified).
Индексатор остановлен штатно. Исходные config/state/overrides сохранены в
`/root/qianqi-project-history-before-20261004`; SHA256 исходников после миграции OK.
Старые `/var/lib/qianqi-public/index.json` и `/etc/qianqi/public/indexer.json`
остались на месте; мигратор их не менял.

На границе79513933:345731881 →1804034 bytes,136074 →227 records,167 retained tx.
BUY/lifecycle/reward replay совпали; BUY hash
`0xd51585129a44fdb6e0263f73dc6ae546f49c54ad04283d15d7a693d3e4416da7`,
lifecycle hash `0xab40905cac4715c04882625a2ae33446b0a1ca88d1ed95ad64917d1440f25387`.
В этом более позднем снимке уже3 допущенных BUY,53 неподдержанных и50 SELL;
новый supported self-batch найден старой политикой, admission не расширялся.

Новый state `/var/lib/qianqi-public/project-index.json`, config
`/etc/qianqi/public/project-indexer.json`. Только индексатор выбирает их через
`40-project-history.conf`. Прежние30-operations/20-quicknode сохранены.
Первые3 прохода:0 failures,227 records,2.37MB с cache,9.54s pass/0.047s save;
cgroup peak106.6MB до первого API-запроса. Cold standalone API0.54s на VPS.

До контрольного restart:8/8 success,lag0,head79518814,227 records; idle pass2.66s.
После restart:3/3 success,lag0; HTTP wallet `observed`, cold551ms/warm3.56ms,
carry6USDG. Пиковая память cgroup111812608 bytes, NRestarts0 (аварийных).
Новый snapshot/config скачаны на Windows; checksum/config identity и независимый
BUY replay локальной копии совпали. [Числовое evidence](evidence/PROJECT_HISTORY_2026-10-04.json).

Финансовая автоматика disabled/inactive, activation marker отсутствует, глобальный
`prepared` и публичный сайт/API не переключались. Перед будущим включением
финансовой автоматики shared config должен явно указывать новый state/runtime;
старый путь не продолжает индексироваться. Резервное копирование каталога state
включает новый файл и старые неподвижные копии; для восстановления нового формата
нужен именно новый runtime, прежний `prepared/release.json` недостаточен.

Откат: остановить indexer, сохранить новые config/state, убрать только
`40-project-history.conf` в архив, daemon-reload, запустить прежний unit.
Старый snapshot начнёт догонять с79513933 и снова будет расти; это аварийный
откат, не долговременное решение. Ничего не удалять и anchor не менять.
