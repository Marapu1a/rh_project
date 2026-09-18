# Текущий ответ GPT

Обновлено: 18.09.2026.

Просмотрен latest commit 31f160d1c3c532cf88d4466c8873f258f753570f — Verify real drand evmnet proofs locally and on Robinhood RPC.

Прочитаны DRAND_FEASIBILITY.md, новый GPT_REVIEW_REQUEST.md, EvmnetFixture.sol, pinned vendor/source metadata, реальные vectors, local/RPC evidence и тест. Дополнительно сверены upstream drand client/spec, pinned randa-mu vector/demo и актуальные Robinhood/Arbitrum docs. GitHub CI/status для latest commit пусты. Заявленные repo проверки npm test 167/167, drand 2/2 и RPC 2/2 в этом проходе мной независимо не запускались.

## Короткий вывод

Feasibility реально продвинул вопрос: путь evmnet proof -> Solidity -> Robinhood EVM теперь не гипотеза. В текущем research package я не вижу конкретной ошибки в ordering public key, uint64 round encoding, DST, hash-to-point или sha256(signature).

Но до production RNG ещё две отдельные границы:

1. crypto implementation остаётся unaudited dependency в нашем audit scope;
2. timing/finality binding пока не решён.

И при проверке второй границы нашёлся более срочный production blocker, который относится не только к RNG:

> текущие Short/Monthly cutoff и epoch contracts используют Solidity block.number / blockhash как будто это Robinhood L2 block number. На Arbitrum/Nitro это неверно.

Robinhood и Arbitrum docs сейчас прямо говорят: block.number внутри контракта возвращает приблизительный Ethereum/L1 block number, тогда как RPC receipt/log blockNumber — настоящий L2 block number. Для L2 height нужен ArbSys(0x64).arbBlockNumber().

Это затрагивает как минимум ShortDrawCommitment.sol, ShortDatasetPreparation.sol, ShortRulesEpochs.sol и MonthlySettlement.sol. Поэтому следующий package я бы начинал не с формулы drand round, а с исправления chain-numbering boundary и только затем строил binding поверх правильного L2 anchor.

Источники:

- https://docs.robinhood.com/chain/differences-from-ethereum/
- https://docs.robinhood.com/chain/transaction-finality/
- https://docs.arbitrum.io/arbitrum-essentials/arbitrum-vs-ethereum/block-numbers-and-time
- https://docs.arbitrum.io/arbitrum-essentials/arbitrum-vs-ethereum/solidity-support

---

## 1. Что именно уже доказал drand package

### Message / round encoding

Текущий код:

~~~solidity
BLS.hashToPoint(
    DST,
    abi.encodePacked(keccak256(abi.encodePacked(round)))
)
~~~

для uint64 round совпадает с текущим drand client: round сериализуется как 8-byte big-endian, для BN254 evmnet unchained message используется Keccak-256 от этих восьми bytes.

Upstream client:

https://github.com/drand/drand-client/blob/master/lib/beacon-verification.ts

Pinned randa-mu demo использует ту же конструкцию:

https://github.com/randa-mu/bls-solidity/blob/11af179a8287d978659aae07adb66aa60f64b8a6/src/demos/EvmnetRegistry.sol

### DST

BLS_SIG_BN254G1_XMD:KECCAK-256_SVDW_RO_NUL_ совпадает с drand client и pinned vector.

### Public key ordering

В fixture key хранится в порядке, который ожидает pinned kevincharm/bls-bn254; тест затем обратно сериализует его в drand wire order и сравнивает с chain info. Плюс две реальные подписи проходят pairing verification. Конкретного ordering defect не вижу.

### Canonical randomness

sha256(signature) совпадает с drand client validation и с опубликованным beacon randomness. Отдельный proven flag правильно избегает ошибки bytes32(0) как sentinel.

### Robinhood execution

Новый RPC check значительно сильнее прежнего precompile smoke test: через state override на chainId 4663 и 46630 исполняется весь runtime, включая hash-to-curve, ECADD/modular work и pairing. Valid proof принят, wrong round отвергнут.

Но repo правильно не называет это deployment: это eth_call / eth_estimateGas, без публичной транзакции и сохранённого state.

Runtime 9,139 bytes и ~233k/243k remote estimate сейчас не выглядят техническим blocker.

---

## 2. Crypto boundary всё ещё не закрыта

