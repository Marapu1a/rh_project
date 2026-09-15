# Текущее обращение к GPT

15.09.2026. Завершён исследовательский пакет `short-settlement-scaling-study-v1`. Просьба проверить выводы и небольшой следующий шаг. Это ревью, не самостоятельное разрешение менять продуктовые правила.

## Что сохраняем

Все eligible OPEN wallets на cutoff участвуют в одном Short; MAX_N/FIFO/cohorting не вводим. Один snapshot, один authenticated seed, тот же admission q(e) и global top-K, одна корзина, без reroll/timeout-no-win. Гибкость будущих параметров не должна переписывать уже возникшие обязательства. Production contracts в этом пакете не менялись.

## Главный результат

Permissionless streaming прототип работает на настоящем PromoVault, только в test/contracts. Данные публикуются и canonical-валидируются порциями **до reserve**. При seal контракт проверяет вычисленные count/root против заранее заявленных; count не доверенный. После mock seed delivery любой обрабатывает следующий chunk. Global top-K продолжается, finalize и terminal event атомарны в конце.

Для 5000 участников/K10: все обработаны, максимальная отдельная tx 1,037,407 gas; весь путь 74,908,186 gas, 162 tx. Для 1000/K64: max 4,771,017, total 52,962,008. Это local Cancun, не production ArbOS fee measurement. Полный список восстановлен третьей стороной из transaction calldata. Разные transport partitions дают одинаковый study outcome/hash при том же context/seed.

Проверки: 110/110 npm tests прошли, Solidity compilation успешно; 10 atomic/stress scenarios и 3 streaming scenarios, с двумя ожидаемыми OOG старого пути. Production contract diff пуст.

Atomic path: реальные hashes N5000/K10 не завершились при бюджете 32M. Искусственный forced-worst insertion N1000/K64 также OOG при 32M; N2000/K10 требует 26,866,346. Stress variant существует только в compiler memory; это не найденный seed и не версия алгоритма продукта.

Два RPC на pinned block 63,945,627 вернули getMaxTxGasLimit=32M. Header gasLimit огромен и не является практическим tx budget. Точный Robinhood sequencer/provider transaction-size limit не установлен: успешные estimate-пробы не доказывают sendRawTransaction acceptance, публичных tx не отправляли. Поэтому «single-tx точно безопасен до N=1000» не утверждаем.

## Прочитать

1. [Полный отчёт и сравнение A/B/C/D](SHORT_SETTLEMENT_SCALING_STUDY.md).
2. [Исследовательский контракт](../test/contracts/ShortStreamingStudy.sol), [7 integration tests](../test/short-streaming.test.cjs), [RPC восстановление chunks](../test/fixtures/short-streaming.cjs).
3. [Gas/stress script](../scripts/short-scaling-study.cjs), [результаты](../research/short-scaling-study.json).
4. [Read-only RPC script](../scripts/short-scaling-rpc.cjs), [сырые ответы](../research/short-scaling-rpc.json).
5. [Текущий статус](IMPLEMENTATION_STATUS.md); `contracts/` остался без изменений.

## Вопросы по существу

- Правильны ли completeness и индукция global top-K через local top-K? Есть ли простой сценарий пропуска/повтора/подмены, который не закрыт индексом, chunk hash, canonical order и ожидаемыми count/root?
- Достаточна ли publication calldata + chunkHashes как минимальная схема DA для независимого продолжения? Какие требования к архиву/зеркалам действительно обязательны, без притворства, что root гарантирует availability?
- Прототип использует ordered rolling root, а не flat ABI hash V2: `root=keccak256(abi.encode(prev,wallet,first,last))`. Это новый commitment/result domain. Верно ли отказаться от обещания drop-in совместимости, сохранив probability semantics, и подготовить новый формат до deployment?
- Cutoff якорится в begin, поэтому завершение подготовки после 256 блоков не ломается. Какие проверки finality/BEGIN→SEAL нужны в следующем пакете, чтобы не смешать это с ретроактивной активацией правил?
- Есть ли смысл в Merkle для нашего последовательного scan, если все data уже валидируются на публикации, chunks ограничены, а storage хешей составляет O(chunks)? Просьба обосновать конкретную выгоду, не добавлять его по умолчанию.
- Прототип не интегрирован с full BUY/lifecycle replay и не доказывает правдивость списка. Следующий модуль обязан отдать один проверяемый manifest/root/count и сохранить прежнюю границу доверия — что минимум требуется в verifier?
- Экономика исполнения: для 5000/K10 около 74.9M суммарного gas. Исполнитель проекта оплачивает это отдельно от призовой казны; permissionless completion не гарантирует бесплатного исполнителя. Нужен ли на этом этапе ещё механизм, кроме нормального keeper и публичного recovery runner?

## Рекомендуемый следующий кусок

Полноценная подготовка canonical dataset до reserve: публичная proposal/manifest, anchored cutoff, bounded publish, фактические root/count, независимая проверка и явная готовность к seal. Разобрать namespace и брошенную **незарезервированную** подготовку, не вводя отмену frozen draw. Без RNG provider, rules activation, Monthly и frontend в этом же пакете.

Не разворачивать исследовательский single-draw fixture с казной. Не предлагать «потом заменим verifier/controller»: у vault immutable controller. Если быстрый single-tx и streaming нужны одному экземпляру, оба пути должны быть предусмотрены и проверены до deployment.
