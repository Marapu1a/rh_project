# Short settlement: все участники, ограниченная работа транзакции

Исследование 15.09.2026, short-settlement-scaling-study-v1. **Production contracts не изменены.** Прототип находится только в test/contracts; это не готовый controller. Не вводились MAX_N, FIFO, отбор cohort, новая вероятность или несколько seeds на один draw.

## Вывод

Рекомендую развивать **permissionless последовательную обработку заранее опубликованного списка**. Текущие admission и global top-K можно сохранить: один snapshot, один seed, все N, максимум один приз кошельку. В локальном прототипе 5000 участников завершились без исключений из списка, с максимальной отдельной транзакцией около 1.04M gas при K=10. Полная стоимость при этом около 74.9M gas: масштабирование не означает бесплатную обработку.

Single-tx оставить как эталон и возможную заранее спроектированную оптимизацию для малых списков, но не выпускать immutable controller, который навсегда умеет только этот путь. Позже подменить его у существующего PromoVault нельзя. Прежде чем разворачивать, streaming должен пройти отдельную реализацию/ревью вместе с seed authentication, правилами и verifier.

## 1. Что реально удалось узнать о сети

[RPC evidence](../research/short-scaling-rpc.json), команда `npm run report:short:limits`. Только чтения, без отправки подписанных транзакций. Официальный RPC и BlockReq сопоставлены на одном блоке **63,945,627**, hash `0x005ba993a79e7de8da595eb556abc21b512132c48d522ea51048151504ecedc0`, timestamp **2026-09-15 20:42:54 UTC**, chainId=4663. Оба вернули одинаковые значения на этом блоке.

| Наблюдение | Результат | Что из него следует |
|---|---|---|
| header.gasLimit | 1,125,899,906,842,624 | Нельзя использовать как практический бюджет транзакции |
| ArbGasInfo.getGasAccountingParams | 7,000,000 / 32,000,000 / 32,000,000 | Сохранён raw ответ; не переносим произвольно настройки Arbitrum One |
| ArbGasInfo.getMaxTxGasLimit | 32,000,000 | Наблюдаемая настройка ArbOS на pinned block; не обещание всегда доступного исполнения |
| ArbOS version | 116 | Версия, возвращённая сетью, не доказательство идентичности upstream master |
| gasUsed пяти соседних pinned blocks | 175,982–1,404,428 | Маленькая выборка, не оценка пиковой нагрузки/пропускной способности |
| eth_estimateGas с 6,276 / 96,132 / 192,132 bytes | Оба RPC ответили | Это лёгкие calls к EOA с повторяющимся 0x11, не отправка реального settlement |
| getL1BaseFeeEstimate | 0 | Значение getter на этом блоке; не обещание отсутствия data fees |