Pinned kevincharm/bls-bn254 действительно совпадает с сохранёнными hashes и не добавлен в production dependency graph — это хорошо.

Но passing vectors != audit.

randa-mu/bls-solidity, который использует ту же базу, сам маркируется как experimental / unaudited и с июля 2026 архивирован. Drand в 2025 отдельно писал и про свой BLS12-381 on-chain verifier, что он не third-party audited и не предназначен для production integration без дальнейшего review.

То есть production путь для evmnet я бы формулировал так:

~~~text
vendor exact minimal verifier
+ exact evmnet key/DST/scheme immutable
+ upstream differential vectors
+ malformed/adversarial corpus
+ dedicated crypto review/audit
~~~

а не «мы проверили две подписи, значит криптография закрыта».

Полезно добавить differential corpus не только из randa-mu, но и генерировать множество rounds/signatures off-chain через текущий официальный drand-compatible BN254 implementation и сравнивать Solidity result. Это не заменяет аудит, но лучше двух vectors.

---

## 3. Exact-round outage/backfill: здесь ответ стал лучше

Drand protocol specification прямо описывает catchup:

- gaps в beacon rounds быть не должно;
- если сеть отстала, после восстановления nodes догоняют пропущенные rounds последовательно;
- sync API отдаёт requested round и последующие;
- unchained mode всё равно хранит rounds, просто verification не зависит от previous signature.

Источник:

https://docs.drand.love/docs/specification/

Поэтому для **временного outage с последующим восстановлением той же сети** разумное ожидание такое:

~~~text
target R задержался
-> сеть восстановилась
-> catchup генерирует R
-> любой keeper позже приносит тот же proof R
~~~

Это намного лучше request/refund RNG для нашего no-reroll invariant.

Но это не SLA и не решает permanent death. Если evmnet окончательно остановится/будет sunset без генерации конкретного будущего R, draw может зависнуть навсегда. Drand отдельно пишет, что судьбу evmnet решает League of Entropy; на 2025 у них не было плана его сворачивать, пока есть интерес, но immutable lifetime guarantee отсюда не следует.

Источник:

https://docs.drand.love/blog/2025/08/26/verifying-bls12-on-ethereum/

Для нашей philosophy это приемлемая фундаментальная граница только если мы явно принимаем:

> no reroll сильнее guaranteed completion при полном исчезновении RNG network.

---

# 4. Новый production blocker: L1 block.number vs L2 block number

Это сейчас важнее timing formula.

Robinhood docs:

~~~text
block.number -> estimate of Ethereum/L1 block number
ArbSys(0x64).arbBlockNumber() -> actual Robinhood L2 block number
RPC receipt/log blockNumber -> L2 block number
~~~

Arbitrum docs подтверждают то же и отдельно предупреждают, что эти числа не совпадают.

В текущем коде есть конструкции вида:

~~~solidity
request.cutoffBlockNumber < block.number
block.number - request.cutoffBlockNumber <= 256
blockhash(request.cutoffBlockNumber) == request.cutoffBlockHash
~~~

и epoch boundaries:

~~~solidity
policy.firstBlock = block.number + 1
lastTerminalBlock = block.number
~~~

При этом replay/indexer строит историю по обычным RPC L2 block numbers.

Это две разные координатные системы.

На Hardhat это не видно, потому что там block.number и RPC block number совпадают.

### Что надо сделать до RNG binding

Нужен маленький robinhood-block-semantics package:

1. Ввести один внутренний primitive _l2BlockNumber() через ArbSys и перестать использовать Solidity block.number для attempt/cutoff/epoch L2 boundaries.
2. Проверить на Robinhood mainnet/testnet read-only, что ArbSys height совпадает с RPC L2 semantics ожидаемым способом.
3. Не переносить автоматически текущий blockhash(cutoffL2): Arbitrum BLOCKHASH имеет специальные semantics и диапазон относительно Solidity block.number, а не нашего RPC L2 height.
4. Проверить EIP-2935 history contract на Robinhood ArbOS 61. Актуальные Arbitrum docs говорят, что их modified EIP-2935 path использует ArbSys.arbBlockNumber() и предназначен для past **L2 block hashes**. Если он реально доступен на 4663/46630, это выглядит естественной заменой для canonical recent L2 hash check.
5. После этого повторить Short/Monthly epoch/cutoff tests в fixture, которая моделирует Nitro semantics, а не Ethereum/Hardhat block.number == L2 number.

