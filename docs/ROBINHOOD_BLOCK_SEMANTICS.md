# L2 block identity для Short/Monthly

18.09.2026. Исправлена подтверждённая несовместимость с Nitro: RPC receipt/log
blockNumber обозначает L2, а Solidity block.number — приближённый номер L1.
Сравнивать их в cutoff/epoch проверках было ошибкой. Обычная Hardhat EVM скрывала её.

## Изменение

`contracts/ChainBlocks.sol` — внутренняя библиотека, без отдельного deployment,
setter, owner или произвольных внешних адресов:

- chainId 4663 / 46630: number через ArbSys(0x64).arbBlockNumber(), hash через arbBlockHash;
- другие сети: обычные EVM block.number/blockhash;
- на Robinhood ошибка/отсутствие ArbSys приводит к revert, fallback к L1 отсутствует;
- окно прежнее: только завершённые блоки возрастом **1..256 включительно**.
  Вне окна helper возвращает zero, а caller отвергает cutoff. Неизвестный hash/zero
  не становится допустимым. Внутри окна ошибка ArbSys не подавляется.

Заменены все прямые block.number/blockhash в основных contracts:

| Компонент | Исправленные границы |
|---|---|
| ShortDrawCommitment | cutoff identity, записанный freezeBlock |
| ShortDatasetPreparation | canonical recent cutoff при begin |
| ShortRulesEpochs | genesis firstBlock, activation B+1, empty cutoff, terminal block |
| MonthlySettlement | genesis, activation B+1, begin/empty cutoff, terminal block |

Research RNG wrappers также используют helper для числа confirmations и legacy
Monthly path. Это по-прежнему счётчик L2-блоков, **не доказательство L1 finality**.
Старый test-only ShortStreamingStudy остаётся Ethereum-only историческим макетом.

ABI событий и запросов сохранён. Индексер уже работает в RPC L2 координатах, поэтому
форматы replay не менялись. Конкретные hashes нового deployment, естественно, другие.
Никакой миграции старых deployment/обязательств этот пакет не выполняет.

## Проверки

Прежний полный набор **167/167 passed**, новый Nitro suite **5/5 passed**,
mainnet/testnet RPC **2/2 passed**, dual size/deployment gate passed.
Пять новых тестов включены в обычный `npm test` (теперь 172). В этом пакете 167 и 5
выполнены отдельными прогонами; второй полный запуск объединённой команды не делался.

`npm run test:nitro:blocks` — пять сценариев с chainId 46630 и test-only ArbSys,
у которого L2 height = native EVM height + 1 000 000. Это модель разных координат,
не полный эмулятор Nitro. Проверены:

- helper: heights/hashes, точная граница 256, current/future/257, отсутствующий и
  reverting ArbSys;
- Short + Monthly: reject L1 cutoff/чужого hash, real vault freeze/settle,
  terminal L2 heights, откат terminal при reorg и повтор другим caller;
- exact genesis heights, activation B+1, old-first, empty без изменения clock,
  начало новой epoch;
- контрактные begin принимают age 1/256, отвергают 0/future/257;
- старый ShortDrawCommitment записывает правильный L2 freezeBlock.

Уже принятый cutoff не проверяется на свежесть заново при seal: подготовка и ранее
могла занять более 256 блоков. Это поведение сохранено и проверено в Nitro regression.
Свежесть при begin считается в L2-блоках, не в Ethereum-блоках: это другое окно
по реальному времени. Builder должен выбирать свежий cutoff перед begin.
Сохранены reserve/credits/rounding и существующие permission/reentrancy guards.

`npm run check:nitro:rpc` — read-only выполнение **того же helper** через state
override на mainnet/testnet, pinned blocks. Для ages 1/256 hash совпал с RPC;
0/future/257 дают zero, номер L2 совпадает с RPC и отличается от native block.number.
[Evidence](../research/chain-blocks/rpc-result.json) содержит входы, hashes и source hashes.
Это не публичный deployment, не проверка finality и не подтверждение несколькими RPC.

`node scripts/dual-controller-check.cjs` — стандартный deployment/behavior gate
с mock RNG. Runtime Short **22 368**, Monthly **17 445**, vault **8 496** bytes;
все меньше 24 576, без viaIR. Обновлён `research/controller-size/dual-check.json`.

## Границы переносимости и следующий шаг

Новые Nitro chain IDs нужно явно добавить и проверить перед deployment: автоматического
распознавания неизвестной сети и mutable выбора backend нет. EVM-ветка предназначена
для сетей со стандартной семантикой. Фиксированные IDs не являются admin настройкой.

EIP-2935 сейчас не нужен: ArbSys даёт ровно прежнее 256-block окно. Расширение этого
окна потребовало бы отдельного решения и тестов; мы его не делали.

Исправление даёт правильную идентичность блока, но не отвечает, когда этот блок
окончательно закреплён на L1. Следующий шаг остаётся drand timing/binding:
immutable future round, явно описанные finality assumptions и поведение при задержках.

Источники: [Arbitrum block numbers](https://docs.arbitrum.io/arbitrum-essentials/arbitrum-vs-ethereum/block-numbers-and-time),
[ArbSys interface / диапазон](https://github.com/OffchainLabs/nitro-precompile-interfaces/blob/main/ArbSys.sol),
[Nitro implementation](https://github.com/OffchainLabs/nitro/blob/master/precompiles/ArbSys.go).