Официальные [параметры подключения](https://docs.robinhood.com/chain/connecting/) описывают Robinhood как Arbitrum L2 с Ethereum blobs для DA. [Upstream ArbGasInfo](https://github.com/OffchainLabs/nitro/blob/master/precompiles/ArbGasInfo.go) разделяет gas accounting и max-tx getter; runtime-настройки проверены через RPC, а не угаданы из исходников. Для контекста fee accounting — [Arbitrum gas and fees](https://docs.arbitrum.io/how-arbitrum-works/deep-dives/gas-and-fees). Это не измерение реальной стоимости нашего settlement в ETH/USD.

**Граница не установлена полностью:** sendRawTransaction/mempool acceptance, точный максимальный размер транзакции у Robinhood sequencer и каждого провайдера не проверялись. В [upstream Nitro chart](https://github.com/OffchainLabs/community-helm-charts/blob/main/charts/nitro/README.md) есть конфиг max-tx-data-size с default 95,000, но это не подтверждённое значение Robinhood. Оно иллюстрирует, почему даже успешный estimate на 96KB не разрешает обещать включение такой транзакции. Не было публичных денежных операций или подбора предельной нагрузки RPC.

Таким образом, **32M — наблюдаемый верхний ориентир исполнения, не готовый operational budget**. Надёжный practical ceiling для single-tx на mainnet пока нельзя объявить: есть отдельная неопределённость размера/приёма транзакций. Для исследования локальные tx ограничены 32M, хотя Hardhat block limit остаётся 60M.

## 2. Измеренная граница старого пути

[Gas evidence](../research/short-scaling-study.json), команда `npm run report:short:scaling`. Solidity 0.8.37, optimizer 200, Cancun, synthetic participants, настоящий PromoVault. Это local EVM, не полный эмулятор ArbOS/DA/mempool. Все test seed доставляются fixture вручную.

| Профиль | N | K | Settlement gas / исход | Calldata bytes |
|---|---:|---:|---:|---:|
| Настоящие hash ranks, все допущены | 1000 | 1 | 6,884,874 | 96,132 |
| То же | 1000 | 10 | 7,298,190 | 96,132 |
| То же | 1000 | 32 | 9,258,736 | 96,132 |
| То же | 1000 | 64 | 12,882,805 | 96,132 |
| То же | 2000 | 10 | 16,738,215 | 192,132 |
| То же | 5000 | 10 | Out of gas при 32M; reserve остался frozen | 480,132 |
| Принудительный худший insertion | 64 | 64 | 4,091,954 | 6,276 |
| То же | 1000 | 10 | 12,338,152 | 96,132 |
| То же | 1000 | 64 | Out of gas при 32M | 96,132 |
| То же | 2000 | 10 | 26,866,346 | 192,132 |

Худший insertion — **искусственный stress variant**, не найденный честный seed и не альтернативный продуктовый алгоритм. В compiler memory сохраняется работа hash/threshold, все допущены, candidate ranks принудительно убывают, вызывая каждую возможную вставку/сдвиг. Дополнительные guards не сработали в измерениях. Оригинальные contract files не переписываются, normal artifacts не подменяются. Hash исходного и стрессового source есть в отчёте. Это инженерная нагрузочная оценка дорогой ветки, не формальное доказательство абсолютного gas worst-case всего controller.

При условном инженерном резерве 50% от наблюдаемых 32M строка 1000/K10 укладывается по локальному compute, 2000/K10 в стресс-пути — нет. **Это не одобренный MAX_N**: остаются tx-size, целевая VM, seed verification, правила и запас всей обвязки. Не стоит сохранять зависимость продукта от такого потолка.

## 3. Почему нельзя просто предъявить доказательства победителей

Текущий алгоритм вычисляет независимый admission hash каждого wallet, затем глобальный top-K допущенных. Membership и положительный admission победителя не доказывают, что пропущенный wallet не имеет лучшего rank.

В прямой EVM-проверке чёрного ящика hash необходимо рассмотреть все N в худшем случае. Число сравнений можно улучшить heap-алгоритмом, но O(N) проверки кандидатов и данные не исчезнут. Реальный gas также зависит от расширения EVM memory, а не только асимптотики операций. Нельзя заменять full scan одним обычным Merkle proof победителя и называть это эквивалентной верификацией.

При processing кусками доказательство простое: элемент, не вошедший в local top-K своей порции, уже имеет K лучших конкурентов и не попадёт в global top-K. Поэтому `topK(topK(prefix) ∪ topK(chunk)) == topK(prefix ∪ chunk)`. Фиксированный tie-break rank/address делает это однозначным; admittedCount суммируется, каждый участник обработан ровно раз. Порядок призов вычисляется от того же context/seed отдельно.

## 4. Прототип streaming без Merkle

[ShortStreamingStudy.sol](../test/contracts/ShortStreamingStudy.sol), [тесты](../test/short-streaming.test.cjs). Один исследовательский draw на экземпляр, не общий production controller.

```text
BEGIN: cutoff проверен, ожидаемые root/count и правила опубликованы
  ↓
PUBLISH: canonical Participant[] порциями, денег в reserve ещё нет
  ↓
SEAL: фактические root/count совпали → один атомарный reserve
  ↓
SEED: однократная доставка (в fixture — publisher, не настоящий RNG)
  ↓
PROCESS: следующий индекс, проверка опубликованного chunk hash,
         обновление progress + global top-K, без выплат
  ↓
FINISH: все N обработаны → finalize + terminal/расход attempts атомарно
```

Publisher фиксирует ожидаемые root/count **до** публикации данных. `publish` проверяет actual данные: строгий порядок адресов, уникальность между порциями, ненулевые диапазоны, отсутствие vault среди получателей. Root вычисляется контрактом, count/totalAttempts считаются из данных. Ложный заявленный count не позволяет seal. Недостаток funding, неверный root или незаконченная публикация не замораживают денег. `seal` разрешён любому только при точном совпадении.

Для последовательности используется `root0 = keccak256("SHORT_ORDERED_LIST_STUDY_V1")`; каждый следующий `root = keccak256(abi.encode(root, wallet, uint128 first, uint128 last))`. Root не зависит от границ порций. У каждой опубликованной порции сохраняется `keccak256(abi.encode(Participant[]))`, её индекс неизменяем. Поэтому processing доказывает именно следующий кусок, не требует Merkle proofs, не пропускает диапазоны и не принимает повторный индекс. Размер одной порции в опыте ≤64; **общего MAX_N нет**. Это число не принято для production.

Публичные данные находятся в publication transaction calldata; событие содержит индекс/hash/count. Сторонний executor в тесте восстановил список по транзакциям, без исходного массива publisher, и завершил draw. Для практической доступности необходимы сохранение transaction history и независимые копии/archival RPC; root сам по себе не создаёт data availability. Публикация готовности всего списка не доказывает его правдивость относительно BUY: это по-прежнему задача replay/verifier принятой trust model.

Cutoff проверяется при begin, пока доступен blockhash, и якорится в состоянии. Через 300 блоков полная подготовка всё ещё seal-able; новый blockhash старого cutoff не запрашивается. Reorg откатывает и anchor/progress вместе с цепочкой. Production готовность/finality и защита OPEN attempts при смене правил этим не решены.

Контекст включает опубликованный setup/root, правила, basket, chain и адреса, но не транспортное разбиение. Seed фиксируется один раз; нулевое bytes32 допустимо благодаря отдельной phase. Изменить список/правила/seed после seal нельзя. Пока Processing, бюджет полностью reserved; промежуточные top-K не являются назначенными наградами. В конце finalize и AttemptsConsumed атомарны, ошибка оставляет завершённый progress и те же inputs для повтора **того же settlement**, не reroll.

### Измерения streaming

| N | K | Порций | Max gas одной tx | Суммарный gas всего пути |
|---:|---:|---:|---:|---:|
| 1000 | 10 | 16 | 1,006,724 | 16,604,947 |
| 5000 | 10 | 79 | 1,037,407 | 74,908,186 |
| 1000 | 64 | 16 | 4,771,017 | 52,962,008 |

Сумма включает begin, публикацию, seal, mock seed delivery, processing и finish; не включает deployment/funding. Max publication calldata — 6,212 bytes, processing — 6,244 bytes. N=5000/K10 требует 162 tx после deployment/funding: 79 publication + 79 processing + 4 других. Победители, суммы и admittedCount сверены с независимой full-sort JS-моделью для тех же context/seed. Все средства сверены с vault accounting.

Рост N теперь увеличивает число транзакций, общий расход и задержку, но не размер отдельной порции. Рост K всё ещё важен: он определяет top-K storage и стоимость финального назначения, поэтому технический предел K сохраняется. Код опыта намеренно переиспользует существующий ShortOutcome для local top-K, повторяя basket sorting/hash на каждом шаге; production реализацию можно сделать дешевле без изменения правил.

### Ограничения прототипа

- Это один study draw, без production epoch/registry/authorization/readiness и без настоящего RNG. До seed publisher всё ещё нужен; после доставки seed processing/finish permissionless.
- Новый streaming commitment ещё не соединён с полным BUY/attempt lifecycle replay. Проверена атомарность настоящего vault.finalize и terminal event; не заявляется готовый сквозной BUY → entries → streaming draw production path.
- Несовпадающий JSON snapshot/root возможен, но публично обнаружим replay. Контракт доказывает обработку всех **опубликованных** участников, не происхождение entries.
- Подготовка требует места в цепочке и оплаты. Нужен дизайн namespace/отмены только **незарезервированной подготовки**, чтобы брошенная proposal не блокировала остальные; отмены frozen draw нет.
- Если никто не оплачивает продолжение, progress стоит. Исполнителя проекта и его gas-бюджет нужно обеспечить отдельно; расходы нельзя незаметно списывать из невозвратных призовых средств. Стороннее продолжение — техническая возможность, не гарантированный сервис.
- Поздняя недоступность сети/токена или недоставка RNG не исчезают от streaming. Никаких timeout-as-no-win или emergency reroll не добавлено.

## 5. Сравнение архитектур

| Подход | Все N | Один seed | Permissionless completion | On-chain работа | Дополнительное доверие | Доступность данных | Добавить позже |
|---|---|---|---|---|---|---|---|
| A. Single-tx scan | Да, если tx помещается | Да | При публичных inputs | Вся O(N*K+K²) в одном вызове, O(N) calldata | Нет доверия вычислителю | Нужно раскрыть список | Не спасает oversized frozen V2 |
| B. Streaming | Да, весь fixed snapshot | Да | Да, следующий шаг может исполнить любой | Весь scan распределён; O(chunks+K) state | Нет доверия вычислителю; нужен кто-то, кто платит | В опыте опубликовано до reserve/seed | Путь должен быть в controller до deployment |
| C. Succinct proof | Да, если программа доказывает полный список/outcome | Да | Proof можно предоставить любому; нужны prover resources | Verification не повторяет N, плюс O(K) rewards | Корректность proof system/program/setup | Witness/public dataset всё равно нужно сохранить | Только заранее привязанный verifier либо новый deployment |
| D. Optimistic | Да, по claim, при честном оспаривании | Да | Да при наличии watchers и response paths | O(K + proofs) обычно; dispute отдельно | Нужен хотя бы один своевременный challenger | Без полной DA challenge ненадёжен | Нужны заранее заданные окно/escrow/proof rules |

### C: что конкретно доказывать

Public inputs: deployment/draw context, dataset root/count, rules hash, единственный authenticated seed, basket/D и итоговые winners/amounts/resultHash. Программа проверяет canonical список и commitment, точную целочисленную q(e), полный top-K и permutation. Это вычислимый алгоритм для zkVM, но портирование ABI/keccak/256-bit арифметики и воспроизводимая сборка программы требуют отдельной работы.

Официальная [SP1 proof types](https://docs.succinct.xyz/docs/sp1/generating-proofs/proof-types) приводит ориентиры примерно 270k gas для Groth16 verification и 300k для PLONK; это **цифры поставщика для proof verification, не наши замеры и не полный settle**. Groth16 использует ceremony/setup; его assumptions нужно фиксировать вместе с verifier key. Не следует называть все SNARK/STARK режимы одинаковыми по setup. [Solidity integration](https://docs.succinct.xyz/docs/sp1/verification/solidity-sdk) связывает verification с program key и public values.

[Hardware requirements SP1](https://docs.succinct.xyz/docs/sp1/getting-started/hardware-requirements) указывают для локальных EVM proofs 16+ CPU cores и существенную память: от 16GB Groth16 / 64GB PLONK. Для нашей программы proving time, цена и фактический verifier gas **не измерялись**. Нельзя обещать «быстрее и дешевле» на основании рекламного общего числа. Здесь ZK может выиграть при огромных N, но добавляет новую сложную поверхность проверки и prover-инфраструктуру. Для следующего MVP-пакета streaming уже подтверждён нашими измерениями, ZK пока нет.

### D: omission challenge может быть проще общего VM fraud proof

Для неверного top-K достаточно показать membership **одного пропущенного admitted wallet**, чей (rank,address) лучше худшего заявленного winner; когда заявлено меньше K — любого пропущенного admitted. Заявленные winners должны заранее пройти membership/admission/uniqueness/order проверки. Это дешёвый положительный контрпример, но отсутствие challenge не является доказательством отсутствия omission: нужен watcher с полным списком и временем на проверку.

Точное общее admittedCount из нынешнего resultHash сложнее: правильные K winners не доказывают число всех admitted ниже порога отбора. Нужен отдельный counting proof/trace либо явное изменение audit-result формата. Generic execution disputes также возможны, но приносят собственный протокол, как показывает [Nitro whitepaper, challenge phases](https://docs.arbitrum.io/nitro-whitepaper.pdf). Для нас дополнительная задержка, bonds, DA-challenges и обработка ответов пока менее привлекательны, чем прямое продолжение scan. Не утверждаем, что любой optimistic вариант неизбежно равен сложности ZK.

## 6. Нужно ли менять вероятность

Нет причины делать это сейчас. Sum-tree sampling может дать O(K log N) выборку путей после подготовки корректного дерева, но выбор K по весам не эквивалентен независимому admission + global top-K. Например, один eligible wallet с q=20% сейчас выигрывает с вероятностью 20%; weighted selection единственного wallet без отдельного null outcome дал бы 100%. Добавление null/rejection и исключений требует новой спецификации распределения и пределов числа попыток.

Возможны специальные ускорения при группах одинаковых q, но это не автоматическое доказательство **того же** seed→outcome V1. Если менять распределение либо mapping seed, потребуется явная новая версия до frozen обязательств. Streaming не требует такого изменения продуктовых шансов.

## 7. Совместимость и следующий небольшой пакет

Прототип сохраняет outcome math, но **не является drop-in заменой V2 commitment**. Flat `keccak256(abi.encode(all Participants))` нельзя наивно продолжать несколькими вызовами штатного EVM keccak; в исследовании используется новый ordered root и отдельные `SHORT_STREAM_CONTEXT_STUDY_V1` / `SHORT_STREAM_RESULT_STUDY_V1` domains. Поэтому не обещаем тот же bytes32 resultHash V2. Сравнение подтверждает одинаковые winners/amounts/admitted для одинакового context/seed; разбиение на порции не меняет study resultHash. Native incremental keccak или новый public commitment format — отдельный осознанный выбор, не тихая совместимость.

У существующего PromoVault immutable controller. Уже deployed/frozen V2 нельзя переключить на streaming/ZK, просто опубликовав новые rules. Если оба пути нужны одному deployment, их надо заранее реализовать в неизменяемом коде и доказать эквивалентность результата; без arbitrary verifier/module replacement. Публичного deployment сейчас нет, поэтому решение можно принять до появления обязательств.

**Рекомендация следующего implementation package:** законченный модуль подготовки ordered dataset: canonical data chunks, anchored cutoff, bounded work на каждый вызов, публичный manifest/verifier, вычисленные root/count, явная readiness перед резервированием. Отдельно от RNG/активации rules. После него переносить проверенный progress/top-K/finalize в общий controller с его остальными требованиями. Не разворачивать промежуточный модуль как единственный controller реальной казны.

## Воспроизведение и границы тестов

```powershell
npm run test:short:streaming
npm run report:short:scaling
npm run report:short:limits  # read-only внешний RPC
npm test
```

7 новых integration tests: partition invariance 1/7/64, другой исполнитель и восстановление из calldata, malformed/cross-chunk data, root/count mismatch, duplicate/skipped/replaced chunks, premature finalize, long preparation/cutoff, funding/finalize failure, zero seed/empty mathematical dataset и reorg progress. Outcome сверяется независимой JS full-sort моделью, деньги — настоящим PromoVault. Production contracts не менялись; новые тестовые источники и in-memory stress compile явно отделены от них. Новый fork не требовался: измерены локальное выполнение и отдельно реальные read-only параметры сети, без заявления об их полной эквивалентности.

Результат: **110/110 npm tests прошли**, Solidity compilation успешно. 10 atomic/stress сценариев включают два ожидаемых OOG при 32M; все 3 streaming сценария завершились и прошли сверку результата/учёта денег. Source hashes отчёта совпадают с сохранённым кодом.
