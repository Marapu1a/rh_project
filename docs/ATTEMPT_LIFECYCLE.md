# Попытки: доступно, заморожено, использовано

15.09.2026. Реализован [детерминированный lifecycle replay](../scripts/attempt-lifecycle.cjs) поверх [BUY replay](DIRECT_BUY_REPLAY.md). Это постоянный формат учёта попыток и проверки снимка, **не production controller или проверка random**. Custody-контракты не менялись.

Следующий пакет 15.09: [ShortDrawCommitment](SHORT_DRAW_COMMITMENT.md) связывает этот же AttemptsFrozen ABI с настоящим резервированием USDG атомарно. Есть проверка raw receipts и локального reorg. Он не доказывает правильность snapshot и не добавляет terminal; описанный ниже синтетический пример остаётся примером, а не production history.

Обновление V2: [Short outcome verifier](SHORT_OUTCOME_VERIFICATION.md) дополнительно сверяет ABI hash диапазонов с тем же replay snapshot и пересчитывает результат по seed. Lifecycle reducer/CLI сам по себе эту дополнительную проверку не выполняет. Test-only terminal с настоящим finalize проверен на локальных receipts; это не production RNG.

## Проверяемая история

Каждая entry создаёт по одной Short и Monthly attempt. Replay сохраняет исходный BUY ledger, историю MINT/FREEZE/TERMINAL с блоками/транзакциями/логами и состояние каждого кошелька отдельно по типам:

```text
mintedTotal = open + sum(frozenByDraw) + consumedTotal
```

Инвариант проверяется после каждого перехода. Нулевое начисление при неполном BUY-пороге видно в BUY ledger/carry и не создаёт attempt. Покупки пересчитываются из raw history; список начислений от оператора не является входом.

Попытки не NFT: используются накопительные диапазоны, например `firstAttempt=2, lastAttempt=4, count=3` одного кошелька и типа. В каждом типе один pending draw; SHORT и MONTHLY независимы. Один drawId нельзя повторно использовать даже для другого типа в пределах экземпляра.

## Cutoff и снимок

Cutoff — номер и хеш **последнего полностью включённого блока**. Он должен быть каноническим предком блока FREEZE, не раньше anchor. Same-block/future cutoff запрещены. После предыдущего TERMINAL того же типа новый cutoff не может быть раньше блока этого TERMINAL.

Замораживаются **все доступные к cutoff** попытки типа:

```text
count = mintedTotalAtCutoff − consumedTotal
firstAttempt = consumedTotal + 1
lastAttempt = mintedTotalAtCutoff
```

Покупки между cutoff и фактическим FREEZE, как и последующие покупки, остаются OPEN. Учитываются прошлые списания; нельзя использовать просто исторический total или текущее состояние БД.

`attempt-snapshot-v1` содержит domain, drawId, kind, cutoff, rulesHash и отсортированные по lower-case адресу положительные диапазоны участников. Domain включает chainId, instanceId, ParticipantRegistry, lifecycle source + его code hash и hash BUY manifest. Counts/ranges — десятичные строки, cutoff number — безопасное целое. Используется canonical JSON + Keccak256: это **хеш полного снимка, не Merkle tree**.

Снимок строит replay. FREEZE несёт ожидаемый хеш; пропуск/добавление участника, другой диапазон или domain приводят к ошибке. Содержимое rulesHash записывается, но исполнение продуктовых правил по нему не доказывается. Future controller должен фиксировать бюджет/корзину отдельно в общем контексте draw; attempt snapshot не заменяет денежный commitment.

## События

Схема `attempt-lifecycle-v1`, kind 0=SHORT, 1=MONTHLY. Один настроенный source предназначен одному экземпляру: это manifest/controller binding.

```text
AttemptsFrozen(drawId, kind, cutoffBlockNumber, cutoffBlockHash, rulesHash, snapshotHash)
AttemptsConsumed(drawId, kind, snapshotHash, outcome, resultHash)
```

Occurrence identity: `(chainId, blockHash, transactionHash, logIndex)`, также сохраняется transactionIndex. Логи извлекаются только из настроенного source в полной проверенной ветке receipts. Идентичная повторная доставка идемпотентна; второй on-chain FREEZE того же drawId или повторный TERMINAL — конфликт.

