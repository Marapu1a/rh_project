# Разбор review и подготовка первого подтверждения

04.10.2026. Внешний [ответ GPT](GPT_REVIEW_RESPONSE.md) из commit `00941e8`
проверяет кандидат `27108e6`. Это статический review, не запуск тестов и не
разрешение включить финансовую автоматику. Этот пакет меняет локальный preparer
и документацию; сервер, контракты и сайт в production не изменялись.

## Решения по замечаниям

| Замечание | Решение / статус |
|---|---|
| Поздние entries и старые draws | По review дефект не найден. Сохраняем creditedAt, прежние snapshots и отдельные Short/Monthly epochs |
| Trace/code hashes в bundle не являются доказательством исполнения | Принято. Offline replay проверяет согласованность предоставленного evidence. Publisher/RPC остаются границей доверия. Для первого боевого пакета нужна независимая RPC-сверка, пока не выполнена |
| Полнота компактной истории зависит от getLogs | Принято. Перед первым freeze и после смены RPC — независимый аудит полного диапазона по identities логов. Нельзя ограничиться повторной проверкой уже найденных tx |
|24ч от deployment не равны24ч от объявления | Принято. Сохранить публичный URL, содержание/hash и время объявления. Первый confirm не раньше max(source.availableAt, announcement.publishedAt +86400) |
| Покупатель может прийти через неподдержанный UI route | Принято. Не обещать билет для любой покупки.28 форм проверены локально,24 других записи pending; первый боевой путь должен включать фактический пользовательский маршрут |

Это не требует возвращать пустые блоки в постоянное хранилище. Криптографическое
доказательство исполнения и полностью доверенный publisher — разные модели;
данный пакет не переводит продукт на вторую без отдельного решения владельца.

## Исправление до публикации

Собственная проверка нашла воспроизводимый дефект старого preparer: один tx hash
в нижнем/верхнем регистре проходил `new Set` как два разных значения. Итоговый
bundle нормализовал оба в один hash, и после публикации replay отверг бы пакет.
Regression test на `00941e8` с прежним preparer: `Missing expected rejection`.

Теперь `prepare-purchase-recognition.cjs`:

1. Нормализует tx hashes до проверки уникальности и проверяет их форму.
2. Воспроизводит всю переданную историю BUY/lifecycle, проверяет конфигурацию
   и оставляет к публикации только ещё ожидающие однозначные покупки.
3. Сверяет historical header, receipt, trace и runtime evidence. При наличии
   buyPolicy сверяет policy через текущий admission reader.
4. Читает source runtime, immutable instance/publisher, availableAt и published
   на finalized block. Несуществующий source, иной publisher или неистёкшая
   контрактная задержка не дают план транзакции.
5. Прогоняет **целый bundle** через обычный replay с явно синтетическим
   confirmation block; проверяет число новых подтверждений и прежние draws.
6. Выполняет read-only `eth_call(confirm)` и повторно проверяет ветку finalized
   и сохранённой истории. Только после успеха записывает bundle/возвращает план.
7. CLI требует целый checksum, тот же configHash, admitted/caughtUp и свежий
   индекс. Сохранённые minted totals не используются как истина.

План `purchase-recognition-plan-v2` содержит reference hashes/проверенный head,
но остаётся **неотправленным**. `publicationChecksRemaining` явно перечисляет
независимый bundle audit, полноту project history,24ч публичного объявления и
доступность bundle. Проверка availableAt сама по себе эти требования не закрывает.
Успешный план — проверка на конкретном checkpoint; перед отправкой её обновляют.

`node --test test/purchase-recognition.test.cjs`: **15/15 PASS**04.10, адресный
набор. Проверены регистр дубля, wrong source/owner/instance, notice, published,
corrupt/foreign/unadmitted/waiting/stale index, неверный frozen snapshot, повторный
BUY, подмена metadata header и смена finalized после eth_call. RPC в этих новых
fault-сценариях синтетический. Full suite и browser suite повторно не запускались:
изменены только preparer и его проверки; предыдущие результаты см. [отчёт](PURCHASE_RECOGNITION_2026-10-04.md).

