# Текущий ответ GPT

Обновлено: 15.09.2026.
Последний просмотренный commit проекта: `5bf7abd0c649afba86b214fd4ab516bf87b4a25f`.

Тема: **PAIR dependency / escape audit перед реальным запуском**.

Это отдельный инфраструктурный follow-up. Текущие продуктовые изменения Short (включая удаление Luck в latest spec/model) не пересматриваем. Production-код сейчас менять не просим.

## Решение владельца

Продолжаем делать первый запуск под PAIR / Robinhood Chain.

Падение цены самого `$PAIR` не является причиной бросать текущую разработку. Код проекта не должен быть одноразово привязан к одному launchpad: если когда-нибудь PAIR окажется проблемным, продуктовую/призовую часть можно портировать на другую EVM-сеть или другую площадку.

Рабочий принцип:

> **PAIR — первый launch/fee infrastructure adapter, а не сам проект.**

Теоретически тот же продукт можно запускать независимыми экземплярами под разными именами и/или в разных сетях:

```text
network A:
  TOKEN_A
  fee-source adapter A
  PromoVault A
  Short/Monthly A

network B:
  TOKEN_B
  fee-source adapter B
  PromoVault B
  Short/Monthly B
```

Без bridge это отдельные токены и отдельные экономики. Старые holders автоматически не мигрируют; snapshot/airdrop/bridge были бы отдельным продуктовым решением.

Пока никаких multi-chain модулей проектировать не надо. Важно только не зашить PAIR-специфику глубже, чем она действительно нужна.

---

## Что уже видно по нашей архитектуре

Универсальная часть проекта в основном уже отделяется:

- PromoVault / free-reserved-claimable accounting;
- Short/Monthly logic;
- USDG prize liabilities;
- future controller/RNG/indexer/product UI.

PAIR-специфичная часть сейчас прежде всего:

1. источник creator fees;
2. provenance/атрибуция launch pool и position;
3. сбор/claim native PAIR revenue;
4. определение eligible canonical BUY по конкретному торговому пути.

То есть потенциальный future port должен скорее менять `fee source / trade attribution adapter`, а не переписывать весь Promo.

---

## Конкретная текущая runtime-зависимость

`FeeRouter.sol` сейчас одноразово привязывается к внешнему PAIR vault через:

```solidity
IPairNativeVault public pairVault;
uint256 public positionId;
uint64 public sourceEpoch;
```

`bindSource()` проверяет:

```text
vault.projectToken() == projectToken
epochRecipientCount(epoch) == 1
recipient == FeeRouter
share == 10000
```

После bind router использует:

```text
collectFees(positionId)
claimable(epoch, recipient, asset)
claim(asset, epoch)
```

`rollCampaign()` специально fail-closed при:

```text
pairVault.epoch() != sourceEpoch
```

Это хорошая защита от тихой смены внешней fee policy, но одновременно availability risk: если PAIR способен изменить epoch/policy не по нашей воле, наш rollover остановится.

Одноразовый `bindSource` также означает, что текущий прототип сознательно не умеет мигрировать на другой PAIR vault/source после запуска.

Это не обязательно надо менять — сначала нужно понять реальные полномочия PAIR и свойства deployed contracts.

---

## Что уже проверялось

В `docs/archive/ECONOMICS_FORK_2026-09-12.md` есть успешный свежий fork, где настоящий PAIR launch path был использован вместе с нашими FeeRouter и PromoVault.

На том fork были проверены:

- реальный TOKEN/USDG PAIR launch;
- BUY/SELL через настоящий PoolManager/hook;
- creator revenue в USDG и TOKEN;
- collection/claim native PAIR fees;
- `FeeRouter` rollover;
- выплата в PromoVault и claim;
- accounting старой/новой кампании.

Это сильный integration evidence для той версии PAIR, но **не вечная гарантия совместимости**.

В архивном отчёте уже зафиксировано, что PAIR launch route менялся: прежняя проверка salt/factory перестала быть достаточной, пришлось находить актуальные coordinator/registry/factory.

Следовательно, перед production launch нужен новый canary на текущем live release, а не ссылка на старый успешный fork.

---

## Что именно хотим проверить у PAIR

Нужен не общий обзор `$PAIR` tokenomics, а **dependency / escape-hatch audit нашего конкретного launch path**.

Главный вопрос:

> Если завтра pair.fund frontend/API/keeper исчезнут или команда PAIR перестанет помогать, что из нашего проекта всё равно продолжит жить on-chain и что мы сможем обслуживать сами?

Разделить минимум четыре уровня риска.

### A. Цена `$PAIR` падает почти в ноль

Проверить, существует ли хоть какая-то runtime-зависимость нашего TOKEN/pool/fees/Promo от владения, цены или ликвидности `$PAIR`.

Желаемый результат: цена protocol token сама по себе технически нас не ломает.

### B. Off-chain PAIR исчезает

Представить:

```text
pair.fund UI = down
PAIR API/indexer = down
PAIR keeper = down
```

Проверить, можем ли мы:

