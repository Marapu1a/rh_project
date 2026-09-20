# PAIR dependency audit — 15.09.2026

> Архив на 19.09.2026: исторический отчёт/обсуждение, не текущий план и не самостоятельная спецификация.
> Начало работы: [CURRENT_CONTEXT](../../CURRENT_CONTEXT.md). Условия и выводы ниже относятся к указанному этапу.

**Дополнение того же дня:** исходники получены через Sourcify API v2; проверены runtime семи deployments и найдена смена recipients через registry. [Продолжение: исходники и переносимость](PAIR_PORTABILITY_AND_SOURCES_2026-09-15.md). Указания ниже «исходники не получены / authority не подтверждена» описывают первый проход, а не итоговый статус исследования.

Статус: выполнены аудит нашего кода, сверка исторического fork, read-only chain snapshot и локальные проверки отказов. **Полномочия внешних vault/locker не доказаны полностью; production clearance не выдан.** Это не формальный аудит всего PAIR и не новый launch canary. Production-контракты не менялись.

## Короткий вывод

Наше уже обеспеченное prize accounting не вызывает PAIR. Исчезновение сайта PAIR само по себе не отключает `FeeRouter.sync/pay` и `PromoVault.claim`. Сбор ещё не полученных комиссий, hook существующего рынка и возможная смена внешней политики остаются внешними зависимостями. Работоспособность всей системы также требует RPC/сети, исправных токенов и собственного production controller/indexer/исполнителя, которых пока нет.

One-time bind и fail-closed rollover пока сохранять. Добавлять произвольную миграцию source как реакцию на неопределённость не рекомендую: сначала доказать, кто может изменить внешний источник и что происходит с уже начисленными fees. При необратимом изменении epoch текущий экземпляр router не умеет возобновить rollover. Перенос кода на новую сеть не переносит старые активы или права пользователей.

## Свежие наблюдения и источники

