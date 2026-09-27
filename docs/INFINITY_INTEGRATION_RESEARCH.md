# Infinity: исходники и реальные комиссии

## Новый TOKEN/USDG fork с3%, 27.09.2026

Пользователь выбрал creator policy fee300bps; [PRODUCT_SPEC](PRODUCT_SPEC.md).
Новый proof выполнен через публичный Infinity launchpad обычным creator:
launch → зарегистрированный single TOKEN/USDG pool → BUY → contract claim → SELL →
contract claim. Zero developer buy разрешён этим entrypoint. Launch fee0.0005ETH,
gas отдельно. Proxy implementation и runtime hook/engine/adapter проверены перед запуском;
engine.validateLaunchpad подтвердил graph. Это привязка конкретного fork, не всех releases.

Исходный блок `0x4659bc4`, локальная сеть31337. Не было impersonation, изменения PAIR
code/permissions или подмены policy. Искусственно пополнен только USDG покупателя,
локальные signers имеют sandbox ETH. Стартовые ticks±400000/±380000 — явно тестовая
цена/ликвидность, minOut1; protection выключена явно в launch params, vanity не добывался.
Это не рекомендация этих параметров для deployment или UI-equivalence proof.

| Шаг | USDG |
|---|---:|
| BUY: actual pool input | 100.000000 |
| BUY: комиссия проекта3% | 3.000000 |
| BUY: комиссия PAIR0.3% | 0.300000 |
| BUY: полные затраты кошелька без газа | 103.300000 |
| SELL: quote output до hook fees | 97.808425 |
| SELL: комиссия проекта3% | 2.934252 |
| SELL: комиссия PAIR0.3% | 0.293425 |
| SELL: фактически получено покупателем | 94.580748 |
| Получено нашим receiver за две сделки | 5.934252 |

Полностью проданы купленные22894601.471716987657194988 TOKEN. В обеих Swap fee11098pips,
т.е.1.1098% pool fee, уже отражённой в amounts, а не ещё одна доплата к103.30.
Из этой единственной round-trip нельзя выводить ожидаемую прибыль/убыток трейдера:
цена/impact зависят от сценария; gas не учтён.

Receiver — [локальный fixture](../research/infinity-source-audit/LocalInfinityReceiver.sol),
разрешён только chain31337. Owner однократно привязывает vault; любой caller вызывает
фиксированный claim для USDG, полученные деньги остаются в receiver. Вывода нет.
Не production collector и не новый способ пополнения PromoVault. Проверены совпадение
recipient/fee, balance delta, очистка claimable, NoClaim при повторном пустом claim,
нулевые остатки USDG/TOKEN в swap adapter и USDG в fee vault после выплат.
Вызовы pull совершал buyer, не owner: внешнюю автоматизацию можно подключить без
права распоряжаться полученными средствами. Текущий FeeRouter не менялся.

Команды:

```powershell
node scripts/infinity-launch-fork.cjs NEW_OUTPUT.json
node --test test/infinity-launch-evidence.test.cjs test/native-launch-evidence.test.cjs
```

Fork complete:333upstream requests/4retries/0errors. Offline4/4,159ms; full не запускался.
Лог `.local/logs/infinity/fork-evidence-tests.log`.
[Evidence](../research/infinity-source-audit/fork-success-2026-09-27.json) включает raw
tx/receipts, params, anchors и суммы. Проверки включены в full/accounting профили.
Первая попытка закончилась до launch из-за отсутствующей локальной TickMath dependency;
добавлены точные исходники TickMath/BitMath/CustomRevert из Sourcify engine package,
вторая попытка успешна. Product compilation/dependencies не менялись.

Следующий ограниченный шаг: production модель Infinity collector и кампаний, затем
подключение USDG к существующему funding path. До реализации определить invariant
финального claim при rollover и реакцию на внешнюю policy drift. Decoder/admission,
automatic participation и payout по-прежнему не проверены этим fork.

## Первичное исследование до выбора3%

27.09.2026. На момент исследования выбор запуска не был сделан; production код не менялся.
Дополняет [сценарии1–5%](INFINITY_FEE_SCENARIOS.md).

## Доказательства

Получены Sourcify исходники hook, engine, adapter, Creator Vault: exact_match.
Их onchainBytecode hashes совпали с RPC code на блоке73756855 (hash сохранён).
Сохранены реальные BUY/SELL из примера PAIR, исходники/ABI и результаты:
[research/infinity-source-audit](../research/infinity-source-audit/evidence-2026-09-27.json).
Исторические транзакции проверены арифметически, не переисполнены; исторический code
отдельно не сопоставлялся. Полный граф launchpad/deployer/manager не аудирован.