- восстановить token/pool/position/vault только из chain state/events;
- торговать напрямую через canonical V4 infrastructure без PAIR frontend;
- самостоятельно вызвать collect/claim;
- продолжать наш indexer и Promo;
- не зависеть от их серверного random/oracle для уже существующего рынка.

### C. PAIR protocol contracts меняются

Выяснить для **текущего live release**:

- какие контракты proxy/upgradeable, какие immutable;
- кто admin каждого proxy/handler/registry/factory/vault/hook/locker;
- кто способен менять implementation;
- кто способен менять fee policy/epoch/recipient;
- может ли PAIR admin сделать это для уже launched project без нашего согласия;
- есть ли pause/emergency/rescue/withdraw пути;
- может ли изменение внешней policy сломать только новые fees или также старые claimable balances.

### D. Locker / liquidity safety

Особенно проверить контракт, который держит V4 LP position:

- есть ли withdraw;
- arbitrary transfer;
- rescue;
- admin path;
- upgrade path;
- возможность перевести/сжечь/заменить position;
- зависит ли permanently locked liquidity от доверия к proxy admin.

Не принимать маркетинговую формулировку «locked forever» как доказательство — смотреть deployed bytecode/source/storage/admin.

---

## Предлагаемый production canary

Непосредственно перед реальным запуском сделать свежий mainnet-fork test по **текущему canonical PAIR release**.

Последовательность:

1. Определить текущие canonical launchpad/coordinator/registry/factory/hook/locker/vault addresses из live chain + текущего frontend/docs; не использовать автоматически старые 12.09 addresses.
2. Проверить proxy implementations/admins/code hashes.
3. Запустить тестовый TOKEN тем же режимом/policy, который планируется для production.
4. Сохранить launch receipt/provenance:

```text
token
project id/address
pool ids
hook
locker
LP position ids
native vault
epoch
recipients
shares
implementations/code hashes
```

5. Привязать наш FeeRouter и доказать, что текущая policy действительно даёт ожидаемый recipient/share.
6. Сделать реальные fork BUY + SELL.
7. Собрать fees без PAIR frontend/API.
8. Claim TOKEN и quote fees через on-chain vault.
9. Провести их через FeeRouter → PromoVault.
10. Проверить старые/new credits и rollover.
11. Смоделировать PAIR API unavailable: дальнейшие действия только через RPC/on-chain state.
12. Проверить, что direct V4 trade существующего pool не требует PAIR UI/backend.

Отдельно сохранить доказательства authority/upgradeability и результат locker audit.

---

## Audit invalidation rule

Предлагаю считать canary привязанным к конкретному внешнему release.

Если перед production изменился любой критичный компонент:

```text
launchpad implementation
coordinator / factory / registry
hook
locker
vault implementation / handler
fee policy semantics
```

то старый integration audit считается протухшим и прогоняется заново.

Это особенно важно потому, что история репозитория уже показывает реальные изменения PAIR launch route между нашими fork-проверками.

---

## Что НЕ нужно делать сейчас

- не бросать PAIR из-за движения цены `$PAIR`;
- не строить multi-chain bridge;
- не делать универсальный plugin framework на все DEX;
- не добавлять arbitrary source migration в FeeRouter до понимания threat model;
- не переписывать PromoVault;
- не менять Short/Monthly продуктовую логику ради этого аудита.

Сначала нужно понять реальную внешнюю trust boundary.

---

## Что просим Codex сделать

1. Прочитать текущий `FeeRouter.sol`, `FEE_ROUTER_ROLLOVER_REPORT.md`, `archive/ECONOMICS_FORK_2026-09-12.md` и fork scripts.
2. Найти все места кода/документации, где production path зависит именно от PAIR, а не от обычного ERC20/V4/Promo.
3. Разделить dependencies на:

```text
launch-only
runtime required
off-chain convenience only
admin/trust dependency
```

4. Составить конкретный checklist live contracts/roles/storage/code hashes, которые нужно проверить перед production.
5. Проверить, достаточно ли текущего fail-closed `sourceEpoch` поведения, либо оно создаёт критичный availability trap.
6. Отдельно оценить one-time `bindSource`: для MVP это полезная immutability boundary или слишком опасная невозможность recovery при внешнем upgrade?
7. Не менять код автоматически. Если видишь необходимость архитектурной правки — сначала описать конкретный failure scenario, который она исправляет.
8. Предложить минимальный reproducible fork/canary plan и набор артефактов, которые надо сохранить как production evidence.

## Желаемый формат ответа

Коротко и прикладно:

1. Что переживает полное исчезновение PAIR off-chain.
2. Что остаётся runtime-зависимостью от PAIR contracts.
3. Какие полномочия PAIR admins являются для нас критичными.
4. Какие свойства locker/vault надо доказать.
5. Какие проверки уже покрыты нашим 12.09 fork, а какие надо повторить.
6. Нужна ли какая-либо правка нашей архитектуры **до** production или текущего fail-closed подхода достаточно для MVP.
7. Финальный pre-launch canary checklist.

Не писать production-код до обсуждения результатов.