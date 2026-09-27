# Постоянный ответ GPT — план первого релиза PAIR Infinity

27.09.2026. Проверен `a2de8d7` и сохранённый source/fork `5a31ff5`. Это независимое решение для обсуждения, не команда менять контракты. Новый коммит только документационный; тесты этого шага не нужны. Ранее Infinity receipt evidence и 4/4 адресных offline тестов уже проверены.

## Вердикт

Переход первого релиза на Infinity 3% зафиксирован как решение владельца. План в целом верный, но ближайший пакет должен дать **один реальный путь USDG из Creator Vault в GENERAL reserves с атомарным закрытием кампании**, иначе появится ещё один контракт, который лишь копит деньги. V2 `FeeRouter` и worker оставить в покое. Никакого подтверждения Infinity-билетов, PAIR UI, draw и автоматической выплаты fork пока не содержит.

## Выбранная модель/API

**Получатель в PAIR — сам collector.** `PancakeV1CreatorFeeVault.claim([USDG])` перечисляет только `msg.sender`; промежуточный adapter добавит вторую custody и усложнит финальный claim. Creator Vault при launch получает адрес уже развернутого collector. Токен предсказывается через проверенную factory; collector можно predeploy с immutable predicted TOKEN, USDG и проверенным hook/factory. После обычного launch — однократный `bindSource(vault, initialPolicy)`, когда существуют vault и остальные recipients. До bind `pull/sync/roll` запрещены; накопленные на collector claimable остаются в PAIR vault. Никаких nonce-предсказаний адреса collector не нужно.

При bind on-chain проверить `vault.projectToken == TOKEN`, `vault.hook == hook`, `vault.admin == factory`, `factory.verifyVault(TOKEN, CREATOR_QUOTE, vault)`, `hook.activePolicy(TOKEN) == (mode1,300bps,vault)`, `vault.currentPolicy() == (epoch,collector,300bps)`, quote=USDG и существование контрактов. Конкретный launch receipt, code/implementation hashes, factory/engine/launchpad graph и исходный PoolKey — **deployment admission/health**, не чтение логов из Solidity. Привязка source ровно одна. Не открывать призовое распределение до утверждения внутренних bps и recipient владельцем; в fork использовать явно помеченную fixture policy.

`pull()` без owner: проверить fingerprint, положительный `claimable(collector,USDG)`, вызвать только `claim([USDG])`, потребовать `returned == balanceAfter-balanceBefore == due` и post-claimable=0, затем признать доход текущей кампании. Пустой pull возвращает 0, не зовёт ревертящий `NoClaim`. `sync()` учитывает только неподотчётный USDG баланс при чистом fingerprint; `pay(recipient)` отдаёт лишь накопленный кредит этому recipient и работает даже при внешнем drift. Balance deficit всегда stop. TOKEN-переводы не считаются выручкой и не создают опцию «rescue в призы».

`rollCampaign(expectedId,next)` только owner/nonReentrant после `endsAt`: при том же fingerprint сделать final claim, учесть прямой USDG, закрыть rounding старой кампании, открыть новую. Внешний вызов, sync и смена политики в одной транзакции: любой revert откатывает весь rollover. Unpaid credits не требуют выплаты и сохраняются. `endsAt` сам не переносит доход в новую кампанию. Призовая доля переводится фиксированному PromoVault; затем существующий `syncUSDG()` относит полученный USDG в GENERAL; тест должен завершаться ростом reserves, не балансом collector. Небольшой самостоятельный контракт с теми же проверенными принципами `FeeRouter` безопаснее выноса общей базы сейчас; worker сделать отдельной узкой веткой, не подделывать V2 ABI.

### Внешний fingerprint и drift

Hook: закрепить `tokenStates(TOKEN).currentEpoch` **как счётчик последней запланированной эпохи**, плюс active mode/300bps/destination и `hook` address. Creator Vault: `epochCount()` как полный счётчик, `currentPolicy()` epoch/recipient/300bps, immutable TOKEN/hook/admin. На каждом pull/sync/roll читать оба. Только active values недостаточны: owner hook может запланировать будущее или сменить и вернуть политику; счётчик монотонен и заметит оба случая. Проверять 1–2 getters, не сканировать всю историю. Новая scheduled epoch, даже ещё не вступившая, консервативно требует review. После внешнего изменения автоматическое признание новых денег и rollover стоят, старые `credit/pay` и обеспеченные призы живут.

`Creator Vault.appendPolicy` доступен только его `admin` (factory); в прочитанном factory не нашли публичного wrapper для вызова append. Поэтому **не утверждать**, что creator сам меняет recipient. Hook `schedulePolicy` доступен owner, а после freeze также registrar при условиях кода; effectiveAt может быть немедленным, attestation ограничивает ненулевой destination. Это реальная внешняя власть, а не доказательство злого намерения. Счётчик `epochCount` всё равно закрепить: он дешев и закрывает смену, если PAIR позже добавит административный путь.

При drift `sync()` тоже stop: прямой USDG имеет неизвестное происхождение, и автоматическое отнесение его к старой кампании без чистой policy нельзя оправдать. USDG остаётся на collector как unaccounted inventory, не исчезает. Старый `claimable[recipient][asset]` в PAIR агрегирует эпохи; после смены с возвратом нельзя разделить его по эпохам одним getter. В первом пакете **не строить автоматический recovery**: сообщить sourceDrift, сохранить средства/историю, оставить pay старых credits, отдельно решить атрибуцию незабранного. Не давать arbitrary rebind и не разблокировать roll одной кнопкой.

## Нерешённые решения

| Вопрос | Моя рекомендация | Статус |
| --- | --- | --- |
| Внутренние доли creator USDG | Владелец утверждает bps и адрес ops/project до production; тестовые 100% в Promo обозначить fixture | Не утверждены |
| База 100 USDG/билет | **Фактический net USDG debit кошелька на подтверждённом BUY**, включая hook fees и вычитая refunds той же tx; `maxInput` не считать расходом. При BUY 103.30 это 1 билет и carry3.30. Это соответствует обычному «потратил 100», но меняет старую семантику pool input | Рекомендация, нужно решение владельца и новый genesis |
| Поддержка торговли | Начать с одного доказанного Infinity adapter/calldata/receipt, payer=recipient, TOKEN/USDG. Другие UI/маршруты добавлять по evidence | Исследовать после funding пакета |
| Внешний drift | Stop нового accounting/roll, выплата старых credits; recovery отдельно | Без автоматического принятия |
| Production readiness | Реальные RNG/finality, automatic eligibility/payout, worker, UI маршрут и параметры ликвидности ещё не готовы | Релизные блокеры |

## Критерий готовности ближайшего пакета

На fork публично выпустить TOKEN/USDG с collector-recipient, BUY+SELL 3%, permissionless pull, `pay` и реальный `PromoVault.syncUSDG()` после перевода USDG; вся сумма reconciliation от fee events до credits, переводов и резервов. Адресные unit-тесты: empty pull, неверный source/asset/policy/counters, смена-и-возврат политики, scheduled future epoch, `claim` revert/неполная выплата с rollback, direct USDG до и после `endsAt`, два rollover с unpaid credits, rounding, reentrancy, stale id, drift и deficit. Проверить, что при source failure уже учтённые credits и призы доступны, а worker не повторяет unknown send без receipt reconciliation. Full suite из-за этого пакета автоматически не нужен.

После этого — отдельный Infinity decoder + новый genesis без регистрации и утверждённой базой gross debit; затем payout worker. Нельзя снова потерять простой пользовательский маршрут за аудитом комиссий.
