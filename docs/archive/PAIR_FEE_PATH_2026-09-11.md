# PAIR: проверка пути комиссий и текущего релиза

> **АРХИВ.** Документ отражает прошлый этап, не текущие правила. Актуальная логика: [PRODUCT_SPEC](../PRODUCT_SPEC.md); реализация: [IMPLEMENTATION_STATUS](../IMPLEMENTATION_STATUS.md). Числа и следующие шаги ниже относятся к дате документа.


Дата наблюдений: 2026-09-11. Продолжение `PAIR_TECHNICAL_RECON_2026-09-11.md` и `PAIR_FOLLOWUP_2026-09-11.md`.

Обновление 13:52 UTC: новый launch успешно прошёл read-only симуляцию после корректного подбора salt; проверены получатель-контракт и варианты developer buy 0 / 0,00001 ETH. См. `PAIR_LAUNCH_SIMULATION_2026-09-11.md`. Ниже сохранены результаты предыдущего этапа; его открытый вопрос об успешной симуляции закрыт, проверка собственного FeeRouter остаётся впереди.

Проверки: чтение frontend, API, RPC, receipt/logs и одна изменённая read-only симуляция launch через eth_call. Подписей, отправки транзакций, создания токена и расходов не было. Это исследование поведения конкретных контрактов, не аудит их безопасности.

## Результат для MVP

Есть реальный пример запуска с единственным пулом TOKEN/USDG, распределением собранной комиссии 70/30 и получением creator share контрактом. Это подтверждает технический прецедент для схемы PAIR vault → FeeRouter → PromoVault. Произвольный наш FeeRouter и новый запуск на текущей реализации ещё не проверены.

Native и custom quote ветки имеют разную механику vault/claim. Нельзя переносить результат одной ветки на другую или считать API-метку canonical достаточным описанием действующего релиза.

## 1. Native: один TOKEN/USDG-пул и получатель-контракт

- Token: `0x31515657e06cc895ca4a6744a004555869015555`.
- Creator: `0xb1bf6346cd6f7a8f52a709a4265a00d969bd531d`.
- Vault: `0xd2900ce7680b6f46ceb803c79258e4264e95a7c3`.
- Recipient: `0x766631e1a3ff2b460a34df221cff875a4bd967d0`, контракт social fee escrow.
- Coordinator: `0x5904d5e72c326aeea44e2780d3f8be395a82403d`, ветка legacyNative в исследованных данных.
- Launch tx: `0x29308b4140ddfa903f553528a4f51449d37ab027eff831b99080ca727fa28719`.
- Pool: `0x44602405bf68c2a6d1ece1f8dd8210003e7904d3e0cf0811f1ec27cd6a4ca979`.

Collection tx `0x5a0c637ddd1063c4d5261dcb9a8f1bf90fce083248717923283d89261852bea5`, status=1:

| Asset | PoolManager → vault, raw | Оставлено creator, raw | Vault → отдельный адрес, raw |
|---|---:|---:|---:|
| TOKEN | 119779581729463413282620 | 83845707210624389297834 | 35933874518839023984786 |
| USDG | 121069 | 84748 | 36321 |

Отдельный адрес: `0xbc27542ae2ed2e4d1d380b5fe8b2d48404fd824c`. В этой операции creator получает floor(total × 70%), остаток составляет protocol share. Получатель protocol share установлен по Transfer; его организационная принадлежность отдельно не проверялась.

USDG имеет 6 decimals: собрано 0,121069 USDG, creator share 0,084748 USDG, protocol share 0,036321 USDG. Это доли собранных LP fees; receipt сам по себе не устанавливает полную комиссию каждой сделки маршрута.

Claim tx `0x7a402e2a618f41fc416369fb5e69cbe318320f3fd9afc0491f8a71bdd3aa4a2f`, status=1: creator вызывает `pull(address,address)` у recipient escrow, затем USDG Transfer из vault в escrow на 84748 raw. Последующая выплата человеку здесь не доказывалась.

Практическое следствие: FeeRouter может потребовать активного вызова claim/pull; автоматическое поступление денег после каждого swap не подтверждено. Комиссия также приходит в TOKEN, поэтому нельзя считать весь бюджет сразу доступным в USDG.

Evidence: `research/usdg-claim-project.json`, `research/usdg-claim-transaction.json`, `research/native-usdg-collection-receipt.json`, `research/claims-and-native-vaults.json`.

## 2. Custom quote: отдельная модель

Token `0x51ee804a2c10dcd35bd15f0e714361c73fe85555`, vault `0x5860f2782964af2eb2b17a3135c55ae532ce189d`, creator `0xc253ccba17b37f9592efd46688430ba058e87161`.

Два collect: `0xd6ea60e37d86212062cc7c014032e1973643d963c04452825d332a48072077bc` и `0x65b74ef657ce0d9cd50a207c510a5b231742c8959343bfc142bcd811d1838f73`. Для трёх позиций собираются TOKEN и соответствующие quote assets. В исследованных collect нет конвертации этих поступлений.

