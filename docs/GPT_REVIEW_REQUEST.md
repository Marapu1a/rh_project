# Ревью: исправление L1/L2 block identity

18.09.2026. Подтвердили дефект независимо через оба Robinhood RPC и исправили.
Начать с [ROBINHOOD_BLOCK_SEMANTICS.md](ROBINHOOD_BLOCK_SEMANTICS.md).

Минимальный helper contracts/ChainBlocks.sol:

- 4663/46630 используют фиксированный ArbSys(0x64), number + arbBlockHash;
- остальные chain IDs используют стандартную EVM семантику;
- на Robinhood нет fallback к L1 при ошибке ArbSys;
- окно не расширяли: только completed ages 1..256;
- EIP-2935 не понадобился, нужный путь ArbSys проверен на обеих сетях.

Заменили cutoff, genesis/activation B+1, terminal block и legacy freezeBlock в
ShortDrawCommitment, ShortDatasetPreparation, ShortRulesEpochs, MonthlySettlement.
Research RNG wrappers также исправлены. Их confirmations — L2 block count, НЕ finality.
Казна, fee math, permission model, события и формат replay не менялись.

Проверки: прежний полный набор 167/167; Nitro suite 5/5 отдельным запуском.
Новые тесты включены в npm test (172). Повторно объединённую команду не запускали.
State-override RPC checks 2/2; ages 1/256 hashes совпадают с RPC, 0/future/257 дают zero.
Это не deployment и не finality proof. Evidence: research/chain-blocks/rpc-result.json.

Nitro fixture специально разводит координаты: L2 = native EVM number + 1 000 000.
Это не полный Nitro emulator. Проверяет genesis, B+1, old-first, empty без нового
clock, begin/seal/terminal с реальной казной, reorg/retry и старый commitment path.

Повторён standard size/deployment gate: Short 22 368, Monthly 17 445, vault 8 496 bytes.
Все ниже 24 576. Никаких proxy, setters, смены RNG, admin rescue или новой казны.

Границы переносимости явные: другая Nitro сеть требует добавить её chain ID
и повторить проверки перед deployment. Автоопределения неизвестных сетей нет.
Исторический test-only ShortStreamingStudy остаётся Ethereum-only.

Вопросы:

1. Остался ли конкретный путь смешать L1/L2 координаты в текущих основных компонентах?
2. Есть ли несовпадение contract events/genesis/terminal с текущим replay?
3. Видите ли дефект в диапазоне 1..256 или fail-closed поведении helper?
4. Можно ли переходить к локальному drand timing/binding study без расширения scope?

Следующий кусок по-прежнему: один immutable future round, поздняя same-proof
доставка, явные finality assumptions, отсутствие вечной блокировки из-за задержки
до freeze. Правильный L2 hash не объявляем доказательством L1 finality.
Ответ — в прежний GPT_REVIEW_RESPONSE.md.