- Наш код: [FeeRouter](../../../contracts/FeeRouter.sol), [PromoVault](../../../contracts/PromoVault.sol), [rollover report](../../FEE_ROUTER_ROLLOVER_REPORT.md), [исторический fork](../ECONOMICS_FORK_2026-09-12.md), [fork runner](../../../scripts/economics-fork.cjs).
- Live chain 4663: pinned block **63395951 / 0x3c7586f**, header/hash, code, storage и eth_call сохранены в [evidence JSON](../../../research/pair-dependency-audit-2026-09-15.json). Начало наблюдения 2026-09-15T05:04:24Z. Все on-chain чтения одного collector привязаны к этому номеру блока; HTTP API не является частью его snapshot и вернул более позднюю attestation.
- [PAIR docs](https://pair.fund/docs) — заявления и таблицы адресов, не доказательство ограничений bytecode. Опубликованная implementation `0x1559…b12c` расходится с прочитанным implementation slot. Нельзя использовать таблицу docs как единственный release manifest.
- [Native consumer-live](https://pair.fund/api/v5-v2/native-fee/consumer-live) сначала ответил 503, при повторном чтении — 200 с manifest SHA256 `119b86474077e36c6acedef6b6e813374c5b7ede61694b460d7c66ed0ff60b5e`, coordinator `0xddc69…687b`, registry `0x34b34…3809`, hook `0x438b…80c0`. Это соответствует пути 12.09; ответ API не заменяет независимую проверку всех registry bindings.
- [Standard consumer-live](https://pair.fund/api/v5-v2/standard-route/consumer-live) в collector ответил 503. [Общий readiness](https://pair.fund/api/launches/native-fee-v2-readiness) при этом 200/ready. Отказ подтверждения нельзя автоматически переносить на существующие пулы или все пути запуска.
- [Custom quote readiness](https://pair.fund/api/quote-assets/launch-readiness) указывает другой coordinator `0xacdae…67a9`; это иной advertised path, не доказательство, что native путь сменился. Нельзя смешивать эти readiness endpoints.
- Frontend bundle `/assets/index-BDOzzxau.js` содержит несколько поколений manifests. Наличие адреса в bundle не делает его активным. Его новые кандидаты также проверены как отдельные кандидаты, а не названы текущим release.
- Blockscout smart-contract API v2 для proxy/locker и v1 getsourcecode вернули HTTP 403 Cloudflare challenge. Две попытки Sourcify metadata для locker/implementation вернули 404. **Исходники внешних контрактов не получены в этом проходе.** Это ограничение доступа, не доказательство отсутствия опубликованных исходников.

### Подтверждённые chain значения

| Компонент | Наблюдение | Чего оно не доказывает |
|---|---|---|
| Launchpad `0x8660…Ae62` | implementation slot → `0x8000b64b62837a1511e302c62354e1bc39b5641a`; owner() → `0x3da42dbecbeff476c027f8298bfad0d6c3ba5656` | owner не обязательно единственный upgrade authority; требуется код авторизации и контроль owner-адреса |
| Registry пути 12.09 `0x34b34…3809` | owner() → `0x18fe9694a335c8b42d228147eddac524748300ea` | Какие именно bindings владелец вправе менять и влияют ли они на старые проекты |
| Новый frontend registry-кандидат `0x8e1bf…8738` | тот же owner, отдельный код/адрес | Что этот кандидат выбран нашим launch path |
| Native hook `0x438b…80c0` | registrar() → poolEngine `0x86877c5394a3d4a74ffe9e599804e23b4c758a7e` | Может ли registrar менять правила уже существующего рынка |
| Исторический публичный vault `0xd1ade…7c01` | epoch=1, projectToken=`0xffbd…5555`, registrar=`0xeed3d5042918224f40fc78358c51ee9a1c8f46a1` | Это чужой исторический проект, не vault будущего запуска и не полный образец текущего release |
| Docs locker `0xefcf…a117` | код 4194 bytes, нулевые ERC1967 slots | Отсутствие нестандартной проксификации, admin или withdraw; также не доказано, что он держит LP нашего native пути |

Полные адреса, keccak256 runtime code hashes, getters и errors — в JSON. Для всех кандидатов прочитаны implementation/admin/beacon slots. Нулевой slot не доказывает immutability; reverting owner()/registrar() не доказывает отсутствие администратора. Значение owner() на implementation отдельно не описывает owner proxy. Тип владельца (EOA/multisig/timelock), его участники и задержки ещё не установлены.

## Карта зависимостей

| Часть | Категория | Роль и последствия исчезновения |
|---|---|---|
| Launchpad/coordinator/factory | launch-only, admin/trust | Создают TOKEN/vault/market и задают начальные права. Требуется закрепить фактический release; переиспользование этих адресов старыми runtime-компонентами ещё проверить |
| Registry / mode handler / registrar | admin/trust, возможно runtime | Если vault/hook читает их при каждой операции, смена влияет на старые проекты; если только при создании — иной риск. Без исходников граница не доказана |
| Native vault и LP custody | runtime required | FeeRouter вызывает collectFees/claimable/claim; отказ блокирует получение новых комиссий и rollover |
| Hook и PoolManager | runtime required | Каждый соответствующий swap проходит правила пула/hook. Собственный frontend не обходит hook или pause |
| Quote/token ERC20 | runtime required | Transfer/allowance/balanceOf, возможные ограничения эмитента, decimals и ликвидность. USDG независимо от PAIR нельзя считать лишённым issuer/network рисков |
| PAIR UI, индексатор, fee keeper | off-chain convenience для доступных permissionless методов | Заменимы своим RPC-клиентом и обработкой событий, если auth on-chain действительно permissionless. Для launch подписанный quote/attestation может быть отдельной необходимой зависимостью |
| PAIR oracle/price signer | launch/runtime граница не доказана | Не доказано, что существующий native swap не зависит от keeper freshness. Нельзя переносить маркетинговое описание V5 oracle на все hook версии |
| Наш FeeRouter | локальная runtime-логика + внешний fee source | Не обращается к PAIR API, не требует владеть protocol TOKEN `$PAIR`; fixed source и assets |
| Наш PromoVault | отдельное ERC20 accounting | Нет вызовов PAIR vault/registry/hook. Контроллер неизменяемый; запуск/finalize ещё требуют корректного собственного controller |
| Наш future indexer/RNG/UI | ещё не реализовано | Автономность от PAIR off-chain — требование, а не готовая возможность |

Зависимости видны также в `scripts/economics-fork.cjs`, `fork-fee-router.cjs`, `research/simulate_native_launch.py`: proxy, PoolManager, PositionManager, USDG, подготовленный launch calldata и salt. Это исследовательские integration scripts, не автономное обнаружение текущего релиза. `read-only-fork-rpc.cjs` — транспортный помощник, PAIR API ему не нужен.

### Цена `$PAIR`

В наших FeeRouter/PromoVault нет адреса protocol token, проверки его holdings/price или требования платить им. Но отсутствие такой зависимости во всём внешнем hook/handler графе не доказано без его source/trace. Падение цены само по себе не повод менять продукт; утверждение «технически совершенно независимо» пока сильнее доказательств.

### Исчезновение PAIR off-chain

Подтверждено для нашего кода: имеющиеся credits можно выплатить, прямые поступления синхронизировать, уже назначенные PromoVault rewards получить без PAIR UI/API. Нужны работающие ERC20 и RPC; никто не запускает транзакции автоматически.

Исторически продемонстрировано на локальном fork: direct swaps через SwapFixture/PoolManager, сбор и claim без PAIR frontend. Это не проверка текущего UniversalRouter или всех поддержанных production trade routes. Восстановление provenance возможно по launch receipts, Initialize/events и state; полный собственный recovery/indexer сейчас не реализован. Доступность архивных RPC тоже отдельный ресурс.

## FeeRouter: fail-closed и one-time bind

1. `bindSource` проверяет наличие кода, projectToken и единственного recipient=router с 10000 bps. **Не доказывает каноничность vault, правильность pool/positionId, владение LP или отсутствие upgrade.** Нужен проверенный launch receipt и сверка graph до вызова. Случайный positionId может пройти bind и ломать collect навсегда.
2. `rollCampaign` проверяет sourceEpoch до и после внешнего collect/harvest. Ошибка откатывает весь переход. Уже настроенный router не умеет ни сменить sourceEpoch, ни заменить vault.
3. `collect` не проверяет epoch. `harvest(asset, pairEpoch)` принимает выбранную вызывающим эпоху, а `sync/pay` вовсе не вызывают source. Поэтому drift блокирует rollover, **но не всё обслуживание**. Если внешний vault допускает старый claim, он остаётся доступен через harvest.
4. Пока rollover невозможен, вновь признанные средства относятся к старой кампании, даже после endsAt. Это последовательное следствие принятой атомарной границы; старые recipients продолжают получать credits. Это availability/смена политики проекта, не автоматическое присвоение средств атакующим.
5. Fail-closed защищает смену кампании, но не является постоянной проверкой внешней политики: внешний admin может направить будущие fees иначе, а router не умеет вернуть то, что ему не начислили. Нужны доказательства полномочий vault/registrar.

**Рекомендация сейчас:** не ослаблять rollover и не добавлять arbitrary migration. Перед production нужен ответ: возможен ли чужой epoch change/upgrade нашего vault? Если нет и source исправен — текущая граница выглядит приемлемым кандидатом MVP. Если да — либо выбрать неизменяемый launch mode/source, либо отдельно спроектировать ограниченный recovery, сохраняя старые credits и точную accounting boundary. Универсальный admin escape не является бесплатным исправлением.

Сценарий для архитектурного решения: registrar меняет epoch с 1 на 2 без нашего участия; collect/claim работают, но все будущие rollCampaign отклоняются. Другой сценарий: source навсегда перестаёт обслуживать position; финальный collect никогда не проходит. Последствия должны быть известны до необратимого bind.

## Что нужно доказать для vault/locker

Для конкретного будущего launch receipt, а не docsLocker вообще:

- Кто по PositionManager.ownerOf(positionId) держит LP, есть ли approvals/operator approvals, кто может decreaseLiquidity/burn/transfer/replace position.
- Реальный runtime source и implementation graph: ERC1967/UUPS/beacon, clones с embedded implementation, custom delegatecall; ограничения fallback и update функций.
- Все write paths: withdraw/rescue/arbitrary call, approvals, управление registrar/mode handler, распределение principal против fees. Наличие/отсутствие функции по короткому списку selector не является доказательством.
- Кто меняет epoch/recipients/shares, требуется ли creator/router согласие, можно ли менять старые claimable, переводить accumulated fees в другую policy.
- Кто может pause collection/claim/swap, отозвать роль keeper, менять oracle, quote whitelist, hook rules; распространяется ли это на существующий рынок.
- Кто контролирует каждый owner/admin/role, multisig/timelock и реальные задержки. Связь registry replacement с уже созданными vaults/hook.

До этих проверок формулировку «locked forever» не считаем доказанной. Новый fork с успешной торговлей сам по себе тоже не доказывает отсутствие административного вывода.

## Проверки, выполненные здесь

Все 18 тестов FeeRouter прошли (16 прежних и 2 новых). Добавлены два локальных mock-теста в [fee-router.test.cjs](../../../test/fee-router.test.cjs): отказ collect блокирует rollover, но старые credits и direct revenue выплачиваются; смена epoch блокирует rollover, но old-epoch harvest работает, если source продолжает его разрешать. Они проверяют нашу логику, **не моделируют реальные полномочия PAIR**.

Исторический fork 12.09 покрывал реальный тогда launch, BUY/SELL, TOKEN/USDG fee collection, rollover, route receipts и старый PromoVault flow. Новые funding/monthly изменения PromoVault не прошли новый сетевой canary. Сегодня выполнены только read-only chain/API проверки и локальные unit tests; никакой новый TOKEN даже на fork не создавался.

## Минимальный pre-launch canary и артефакты

1. Закрепить chainId, номер/hash блока, release manifest и фактические registry bindings. Сверить native mode, proxy implementation, factory/hook/vault handler/LP custody. При отказе attestation не угадывать маршрут по старому bundle.
2. Получить полный source graph с настройками компиляции и сопоставить runtime с bytecode. Сохранить code hashes, implementation/admin/beacon slots, roles, timelock, policy и proofs контроля LP. Закрыть вопросы предыдущего раздела.
3. На локальном свежем fork подобрать свободный salt и создать TOKEN именно планируемым mode/policy. Не переиспользовать фиксированный salt/address из `economics-fork.cjs` без проверки. Создание в публичной сети здесь не нужно.
4. Сохранить receipts: project/TOKEN, vault/epoch/recipients, poolKey/poolId, hook, LP positionIds и ownerOf, factory/coordinator/registry graph. Затем bindSource нашего router, сверить всё ещё раз.
5. BUY/SELL через прямой V4 путь, TOKEN и USDG fees, самостоятельные collect/claim, sync/pay, rollover. Проверить новые поступления, unpaid credits, failure rollback и funding actual USDG в текущем PromoVault API, изоляцию Next/reserved/claimable.
6. После подготовки запретить обращения к pair.fund UI/API: оставить только RPC, адреса и ABI. Повторить swaps/collect/claim и восстановление идентичности по сохранённым receipts/events. Это проверка независимого исполнения, не отсутствие price-signer зависимости до запуска.
7. На fork отдельно испытать только реально существующие admin write paths, подтверждённые source: policy/epoch, pause, upgrade и LP операции. Зафиксировать последствия для старых claimable и будущих fees. Проверить устаревший oracle, если relevant.
8. Сохранить commit наших контрактов, compiler/settings/ABI hashes, pinned external graph, JSON RPC/receipts, результаты тестов и список непроверенного. Изменение любого критичного binding, code hash, implementation, роли или fee semantics требует пересмотра доказательств, даже если proxy bytecode не изменился.

## Воспроизведение текущего read-only снимка

```powershell
node scripts/pair-dependency-audit.cjs
node --test --test-concurrency=1 test/fee-router.test.cjs
```

[Collector](../../../scripts/pair-dependency-audit.cjs) разрешает только чтение RPC, закрепляет блок, сохраняет ошибки как evidence. Повторный запуск перезапишет JSON новым наблюдением; это не побайтовое воспроизведение состояния 15.09 и не автоматический поиск всех контрактов. Список кандидатов специально содержит исторические/альтернативные адреса. Перед canary его нужно расширить до подтверждённого полного graph.

Следующий необходимый результат: исходники и authority graph точного native vault/locker/handler. Пока они не получены, решение о безопасности внешних прав и необходимости recovery остаётся открытым; остальную локальную продуктовую разработку этот пробел сам по себе не отменяет.
