# PAIR: денежная цепочка и границы изменений

26.09.2026. Read-only аудит выбранного кандидата: native Launch V2, mode 1,
один TOKEN/USDG pool. Это не утверждение deployment-профиля и не полный аудит PAIR.
[Снимок RPC/API](../research/pair-dependency-audit-2026-09-26.json),
[предыдущая сверка поколений](PAIR_LAUNCH_COMPATIBILITY.md).

## Что подтверждено сейчас

Chain 4663, block 72884069, hash в evidence, повторный anchor совпал.
Runtime семи ранее изученных контрактов совпал с source-audit manifest:
registry, mode-1 handler, factory, coordinator, hook, implementation launchpad,
legacy locker. EIP-1967 slot действующего launchpad указывает именно на проверенный
implementation. Registry.currentCoordinator совпал с native API; currentHandler(1)
вернул handler 0x8db100…7864f, version 5, enabled=true. Launch enabled=true.
API получен отдельно, на более позднем блоке; это не единый атомарный API/RPC snapshot.

Старый launchV2Coordinator getter не выбирает native маршрут: launchV2Token
читает coordinator из выбранного registry. Поэтому ранее обнаруженное различие
адресов не является ошибкой привязки.

Token factory и её immutable implementation дополнительно получены из Sourcify:
exact_match и совпадение on-chain runtime hashes. Исходники сохранены в
[research/pair-dependency-audit](../research/pair-dependency-audit/).
Это проверка опубликованных исходников по runtime, не независимая перекомпиляция.

## Денежная цепочка

1. Создатель вызывает native launchV2Token с modeId=1. modeConfiguration содержит
   ABI-encoded address[] recipients и uint16[] shares. Пустая config означает
   creator=10000; нам нужен явно заданный FeeRouter=10000. Поля старого fee-sharing
   entrypoint нельзя механически переносить в native launch.
2. Текущая launchFeeWei — 500000000000000, то есть **0.0005 ETH**, отдельно от gas
   и developer buy. Значение изменяемое, перед запуском перечитать. msg.value равен
   launch fee + developerBuy.ethAmountIn. Полный preflight запуска ещё не выполнен.
3. Factory выпускает fixed-supply TOKEN (1 млрд), адрес предсказуем по creator/salt,
   требуется suffix 5555. Можно сначала вычислить TOKEN, затем развернуть FeeRouter
   с этим адресом, затем launch с FeeRouter в recipients. Это план для fork,
   пока не доказанная сквозная процедура. Повторное initialize запрещено.
4. Pool engine размещает одностороннюю TOKEN liquidity в V4, position NFT получает
   vault. Не требуется заранее равная долларовая сторона LP; developer buy — отдельная
   покупка. Параметры диапазона зависят от текущих launch economics/feeds/registry.
5. Swap в данном пуле имеет fee=10000 (1%), tickSpacing=200. Это LP fee, а не
   отдельный 1% налог hook поверх неё. Native hook наблюдает swap; его swap callbacks
   не изымают дополнительную комиссию. Другие пулы токена не обязаны кормить наш vault.
6. collectFees снимает комиссии позиции без снятия LP. Для каждого полученного актива
   vault выделяет floor(amount*7000/10000) mode-получателям, остаток protocolTreasury.
   Mode 1 создаёт recipient claimable; mode 2 — другой путь buyback/burn.
   Следовательно, **у проверенного mode-1 VaultV2 тоже 70/30**, но это вывод из его
   кода, а не перенос старой V1 политики на все поколения.
7. FeeRouter как единственный recipient получает 100% от этих 70%, через claim.
   Это TOKEN и/или USDG, не обещание USDG на всю сумму оборота. При условных $1000
   комиссий, действительно собранных нашей позицией: $700 эквивалента получателям,
   $300 PAIR. Оценка 0.7% оборота применима лишь при соответствующей доле активной LP
   и маршруте через этот пул. Это не 0.7% любого перевода/торговли TOKEN.
8. Наш FeeRouter отдельно распределяет полученное по своей campaign policy;
   converter меняет призовой TOKEN на USDG; PromoVault ведёт Short/Current/Next.
   Три recipient slots FeeRouter не являются этими тремя резервами. External USDG
   funding PromoVault не требует PAIR. Призовая custody не источник project gas.

## Что PAIR может поменять

| Граница | Последствие для уже созданного mode-1 проекта |
| --- | --- |
| UI/API, новый aggregator | Может измениться покупательский маршрут; старые контракты сами от этого не исчезают. Наш decoder не должен молча принять новый путь |
| Upgrade launchpad, новый coordinator/handler, launch fees/feeds | В первую очередь меняет будущие запуски. Нельзя автоматически заменить адреса уже работающего проекта значениями latest API |
| Factory upgradeModeVault | У проверенной mode-1 factory upgradeVaultImplementation всегда revert; существующий VaultV2 не proxy |
| Registry.communityTakeover | **Owner registry может заменить recipients существующего mode-1 vault без согласия creator и без timelock в этой функции** |
| Atomic fee transition | Сначала collect всех позиций в старую epoch, затем новые recipients/epoch. Старые claimable остаются; при collect failure весь переход revert |
| TOKEN implementation | Factory создаёт clone с фиксированной implementation; setter для её замены нет. Initial protection копируется при запуске; дальнейшего чтения launchpad для обычной торговли в изученном TOKEN нет |