## Доступный второй RPC: фактическая проба

Проверена одна сохранённая USDG покупка
`0xeb4228dbc60761390d905d8570c82ae8614ba962519cc30c51d67a2f0fb47ba0`:

- Прежний Alchemy RPC (`.local/rpc-url.txt`): chain4663, receipt/logs совпали,
  исторический router runtime hash совпал. `debug_traceTransaction` вернул
  HTTP400/-32600: метод недоступен на Free tier.
- Публичный Robinhood RPC: chain4663; `debug_traceTransaction` вернул
  `the method debug_traceTransaction does not exist/is not available`.

Это подтверждённое ограничение **двух проверенных endpoints**, не утверждение
обо всех провайдерах или о невозможности независимой проверки. Ни один из этих
ответов не закрывает trace-аудит28 покупок. Никаких платных услуг не подключено.
Локальные результаты: `.local/logs/recognition-second-rpc-probe.json` и
`.local/logs/recognition-public-rpc-probe.json`; API keys в репозиторий не входят.

## План первого боевого пути

Область: Robinhood4663, QIANQI
`0x6EA39A23AA46E51CA6CD2d1cbc0B5bfb29ECB216`. Текущий policy publisher по сохранённой
конфигурации — `0x098afA6731239a00CE0aff669aaefD16b7C72114`, instance
`0x8a6a507aae35a2981afdf8e3637d013b5736b70a6621355254d55ccdc0a3da12`.
Это исходные ориентиры для свежего preflight, не утверждение о текущем nonce
или готовый deployment адрес. Publisher нового source нужно связать с выбранным
исполнителем и проверить до подписи; синтетические адреса fixture не использовать.

1. **Проверяемость.** Получить независимый endpoint с историческим callTracer/logs.
   Перечитать28 receipts, execution и runtimes до/после покупки; сравнить
   beneficiary, USDG basis, proof и итоговый carry. Опубликовать воспроизводимую
   команду с inputs/hash, не credentials. До этого первый пакет не публиковать.
2. **Полнота.** Зафиксировать anchor/head/hash и watched addresses/topics.
   Вторым RPC просканировать *весь* диапазон с допустимым paging; сравнить
   `(blockHash, transactionHash, logIndex, address, topics, data)` с исходным
   индексом. При расхождении остановить подготовку draw. Затем сделать этот
   аудит периодическим с сохранением проверенной границы, без копии пустой сети.
3. **Объявление.** Опубликовать понятное правило и технические условия, сохранить
   URL/time/hash. Отсчитывать24ч от публикации, отдельно от deployment delay.
4. **Source и перенос.** Подготовить deployment с фактическими immutable/nonce,
   дать владельцу reviewable подпись. После receipt сверить runtime/roles/time.
   Перенести bundle store/backup и одинаковый trust в индекс/API/coordinator;
   воспроизвести старые snapshots. Публичный кабинет переключать после сверки.
5. **Один малый confirm.** Подготовить v2 plan, независимо проверить пакет,
   обеспечить публичное получение файла по hash, затем подтвердить. Дождаться
   finality, сверить кошелёк/carry/Short/Monthly и restart. Остаток28 — после этого.
6. **Финансовая автоматика.** Собственный preflight после первого полного пути.
  24 других покупки остаются pending до проверки их маршрутов.

Черновик публичного текста, **ещё не опубликован**:

> Verified buys earn tickets. Every 100 USDG in qualifying purchases adds one Short
> ticket and one Monthly ticket. Some purchase routes are still being checked.
> If an earlier purchase is confirmed later, its tickets become available for
> future draws. Draws already locked or completed stay unchanged.

В окончательном объявлении раскрыть USDG basis с комиссией/возвратами и отдельный
ETH basis (доставленный в curve USDG), текущий список поддержанных форм и ссылку
на доказательства. Не обещать универсальную поддержку интерфейса Pons.
