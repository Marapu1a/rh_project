# Текущий ответ GPT

Обновлено: 15.09.2026.
Просмотрен latest request commit `49cb27f28412c10b206b168fc27c1cb58f10342f`, а также результаты `91f5d704aaa8edd72a08df7369be440179242a87` и `0eed3f70fe79f489520b41d28efc3a8624243660`.

Фактически прочитаны:

- `docs/PAIR_DEPENDENCY_AUDIT_2026-09-15.md`;
- `docs/PAIR_PORTABILITY_AND_SOURCES_2026-09-15.md`;
- `research/pair-source-audit/manifest.json`;
- сохранённые verified sources `VaultV2`, `FactoryV2`, `ModeRegistry`, `NativeFeeSharingModeV5`, `NativeFeeHook`, `NativeFeeCoordinator`, `PairLaunchpadV5Upgradeable`;
- наши `FeeRouter.sol` и `PromoVault.sol`.

Никакие сетевые команды в этом проходе мной не запускались. Ни Sourcify, ни RPC заново не опрашивал; ниже ревью сохранённого evidence и кода.

Тема: **что действительно доказал PAIR source audit, где остаётся trust boundary и какой следующий пакет работ имеет смысл**.

## Короткий вердикт

Исследование получилось полезным и в целом выводы прочитаны правильно.

Главное изменение относительно первого прохода: теперь уже есть исходники конкретной native fee-sharing ветки, и стало видно, что риск не в «PAIR может тайно вытащить наш LP через VaultV2», а в другом:

> PAIR registry owner способен сменить fee-sharing recipients будущего epoch через `communityTakeover`, а наш текущий FeeRouter специально fail-closed на любое изменение `sourceEpoch`.

То есть security boundary стала намного конкретнее.

При этом:

- уже созданные `FeeRouter.credit` не зависят от дальнейшего PAIR rollover и могут быть выплачены через `pay()`;
- старые `VaultV2.claimable[oldEpoch]` не переписываются при atomic transition;
- PromoVault вообще не вызывает PAIR;
- existing native hook path по прочитанному коду не требует PAIR API/price signer на каждом swap;
- новый независимый deployment продукта на другой площадке действительно реалистичен без переноса старой казны.

Я бы **не добавлял сейчас универсальную миграцию source** и не делал proxy. Текущий fail-closed подход приемлем для MVP, если публично и технически считать потерю будущего PAIR revenue внешним availability risk, а не обещанием непрерывного дохода.

---

## 1. Существенные поправки к формулировкам source audit

### Vault лучше называть не «immutable vault вообще», а «non-upgradeable VaultV2 family в проверенной ветке»

`PairV5LaunchV2NativeFeeVaultFactoryV2` действительно делает:

```solidity
new PairV5LaunchV2NativeFeeVaultV2{salt:salt}(...)
```

и его `upgradeVaultImplementation()` всегда revert с `ImmutableImplementation()`.

У самого `VaultV2` нет proxy/upgrader path; критические зависимости — `positionManager`, `registrar`, `protocolTreasury`, `projectToken`, `launchpad`, `policyController`, `buybackExecutor`, `modeId` — immutable.

Это сильное доказательство для **этой factory family**.

Но factory source сам по себе ещё не доказывает, что будущий vault нашего конкретного launch создан именно этой factory и именно этим handler/version. Поэтому production wording лучше:

> «наш canary launch должен доказать, что конкретный vault создан verified FactoryV2/VaultV2 path и runtime/constructor bindings совпадают с receipt»

а не просто «VaultV2 immutable».

### LP custody выглядит хорошо, но последний кусок доказательства всё ещё PositionManager

`PoolEngine.createPool()` mint'ит position сразу с recipient=`vault`.

`VaultV2.registerPosition()` дополнительно требует:

```solidity
positionManager.ownerOf(id) == address(this)
```

и `collectFees()` снова проверяет ownership.

В прочитанном `VaultV2` нет функции transfer/approve/decrease/burn/rescue/arbitraryCall.

Это очень хороший сигнал.

Но абсолютное «LP невозможно вывести» пока требует ещё двух вещей на конкретном launch:

1. `PositionManager.ownerOf(positionId) == vault`;
2. у position нет approval/operator, позволяющего третьей стороне им распоряжаться, и semantics конкретного PositionManager не дают обход ownership.

То есть вывод документа правильный: native V2 custody не надо путать с legacy PairV4Locker, но canary должен проверять именно position ownership/approvals.

### Community takeover прочитан правильно и это главный внешний risk

`PairV5LaunchV2ModeRegistry.communityTakeover()` — `onlyOwner`.

Для mode 1 handler возвращает `eligible=true`, а registry при регистрации проекта сохраняет takeover eligibility.

Далее registry может без подписи прежних recipients вызвать:

```text
VaultV2.transitionFeeSharingAtomic(newRecipients,newShares)
```

Внутри VaultV2:

```text
collect all registered positions under old epoch
→ set new policy
→ epoch++
```

Старое `claimable[oldEpoch][oldRecipient][asset]` не переписывается.

Это означает:

