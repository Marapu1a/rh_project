# Атомарная фиксация Short

15.09.2026. Реализован [ShortDrawCommitment.sol](../contracts/ShortDrawCommitment.sol): **abstract-компонент будущего полного controller**, а не контракт для публичного запуска. PromoVault, FeeRouter и математика корзины не изменены.

## Граница пакета

Одна успешная транзакция связывает заявленный снимок попыток, правила, cutoff, бюджет D, рассчитанную корзину и настоящий USDG reserve в PromoVault. Ошибка любого шага откатывает весь переход, включая распознавание прямых переводов в vault. AttemptsFrozen появляется только после успешного reserve; AttemptsConsumed здесь вообще нет.

```text
нет pending Short
→ проверить запрос, предыдущий блок и immutable vault binding
→ рассчитать корзину из фиксированных weights/minimumUnit и D
→ PromoVault.reserveUSDG(drawId, campaignId, SHORT, D)
→ сохранить commitment и pendingShortDrawId
→ AttemptsFrozen + ShortDrawFrozen
```

## API и состояние

Constructor фиксирует адрес vault, существующий registry, ненулевой instanceId, weights, minimumUnit и remainingRulesHash. Vault допускается по заранее рассчитанному адресу: сначала развёртывается полный controller, затем vault, требующий controller.code.length > 0. При freeze проверяются наличие кода vault и его неизменяемый drawController == address(this). Setter/rebind нет.

Внутренний `_freezeShort(FreezeRequest)` принимает:

| Поле | Значение |
|---|---|
| drawId | Ненулевой ID; нельзя повторить в компоненте или существующих draws vault |
| campaignId | Ненулевая metadata, не доказанная связь с кампанией FeeRouter |
| cutoffBlockNumber / cutoffBlockHash | Последний включённый блок снимка |
| attemptSnapshotHash | Ненулевой hash публично воспроизводимого снимка |
| expectedRulesHash | Должен совпасть с фиксированным shortRulesHash |
| budget | Положительный D в raw USDG, целиком резервируется из SHORT |

`shortRulesHash = keccak256(abi.encode(keccak256("SHORT_RULES_V1"), weights, minimumUnit, remainingRulesHash))`. Последнее поле — обязательство по остальным правилам, а не их реализация. До production нужно определить их каноническое публичное представление и исполнение. Числа из тестов не стали продуктовыми настройками.

`shortCommitment(drawId)` отдаёт весь исходный request, basketHash, basketTotal, remainder и freezeBlock. `shortWeights()` и `shortBasket(drawId)` позволяют независимо восстановить призы. Неизвестный draw в shortBasket вызывает revert. `shortCommitmentHash` хеширует ABI-encoded tuple:

```text
keccak256("SHORT_COMMITMENT_V1"), chainId, controller address, instanceId,
registry address, vault address, quote token address, Commitment
```

Commitment tuple соответствует порядку полей Solidity; FreezeRequest вложен первым. basketHash — keccak256(abi.encode(uint256[] prizes)). Правила/снимок входят через request. Это отдельный commitment от canonical-JSON attemptSnapshotHash: существующий формат indexer не меняется. Его domain дополнительно содержит sourceCodeHash и buyManifestHash.

## Инварианты и ограничения

- Ровно D уходит из freeShort в reserved; CURRENT/NEXT не становятся источником этого draw. Сам reserve предварительно распознаёт прямой USDG как GENERAL по прежним правилам.
- `basketTotal + remainder == D`; все места положительные и соответствуют фиксированному шаблону. Пыль остаётся внутри frozen D до будущей финализации, не распределяется повторно при funding.
- После freeze нет API изменения снимка, бюджета, правил, корзины либо cutoff. Второй Short запрещён при pending, даже с другим ID. Другие mutations полного controller должны использовать общий ReentrancyGuard.
- Новое funding, claim старых наград и Monthly accounting не меняют frozen Short. Существующие выплаты не требуют завершения Short.
- Технический предел шаблона — 64 места, чтобы ограничить объём вычисления/хранения. Это не выбор production K и не подтверждение gas-пригодности будущего RNG/settlement.
- Проверка blockhash работает только для предыдущих 256 блоков EVM. Same-block, future, нулевой/чужой hash и более старый cutoff отклоняются. Это **не finality**: production политика должна выбрать допустимый cutoff внутри этого окна либо сначала пересмотреть эту проверку, если выбранной сети необходимо более длинное окно. Число подтверждений не выбрано.
- Хеш фиксирует **заявленный** снимок, не доказывает полноту/правильность билетов. Публичный replay пересчитывает его и обнаруживает подмену; автоматического on-chain отклонения неправдивого ненулевого hash здесь нет.
- Готовность, шесть часов, выбор D, проверка допуска/авторизации snapshot, RNG и terminal отсутствуют. Пустой снимок в интеграционном тесте проверяет ABI, не утверждает готовность пустого розыгрыша.

Компонент не открывает внешнюю функцию freeze. Внешний unrestricted wrapper существует **только в test/contracts**. Нельзя разворачивать его с настоящей казной: в этом пакете нет завершения pending. У PromoVault один immutable controller для обоих типов draws; нельзя запустить недоделанный Short-only controller и потом заменить его. Будущий полный controller должен собрать Short и Monthly до deployment. Это постоянная составная часть его кода, а не временная заменяемая заглушка.

Будущий terminal обязан атомарно выполнить денежный settlement и зафиксировать расход попыток: если finalize/settlement не удался, AttemptsConsumed и завершения pending быть не должно. Такое завершение здесь намеренно ещё не реализовано.

## Проверки

```powershell
npm run test:short:commitment
npm test
```

11 новых тестов: успешный reserve и независимый пересчёт обоих commitment hashes; откат donation recognition/rounding phase при недостатке Short; некорректные requests/cutoff; границы окна 256 блоков; повторный pending/занятый ID; позднее funding; старые claims и Monthly; immutable binding; точный ReentrancyGuard error при balanceOf callback из настоящего vault; шаблоны/округление; реальные receipt events → lifecycle replay и локальный reorg с повторным freeze.

Результат 15.09: npm test — **93/93 прошли**, включая эти 11; npm run compile — успешно.

Это локальный Hardhat с настоящим PromoVault и test-only wrapper, не новый сетевой fork и не тест честности случайного выбора. Предыдущие direct BUY fork-evidence не переименовываются в проверку этого пакета.