Claim TOKEN: `0xbf4f38435c59600a03bf2bdcb96da014e825add9c1ede2ac4337c0644bcd69d9`. Вызов `claim(address)` переводит из vault creator ровно `21777620664370428973145078` raw TOKEN — сумму шести наблюдавшихся TOKEN collections. Claim одного quote: `0x36194fec31880147a97cbc8f8f1632ab6c952cb8819d6e0564610532feaa8e6c`.

Это 100% наблюдённых поступлений TOKEN в данный vault, а не доказательство creator share=100% от полной комиссии сделки во всей custom ветке. В claim TOKEN отсутствует отдельный лог Claim; для индексатора нужны ERC20 Transfer и соответствующий контекст.

Frontend ABI: `collectFees(uint256)`, `claim(address)`, `claimable(address)`, `creator()`, `registrar()`. На пустом vault вызов claim от creator вернул `NothingToClaim()`, от тестового постороннего адреса — `OnlyRegistrar()`. Имена сопоставлены по keccak сигнатур frontend ABI; полный алгоритм авторизации без исходников не установлен.

Evidence: `research/custom-collect-transaction.json`, `research/custom-claim-investigation.json`, `research/claims-and-native-vaults.json`, `research/frontend-error-selectors.json`.

## 3. Текущий релиз и предел подтверждения нового запуска

Proxy `0x8660a7f019c7943b0b0a91b8e39aff3b6db6ae62` использует implementation `0x8000b64b62837a1511e302c62354e1bc39b5641a` по ранее прочитанному EIP-1967 slot. Его runtime code hash: `0x12ba8b9e917f08c014e3823e4cad6bab4ee183df3c9ed9116e9edff7de13457f`.

Frontend manifest содержит другую implementation, но frontend предусматривает approved upgrades. На блоке `0x396e8ff` вызов `isApprovedRelease(uint256,address,address,bytes32)` у registry `0xd3c320136e541e581d68ed49d10bdbbee6880aa4` для фактической реализации вернул true. Само расхождение с manifest поэтому не доказывает неисправность. Владелец и code hash самого registry в этой проверке независимо не подтверждались.

История coordinator `0xabfbaf56e39bec0b696e44e2c05bb56fcbda5040` и coordinator `0x5904d5e72c326aeea44e2780d3f8be395a82403d` различается. У custom readiness свой coordinator `0xacdaeb4c9de24299b27027cbb3b47195c2ef67a9`. Какой путь получит наш новый запуск, успешно не воспроизведено.

Симуляция на блоке `0x3975ca9`: взята calldata исторического TOKEN/USDG launch, заменены deadline и salt, снижены min outputs, сохранены sender, recipient escrow и value. `eth_call` вернул `0x6de3e846`, соответствующий frontend error `InvalidLaunch()`. Это изменённый тестовый payload, а не доказательство, что корректный новый launch невозможен. Свежий vanity salt и совместимость параметров существующего escrow не были подтверждены. `debug_traceCall` недоступен: JSON-RPC -32601.

Explorer не предоставил проверенные исходники изученной implementation; запросы Sourcify не дали match. Попытки получить Solidity metadata через IPFS gateways вернули 429. Это ограничение доступа к исходникам, не доказательство, что исходников нигде нет.

Evidence: `research/frontend-release-manifests.json`, `research/current-release-chain.json`, `research/current-usdg-launch-simulation.json`, `research/current-usdg-launch-trace.json`, `research/frontend-error-selectors.json`.

## 4. Ограничение RPC/indexer

Широкие eth_getLogs от блока 0 в ряде запросов возвращали пустой результат, хотя более узкий диапазон возвращал события тех же vault. Пустую выдачу нельзя считать отсутствием активности. Полнота собранной истории не доказана. Для MVP нужны ограниченные диапазоны, reconciliation с receipts/балансами и обработка повторов/reorg; PAIR trades API не использовать как единственный источник eligible BUY (ошибка классификации уже разобрана в предыдущих отчётах).

## Следующий проверяемый результат

До реализации интеграции получить успешную симуляцию точного будущего launch: один TOKEN/USDG-пул, конкретная версия fee-sharing, новый валидный vanity salt, наш тип recipient-контракта, согласованный developer buy. Затем проверить collect → claim → recipient на локальном fork или поддерживаемой тестовой среде. Текущая неудачная симуляция этот этап не закрывает.

Черновик точечных вопросов PAIR, никуда не отправлен:

1. Какой supported entrypoint и coordinator сейчас использовать для нового single-pool TOKEN/USDG launch? Нужны exact ABI, пример calldata и deployment manifest, соответствующие implementation `0x8000…641a`.
2. Где исходники этой implementation, mode handler, vault, beacon и hook? Кто может их обновлять и менять fee policy?
3. Разрешён ли произвольный контракт как fee recipient в этой версии? Каковы точные claim/epoch/registrar права, может ли keeper вызывать получение в пользу фиксированного recipient?
4. Для выбранного режима какая полная swap fee и какая creator share по каждому asset? Есть ли conversion или дополнительные hook/protocol deductions?
5. Поддерживаются ли allocation=100% USDG и developerBuy=0? Как формировать vanity salt и modeConfig для этого варианта? Как диагностировать `InvalidLaunch()` у текущей реализации?
6. Есть ли совместимый testnet deployment или RPC с debug_traceCall для воспроизводимой проверки интеграции?
