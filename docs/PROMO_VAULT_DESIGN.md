# PromoVault — USDG funding и обеспеченные призы

Обновлено 13.09.2026. [Продуктовая спецификация](PRODUCT_SPEC.md), [карта реализации](IMPLEMENTATION_STATUS.md). Исходник: [PromoVault.sol](../contracts/PromoVault.sol). Это локальный прототип, не production controller и не публичный deployment.

## Граница этапа

Реализованы внешнее USDG funding и три свободных продуктовых резерва. Существующие reserve/finalize/claim связаны с ними бухгалтерски. Creator revenue allocation, конвертация, entries, короткая/месячная случайная логика, RNG и новый controller не добавлены. FeeRouter не менялся.

Новый constructor: `PromoVault(token, quote, controller, nextStartTarget)`. Активы различны и ненулевые, controller должен иметь код, target положителен и задаётся в raw units quoteToken. Target immutable, setters нет. Старые вызовы constructor с тремя аргументами несовместимы; локальные tests и текущий fork-script обновлены. Proxy/migration живого экземпляра нет.

**Next сейчас только наполняется.** В этой версии нет перехода Next → Current и изменения target: это следующий отдельный этап. Не использовать этот промежуточный контракт для живых призовых средств.

## Состояние и инварианты

```text
S = freeShort
C = freeCurrent
N = freeNext
T = nextStartTarget
R = reserved[USDG]
L = claimable[USDG]
U = unrecognizedUSDG()
B = фактический balanceOf(vault)

B = S + C + N + R + L + U
0 <= N <= T
```

`available(USDG) = B - R - L = S + C + N + U` — весь незакреплённый баланс, **не доступный бюджет конкретного draw**. Для draw используется только выбранный S или C. Если B не покрывает уже учтённые S+C+N+R+L, методы отклоняются с BalanceDeficit. Новое fundUSDG не маскирует существующий дефицит. Rebasing и fee-on-transfer не поддерживаются.

TOKEN сохраняет прежнее per-asset available/reserved/claimable поведение для существующих локальных интеграций. Оно не означает возврат TOKEN-призов в актуальную продуктовую концепцию. Общего денежного баланса TOKEN+USDG нет.

## Funding API

`fundUSDG(amount, destination)` — permissionless; transferFrom только msg.sender. Значения destination: GENERAL=0, SHORT=1, CURRENT=2, NEXT=3. Нужен allowance на quoteToken, amount > 0. Прежде обрабатываются старые direct transfers; затем измеряется только новый balance delta. Для обычного ERC20 ожидается delta == amount; несовпадение целиком откатывает вызов, включая прежний sync и перевод. Это сознательный отказ от transfer-fee токенов, а не обещание их поддержки.

- GENERAL: 3:2:1 с ограничением Next по T; его overflow идёт Current.
- SHORT: вся сумма Short.
- CURRENT: вся сумма Current.
- NEXT: только room до T в Next, всё остальное Current.
- Project fee отсутствует во всех четырёх вариантах.

`syncUSDG()` — permissionless. Распределяет U как GENERAL; при U=0 ничего не меняет. `unrecognizedUSDG()` показывает U без изменения состояния.

Прямой ERC20 transfer не несёт назначения. Опубликованное правило контракта — GENERAL. Для целевого funding нужен fundUSDG. В USDGAllocated для распознанного прямого перевода payer=zero: вызывающий sync не объявляется спонсором. Положительный U может объединять переводы нескольких отправителей.

Старый прямой USDG перевод от FeeRouter.pay также обрабатывается как GENERAL: receiver не знает экономическое происхождение баланса. Это не реализация project share или нового creator allocation. Призовой TOKEN не конвертируется и не учитывается этим API.

## Точное округление

GENERAL использует непрерывную последовательность минимальных единиц:

```text
SHORT, CURRENT, SHORT, CURRENT, SHORT, NEXT
```

`generalFundingPhase` хранит следующую позицию, от 0 до 5. Целые группы по шесть единиц считаются арифметически; хвост имеет максимум пять итераций независимо от суммы. Это работает и на максимальном uint256, без накопительного счётчика общего lifetime funding.

