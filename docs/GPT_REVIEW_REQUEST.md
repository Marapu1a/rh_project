# Ревью Monthly admission epochs

17.09.2026. Реализовали следующий узкий шаг после kind-bit IDs. Код казны, её
распределение денег и Short state machine в этом пакете не менялись.

Принятые поправки к прошлому предложению:

- Меняются только параметры допуска q. Monthly interval **не versionable**, immutable.
- Empty closure не является draw и **не обновляет clock**. Нет дополнительного месяца
  ожидания после закрытия действительно пустой версии.
- Activation запрещена и при pending, и при Publishing/Ready preparation.
- Policy закреплена за Input.rulesEpoch; processing читает policy именно этого draw.

Начать с [MONTHLY_RULES_EPOCHS.md](MONTHLY_RULES_EPOCHS.md), затем:

1. `contracts/MonthlySettlement.sol`: announcement, notice, B+1, current/draining,
   immutable policies, empty, terminal. Wrappers в test/contracts и research/controller-size.
2. `scripts/attempt-lifecycle.cjs`: lifecycle v4, независимые Monthly ranges, mint epoch,
   old-first snapshot, verified-empty, conservation, reorg; старые v1/v2/v3 остаются.
3. `scripts/monthly-dataset.cjs`, `scripts/verify-monthly-dataset.cjs`, `scripts/dual-bindings.cjs`:
   builder из raw history, проверка on-chain genesis и policy draw, публичных chunks и context.
4. `test/monthly-epochs.test.cjs`, `test/monthly-replay.test.cjs`: оба исхода old draw,
   failure/retry, credits, новые попытки, независимость Short, empty без переноса срока,
   same-block mint и B+1, поздний свежий cutoff, reorg, RPC publication и offline CLI.

Одновременно обслуживаются максимум старый draining и новый current. Пока old не
terminal/empty, третье объявление запрещено. История policies сохраняется для аудита,
но очереди необслуженных версий не растёт. Carry не сбрасывается; версия возникает при mint.
После настоящего terminal отсчёт идёт как раньше. После empty остаётся старый clock.

Новый ABI Monthly Input содержит rulesEpoch, ctor — notice; контекст теперь
MONTHLY_DATASET_CONTEXT_V2. Это новый deployment без миграции старых обязательств.
monthlyRulesHash — immutable **genesis** hash; monthRules() — **current** rules;
проверять старый draw следует через monthlyEpochPolicy(draw.input.rulesEpoch).

Ограничения по-прежнему явные: fake empty/dataset не исключается on-chain, а выявляется
независимым replay. RPC не сертифицирует finality/RNG. Нового admin reset/reroll нет.
Activation не резервирует деньги и не гарантирует будущую внешнюю готовность; production
readiness/finality/RNG остаются следующим отдельным этапом. Числа q/notice не утверждались.

Size/deployment gate с research RNG wrappers: Short 21 988, Monthly 17 064, vault 8 496
байт; стандартный runtime limit 24 576, optimizer 200, без viaIR. Evidence:
`research/controller-size/dual-check.json`.

Проверки: полный `npm test` 164/164; после него дополненный replay/CLI suite 6/6 и
усиленная RPC publication/genesis проверка 1/1. Всего сейчас 165 разных тестов;
повторный полный прогон после добавления CLI-теста не делали. Size/deployment check прошёл.

Вопросы:

1. Есть ли путь изменить старым attempts policy или включить новую epoch в старый draw?
2. Не расходится ли clock при win/no-win/empty между контрактом и replay?
3. Есть ли способ создать третью обслуживаемую epoch, застрять на старом cutoff или
   активировать изменение поверх опубликованного dataset?
4. Видите ли конкретный пропуск в v4 genesis/domain/publication checks?
5. После исправления реальных замечаний готовы ли перейти к отдельному исследованию
   настоящего RNG provider и минимального authenticated request/callback API?

Не предлагайте interval setters, mutable controllers или переписывание prize accounting
без конкретного воспроизводимого дефекта. Ответ — в прежний GPT_REVIEW_RESPONSE.md.
