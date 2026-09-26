# GPT: PAIR launch, BUY coverage и устойчивость денежного контура

## Текущий follow-up после 9e2e237: source-read isolation

Реализована узкая изоляция в [LOCAL_PRIZE_FLOW](LOCAL_PRIZE_FLOW.md): только
epoch/claimable eth_call с existing retryableRead классификацией. Первый transient
failure завершает source lane текущего pass, local inventory продолжает работу;
failures/onStep сохраняют sourceReadUnavailable, результат prize — degraded.
Send/receipt и observer callbacks вне read catch, coordinator/pending journal не менялись.
CALL_EXCEPTION/BAD_DATA, local balance errors, deficit и policy mismatch остаются stop.
Новая epoch не принимается автоматически, rebind не добавлен.

При review проверь границу catch, late claimable failure после подтверждённого collect/
первого harvest, сохранение unknown-send stops и оба порядка coordinator. Результаты
адресных проверок и команды — в документе модуля. Следующим предлагаем pinned
deployment/health manifest; не смешиваем его с recovery существующих frozen obligations.
Ниже — предыдущие follow-up и контекст исследования.

## Follow-up после ответа 98e6302 — 26.09

Предложенный launch/bind пакет выполнен: [NATIVE_LAUNCH_PROOF](NATIVE_LAUNCH_PROOF.md).
Новый native mode1 TOKEN/USDG через обычный creator, nonce bootstrap converter,
bind с registered position/quote/NFT custody, BUY100USDG → collect/claim →
0.699999USDG в GENERAL reserves. Без PAIR impersonation. Адресно45/45 + evidence2/2.
Прямой Universal Router native BUY, не UI/AUTO proof; eligibility/draw/payout отдельно.
Первый harness funding probe упал после launch, исправленный новый run прошёл;
raw успешные receipts и ограничения в отчёте. Полный suite не запускался.

При следующем review проверь минимальность bind guard, nonce bootstrap без временного
recipient и отсутствие завышенных claims по evidence. Предложи узкий source-read
isolation пакет без обхода unknown-send/deficit/policy stops. CTO recovery и
production transition не реализованы. Ниже сохранён контекст предыдущего запроса.

26.09.2026. Новый пакет после твоих ответов `b661057` и `573e012`.
Просим независимое ревью выводов и следующего шага. Ответ перезапиши в
GPT_REVIEW_RESPONSE.md, начиная с даты и проверенного commit. Код не меняй.
Предыдущие письма доступны в git; не нужно перечитывать весь архив.

## 1. Откуда пришли и что сейчас решаем

Прошлое обращение касалось реальной V4 конверсии TOKEN→USDG. Она уже была проверена
на fork в `87f94ba`; после этого ты поднял более важный продуктовый вопрос:
внешняя покупка → автоматические билеты → USDG победителю без обязательного визита
на сайт. Мы исследовали реальный путь покупки и источник комиссий PAIR.

Пользователь подтвердил PAIR как площадку запуска. PONS/самостоятельный launch
сейчас заново не сравниваем. Нужно поддерживать доказуемые популярные покупки,
а не все возможные способы получения TOKEN. Неясность трактуем как отсутствие
подтверждённой eligibility. Transfer/баланс/холд не заменяют подтверждение покупки.
Призы остаются USDG. Конверсия простая порционная, без trading bot и нового oracle
framework. Призовые средства нельзя выводить на эксплуатацию или спасать reset/reroll.

Важный статус прошлого письма: регистрация до BUY **всё ещё обязательна в коде**.
Автоматическая eligibility без register и автоматический payout-worker пока не
реализованы. Не выдаём исследование маршрутов за закрытие этих двух задач.
Permissionless claim сам транзакцию не отправляет. Предложение из твоего ответа
не является уже действующей спецификацией или разрешением пересчитать старые snapshots.
Просим сохранить эти задачи в плане, не потерять их за аудитом PAIR.

## 2. Краткая карта чтения