CTO — реальная capability, не предположение о намерениях PAIR: на reference TOKEN
0x2b9495…5555 свежие чтения дали mode1, epoch1, ctoEligible=true,
atomicTransition=true и правильный registry→vault. В mode-1 resolve eligibility
не отключается пользовательской config. Это означает: будущий доход PAIR не является
неотзываемым правом нашего проекта. Наш код не может восстановить чужую allocation.

Mode-1 vault не даёт нам вывести/перенести LP. Новый backend/adapter не переносит
ликвидность и не создаёт право на старые комиссии. Direct transfers в PAIR vault
не являются штатным funding: его collection учитывает полученную при collect дельту.
Сбой asset transfer в protocolTreasury также способен откатить collect.

## Как сегодня реагирует наш код

- FeeRouter.bindSource одноразовый, assets неизменяемы; позицию оператор обязан сверить
  с launch receipt. Сам bind не доказывает принадлежность position vault/pool.
- rollCampaign требует неизменной sourceEpoch и успешного collect/harvest. После CTO
  rollover будет revert даже если PAIR оставил тот же FeeRouter получателем.
- harvest старой epoch, sync и pay уже заработанных credits остаются доступны;
  их выполнение всё ещё зависит от работоспособности соответствующих ERC20/vault.
- local-prize-flow сначала раздаёт уже имеющиеся средства, при epoch mismatch
  пропускает collect и пытается забрать старые claimable. Definite collect rejection
  изолируется; это уже полезная защита.
- Но read failure source.epoch/claimable выходит как error и пропускает последующие
  действия этого prize pass, включая conversion. Coordinator без ops выполняет prize
  раньше draw и при error останавливает pass; с ops draw идёт первым. Полной независимости
  нет. Unknown broadcast/shared signer pending намеренно останавливает отправки:
  обходить reconciliation ради живости нельзя.
- Уже frozen/claimable PromoVault не переписываются PAIR. Потеря дохода означает
  ожидание накопления новых бюджетов; это не основание отменять старые выигрыши.
- Наш AUTO decoder пока V1; его нельзя считать native V2 поддержкой. Для нового
  release нужна доказанная receipt-семантика, а не просто новый адрес в whitelist.

## Минимальная стратегия устойчивости — следующий план, не реализация

1. **Доказать старт**: local fork нового TOKEN/USDG mode1 с FeeRouter recipient,
   настоящим launch entrypoint, BUY→collect→claim. Без impersonation PAIR owner.
   Проверить quote eligibility, launch protection, стоимость и выбранный BUY маршрут.
2. **Изолировать источник в worker**: подтверждённая недоступность PAIR/read failure
   не мешает тратить уже доступный призовой бюджет/конвертировать уже полученный TOKEN.
   Shared RPC outage и unknown transaction остаются отдельными блокирующими состояниями.
   Тесты: source read revert, collect revert, epoch change, сохранение claims и draw pass.
3. **Pinned deployment manifest + автоматический read-only health check**: сеть,
   TOKEN, vault/position/pool key, handler/version, runtime и clone implementation,
   epoch/recipients, доступность RPC. Различать changes future launch и changes нашего
   источника. Не брать latest PAIR API как live-конфигурацию. Показывать причину ожидания.
4. **Отдельно спроектировать recovery accounting**. Нельзя просто разрешить owner
   заменить vault/epoch: это нарушит принятую атомарную границу кампаний. Сохранить
   старый router/долги и проверять новый источник независимо — кандидат, но downstream
   authorizations и campaign attribution ещё надо проверить. Автопринятия чужой epoch нет.
5. BUY routes расширять будущей проверенной policy без изменения старых snapshots;
   новые неизвестные покупки честно обозначать unsupported. Источник дохода, BUY evidence
   и конверсия — разные зависимости, не менять их одним глобальным переключателем.

Таким образом, обновление PAIR не должно требовать замены ядра Promo. Но обещать
сохранение прежней выручки или перенос запертой LP при любом решении PAIR нельзя.
Отдельного универсального proxy/админа призовой казны для этого не добавляем.

## Пределы проверки

Сеть читалась через Blockreq RPC; публичных sends, нового launch/fork и продуктовых
тестов в этом шаге не было. Runtime не менялся. Источники: [PAIR docs](https://pair.fund/docs),
[native manifest](https://pair.fund/api/v5-v2/native-fee/consumer-live), Sourcify URLs
в evidence и историческом source-audit manifest, локальные FeeRouter/worker исходники.
PoolManager/PositionManager/USDG, все поколения маршрутов и полный permission graph
buyback/holder-distribution этим аудитом не покрыты. Режимы 2/3 для этой схемы не нужны.