Источники: [PAIR docs](https://pair.fund/docs),
[hook](https://sourcify.dev/server/v2/contract/4663/0x647895e9ba75a4747d8a7Ed1dd56Ee8b7B9e3067?fields=all),
[adapter](https://sourcify.dev/server/v2/contract/4663/0x6ACe84C6D8D286E55933774bCe9c97aB7A107df5?fields=all),
[Creator Vault](https://sourcify.dev/server/v2/contract/4663/0xfd1150C49eEe28f9f8f007F8819a0A793aAFC31D?fields=all).

## Fee base и полная нагрузка

Для exact-input BUY в quote-режиме hook считает policy и protocol fees от заданного
amountSpecified по отдельности с floor. Adapter требует gross input сверх суммы,
идущей в pool: на100 единиц pool input при3% нужно ещё3+0.3 единицы.
У SELL exact-input quote является выходом: проценты считаются от фактической
положительной quote delta pool и удерживаются из неё. Обе операции платят quote.
Для100 gross средств BUY база меньше100: примерно100/(1+f+0.003).
Это уточнение прошлой модели, где V явно означал fee base, а не расход кошелька.

В сохранённом BUY: база7440375325612 raw quote; проекту372018766280,
протоколу22321125976; inputMaximum7834715217868 — ровно сумма трёх величин.
В SELL база7276146977795; проекту363807348889, протоколу21828440933.
Это один пример с5%, quote не USDG. Не переносим raw decimals на доллары.

Отдельно pool Swap сообщает fee11098 pips =1.1098%, protocolFee1109 pips.
PoolKey fee10000 =1%; ProtocolFeeLibrary сочетает pool protocol fee и LP fee:
1109+10000-floor(1109*10000/1e6)=11098. Поле protocolFee уже учтено в11098,
ещё раз его прибавлять нельзя. Это не те же0.3%, которые отдельно берёт PAIR hook.
Размер pool protocol fee для нашего будущего пула ещё нужно прочитать отдельно.

Иллюстрация buy→sell при постоянной цене, без gas/impact, с одинаковым pool fee
p=1.1098% на каждой стороне и h=f+0.3%:
остаток от100 =100*(1-p)^2*(1-h)/(1+h).

| Policy fee | Остаток из100 | Рост цены для выхода в ноль |
|---:|---:|---:|
| 1% | 95.28 | 4.95% |
| 2% | 93.40 | 7.07% |
| 3% | 91.54 | 9.24% |
| 4% | 89.73 | 11.45% |
| 5% | 87.95 | 13.70% |

Это аналитический сценарий с pool fee из примера, не исполненный quote для нашего
токена. Первая таблица без pool fee недооценивала полную нагрузку. Поступления в призы
при фиксированной fee base остаются прежними; при фиксированном gross BUY меньше база.

## Получение денег контрактом

Engine принимает произвольный ненулевой recipient для creator mode и передаёт его
factory.deployCreatorVault; EOA-only проверки в этом пути нет. Hook отправляет fees
в аттестованный PAIR vault и вызывает recordFee в swap-транзакции. Прямо поставить
наш обычный FeeRouter вместо policy.destination нельзя: это должен быть валидный vault.
Наш контракт может быть recipient этого vault, если умеет вызывать claim(address[]).
Creator Vault учитывает claimable[recipient][asset], платит исключительно msg.sender,
обнуляет credit перед transfer; нулевой claim ревертит. LP collect для этих hook fees
не нужен. Автоматизация требует внешнего worker, вызывающего наш permissionless pull.

Текущий FeeRouter ожидает collectFees(positionId), claimable(epoch,recipient,asset)
и claim(asset,epoch), поэтому ABI несовместим. Не привязывать его как recipient до
проверенного механизма claim: иначе он не сможет получить причитающиеся деньги.
Призовые резервы/Short/Monthly этим отличием сами по себе не затрагиваются.
Наш будущий collector должен проверять source/policy, zero claim, полученный balance
delta и атомарную границу кампаний; без arbitrary calls/вывода призовой казны.

## Изменения политики и торговые маршруты

Creator Vault содержит onlyAdmin appendPolicy. У исследованного vault admin — factory,
а не кошелёк creator. В прочитанном factory нет публичного wrapper для appendPolicy:
наличие метода у vault не доказывает доступность изменения получателя для пользователя.
Hook frozen=true, registrar=engine, owner=0x18Fe9694a335C8b42D228147eDdAC524748300eA.
schedulePolicy всё ещё допускает owner и проверяет attestation. Frozen здесь не
означает отсутствие всякой изменяемости. Не обещать ни нашу свободу смены ставки,
ни абсолютную неизменность внешней policy без проверки полного пути управления.

Swap hook требует от caller settlement callback. Проверенный BUY вызвал PAIR Infinity
adapter, SELL прошёл через ETH coordinator с тем же adapter. Это не подтверждение
работы любого стандартного Pancake router. Наш Uniswap decoder нельзя переименовать:
другие PoolKey/manager/Swap ABI, funding и callback. Новый узкий adapter должен
доказывать payer/recipient и фактическую базу билетов; hook fees нельзя молча добавить
в nominal BUY amount старых правил. Расширения admission остаются версионированными.

## Проверки и следующий кусок

`node scripts/verify-infinity-evidence.cjs`: обе реальные receipts, fee formulas и
сохранённые runtime hashes проверены, exit0. Offline consistency не удостоверяет RPC.
Продуктовые тесты не запускались: runtime продукта не менялся.

Следующий ограниченный proof: новый single TOKEN/USDG Infinity launch на fork,
creator recipient — минимальный контракт с claim; BUY→SELL→получение USDG этим
контрактом. Проверить gross/net, pool fee, отсутствие остаточных долгов. Без внедрения
новой prize математики и без обещания универсальных маршрутов. Сначала закрыть
этот путь, затем выбирать между V2 и Infinity и проектировать production collector.
