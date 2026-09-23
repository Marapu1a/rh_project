# Публичный TOKEN/USDG reference: 23.09.2026

Статус: read-only исследование чужого deployment, не наш будущий токен и не
утверждённый production manifest. Транзакций, deploy и fork в этом шаге нет.

## Что найдено

На Robinhood chain 4663 события native coordinator
`0xddc69cbfb38f3f24d23b980c9e156c62a431687b` дали 20 запусков с quote USDG.
Проверены getters шести последних кандидатов modeId=1 (Fee Sharing).
Это выборка конкретного coordinator, не перечень всех PAIR pools.

Pinned block **70638438**, hash
`0x10c4b259388dbedcf028348fa565758ddd28fb09b7d44ff33d9510c0f4668ae0`.
Повторное чтение anchor совпало; sampled receipts совпали с block headers RPC.
Это проверка согласованности одного RPC, не независимое доказательство finality.

Для следующего исследования выбран reference с 11 Swap events, включая сделки
после launch (однопозиционный кандидат имел только launch purchase):

| Поле | Значение |
| --- | --- |
| TOKEN | `0x2B9495821247E9b3790E9e18f8498bEE6f5A5555` |
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` |
| Vault | `0xDCD7B60c8FeF290936533da7c21B5Be97839e580` |
| USDG positionId | `2466182` |
| PoolId | `0xcba8f1e548abf84741726c3a31ed56522794682171520a2b72280f99aa59b03e` |
| Pool key | sorted TOKEN/USDG, fee 10000, tickSpacing 200, native hook |
| Epoch / mode | 1 / 1 |
| Recipient | `0xb1BF6346cD6F7A8F52a709A4265a00D969Bd531d`, 10000 bps |

LP ownerOf соответствует vault; positions getter отмечает USDG position как
registered и с тем же poolId. У vault **две** позиции: вторая с другим quote.
FeeRouter привязывает одну позицию; нельзя автоматически переносить обе в наш
TOKEN/USDG accounting. Получатель чужой: этот vault не источник нашего FeeRouter.

## Обнаруженное несовпадение BUY

Все 11 Swap transactions сохранены с calldata и receipts:

- 5 SELL — `INELIGIBLE / SELL`;
- 3 — `UNSUPPORTED_ROUTE / NOT_DIRECT_ROUTER_CALL` (включая launch);
- 3 BUY через ожидаемый UniversalRouter — `UNSUPPORTED_ROUTE / ACTION_SEQUENCE`.

Последние имеют commands **0x10**, actions **0x060c0f**; текущий decoder допускает
только **0x060b0e**. Пример transaction:
`0x428c56a539d8f984df31eaa7ba84b06ba8fd3fe114aa0d96d63144627ee88182`.
Это уже релевантное несовпадение на TOKEN/USDG, а не на посторонней паре.
Семантику новых settlement/delivery параметров ещё предстоит проверить по коду
router и transfers. Простая замена допустимых bytes небезопасна: нужны прежние
гарантии payer, recipient, gross USDG и однозначности route.

Чистый decodeTransaction проверяет route, но не регистрацию пользователя и не
полный entry replay. Decoder projection не содержит fork-only registry/anchor.
Исполняемые adapters и правила участия в этом шаге не менялись.

## Чего это пока не доказывает

- Sourcify для выбранного vault ответил 404. Getters и provenance launch не заменяют
  независимую проверку соответствия runtime исходникам.
- В истории vault до anchor два события NativePositionRegistered, collect/claim
  events не найдены; claimable TOKEN/USDG у recipient равны нулю. Это **не** означает
  отсутствие несобранных LP fees и не проверяет успешный collect/claim.
- Исторические swaps не доказывают текущую ликвидность или исполнимость swap сейчас.
- Не подтверждены будущие параметры нашего deployment, доходность, RNG и gas draw.
- Native coordinator reference не доказывает, что текущий UI launch использует
  тот же route: различия маршрутов описаны в [предыдущем dossier](PAIR_PROFILE_EVIDENCE_2026-09-23.md).

## Воспроизведение и следующий шаг

Скрипты только читают публичные RPC methods, сохраняют ответы и отказываются
перезаписывать существующий output. Требуются установленные зависимости проекта.

```powershell
node scripts/find-pair-usdg-reference.cjs .local/logs/new-discovery.json
node scripts/inspect-pair-usdg-reference.cjs .local/logs/new-discovery.json .local/logs/new-inspection.json
```

Сохранённые evidence: [discovery](../research/pair-usdg-references-2026-09-23.json),
[inspection и receipts](../research/pair-usdg-active-reference-2026-09-23.json).
Первый скрипт ограничивает выборку шестью vault и восемью позициями/recipients;
ошибки сохраняются в output. Второй выбирает наиболее активный из этих кандидатов,
берёт первые 3 и последние 12 уникальных tx (здесь все 11).
Адреса router/manager/hook берутся из существующего fixture как кандидаты,
их текущие code hashes записываются отдельно; это не production allowlist.

23.09: оба public read-only запуска exit 0; anchor stable, 11/11 canonical samples.
Проверки синтаксиса обоих scripts и offline повтор decoder по сохранённым receipts
успешны. Full unit suite не запускался: runtime/contracts не менялись.

Ближайший ограниченный шаг: разобрать 0x060c0f по исходникам и фактическим transfers,
создать regression fixtures с позитивными и негативными вариантами, затем решать
вопрос отдельного route adapter. Collect/claim проверить отдельно на fork, не
подменяя владельца публичного vault в выводах о production. GPT пока не привлекаем.