Сначала прочитай:
- [PAIR_DEPENDENCY_BOUNDARY](PAIR_DEPENDENCY_BOUNDARY.md): цепочка денег, mutable
  зависимости, source failures и предложенный порядок укрепления.
- [PAIR_LAUNCH_COMPATIBILITY](PAIR_LAUNCH_COMPATIBILITY.md): почему проверенные BUY
  и fee source пока не составляют единый профиль запуска.
- Начало [DIRECT_BUY_REPLAY](DIRECT_BUY_REPLAY.md): новый AUTO adapter и проверки.
- [ROUTE_RESEARCH_2026-09-24](ROUTE_RESEARCH_2026-09-24.md): фактические маршруты,
  public observations, границы UI evidence.

Для спорного места открывай конкретный код/evidence. PRODUCT_SPEC — правила,
CURRENT_CONTEXT/ROADMAP — статус; старые части модульных документов — история.
Не нужно повторять весь security audit проекта.

## 3. Что добавлено после последнего ответа

Реализован отдельный `rh-pair-auto-usdg-v1`:
- `scripts/pair-auto-buy.cjs`: pinned V1 aggregator, прямой buyExactInput, USDG funding,
  payer=recipient, 1–2 уникальные ветви; ABI/calldata, AggregatedBuy, Transfers и V4 Swaps
  должны согласовываться. Wrappers, другой funding/recipient, 3–5 legs не поддержаны.
- Объём — один gross USDG debit всей покупки, включая внутренние conversion fees.
  Нельзя суммировать обороты промежуточных swaps и выдавать несколько purchases.
  Цена TOKEN не используется для перевода output обратно в USDG.
- Подключён в direct-buy, typed buy-policy-format и RPC replay/scan. AUTO receipt
  не считается второй раз прямым decoder. Регистрация проверяется на момент первого
  USDG payment, а не позднего итогового event. Candidate id использует итоговый event.
- AUTO-only genesis не требует несуществующего direct TOKEN/USDG pool. Если есть
  direct adapter, реальный poolKey/id обязателен. Обычное append-only расширение
  не позволяет подменять остальные bindings или превратить AUTO-only в direct pool.
- Scanner проверяет aggregator runtime на cutoff и блоках его вызовов; отсутствие
  исторического code не заменяется latest. Это не независимая проверка finality
  и не защита от всех intra-block изменений proxy implementations.

Публичной активации нет. Эти изменения не расширяют поддержку на native V2/Infinity.
AUTO — полезный проверенный профиль, но не причина выбрать неподходящий launch.

Проверки, уже выполненные 25.09, не повторялись только ради публикации:
`node --test test/pair-auto-buy.test.cjs test/pair-auto-evidence.test.cjs test/direct-buy.test.cjs test/attempt-lifecycle.test.cjs test/monthly-replay.test.cjs`
— 55/55, около 1.85 s. Отдельно launcher infrastructure 5/5, не суммировать с
продуктовым результатом. Full suite не запускался.

Fork: `node scripts/permit-buy-fork.cjs NEW_OUTPUT.json --auto`, upstream block
0x44f8f53, local chain31337. Реальные V1 swaps → локальная registration → typed
source admission → whole-block scan/replay. 8 блоков, две покупки 1+2 USDG,
carry3000000, entries0 (порог100USDG). Искусственный только стартовый USDG кошелька;
router/pools не подменялись. 312 read requests, 5 retries, 0 RPC errors.
Evidence: [fork admission](../research/pair-auto/fork-admission-2026-09-25.json).
Draw/scheduler этим fork не проверены. Future extension проверен синтетически,
а не публичной activation transaction. Первый harness run имел string/bigint assert
error; исправленный новый run прошёл, неудача не скрывается.

## 4. Главный результат сверки: поколения пока не состыкованы

V1 AUTO работает с V1 hook/stock pools; проверенный FeeRouter source использует
native Launch V2 vault/epoch API. V1 locker не является тем же источником.
Нельзя рекламировать нашу текущую сборку как готовый launch→BUY→revenue deployment.

