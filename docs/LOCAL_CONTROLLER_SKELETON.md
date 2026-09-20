# Локальный скелет контроллеров

19.09.2026. Следующий этап после независимого аудита: собираем исполняемый контур,
не объявляя нерешённые trust assumptions решёнными. Реальных средств и deployment нет.

## Что соединено

`LocalShortController` и `LocalMonthlyController` используют существующие settlement
компоненты и один `DualControllerPromoVault`. Денежная математика не менялась.
Обёртки выделены из size study; старые исследовательские файлы остаются историческим
экспериментом, а новые входят в обычную компиляцию и тестовый набор.

```text
external USDG funding → free reserves
synthetic participants → begin → publish chunks → Ready
permissionless seal → reserve + asynchronous random request (atomic)
fixed provider callback → one seed
permissionless process chunks → finish → claimable USDG → claim
next cycle (old unpaid claims remain payable)
```

Это полный локальный путь от funding и готового списка до получения приза.
Покупки/индексер ещё не подключены к этому сценарию: snapshotHash и attempts синтетические.
Тест не доказывает правильность начисления билетов по BUY и не доказывает их глобальное
неповторное использование; для этого существуют отдельные replay-компоненты и будущая интеграция.

## API и роли

- Governor через существующий Ownable2Step объявляет будущие правила и предлагает
  нового publisher; publisher должен сам принять назначение.
- Publisher вызывает `begin`/`publish`/`supersede`/`closeEmpty` (Monthly — соответствующие
  `beginMonth`/`publishMonth`/`supersedeMonth`). Supersede допустим только до freeze.
- Любой исполнитель вызывает `seal`/`sealMonth`, `processShort`/`processMonth`,
  `finishShort`/`finishMonth`, активацию созревших правил и получение призов через vault.
- Только immutable randomProvider вызывает `fulfill(requestId, seed)`.
  Governor и publisher не имеют ручного seed/reset/cancel или withdrawal призов.

`ILocalRandom` — маленький интерфейс локального асинхронного транспорта:
`ready`, `fee`, `request(context) → nonzero unique requestId`.
Это **не утверждённый API drand** и не алгоритм выбора future round.
`LocalRandomFixture` находится в test/contracts: любой тестовый актор может задать seed.
Конструкторы обеих обёрток и провайдера требуют chainId 31337, чтобы не принять этот
контур за готовый deployment в Robinhood. Это предохранитель, не доказательство безопасности сети.

## Сохранённые границы

- Reserve и request в одной транзакции: ошибка request откатывает freeze и бухгалтерию.
- Один requestId связан с одним draw/context; неизвестная, чужая или повторная доставка
  отвергается. Нулевой seed разрешён. Замены провайдера/seed/запроса после freeze нет.
- Синхронный callback внутри request заблокирован; delivery выполняется отдельной
  транзакцией после сохранения связи. Если провайдер поймал отказ callback и вернул
  нормальный requestId, последующая асинхронная доставка остаётся возможной.
- Число `cutoffDelayBlocks` — только задержка в блоках, **не finality**.
- Readiness проверяет ready провайдера, цену газа и native balance для fee + floor.
  Floor не является рассчитанным бюджетом всего settlement, газ исполнителей оплачивается
  их собственными кошельками. Autorefill/keeper incentives не реализованы.
- Сроки, эпохи, резервирование и settlement берутся из существующих компонентов;
  старые unpaid credits не мешают новому циклу и не уменьшаются из-за ошибки claim.
- Полнота/достоверность списка остаётся доверенной обязанностью publisher,
  доступной независимому replay. On-chain fraud proof не добавлен.

## Проверки

`npm run test:local:controllers` — три интеграционных теста, также включены в `npm test`:

1. Одновременные Short/Monthly, независимый расчёт результатов, восстановление Short
   из calldata с середины обработки другим исполнителем, преждевременный/повторный
   finish, ошибка claim, новый Short с новым диапазоном attempts и выплата старого долга.
2. Отсутствие native funding, provider not ready/request revert → нет freeze;
   синхронный callback отвергается, поздняя доставка работает, повтор запрещён.
3. Ограничения publisher, запрет supersede после freeze и отсутствие ручного seed/reset.

Результат 19.09: отдельный сценарный набор **3/3**, полный `npm test` **175/175**
(~507 секунд). Live RPC/fork и отдельные drand/Python research suites в этом шаге
не повторялись: интеграция целиком локальная, криптографический verifier не менялся.

На каждом денежном сценарии проверяется conservation:
`USDG balance = free Short + free Current + free Next + reserved + claimable + unrecognized`.

Локальный deployment при обычном лимите 24 576 bytes, solc 0.8.37, optimizer 200,
Cancun, без viaIR: Short **22 237**, Monthly **17 453**, vault **8 496 bytes**.
Настоящий RNG adapter ещё не входит в этот размер. Это не production gas budget.

## Следующий кусок

Обновление 19.09: описанная ниже локальная интеграция выполнена в
[BUY cycle](LOCAL_BUY_CYCLE.md). Исторический отдельный тест скелета по-прежнему
использует синтетические participants; новый тест получает их из локальной истории.

Подключить существующий BUY/attempt replay и builder к этому же локальному контуру,
чтобы получить список из проверяемой истории вместо синтетического snapshot.
Затем автоматизировать исполнение/восстановление. Finality, честность publisher,
drand binding и TOKEN → USDG остаются явными незакрытыми задачами, а не скрытыми
гарантиями этих обёрток. Локальный скелет не отменяет найденные timing counterexamples.
