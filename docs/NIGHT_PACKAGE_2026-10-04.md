# Ночной пакет — 04.10.2026

Статус: исходники QIANQI опубликованы; маршруты исследованы, новый допуск выключен.
Финансовая автоматика не включалась; публичных транзакций и платных действий не было.
[Машиночитаемые результаты](evidence/NIGHT_PACKAGE_2026-10-04.json).

## Исходники и сканеры

Токен `0x6EA39A23AA46E51CA6CD2d1cbc0B5bfb29ECB216`, Robinhood 4663:
[опубликованная проверка Sourcify](https://sourcify.dev/server/v2/contract/4663/0x6EA39A23AA46E51CA6CD2d1cbc0B5bfb29ECB216?fields=all).
Sourcify job `ebe9157f-1dbb-4e83-8231-8d44622464f4`, 01:10:57 UTC:
creation/runtime **match**, matchId54585325. Это не exact_match: CBOR metadata
отличается, исполняемый код с фактическими immutable совпадает. Компилятор
0.8.35, optimizer200, viaIR, Cancun. Использованы публичные исходники Pons Token
и OpenZeppelin; не выдаём их за независимый аудит всей нашей призовой системы.

Автопубликация в explorer не завершилась: Blockscout403/Cloudflare,
Etherscan relay daily submission limit. Повторные запросы GoPlus после публикации
пока возвращают open_source0, honeypot/taxes неизвестны. Значок не обещан.
Согласно [GoPlus](https://docs.gopluslabs.io/reference/response-details), отсутствие
honeypot-ответа при open_source0 не является положительным honeypot-вердиктом.
[GT Score](https://support.coingecko.com/hc/en-us/articles/38381394237593-What-is-the-GT-Score-How-is-the-GT-Score-calculated)
учитывает также рынок, возраст и доступность данных; зелёный балл не цель проверки.

Подготовленный текст для поддержки (НЕ отправлялся):

> Please refresh source/security detection for QIANQI on Robinhood chain4663,
> token0x6EA39A23AA46E51CA6CD2d1cbc0B5bfb29ECB216. Sourcify confirms creation and
> runtime match (not exact metadata), matchId54585325, verified2026-10-04T01:10:57Z.
> Public sources: https://sourcify.dev/server/v2/contract/4663/0x6EA39A23AA46E51CA6CD2d1cbc0B5bfb29ECB216?fields=all
> GoPlus still reports is_open_source=0 and unknown honeypot. Blockscout relay
> verification received403 Cloudflare. Please advise how to index the verified
> sources or submit through the supported explorer workflow. We are requesting
> correct detection, not an audit badge or a guaranteed security score.

## Реальная покупка/продажа на локальном fork

`scripts/verify-live-pons-token-fork.cjs` использует существующий mainnet bytecode,
read-only upstream proxy и локальные синтетические средства. Команда:
`node scripts/verify-live-pons-token-fork.cjs docs/evidence/PONS_PUBLIC_LAUNCH_2026-10-03.json NEW_REPORT.json`
с локальным `RH_FORK_RPC_URL` (ключи в отчёт не попадают).
Fork79544103: PASS,171 upstream reads,0 errors,0 public sends.
Два обычных аккаунта: BUY1USDG и101USDG → transfer другому аккаунту → SELL всего.
Transfer tax0; обратно0.921601 и93.081601USDG соответственно, с комиссиями curve.
Base1%,creator3%,snipe0 на этой высоте. Это два конкретных curve-сценария:
не проверка всех роутеров/будущего graduated pool и не независимый аудит.

## Все 53 неподдержанные записи

Зафиксированный snapshot79518814:106 событий = **55 BUY +51 SELL**.
Из55 покупок3 проходят уже существующий допуск,52 проходят через неподдержанные
маршруты. Одна из прежних53 UNSUPPORTED была SELL в self-batch: исправлена только
классификация; новые покупки не допущены, билеты не начислены задним числом.

Исследованы все53 callTracer-трассы (2442 внутренних вызова), полные receipts,
внешние отправители/цели и доступность исходников. Сырые трассы остаются локально
в `.local/logs/night-traces/`; публичные сгруппированные наблюдения — в evidence.
В выборке покупки сводятся к ETH→USDG→QIANQI и прямому USDG; других входных
токенов в исследованной выборке не выявлено. Это не ограничение всех будущих маршрутов.

Крупнейшие группы:

| Внешняя цель | Записей | Что мешает безопасному допуску |
|---|---:|---|
| 0x65050a9b7e5075a2ba5ced7b1b64ee66262c40dc |28 BUY|Несколько delegatecall-модулей; исходники модулей не найдены в Sourcify|
| 0x9689992f5b5c09447f15906d8d11214944488341 |11 BUY|Park proxy опубликован, implementation0xe419…3359 не опубликован|
| 0x6131b5fae19ea4f9d964eac0408e4408b66337b5 |4 BUY|MetaAggregationRouterV2 опубликован, есть вложенные исполнители и промежуточный получатель|
| self-account0x125736d9ee228f1cc277bb2182b08e7ccb8b0f61 |1 BUY+1 SELL|Известный7702 executor, но внутри произвольный Park вызов вместо разрешённой формы|
| Остальные8 целей |8 BUY|Нужна отдельная проверка кода, полномочий и конечной передачи|

Особенно важно: прямой USDG маршрут65050… списал200USDG, отправил2USDG внешней
комиссии и198USDG в curve (tx0xeb4228dbc60761390d905d8570c82ae8614ba962519cc30c51d67a2f0fb47ba0).
Нельзя заменить доказательство плательщика/расхода одним CurveBuy.quoteIn и
незаметно изменить продуктовую базу билетов. Receipt доказывает движение, но сам
по себе не доказывает безопасную семантику произвольного прокси/роутера.

Следующий ограниченный шаг: выбрать65050… или Park, восстановить полный состав
исполнителей и правила вызова; определить плательщика, конечного получателя,
USDG basis/refunds и upgrade guards; проверить captured/fork положительные и
отрицательные векторы. Только затем обсуждать новую policy и её дату действия.
Не включать «любой router BUY» и не считать подпись внешнего sender достаточной.

## Исправления хранения и классификации

Project compaction теперь сохраняет соседние7702 authorization-транзакции в
блоках с событиями проекта: они могут изменить делегирование покупателя.
Иначе проверка parent delegation могла потерять контекст. Пустая история сети
по-прежнему не сохраняется. Регрессия сначала воспроизведена падающим тестом.
`scripts/audit-project-authorizations.cjs CONFIG STATE NEW_OUTPUT` — read-only RPC
аудит/экспорт, проверяет checksum/config/canonical branch, не перезаписывает вход,
останавливается при изменении ledger. На реальной истории98 event-блоков:
пропусков0, ledger совпал; серверный повтор на79529906 дал тот же результат.

Batch decoder сохраняет INELIGIBLE/SELL вместо подмены на unsupported-buy.
Реальный receipt сохранён в test/fixtures/pons-live-self-sell.json. Отдельно
проверена смешанная synthetic BUY/SELL receipt: продажа остаётся SELL,
неподтверждённая покупка остаётся UNSUPPORTED.

Проверки04.10:
`node --test test/project-history.test.cjs test/pons-entrypoint-buy.test.cjs test/pons-batch-integration.test.cjs`
**23/23 PASS**, адресный набор; полного baseline не заявляем.

## Серверный перенос

Отдельно после локальных проверок: runtime night-final-20261004,314 файлов
проверены от пользователя qianqi. Предыдущие releases/state сохранены.
В промежуточном runtime зависимости имели root-only permissions, сервис не
стартовал; исправлено, проверка require от service user добавлена в перенос.
Финансовые сервисы inactive, activation marker отсутствует. Read-only8789;
публичный8787/фронт не переключались. Новые route policies не публиковались.
История около2.37MB; свободно33GB/38GB. Это измерение, не обещание нулевого
роста при увеличении количества событий проекта.

Финальный live checkpoint01:36UTC: ready=true, lag0 к finalized79541426,
12/12 проходов,0 failures/restarts.227 сохранённых блоков,2374608bytes.
Кошельки/регистрации и draws/rewards совпали с исходным snapshot; reward checkpoint
продвинулся вместе с высотой. Менялся только SELL reason, не начисления.
GoPlus повторно01:37UTC: open_source0, honeypot неизвестен, taxes пусты.
