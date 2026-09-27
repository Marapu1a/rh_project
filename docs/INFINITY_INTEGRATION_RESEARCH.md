# Infinity: исходники и реальные комиссии

27.09.2026. Read-only исследование; выбор запуска не сделан, production код не менялся.
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
