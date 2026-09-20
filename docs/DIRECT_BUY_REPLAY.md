# Direct BUY → билеты: decoder и replay v1

> Справка по модулю/эксперименту. Общий текущий статус — [CURRENT_CONTEXT](CURRENT_CONTEXT.md);
> даты и результаты ниже относятся к указанным этапам, а не задают следующий шаг проекта.

15.09.2026. Закончен узкий этап принятой [архитектуры indexer](INDEXER_TRUST_MODEL.md): воспроизводимый учёт покупок без нашей БД, с реальными контрактами PAIR/router в локальном fork. Production-контракты не менялись.

## Что выполнено

- [Сбор evidence](../scripts/direct-buy-evidence.cjs) создал native PAIR TOKEN на свежем локальном fork блока **63479353**, зарегистрировал участника и провёл покупки через уже развёрнутый Robinhood Universal Router `0x8876789976decbfcbbbe364623c63652db8c0904`.
- Все транзакции выполнены **только на Hardhat chain 31337** поверх состояния chain 4663. Кошельку локально выдан тестовый баланс USDG через storage override; резервы pool не правились. Это не публичный launch и не mainnet пользовательские сделки.
- В [evidence.json](../research/direct-buy/evidence.json) сохранены 13 блоков **63479354–63479366**, все их транзакции/calldata/receipts, pool key/id, code hashes, регистрации и диагностические изменения баланса. Числа взяты из реального исполнения, не из поддельного SwapFixture.
- Router source получен через [Sourcify API v2](https://sourcify.dev/server/v2/contract/4663/0x8876789976decbfcbbbe364623c63652db8c0904?fields=all). Статус **`match`, не `exact_match`**; runtime записи совпал с runtime в fork. Хеши выбранных source-файлов проверены по metadata. Независимая перекомпиляция внешнего router не выполнялась. Внешние источники с исходными MIT/GPL лицензиями сохранены в `research/direct-buy/sources`, не включаются в наши contracts/build.

## Точный поддержанный маршрут

[Decoder](../scripts/direct-buy.cjs) принимает только прямой `execute(bytes,bytes[],uint256)` на указанном router, один command `0x10`, actions `0x060b0e`: exact-input single → SETTLE → TAKE. Именно такую последовательность описывает [PAIR](https://pair.fund/docs); фактический ABI проверен по сохранённым исходникам router, а не скопирован из стандартного Uniswap.

В Robinhood struct есть дополнительный `minHopPriceX36`. В v1 он равен нулю; hookData пуст, amountIn положителен, settle/take amount равны нулю (полный debt/credit), payerIsUser=true. Допускается буквальный recipient=кошелёк либо router sentinel `address(1)`.

Плательщик определяется по **доказанной семантике этого прямого вызова**: router lock сохраняет caller, SETTLE использует его как payer; TAKE recipient должен совпасть. Это не общее правило `participant = tx.from` для всех транзакций. Вызовы через smart-wallet wrapper/EntryPoint без специального decoder **не поддержаны**, хотя регистрация таких кошельков разрешена.

Для eligible BUY требуются одновременно:

1. Один PoolManager Swap во всей квитанции, нужный poolId/key, sender=router, USDG delta отрицательна, TOKEN положительна.
2. Канонически декодируемый разрешённый calldata, правильное направление и фактические суммы в его пределах.
3. Ровно два Transfer по TOKEN/USDG: payer → PoolManager с точным quote input и PoolManager → recipient с точным token output; они следуют за Swap в порядке SETTLE → TAKE.
4. Участник зарегистрирован до Swap log по порядку блока/транзакции/лога.

Gross BUY — **actual quote input**, включающий pool fee в этой поддержанной ветке; он сверяется с реально исполненным Transfer. Не approval, не maximum input и не изменение баланса кошелька вообще. Посторонние переводы и service fees не интерпретируются эвристически: такой кандидат получает AMBIGUOUS. Условие двух transfers намеренно узкое; новый token/route с другой transfer-семантикой требует проверки.

SELL получает INELIGIBLE. Несколько swap в транзакции, дополнительные команды, exact-out, другие действия, payer != recipient и вызов через другой контракт — UNSUPPORTED_ROUTE. Ошибки/несогласованность свидетельств — AMBIGUOUS. Ни один из них не меняет carry; все кандидаты остаются в ledger с reason. Прямой перевод без Swap не является кандидатом BUY.

## Replay и независимая проверка

Начало диапазона — anchor **до прямого deployment registry**. Импорт неизвестного carry не поддержан. Проверяются непрерывные block/parent hashes, chain, связь tx/receipt/log и порядок индексов. Повторная доставка идентичного блока или лога не меняет результат; конфликтующие записи, пропуски блоков, orphan logs и неверная provenance останавливают replay.

Replay читает все Swap нужного poolId из всех receipts, а не supplied BUY decisions. Registration occurrence содержит адрес registry через manifest domain, chain, block/hash, tx hash/index и log index. Привязка registry к promo — правило manifest/controller, не гарантия registry bytecode.

Для eligible BUY:

```text
x = carryRaw + actualQuoteInput
minted = floor(x / 100000000)
carryRaw = x % 100000000
```

Выход — канонически сериализованный ledger и его hash, с отдельными счётчиками `shortAttemptsMinted` / `monthlyAttemptsMinted`. Это **накопительное начисление, не доступные после draws попытки**. Поверх него теперь реализован [lifecycle replay](ATTEMPT_LIFECYCLE.md) с OPEN/FROZEN/CONSUMED; production controller отсутствует. Не использовать minted totals как available.

При reorg используем полный replay новой непрерывной ветки от anchor; инкрементальная БД/поиск common ancestor не добавлены. Результат помечен `canonical-in-supplied-branch-not-eligible-for-commit`. Это не finality policy и не on-chain запрет freeze. Canonical hash и определение достаточных подтверждений для commitment остаются отдельной задачей.

## Команды

После `npm ci`, офлайн на сохранённом evidence:

```sh
npm run test:direct-buy
npm run report:direct-buy
node scripts/replay-direct-buy.cjs --evidence research/direct-buy/evidence.json --verify research/direct-buy/ledger.json
```

Это проверяет воспроизводимость предоставленных raw inputs, **не независимую истинность самого сохранённого JSON**. Для проверки публичного экземпляра через свой RPC:

```sh
node scripts/replay-direct-buy.cjs --manifest instance.json --rpc YOUR_RPC_URL --to-block END_BLOCK --verify published-ledger.json
```

RPC reader проверяет chain/anchor, считывает каждый блок и все его receipts, проверяет runtime hashes manifest на конце диапазона, повторно проверяет head hash после чтения и сравнивает пересчитанный ledger с опубликованным. Не зависит от нашей production DB. При изменении head/code, ошибке RPC, неверном диапазоне или несовпадении ledger завершится с ошибкой. Требуется доверенный после аудита instance manifest; runtime hash proxy сам по себе не проверяет все его implementation/upstream зависимости. Полная проверка истории изменения внешнего кода этим reader не реализована.

Сохранённые fork-адреса/транзакции не существуют в public chain: примерный fork manifest нельзя передать public RPC как mainnet instance. Reader проверен через локальный RPC fixture на полном блоковом evidence; публичного экземпляра нашего registry/TOKEN ещё нет. На длинной истории чтение всех receipts медленное, зато полнота не зависит от фильтров/ограничений `eth_getLogs`. Оптимизация с сохранением проверки полноты — позже.

Обновление настоящего fork evidence:

```sh
npm run test:fork:direct-buy
npm run report:direct-buy
```

Нужен RPC; публичный транспорт read-only. Скрипт использует сохранённый launch input/salt и новый deadline. Если PAIR graph/readiness/vanity изменятся, сбор может остановиться; автоматически подменять source другим не следует. Команда перезаписывает evidence, hashes и внешние source-файлы — изменения надо проверить перед commit. Trace используется только для локального USDG funding, не как вход decoder.

## Результат сохранённого сценария

| Кандидат | Решение | Начисление |
|---|---|---|
| Developer BUY внутри launch | Unsupported direct route | 0 |
| BUY 1 USDG до регистрации | Не зарегистрирован | 0 |
| BUY 99 USDG после регистрации | Eligible | 0, carry 99 USDG |
| BUY 1 USDG после регистрации | Eligible | 1, carry 0 |
| SELL | Ineligible | 0; ранее выданное не отменяется |
| BUY с другим получателем | Unsupported | 0 |
| Два BUY в batch | Два видимых unsupported кандидата | 0 |

Всего 8 кандидатов, один начисленный short attempt и один monthly attempt. 10 новых тестов проверяют fork-данные, повторное чтение, ошибочные transfers/calldata, reorg replay, same-transaction registration order и независимый RPC scan. Same-transaction и reorg сценарии — явно синтетические изменения сохранённой истории; actual fork подтверждает отдельные обычные транзакции.

Общий результат 15.09: **67/67 tests passed**, включая 57 прежних. Независимо выполнен новый local fork через настоящий router; это отдельная проверка от unit tests.

## Следующая граница

Не реализованы: production daemon/finality/выбор cutoff, денежный snapshot commitment, random и проверка winners. Учёт потребления attempts, inclusive cutoff и проверка attempt snapshot реализованы следующим отдельным [этапом](ATTEMPT_LIFECYCLE.md), пока на test-only lifecycle source. Smart-wallet wrappers, exact-out и другие маршруты не расширяем молча.
