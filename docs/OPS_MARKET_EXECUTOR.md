# Durable operations swap → ETH refill

28.09.2026. `scripts/ops-market-executor.cjs` подключён к общей автоматике через
опциональный `nativeRefill.swap`, только PROJECT_NATIVE/pinned slot1. Public sends
остаются закрыты. Призовой vault, RNG, распределение90/5/5 и права контрактов не менялись.

## Порядок и границы

В main lock сначала сверяется pending. Ops intent проверяется по source signer,
а не executor. При нехватке ETH сначала пробуем обеспечить одно старое обязательство
(с комиссией перевода и сохранением swap.nativeFloor). Этот путь не читает рынок.
Новые freeze по-прежнему требуют полный forecast. Если на выбранную цель не хватает,
переходим к сбору credits/конверсии. Для старого обязательства неполное пополнение
не отправляется; для новых работ сохраняется накопительный refill в пределах caps,
но freeze не разрешается до покрытия полного forecast. Остаток seed сохраняется всегда.

Один pass выполняет максимум одну ops стадию: collectOps → approve USDG → approve
Permit2 → swap+unwrap. collectOps нужен только если USDG кошелька меньше batch,
но кошелёк плюс credit уже покрывают batch. Мелкие credits не собираем по одному.
Только pay(pinned slot1), без pull или произвольных calls. Проверяются runtime hashes
collector/quote и quoteToken на одном блоке; внешний revenue source не нужен.

Intent до send, hash после; unknown send блокирует повтор. Receipt сверяет
from/to/data/nonce/chain/anchor. Для collectOps записывается usdReceived из Transfer,
баланс на блоке receipt проверяется против исходного плюс полученного. Чужой
permissionless pay перед нашей отправкой допустим: наш pay может дать ноль,
следующий pass прочитает фактический баланс. Save failure сохраняет pending.
Revert/несовпадение envelope останавливает ops, не сбрасывает призы.

Сбор credits использует те же cooldown и native fee caps. USDG spending расходуется
только swap. Refill независимо читает настоящий ETH balance. При swap.nativeFloor
выше minimumBalance сохраняется более высокий остаток, включая fallback.
Нулевой seed у всех исполнителей требует внешнего пополнения.

## Явные параметры nativeRefill.swap

- amountRaw, maxUsdPerPeriod, periodSeconds — bounded порция и лимит USDG.
- maxNativeFeesPerPeriod — отдельный лимит фактических fees approve/swap за период;
  перед отправкой должен помещаться максимальный fee envelope.
- cooldownSeconds — пауза после каждой подтверждённой попытки, включая approvals.
- allowanceSeconds — Permit2 expiry, больше cooldown+deadlineSeconds, максимум сутки.
  Нельзя ставить expiry равным deadline текущей quote: следующий pass строит новый
  deadline и иначе повторял бы approve вместо swap.
- slippageBps/maxImpactBps/maxAgeSeconds/deadlineSeconds — параметры read-only quote.
- maxGasPrice/maxGasUnits/nativeFloor/extraFeeWei — cap и неприкосновенный ETH остаток.
  nativeFloor не ниже nativeRefill.minimumBalance; глобальный maxGasPrice тоже действует.
- localFork — явный режим quote для31337 fork; в4663 false.

Числа из fork — fixture, не выбранный production budget. Никакой гарантии окупаемости
или прогнозного движка. При реальных Nitro fees source qualification ещё обязательна.
USDG/ERC20 approval ограничен порцией; Permit2 allowance ограничен суммой и временем.
Остаточное разрешение не означает новый send: после restart читается текущее состояние.

## Accounting и handoff

opsSwapHistory хранит период/израсходованный USDG/fees/periodFees/lastAttemptAt/nonce;
lastOpsSwap сохраняет проверенный receipt результат. Handoff переносит эти поля и
opsSwapHalt вместе с refill history; вся nativeRefill policy остаётся неизменной.

USDG debit считается по Transfer от pinned source в receipt. Native output — unwrap
закреплённого WETH: у реального Robinhood WETH это Transfer(router→zero), а не только
Withdrawal. При наличии обоих событий сумма не удваивается; противоречие останавливает
swap. Это проверка событий конкретного pinned маршрута, не универсальное доказательство
native transfer любых контрактов. Source runtime/immutable audit остаётся release gate.
На fork output дополнительно проверен по native balance delta с учётом фактических fees.
Дальнейший refill всегда читает ETH balance, не расходует сумму из поля nativeOutput.

