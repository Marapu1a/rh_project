# Статический review: Monthly V2 — общий 75/25 и один взвешенный победитель

29.09.2026. **Не запускай tests/build/fork.** Проверки выполняет Codex;
[разделение работы](REVIEW_TESTING.md). Смотри код, математику, связки и реальные
дефекты; не превращай отсутствующие deployment-параметры в новые продуктовые решения.

## Решения владельца

- Monthly: не чаще30суток после settlement; положительный Current и заполненный Next.
- Один общий исход:75% весь frozen Current одному победителю,25% перенос без победителя.
- В75%-ветке нет второго личного допуска. Принят вес `e/(e+1)`, e — месячные attempts.
  Он нормируется по всем кошелькам snapshot. Больше entries → убывающая прибавка веса.
  Для одного участника итоговый шанс75%, для нескольких —75% × доля его веса.
- Нет Luck, reroll/reset, prize withdrawal. Старые unpaid claims сохраняются.
- Current>=100USDG пока **не утверждено**. T=100USDG — это Next target, не минимум Current.
- Short без верхнего продуктового потолка уже реализован; корзина/q Short ещё кандидаты.
-90/5/5 и3% creator fee сохраняются. Нехватка/дорогой gas → resumable wait/top-up,
  не доказательство вечной самоокупаемости. Призовые деньги на gas не расходуются.

## Что изменено

`contracts/MonthlyOutcome.sol`: фиксированный V2 payload `(2,3,4,1,1)` в существующем
Rules ABI. Новый rulesHash tag. Gate — старшие2бита hash с label MONTHLY_PAYOUT_V2;
значения0,1,2 дают выплату. Отдельный MONTHLY_WINNER_V2 hash от того же context/seed
выбирает интервал накопленных весов. Дополнительного random request нет.

Вес `floor(2^128 * e/(e+1))`; целочисленный и положительный. Точка выбора равна
`floor(hash * totalWeight / 2^256)`. Solidity: деление512-битного произведения на
M=uint256.max и коррекция q-- при остатке<q. JS вычисляет произведение напрямую.
Это Q128 аппроксимация весов, не обещание бесконечной точности или sybil resistance.

`MonthlySettlement`: суммирует вес в validated publication до freeze/seed;
process обходит committed chunks, finish проверяет весь progress/weight и обязательного
winner именно в выплатной ветке. Result tag V2. Поле admitted для совместимости равно
числу всех участников при выплате и нулю при переносе; оно больше не личный допуск.
bestRank используется только legacyV1. Казна и RNG не изменены.

`monthly-outcome.cjs`, dataset verifier и local-monthly-executor независимо проверяют
правила, веса, победителя, resultHash. Новые attempts после freeze остаются OPEN;
terminal расходует только зафиксированный набор в обеих ветках.

Публичный controller требуетV2, profile=`promo-robinhood-monthly-drand-v2`.
Оба допуска — новых операций и старых обязательств — обновлены на этот profile.
Public execution всё ещё закрыто. V1 оставлен для local/historical reference;
announcement не может сменить поколение относительно genesis. Это новая сборка/
deployment, не proxy update и не переселение старых journals на другой ABI/codeHash.

Launch plan фиксирует принятые rules/weight и проверяет drift. Репетиция сверяет
ожидаемые claims с фактическим исходом: legitimate rollover не должен ошибочно
считаться провалом из-за отсутствия Monthly выплаты.

## Что проверить в коде

1. Arithmetic: границы uint128, Q128 rounding и mulDiv/mulmod correction для random ticket.
2. Total weight определяется только committed участниками до seed; chunk partition,
   restart и порядок исполнителей не меняют победителя. Нет второго admission.
3. Нельзя открыть V1 в новом public controller или переинтерпретировать frozen draw
   через announcement. Нет разъезда generation checks normal/obligations-only.
4. Совпадение независимого JS с Solidity; отсутствие BigInt serialization surprises
   в durable worker result; atomарность claimable/Current/Next и поздних поступлений.
5. Видишь ли конкретный блокер для следующего шага: финальные численные Short параметры
   и minimumCurrent, затем launch profile/RPC? Не расширяй пакет до нового RNG/управления.

## Проверки и ограничения

Codex проверил V2 математику, обе ветки, один кошелёк, разные chunks, failed settlement,
old credits, no repeat, независимый replay, BUY→dataset→worker и сохранение late entries.
LegacyV1, dual vault и public BLS/checkpoint neighbours прошли адресно.
Итог71 различный продуктовый сценарий +1catalog, не full baseline; recovery12/12.
Точные команды/итог — в [модуле](MONTHLY_RULES_EPOCHS.md).

Составная локальная репетиция завершилась: призам1805.40USDG, выплачено849.366662,
осталось956.033338; Monthly802.70USDG одному кошельку. Source outage + потерянный ответ
о claim, durable resume, no double payment. Saved Infinity BUY, synthetic import,
историческая BLS подпись и локальный Nitro fixture: **не same-chain live/fork proof**.
Public source deployment/RPC/finality/service readiness этим не доказаны.