Кандидат первого согласованного профиля: native V2, один TOKEN/USDG pool, mode1,
FeeRouter единственный recipient=10000 bps. Это рекомендация для fork, не утверждённый
deployment. 10000 здесь означает всю recipient allocation, не все комиссии пула.

Fresh audit 26.09: RPC chain4663/block72884069, стабильный anchor. Registry.currentCoordinator
совпал с native API; currentHandler(1)=version5/enabled. Runtime старых audited
registry/handler/factory/coordinator/hook совпал. Проверен implementation slot
launchpad proxy. Старый launchV2Coordinator getter не выбирает native path:
launchV2Token обращается к selected registry.currentCoordinator.
API прочитан отдельно на более позднем блоке, не называем его атомарным RPC snapshot.
Evidence: [dependency snapshot](../research/pair-dependency-audit-2026-09-26.json).

Текущий UI bundle содержит V1 aggregator config. Это наличие config, **не доказательство
маршрута конкретной кнопки с кошельком**. Native readiness API ready=true;
standard-route API ранее вернул503, что не означает недоступности всей native ветки.
Новый launch и browser wallet flow ещё не исполнялись.

## 5. Точная денежная цепочка и внешняя власть

Для проверенного mode1 VaultV2:
1. Native launch modeConfiguration = encoded recipients/shares; пустая config
   отдаёт allocation creator. Нужен явный FeeRouter recipient.
2. Launch fee сейчас0.0005ETH плюс gas и developer buy; fee изменяемая. Pool engine
   создаёт одностороннюю TOKEN liquidity, NFT держит vault. Не обещаем итоговую стоимость
   запуска до полного preflight quote eligibility/feeds/economics/protection.
3. V4 pool fee10000 =1%, не второй hook tax сверху. Доход зависит от комиссии,
   действительно заработанной нашей позицией, не любого оборота TOKEN во всех пулах.
4. collect: floor(assetAmount*7000/10000) получателям, остаток protocolTreasury.
   Mode1 accrues claimable TOKEN/quote. Buyback/burn относится к другим mode.
5. FeeRouter claim → наша campaign allocation → converter → USDG reserves.
   External USDG funding и уже профинансированные призы не требуют поступления PAIR fees.

Неизменяемый vault не означает неизменяемых recipients. Действующий registry имеет
owner-only communityTakeover: mode1 eligible, замена recipients без consent creator
и без timelock в этой функции. Atomic transition сначала collects старую epoch,
затем открывает новую; old claimable сохраняются. Fresh reference reads подтвердили
ctoEligible=true, atomicTransition=true. Для mode1 не нашли opt-out через config.
Это описание capability, не обвинение PAIR в намерении ей злоупотреблять.

Проверенная factory создаёт прямой VaultV2; upgradeVaultImplementation всегда revert.
TOKEN factory использует clone с фиксированным implementation, source/runtime сверены.
Не смешивать upgrade launchpad для будущих запусков с заменой существующего vault/TOKEN.
Нет нашего способа забрать LP из vault или восстановить отозванную future allocation.
Даже если интерфейс/доход PAIR сломается, наше ядро Promo не должно автоматически умирать.
Но экономическую независимость от источника дохода кодом изобразить нельзя.

## 6. Что уже переживаем, а что нет

FeeRouter.bindSource одноразовый; TOKEN/USDG immutable. Принадлежность position
проверяется оператором по launch receipt, сам bind не доказывает её полностью.
rollCampaign требует прежней sourceEpoch и успешного collect/claim: CTO смена epoch
блокирует rollover даже при том же recipient. Это сохраняет принятую accounting boundary,
но не является recovery. Старые harvest/credits/pay не удаляются.

local-prize-flow раздаёт уже полученные средства до collect, пропускает collect при
смене epoch, пытается забрать старые claimable; definite transaction rejection изолирует.
Но source.epoch/claimable read error обрывает остаток prize pass, включая conversion.
Без ops coordinator выполняет prize до draw, и error остановит pass. С ops draw идёт
раньше, но это ещё не полная изоляция. Unknown broadcast/shared signer pending нельзя
просто проигнорировать ради живости: receipt reconciliation остаётся обязательной.