## Проверки28.09

- `node --test test/ops-market-quote.test.cjs` —16/16: в том числе подмена только
  локального poolKey при независимом правильном manager ответе. Теперь его hash
  проверяется перед quote, а manager key отдельно обязан иметь тот же pinned id.
- `node --test test/ops-market-executor.test.cjs` —12/12: known/unknown для всех3стадий,
  save failures, once-only accounting/caps, WETH burn, mismatched output и reverted tx.
- `node --test test/promo-operational-status.test.cjs` —13/13, ops waits/halt не recovered.
- `node --test test/promo-refill-accounting.test.cjs` —5/5, прежняя refill граница.
- Адресные `--test-name-pattern` в promo-native-refill: `project swap gets seed` и
  `main recovery dispatch` —по1/1. Первый использует stub sender для проверки порядка;
  второй сверяет реальную approval transaction source в общем journal.
- В promo-runtime-handoff: `handoff preserves refill` —1/1, включая ops history/halt.
- `profile catalog` в test-launcher —1/1.

Итого49 разных продуктовых сценариев +1catalog, отдельными запусками, не full.
Несколько ранних failures были несоответствием ожидаемого текста TIMEOUT и fixture
инициализации fork; исправлены. Реальный fork выявил WETH burn вместо Withdrawal.

## Ограниченный fork

`node scripts/ops-market-fork.cjs .local/logs/ops-sender-limited-fork-2.json --executor`
[Evidence](../research/ops-funding/sender-fork-2026-09-28.json), block74812400.
Operations: искусственные USDG +0.002ETH; executor:0ETH.
10USDG →0.003720768049085340ETH; затем executor получил0.001ETH.
После каждой из3отправок симулирована потеря receipt response, журнал прочитан с диска,
known receipt восстановлен без второго nonce/send. Фактический ETH сверён с output.
Это НЕ SIGKILL OS test и НЕ полный watch→draw e2e: настоящий router/Permit2/swap/refill
прогнаны последовательными вызовами helper, а coordinator wiring проверен отдельно.
Local31337, read-only upstream; никакого публичного broadcast или тарифа Nitro.

## Завершение участка funding — 28.09

collectOps и продвижение старых обязательств без рынка реализованы.
[Новый fork](../research/ops-funding/credit-fork-2026-09-28.json): настоящий collector
с тестовым внешним source и искусственными 200 USDG распределил 90/5/5. Operations
получил 10 USDG; с seed 0.002 ETH прошёл collect→approve→Permit2→swap→refill.
Executor получил 0.001 ETH. После каждой из четырёх ops стадий потерян ответ receipt,
журнал перечитан, повторной отправки нет. Рынок настоящий; публичных sends нет.
Это не OS kill и не полный watch→draw fork. Coordinator/старые draw проверены отдельно.

Ближайшая работа — общая релизная репетиция и deployment/RPC параметры. Funding
не расширяем без конкретного блокера. Если доход ещё во внешнем source и не стал
credit collector, пустому executor нужен внешний ETH top-up для обычного pull;
новый ops pull намеренно не добавлен. Seed/caps выбираются при подготовке запуска.

## Адресные проверки завершённого пакета

28.09.2026: 27 разных продуктовых сценариев отдельными запусками, не full suite.
- `node --test test/ops-market-executor.test.cjs test/promo-refill-accounting.test.cjs` — 20/20.
- `node --test --test-name-pattern="project swap gets seed|old obligation advances|coordinator collects" test/promo-native-refill.test.cjs` — 3/3.
- В предыдущем адресном запуске того же файла `empty executor refills` и
  `main recovery dispatch` — 2/2. Уже пройденные соседи без изменений не повторялись.
- `node scripts/ops-market-fork.cjs .local/logs/ops-credit-fork.json --credit` — complete.

Промежуточные failures: assertion искал RNG step не в том уровне отчёта; fixture
лимит 1 gwei был ниже RPC maxFeePerGas; затем реальная ошибка undefined/checksum,
исправленная в sender. Recovery после исправления прошёл через настоящий withState.
Тест coordinator использует историческую drand fixture: только clock sender
привязан к её block timestamp; после recovery следующий market stage заменён wait.
Это не доказательство полного production watch с живым drand и рынком одновременно.

Соседи `--test-name-pattern="partial refill obeys|Ready monthly job"` — 2/2:
периодный cap с gas и запрет нового freeze за счёт старого обязательства.
