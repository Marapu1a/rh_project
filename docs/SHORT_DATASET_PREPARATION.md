# Подготовка полного Short dataset

Обновлено: 16.09.2026.

Дополнение следующего пакета: [ShortRulesEpochs](SHORT_RULES_EPOCHS.md) расширяет этот компонент сохранёнными версиями и epoch-aware begin/seal. Ниже описан исходный dataset-слой; отсутствие activation относится к нему отдельно, а не к новому расширению. Production controller всё ещё не завершён.

Реализован `contracts/ShortDatasetPreparation.sol`: **внутренний компонент**, не deployable production controller. Единственные публичные методы компонента — чтение. Внешние управляющие методы находятся в test-only `ShortDatasetFixture`. Не развёртывать fixture с реальными призовыми деньгами: terminal/RNG отсутствуют.

## Решение о правилах и границе этого пакета

Один Short использует одну версию правил. Нельзя произвольно назначать новую версию уже заработанным OPEN attempts. Номер `rulesEpoch` идентифицирует версию в commitment; сам по себе номер НЕ доказывает допустимость её применения. В этом пакете нет объявления/активации версий, ролей policy admin, паузы или setter правил.

До реализации отдельной activation state machine интегрирующий controller должен использовать одну начальную версию. Это ограничение готовности компонента, а не пожизненный запрет версий в продукте. Старый и новый набор правил нельзя незаметно смешать в одном snapshot.

Для будущего перехода обязательны: публичное предварительное объявление, однозначная граница mint новых attempts, старые OPEN на старой версии, сохранение номинального carry, согласование с cutoff и предыдущим TERMINAL. `SEAL` не является автоматической границей изменения правил для BUY между cutoff и seal. Выбор конкретного activation блока и переходных состояний здесь намеренно не реализован: текущий lifecycle replay ещё не учитывает epochs. Не выдаём поле `rulesEpoch` за завершённое решение этой задачи.

## State machine и API

```text
None → Publishing → Ready → Sealed
          │           │
          └───────────┴──→ Superseded
```

- `_beginDataset(proposalId, request, rules, weights, minimumUnit)` фиксирует предложение и проверяет recent cutoff, правила допуска, положительную обеспеченную корзину и связь controller/vault. Денег не резервирует.
- `_publishDataset(proposalId, participants)` принимает 1..64 записей. Это предел одной транзакции, **не лимит участников**. Контракт проверяет строгий порядок адресов между всеми порциями, диапазоны uint128, ненулевой адрес и запрет vault как получателя. Сам считает root, участников и attempts.
- Последняя порция переводит в Ready только при точном совпадении ожидаемых root/count/totalAttempts. Ошибка откатывает всю эту порцию.
- `_supersedeDataset(proposalId)` закрывает только незамороженную подготовку. История, root и хеши порций сохраняются; ID повторно использовать нельзя. Следующая подготовка имеет новый proposalId; прежний drawId до seal можно повторить.
- `_sealDataset(proposalId)` атомарно делает настоящий `reserveUSDG(SHORT)` и публикует `AttemptsFrozen` + `DatasetSealed`. Ошибка резерва откатывает все изменения и события seal. После успешного seal замены нет.

Одна активная подготовка и один pending draw. Повторный seal и новая подготовка при frozen draw запрещены. Терминальный reset не добавлен: его можно ввести только вместе с проверенным результатом и атомарной финализацией vault. Внешняя authorization/readiness policy — обязанность полного controller. Все внутренние изменяющие методы защищены ReentrancyGuard; будущие внешние wrapper-методы не должны повторно навешивать тот же guard поверх них.

Пустой Short dataset отвергается: отсутствие билетов — пропуск готовности, без резервирования и без расходования попыток. Это отличается от исследовательского streaming fixture, допускающего пустой список для тестирования арифметики.

## Канонические commitments

`root0 = keccak256("SHORT_DATASET_V1")`.

Для каждой записи в возрастающем порядке wallet:

```text
root = keccak256(abi.encode(root, address wallet, uint128 firstAttempt, uint128 lastAttempt))
```

Хеш порции — `keccak256(abi.encode(Participant[]))`. Границы порций не входят в root.

Rules hash связывает domain `SHORT_DATASET_RULES_V1`, существующий outcome rules hash, weights и minimumUnit. Request содержит drawId, campaignId, rulesEpoch, cutoff number/hash, JSON snapshot hash, ожидаемые root/count/attempts и D.

Context: ABI encoding domain `SHORT_DATASET_CONTEXT_V1`, chainId, controller, instance, registry, vault, quote, полный Request, rulesHash и basketHash. Полный тип Request и независимый расчёт находятся в `scripts/short-dataset.cjs`.