В полном цикле ровно 3/2/1. При заполнении Next его единицы идут Current. Фаза продолжает двигаться; targeted funding, резервирование, освобождение draw и claim её не меняют. Повторный sync не дублирует поступления.

Для суммы X, начиная с нулевой фазы, Short=ceil(X/2), nominal Next=floor(X/6); остаток Current с учётом cap Next. Для следующего вызова учитывается уже сохранённая фаза. Это намеренно не floor(X/2) заново для каждого вызова.

Каждая raw unit сразу назначена ровно одному резерву. Дробление последовательного общего funding сохраняет итог при одинаковом порядке относительно остальных операций. Перестановка targeted NEXT между общими поступлениями может изменить остаточную ёмкость Next — это изменение входных условий, не rounding bug. Нельзя приписывать микродолю конкретному спонсору независимо от общей фазы.

## Резервирование draw

`reserveUSDG(drawId, campaignId, source, budget)` — только существующий immutable drawController, nonReentrant. Source: SHORT=0 или CURRENT=1. NEXT отсутствует в enum и не может использоваться для draw.

Метод синхронизирует прямой USDG, затем списывает budget из выбранного свободного резерва, увеличивает reserved и запоминает source в `usdgDrawSource(drawId)`. Требуются уникальный ненулевой drawId, положительные campaignId/budget, достаточный выбранный резерв. Любой отказ откатывает в том числе sync и списание source.

Старый `reserve(drawId,campaignId,asset,budget)` сохраняет TOKEN-путь; для USDG возвращает UseUSDGReserve. Это закрывает обход продуктовых резервов через общий available.

Никакие новые поступления не меняют уже записанные budget, source и asset draw. Current-поступления после резервирования увеличивают свободный Current; будущий monthly controller должен определить принадлежность этого остатка циклу. Сами jackpot cycles сейчас не реализованы.

## Finalize и claim

`finalize(drawId,winners,amounts)` — тот же controller, один раз после reserve. Проверяется весь список атомарно: ненулевые допустимые winners и суммы, отсутствие дублей, общая сумма не выше budget. При ошибке нет частичных назначений.

Для USDG весь budget уходит из reserved, сумма наград переходит в claimable, `budget - awarded` возвращается именно в исходный Short/Current. Возврат остатка не является новым GENERAL funding и не пополняет Next. Пустой результат возвращает весь budget и закрывает draw, но допустимость no-winner должен доказывать будущий controller.

`claim(drawId,winner)` — любой caller, выплата только уже записанному winner. CEI, SafeERC20, ReentrancyGuard; transfer failure сохраняет долг. Невостребованный приз не сгорает и не блокирует другие claims или reserve. Claim не меняет свободные S/C/N и не создаёт U повторно.

## Граница доверия и ограничения

Owner withdrawal, произвольные переводы, fee, смена controller и rescue не добавлены. Но controller по-прежнему определяет список winners; код по адресу controller не доказывает честность. DrawControllerFixture намеренно произвольный, только для тестирования.

`campaignId` — metadata, не проверка расписания или policy FeeRouter. Полная финализация O(N), без Merkle/batching; production предел списка не выбран. Продуктовое отклонение кандидата из-за бюджета выполняется будущей логикой **до** передачи winners в finalize; vault не обрезает невалидный список и не меняет результаты сам.

## Проверки

13.09: 20 PromoVault tests, включая 11 новых; полный набор — 36 контрактных tests (16 FeeRouter + 20 PromoVault). Отдельная offline farming-модель имеет 9 tests и не проверяет актуальный production draw.

Новые проверки: general/targeted overflow, direct transfer перед targeted, повторный sync, все шесть фаз и дробление до/после Next cap, сохранение фазы, изоляция source/reserved/claimable, атомарный rollback reserve/finalize/fund, invalid enums, входящая/исходящая reentrancy, short transfer rejection, дефицит свободных средств и максимальный uint256.

`npm test` включает локальную интеграцию реального FeeRouter с новым PromoVault и mock PAIR; внешняя сеть не нужна. Fork-script адаптирован к новому constructor/reserveUSDG, но **новый RPC/fork в этом этапе не запускался**. Старые fork-данные в архиве проверяли предыдущее API.