Пока это не исправлено, я бы не называл cutoff/finality path Robinhood-compatible.

---

# 5. Timing/future-round binding: минимальная модель после исправления block semantics

Robinhood теперь публикует полезную finality модель:

- soft confirmation — sequencer receipt;
- posted to Ethereum — ordering fixed, кроме Ethereum reorg;
- Ethereum finality — полная finality; docs дают ~13 minutes **typical** after posting.

Важно: это не hard upper bound. Поэтому нельзя превратить «~13 минут» в константу, которая математически гарантирует finality.

Ещё одна важная Arbitrum граница: L2 block.timestamp задаётся sequencer clock и допускает значительный диапазон; docs указывают до 24h назад / 1h вперёд. Значит block.timestamp нельзя описывать как объективный finality clock.

### Я бы тестировал такой invariant

В freeze transaction immutable сохраняются:

~~~text
drawId
frozen context / dataset
budget / basket / rules
L2 cutoff identity
freeze L2 block identity
targetRound
targetRoundTime
~~~

targetRound вычисляется контрактом, caller его не передаёт.

Он должен быть достаточно далеко в будущем, чтобы при нормальном ходе freeze успел перейти выбранную security boundary до публикации R. Но поскольку hard upper bound finality нет, production policy должна иметь fail-closed случай:

~~~text
если freeze не достиг требуемой finality до target disclosure,
этот frozen obligation НЕ получает новый round.
~~~

То есть safety не подменяем reroll'ом.

### Что contract может доказать, а что нет

На L2 contract легко доказать immutable target и валидность drand proof.

Сам по себе L2 contract не доказывает, что **его собственный freeze block уже Ethereum-final** до момента раскрытия R. Read-only RPC observation safe/finalized тоже не является on-chain proof.

Поэтому feasibility должен отдельно выбрать один из уровней:

A. accepted external finality assumption + independent verifier detects violation;

B. on-chain/L1-assisted proof of batch/finality, если реально нужен enforce, а не detect;

C. консервативный fixed lead + fail-closed, честно описанный как operational assumption, не mathematical finality guarantee.

Для MVP я бы сначала исследовал A/C, не тащил L1 proof machinery до доказанной необходимости.

---

## 6. Обязательные негативные сценарии для binding fixture

Минимум:

1. caller не может передать/заменить target round;
2. target R уже опубликован до freeze -> freeze/relevant seal запрещён;
3. exact boundary targetTime == block.timestamp;
4. sequencer timestamp skew around round boundary;
5. freeze reorged away до accepted finality -> canonical replay не сохраняет obligation;
6. freeze survives, proof tx reorged/reverted -> повторяется только proof R;
7. invalid R-1/R+1 proof;
8. correct R через день/30 дней;
9. duplicate delivery by another caller;
10. process/finish revert after proof -> stored R остаётся тем же;
11. keeper outage -> другой caller продолжает;
12. temporary drand outage -> late exact R accepted;
13. permanent no-R -> draw остаётся pending, no reset/new target;
14. restart/replay reconstructs same drawId -> R;
15. cutoff uses L2 height/hash semantics, а не Solidity block.number;
16. target calculation не меняется от caller, gas payer, tx ordering внутри уже frozen context.

Отдельно я бы fuzz'ил round arithmetic на timestamp bounds, а не только на идеальные integer seconds.

---

# 7. Что делать следующим куском

Я бы немного поменял порядок из текущего request.

Сначала:

~~~text
robinhood-block-semantics
~~~

- ArbSys L2 height;
- L2 hash retrieval path;
- mainnet/testnet read-only evidence;
- заменить/изолировать неверные block.number assumptions в Short/Monthly boundaries;
- regressions.

Сразу после:

~~~text
drand-binding-timing-v1
~~~

- immutable exact R;
- future lead;
- explicit finality assumption;
- no reroll;
- late permissionless same-proof delivery;
- reorg/restart/failure matrix.

И только затем production RNG adapter.

Это не отменяет текущий drand feasibility — наоборот, он свою задачу выполнил: cryptographic execution path выглядит жизнеспособно. Теперь главный риск уже не «запустится ли BN254 на Robinhood», а правильная Nitro chain identity/finality semantics и отсутствие target grinding.

Production provider всё ещё не выбран.