В контекст не входят proposalId, число/размер порций, seal block или исполнитель. Поэтому замена незамороженного предложения без изменения смысловых данных и иной способ разбиения не создают альтернативную лотерею. Будущий single-call processing обязан использовать этот же context, а не отдельный domain.

Это новый формат. V2 flat ABI participant hash и study context не совместимы с ним побитно. Старые компоненты/исследование сохранены для истории и регрессионных тестов; production controller должен выбрать один canonical path. Формат итогового resultHash и подключение streaming settlement в этот пакет не входят.

## Независимый пересчёт и восстановление

`buildFromHistory` сам вызывает существующий replay регистраций/BUY/consumption до точного cutoff; отвергает pending Short и повторное использование drawId, строит **все** OPEN диапазоны, JSON snapshot и root/count/attempts. Не принимает готовый список от API за истину.

`verifyPublication` сравнивает artifact с выбранным deployment (chain/instance/source code hash/registry), on-chain Request, правилами и корзиной; восстанавливает опубликованные записи из calldata, проверяет события/хеши/индексы порций, фактические итоги и sealed context. Возвращает список publication txs и artifact hash. Текущий decoder поддерживает прямой `publish(bytes32, Participant[])` тестового wrapper; другой транспорт требует явного decoder, а не молчаливого принятия.

CLI input — JSON с `manifest`, `lifecycle` существующего replay, `request` (drawId/campaignId/rulesEpoch/cutoffBlockNumber/cutoffBlockHash/budget), `rules`, `weights`, `minimumUnit`. В offline-режиме также `blocks` с исходными транзакциями/receipts. Большие числа — десятичные строки, не JSON floating-point.

```powershell
npm run compile
npm run verify:short:dataset -- --input input.json --output artifact.json
npm run verify:short:dataset -- --input input.json --rpc https://YOUR_RPC --proposal 0xPROPOSAL_ID --output artifact.json
```

При `--rpc` история читается заново через выбранный RPC до cutoff, supplied blocks не используются. Без `--proposal` строится пакет до публикации. С `--proposal` дополнительно проверяется on-chain публикация. CLI не отправляет транзакций. Результат содержит artifact, content hash, publication tx list (если проверялась) и явное происхождение evidence. Файл пригоден для независимого скачивания/зеркалирования; автоматический uploader и постоянные зеркала не реализованы.

**Две разные гарантии:** контракт проверяет структуру и полноту *объявленного* набора; replay проверяет соответствие реальным eligible BUY. Ложный, но структурно корректный снимок не блокируется контрактом автоматически. Внешний verifier обнаруживает расхождение; механизма on-chain challenge/proof здесь нет. READY не означает «доказана честность индексера».

## Инварианты и ограничения

- До seal ни USDG, ни attempts не frozen. Supersede не расходует их.
- Все опубликованные участники имеют допустимый для текущего vault адрес и корректный диапазон; повтор адреса между порциями отвергается.
- Ready требует точного фактического root/count/totalAttempts; обрезанный dataset не seal-ится.
- D резервируется один раз, правила/данные после seal неизменяемы.
- Корзина строится прежней математикой; её сумма + остаток = D.
- Anchored cutoff не проверяется повторно после 256 блоков. Начальная проверка recent blockhash не является production finality policy.
- Доступность calldata зависит от истории сети/RPC. Хеши не заменяют резервные копии.
- MAX_CHUNK=64 — консервативный текущий технический предел на базе local study, не подтверждённая production оптимизация.
- Chunk hashes сохраняются; lifetime storage cleanup/экономика keeper не реализованы.
- Эти проверки устраняют известные структурные причины неисполнимого freeze. Они не гарантируют доставку будущего RNG, работу сети, платёжеспособность keeper или неизменность внешнего USDG.

## Проверки

`npm run test:short:dataset`: полный список из нескольких порций и восстановление calldata, одинаковый context при другом разбиении/ID/исполнителе, failed reserve, старый anchored cutoff, supersede и stale ID, неправильные адреса/диапазоны/порядок/root/итоги, authorization test wrapper, replay OPEN/carry/consumption, offline CLI, reentrancy reserve callback и reorg freeze/reserve.

Тесты контрактов используют синтетических участников на локальной EVM; replay-тесты — сохранённое fork evidence с явно синтетическими продолжениями. Это не полный production BUY→RNG→claim E2E и не публичный deployment.

Следующий связанный пакет: activation/epoch state machine и её replay, затем authenticated seed и production streaming terminal. Текущий внутренний компонент нельзя отдельно запускать как законченную лотерею.
