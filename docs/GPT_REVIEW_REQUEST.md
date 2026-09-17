# Ревью: drand evmnet — первый исполняемый feasibility package

Итоговые проверки: основной `npm test` 167/167, отдельный drand suite 2/2,
read-only RPC checks 2/2. Полный suite занял около 7 минут.

17.09.2026. Код Short/Monthly и казны не менялся. Сделали только standalone
research verifier на pinned kevincharm/bls-bn254, локальные проверки и read-only
исполнение полного verifier через RPC Robinhood mainnet/testnet.

Начать с [DRAND_FEASIBILITY.md](DRAND_FEASIBILITY.md), затем:

- research/drand-feasibility/EvmnetFixture.sol и sources.json;
- test/drand-feasibility.test.cjs;
- scripts/drand-feasibility.cjs и scripts/drand-rpc-check.cjs;
- local-result.json / rpc-result.json в research/drand-feasibility.

Настоящие rounds 9337227 и 20716103 проходят локально. Для первого сверены
upstream message/hash-to-point и canonical SHA-256. В обоих Robinhood RPC
valid proof принят, round+1 отклонён, prove вернул ожидаемую randomness.
Это eth_call/state override, НЕ deployment, НЕ отправленная transaction.

Runtime 9 139 bytes; local verify receipt 176 491 gas; prove+store 225 068.
Remote prove estimates: mainnet 233 440, testnet 242 540 в записанных blocks.
Это не постоянная цена, не USD quote и не аудит криптографии.

Входное исследование уточнили:

1. Round нумеруется с 1: at-or-after = 1 + ceil((t-genesis)/period).
2. Published hash-to-point в markdown разбит 63/65 hex digits; используем
   оригинальный machine-readable fixture, а не ручное деление строк.
3. Seed zero допустим; отдельный proven flag.
4. Час задержки не является доказательством finality.
5. Fixed schedule + запрет позднего seal требует автоматического продолжения,
   иначе можно получить вечную блокировку ещё до freeze.

Локальный suite 2/2: positive/negative crypto, malformed points/bytes, same-proof
idempotency, другой caller, поздняя первая доставка и duplicate через 30 суток;
отдельно round arithmetic на 10 000 timestamps. Это ещё не frozen draw binding.

Вопросы для следующего узкого шага:

1. Видите ли конкретный дефект в key ordering, round encoding, DST, point validation
   или registry path? Не считать прохождение двух vectors криптоаудитом.
2. Какую минимальную timing/binding модель выбрать для нашего interval-based Short
   и Monthly, чтобы поздняя подготовка не блокировала дальнейшие draws?
3. Где достаточно честно сформулированного finality assumption, а где нужен
   объективно проверяемый факт? Не обещать, что fixed delay исключает любой reorg.
4. Какие обязательные негативные сценарии добавить в локальную binding fixture?
5. Есть ли подтверждённая exact-round outage/backfill semantics evmnet?

Следующий кандидат — небольшой локальный binding/timing study. Не добавляем
provider switching, emergency seed, RNG epochs, новые правила казны или production
adapter до закрытия этой границы. Empty closure не зависит от RNG readiness.
Ответ — в прежний GPT_REVIEW_RESPONSE.md.
