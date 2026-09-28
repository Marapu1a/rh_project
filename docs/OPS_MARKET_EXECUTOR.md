# Durable operations swap → ETH refill

28.09.2026. `scripts/ops-market-executor.cjs` подключён к общей автоматике через
опциональный `nativeRefill.swap`, только PROJECT_NATIVE/pinned slot1. Public sends
остаются закрыты. Призовой vault, RNG, распределение90/5/5 и права контрактов не менялись.

## Порядок и границы

В main lock coordinator сначала сверяет pending. Ops intent отдельного типа
opsMarket проверяется по source signer, а не executor. При нехватке ETH executor
и недостатке source для refill пробуем bounded конвертацию ДО частичного перевода
ETH, чтобы не потратить seed на перевод раньше approval/swap.

Один pass отправляет максимум одну ops стадию: USDG approve → Permit2 approve →
свежий prepareSwap → swap+unwrap. Следующий pass заново читает allowances и balances.
После подтверждённого swap native refill использует фактический баланс source;
зачисления не вычисляются из обещанной котировки. У каждого send durable intent
до broadcast, hash после него. Unknown hash никогда автоматически не повторяется.
Known hash сверяется с tx/from/to/data/nonce/chain и canonical receipt/anchor.
Save failure не очищает intent; несовпадение envelope или definite revert останавливает
новые swaps для разбора, чтобы не жечь seed в цикле. Это opsSwapHalt, не reset призов.

При отсутствии USDG/достижении cap/halt/недостатке seed можно использовать уже
имеющийся ETH через прежний bounded refill. Cooldown и проблемы рынка оставляют
ожидание с сохранением seed. Уже обеспеченные executor действия не зависят от swap.
Нужен ETH на approve/swap; нулевой ETH у всех сторон требует внешнего пополнения.
Collector credits сами в кошелёк не переходят: их получение ops signer пока НЕ реализовано.

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

## Далее

Получение уже накопленного credit(slot1) за seed ETH operations под тем же журналом,
когда executor пуст и USDG пока только в collector. Сначала ограниченный pay(slot1),
не произвольный pull/call. Затем общий watch e2e с настоящим маршрутом и старым draw.
Public activation, production caps, source/immutable audit и RPC qualification отдельно.