FREEZE перемещает OPEN → FROZEN. TERMINAL требует matching pending draw/kind/snapshot, outcome 0=NO_WINNER либо 1=WINNER и ненулевой resultHash. **Оба исхода расходуют весь frozen набор.** Claim не меняет попытки. Skip/not-ready без FREEZE ничего не расходует. Без TERMINAL попытки остаются FROZEN независимо от времени; timeout/admin reset не добавлены.

**Граница доверия:** source event и resultHash — заявление источника о terminal outcome, не доказательство честного random. Будущий controller обязан публиковать TERMINAL только после проверенного результата и атомарного денежного settlement. Replay не предотвращает ложь авторизованного источника о результате.

## Reorg

Новая ветка полностью пересчитывается от anchor. Если FREEZE/TERMINAL исчезли из цепочки, зависимые переходы исчезают из восстановленной истории. Это не административный возврат билетов.

Если оставшийся FREEZE ссылается на неканонический cutoff или не совпадает с пересчитанным снимком — hard fail, без исправления commitment. Недостаточная/конфликтующая история и неверные references также останавливают проверку. Выход остаётся `canonical-in-supplied-branch-not-eligible-for-commit`; finality и выбор eligible cutoff здесь не реализованы.

## Команды и пример

```sh
npm run test:attempts
npm run report:attempts
node scripts/replay-attempts.cjs --example --verify research/attempt-lifecycle-report.json
```

[Отчёт](../research/attempt-lifecycle-report.json) содержит **явно синтетические lifecycle и дополнительные BUY events** поверх сохранённых fork-данных предыдущего этапа. [Генератор](../test/fixtures/attempt-history.cjs) — test fixture. Его sourceCodeHash — явно синтетический marker, не attestation deployment. Нового fork или публичного draw этим этапом не делали.

| Шаг | Short OPEN / FROZEN / CONSUMED | Monthly OPEN / FROZEN / CONSUMED |
|---|---|---|
| Старые BUY 99+1 → 1 entry | 1 / 0 / 0 | 1 / 0 / 0 |
| После cutoff BUY 300 → 3 entries | 4 / 0 / 0 | 4 / 0 / 0 |
| Short #1 фиксирует старый cutoff | 3 / 1 / 0 | 4 / 0 / 0 |
| Monthly #1 фиксирует накопленный набор | 3 / 1 / 0 | 0 / 4 / 0 |
| Short #1 завершён без победителя | 3 / 0 / 1 | 0 / 4 / 0 |
| Short #2 фиксирует попытки №2–4 | 0 / 3 / 1 | 0 / 4 / 0 |

Пример проверяет бухгалтерию, **не допустимость расписания/бюджета**. Six-hour/monthly интервалы, достаточность призов и RNG принадлежат controller. Empty snapshot допустим для бухгалтерского replay, но не утверждает продуктовую готовность пустого draw.

Для raw evidence: `--evidence FILE` с полями `manifest`, `lifecycle`, `blocks`. Для чтения сети:

```sh
node scripts/replay-attempts.cjs --manifest instance.json --rpc YOUR_RPC_URL --to-block END_BLOCK --verify published-attempt-ledger.json
```

`instance.json` содержит BUY `manifest` и lifecycle config `{schema, instanceId, source, sourceCodeHash}`. Reader читает полный диапазон, проверяет runtime hashes на его конце (включая source) и стабильность head. Историю смены implementations/зависимостей это не проверяет; manifest требует отдельного аудита. Offline JSON не доказывает соответствие сети. `inputMode` — локальная поясняющая метка, не attestation издателя; `--verify` сравнивает ledger и hash.

## Проверки и ограничения

15 новых тестов: inclusive cutoff, поздние BUY, независимость типов, win/no-win, pending, дубликаты, неправильные references/domain, reorg, omission/invention и 81 кошелёк с большими диапазонами. Отдельный EVM-тест действительно deploy'ит test-only `AttemptLifecycleFixture`, регистрирует кошелёк, выпускает FREEZE/TERMINAL и проверяет receipts на пустом наборе. Это проверка event ABI, не полный розыгрыш.

Общий прогон 15.09: **82/82 tests passed** (67 прежних + 15 новых), включая Solidity compilation. Проверка RPC source hash включена в существующий scanner test.

Production controller, денежная атомарность, активация правил/расписание, finality, RNG, winner verification и frontend отсутствуют. Fixture unrestricted только для проверки неверных историй и **никогда не должен управлять PromoVault**. Формат replay постоянный; будущий source adapter должен сохранить семантику, но не обязан копировать fixture ABI без проверки.