- уже начисленный старый recipient debt сохраняется;
- **будущие** creator fees могут быть направлены другим recipients;
- наш `FeeRouter.rollCampaign()` после epoch drift начнёт revert с `SourceEpochChanged()`.

Это не теоретическая неизвестность — такой authority path в прочитанном коде есть.

### Protocol treasury transfer — отдельный availability risk

В `VaultV2._allocate()` сначала считается:

```text
70% modeAmount
30% protocolAmount
```

и protocol amount немедленно `safeTransfer(protocolTreasury)`.

Если transfer конкретного asset в treasury revert'ит, весь `collectFees()` revert'ит, включая начисление creator share.

То есть даже при честной recipient policy collection зависит не только от нашего router, но и от способности VaultV2 перевести protocol share.

Это стоит оставить в threat model как runtime availability dependency.

### Hook действительно выглядит off-chain independent на swap path

`beforeSwap/afterSwap` читают только зарегистрированный pool и on-chain `stateView`; server price signer там нет.

`registrar` и `stateView` immutable.

Существующий pool повторно зарегистрировать нельзя.

Поэтому по **этому verified hook source** исчезновение pair.fund API не является условием остановки swap.

Но остаются обычные runtime dependencies: PoolManager, StateView, ERC20 и сама сеть.

---

## 2. Достаточна ли выбранная граница переносимости

Да. Я бы оставил её именно такой:

```text
portable core:
PromoVault + prize accounting + product rules + future controller/RNG

platform-specific:
fee collection + TOKEN→USDG conversion + eligible BUY attribution
```

При повторном запуске мы **не мигрируем deployment**, а создаём новый экземпляр.

Что реально помешает такому запуску сейчас:

1. production controller/RNG ещё нет;
2. production indexer/BUY attribution ещё нет;
3. TOKEN→USDG conversion ещё нет;
4. FeeRouter знает конкретный PAIR vault API и не является универсальным adapter;
5. другой EVM может не поддерживать текущий build/EVM target;
6. quote token/decimals/target надо заново проверять.

Ничего из этого не требует сегодня проектировать вторую площадку.

И важная граница корректна:

> новый deployment не имеет права забирать free/reserved/claimable из старого PromoVault.

Старые obligations продолжают жить в старом экземпляре.

---

## 3. Что deployment config, а что code version

Я бы не параметризовал GENERAL 3:2:1 в constructor сейчас.

Причина: это не инфраструктурный адрес, а публичное правило движения призовых денег. Если его сделать произвольным constructor config, мы получим много экономически разных vault deployment'ов с одним и тем же bytecode/API, что усложнит проверку пользователем.

Для MVP проще:

```text
изменились prize allocation rules
→ новая code version
→ новые tests
→ новый code hash
```

### Минимальный deployment manifest

Я бы сохранял JSON + человекочитаемый MD со следующим:

```text
identity
- git commit
- contracts version/schema
- compiler version
- optimizer/viaIR
- evmVersion
- artifact/runtime code hashes

network
- chainId
- network name
- deployment block/tx hashes

assets
- projectToken
- quoteToken
- token decimals
- quote decimals
- human nextStartTarget
- raw nextStartTarget

local authorities
- FeeRouter owner
- drawController
- code hashes этих contracts

FeeRouter
- pairVault
- positionId
- sourceEpoch
- projectToken/quoteToken
- initial campaign policy recipients/bps/endsAt

PAIR provenance
- launchpad
- active registry
- coordinator
- handler + mode/version
- factory
- vault
- hook
- poolId(s)
- positionId(s)
- code hashes / runtime hashes
- epoch recipients/shares at bind

product/economic version references
- PRODUCT_SPEC commit/hash
- creator allocation policy version
- Short rules version
- external funding allocation version
```

Не надо класть RPC secrets или считать URL частью trust boundary.

---

## 4. Один следующий пакет работ

Кандидат Codex «локальный независимый deployment ядра» правильный, но в чистом виде он частично повторит unit tests.

Чтобы он дал новую ценность, сделать его не как ещё один test file, а как **reproducible deployment artifact**.

### Пакет: `core-local-deployment`

С чистого локального chain state:

1. compile конкретного git commit;
2. deploy обычные mock TOKEN/USDG;
3. deploy минимальный controller fixture только как явную test authority;
4. deploy PromoVault с production constructor semantics;
5. выполнить внешний USDG funding;
6. проверить GENERAL / targeted allocation;
7. reserve Short;
8. finalize реальные winner amounts;
9. claim;
10. start/settle monthly win и no-win отдельными clean runs;
11. сохранить deployment manifest, constructor args, addresses, tx receipts, code hashes и final accounting state;
12. повторить deployment второй раз и доказать, что различия объясняются только nonces/addresses, а конфигурация и code hashes воспроизводимы.

FeeRouter без PAIR в этот пакет **не надо искусственно универсализировать**. Его portability boundary уже честно описана: другой fee source → другая явная integration implementation.

### Acceptance criteria

Этап готов, если из пустой локальной сети одной документированной командой получается:

```text
deploy manifest
+ code-hash verification
+ funding
+ reserve/finalize/claim
+ monthly accounting
+ conservation assertions
```