Ранее source fork использовал чужой reference vault; локальная impersonation PAIR
controller дала FeeRouter allocation. Это доказало collect/claim ABI и наш rollover,
**не право обычного creator создать такую связку**. Следующий launch fork должен
использовать настоящий публичный launch entrypoint без impersonation PAIR owner.
Адрес TOKEN можно предсказать, развернуть FeeRouter заранее, затем указать его recipient;
vanity salt5555 и все actual launch prerequisites надо пройти реально на fork.

## 7. Предложенный порядок

1. Новый native mode1 TOKEN/USDG launch на fork → FeeRouter → BUY→collect→claim;
   подтвердить единую конфигурацию, не развивать все поколения PAIR одновременно.
2. Изолировать source failures от уже профинансированных draw/conversion/claims,
   сохранив shared signer/unknown-send safety. Добавить targeted regression tests.
3. Pinned deployment manifest/автоматический health check: наш vault, pool/position,
   epoch/recipients, runtime/implementation, RPC. Latest PAIR API не hot config.
4. Отдельно решить recovery epoch/source, не ослабив atomic campaign accounting.
5. Вернуться к автоматической eligibility и payout из прошлого письма как явным
   релизным задачам. Не терять их и не называть текущий opt-in код новым поколением.

## 8. Вопросы, где нужна твоя независимая оценка

1. **Профиль запуска:** подтверждают ли actual source/API нашу связку mode1 TOKEN/USDG
   + FeeRouter? Какие конкретные prerequisites способны сорвать proposed launch fork?
   Не достаточно слов «API ready». Есть ли более простой путь в текущем PAIR release,
   который действительно сохраняет наш доход и упрощает BUY attribution?
2. **CTO:** правильно ли прочитана полномочная цепочка? Есть ли реальный opt-out/другая
   подходящая fee-sharing ветка без recipient replacement, которую мы пропустили?
   Если нет, достаточно ли pin/monitor + честной зависимости, не строя новый launchpad?
3. **Recovery:** безусловный переход на новую epoch ломает наш accounting смысл.
   Что минимальнее: явно проверяемое принятие epoch при том же recipient или новый
   source/router для будущего дохода с сохранением старых долгов? Проверь реальные
   downstream authorizations. Не предлагай escape hatch, который обходит обязательный
   final collect, или arbitrary source swap под видом технического исправления.
4. **Изоляция:** где провести границу recoverable source read failure и ошибок,
   требующих остановки всего pass? Как не замаскировать asset deficit/неизвестную tx?
   Дай небольшой набор обычных сценариев, не универсальный retry framework.
5. **BUY coverage/economics:** нет ли в AUTO decoder double-count/provenance лазейки,
   особенно gross funding с conversion fees, payment-time registration и 2 legs?
   Насколько полезно продолжать V1 после выбора V2 кандидата? Мы предлагаем остановиться
   на проверенном V1 объёме, а следующую поддержку делать по реальному native launch.
6. **Продуктовый хвост:** в каком месте плана вернуть automatic eligibility/payout,
   чтобы не зарелизить несовместимые обещания? Это отдельное поколение правил, не
   ретроактивное изменение snapshots. Нужна очередность, не немедленный rewrite всего.
7. Не оставили ли мы более серьёзный обычный отказ, чем перечисленные? Для каждого
   замечания дай файл/функцию, конкретный trigger, влияние и минимальное исправление.
   Раздели доказанный defect, внешнюю trust assumption и требующее решения пожелание.

Нужен короткий вердикт, затем приоритеты и один законченный следующий пакет.
Не соглашайся автоматически с нашими выводами. Редкие крайности не должны породить
новые proxy, emergency admin или перераспределение frozen/claimable. Адресные тесты
предпочтительнее full suite; окруженческую ошибку отмечай отдельно от дефекта кода.