и результат не зависит от pair.fund/RPC PAIR.

Это уже проверяет именно **развёртываемость ядра**, а не отдельные функции контрактов.

---

## 5. Минимальный pre-launch PAIR canary

Не надо превращать canary в аудит всей экосистемы.

Перед реальным запуском достаточно доказать наш конкретный путь.

### До launch

1. Зафиксировать current canonical graph и code hashes:

```text
launchpad implementation
active registry
coordinator
mode-1 handler/version
FactoryV2
hook
```

2. Проверить, что intended mode действительно fee-sharing V5/compatible atomic path.

### После test launch на свежем fork / canary

3. Получить конкретные:

```text
projectToken
vault
poolId
positionId
```

4. Проверить:

```text
vault.projectToken == TOKEN
vault.policyController == expected registry
vault.modeId == 1
vault.epoch == expected
epoch recipient count == 1
recipient == наш FeeRouter
share == 10000
PositionManager.ownerOf(positionId) == vault
vault.positions(positionId).registered == true
hook.pools(poolId) points to TOKEN/quote/vault/position
```

5. Проверить отсутствие unexpected position approvals/operator approvals.

6. `FeeRouter.bindSource(vault, positionId)` должен пройти только после этой сверки.

### Economic path

7. Сделать intended BUY + SELL.

8. Permissionless `collectFees(positionId)`.

9. Проверить фактические fee deltas и 70/30 split по обоим assets.

10. Claim creator share через FeeRouter для TOKEN и quote.

11. Проверить rollover на неизменившемся epoch.

12. Довести реально полученный USDG через PromoVault → reserve → finalize → claim.

Когда conversion будет реализован — добавить отдельный TOKEN→USDG canary с slippage/recipient checks.

### Invalidation

Если до production меняется critical graph/code hash — canary повторяется.

---

## 6. Что происходит со старыми обязательствами при проблеме PAIR

Здесь важно разделять состояния.

### Будущий creator revenue

Не является нашим активом до фактического начисления/получения.

Community takeover или поломка PAIR могут оборвать будущий поток. Наш контракт не может это исправить.

### VaultV2 старого epoch

Atomic transition сначала собирает fees в старый epoch.

Сохранённые `claimable[oldEpoch][FeeRouter][asset]` остаются claimable, если asset/vault работают.

`FeeRouter.harvest(asset, oldEpoch)` не требует, чтобы `sourceEpoch` совпадал с текущим vault epoch.

### Уже признанные FeeRouter credits

После `_sync()` это balance-backed local accounting.

`pay(asset, recipient)` не вызывает PAIR и не требует rollover.

Даже если будущий `rollCampaign()` навсегда заблокирован epoch drift, старые credits можно выплачивать.

### PromoVault free reserves

Остаются внутри старого vault.

Их нельзя мигрировать в новый deployment или вывести администратору.

Они могут стать призами только через допустимый старый controller.

### Frozen/reserved draws

Вот здесь availability зависит уже не от PAIR, а от нашего controller.

Если production controller/RNG застрял после reserve, нынешний PromoVault сам не имеет timeout/unfreeze recovery.

Поэтому до появления production controller нельзя обещать универсальное восстановление frozen draw.

### Claimable winner debt

После finalize/settle это самый сильный случай:

```text
winner + amount уже зафиксированы
→ любой caller может вызвать claim(drawId,winner)
→ PAIR не нужен
```

при условии, что quote/token ERC20 и сеть работают.

---

## 7. Нужна ли архитектурная правка FeeRouter прямо сейчас

На основании прочитанного source graph я бы **пока не менял**.

Да, community takeover делает конкретный failure scenario реальным:

```text
registry owner меняет epoch
→ old FeeRouter sourceEpoch остаётся прежним
→ rollCampaign навсегда fail-closed
```

Но если takeover убирает наш router из recipients, никакая функция `acceptNewEpoch()` не вернёт будущий revenue.

Если takeover оставляет наш router единственным 100% recipient, теоретически можно было бы безопасно разрешить ограниченный epoch advance. Но проектировать его сейчас — это добавлять recovery authority ради редкого сценария, который ещё не произошёл.

Для MVP проще и честнее:

- bind один раз;
- fail closed на epoch drift;
- alert/monitor epoch;
- старые claims/credits продолжать обслуживать;
- future revenue interruption считать внешним incident;
- новый независимый deployment при необходимости делать отдельно.

Если позже появится реальный operational requirement переживать benign epoch rotation при сохранении `recipient=this,10000`, тогда отдельно спроектировать узкий `acceptEpoch` с доказуемыми preconditions. Не arbitrary source migration.

---

## Что осталось владельцу

Я вижу только два решения, и оба можно принять без изменения контрактов:

1. **Принимаем ли для MVP external PAIR takeover risk как риск потери будущего revenue**, при сохранности уже начисленных claims/credits и prize reserves? Моё предложение — да.
2. **Делаем ли следующим пакетом reproducible local deployment manifest/core smoke**, прежде чем возвращаться к production controller? Моё предложение — да.

Остальное уже не требует продуктового решения: pre-launch canary и epoch/code-hash monitoring — технические release gates.