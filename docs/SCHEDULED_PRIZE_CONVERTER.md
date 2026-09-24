# Замена prize swap adapter с задержкой

24.09.2026. Решение пользователя: возможность заменить маршрут, но не назначение
призовых денег. Burn отдельно, сейчас не добавляется. Пользователь отдельно согласовал
объём: закончить механизм и проверки, рыночный источник цены выбрать перед deployment.

## Реализация и границы поколения

[LocalScheduledPrizeConverter](../contracts/LocalScheduledPrizeConverter.sol) — новый
локальный контракт chain31337. Старый LocalPrizeConverter не изменён; его immutable
adapter и старые TOKEN balances нельзя обновить через новый контракт. Публичных
deployments нет. Prize-flow worker пока работает с прежним ABI; новый профиль ему
не подключён. Это не готовый production converter/DEX/oracle.

Неизменны: TOKEN, USDG, призовой vault, priceSource и его runtime hash, publisher,
notice, maxInput, maxHorizon, maxPriceAge, slippageBps. У publisher только объявление
и отмена adapter, нет withdraw/rescue, смены destination/priceSource, burn или proxy.
Frozen/claimable не используются. USDG forward не зависит от swap/price доступности.

## Минимальный API

- announceAdapter(next, codeHash): только publisher; один pending, другой адрес,
  существующий runtime с точным hash и правильными tokenIn/tokenOut. Нельзя назначить
  converter, vault, priceSource или сами assets. Начинает полный immutable notice.
- cancelAdapter(expectedId): только publisher; очищает единственный pending.
  Новое объявление получает новый монотонный id и новую задержку.
- activateAdapter(expectedId): любой caller после eligibleAt, повторная проверка
  codeHash/assets, очистка pending, увеличение adapterVersion. Старый adapter не
  вызывается — его отказ не блокирует восстановление. Oracle также не требуется.
- convert(amount, deadline, expectedVersion): любой caller, только текущая версия,
  amount <= available/maxInput, deadline в допустимом горизонте. Старый queued вызов
  не переходит молча на новую версию. Нет caller-selected minOut/recipient/calldata.
- sync и forwardQuote сохраняют прежний accounting и фиксированный prize destination.

Начальная версия adapter=1. Нет pending overwrite, ранней/повторной активации,
устаревшей отмены или короткого emergency bypass. Публикация сама не останавливает
рабочий adapter. Неудачная активация сохраняет pending для последующего cancel.
Events содержат id, адрес/hash, eligibleAt и новую version для публичного наблюдения.
Permissionless activation не запускается сама: автоматизация — следующий integration step.

## Неизменяемая проверка цены

[IPrizePriceSource](../contracts/IPrizePriceSource.sol) возвращает raw-unit ratio
numerator/denominator и observedAt, отдельно от swap adapter. Converter сверяет
source codeHash, положительность ratio, ненулевой timestamp, отсутствие будущей
даты и age <= maxPriceAge. Revert/unavailable/некорректные данные запрещают swap.

```text
referenceOut = ceil(amountIn × numerator / denominator)
minimumOut   = ceil(referenceOut × (10000 - slippageBps) / 10000)
```

Двойное округление консервативно: минимум может быть строже точного общего выражения.
Нулевой minimumOut не разрешён. Adapter получает allowance только на amount; после
успеха allowance обнуляется. Проверяются фактические TOKEN debit ровно amount и USDG
credit >= minimumOut. Partial input, bad output, wrong recipient, revert/reentrancy
откатывают swap, allowance и accounting. Никакая return value не заменяет balance delta.

**Свежесть не доказывает правильность курса.** Источник может сообщать плохую цену с
новым timestamp; одна проверка ABI/codeHash этого не предотвращает. Адреса oracle и
adapter различны, но экономическая независимость их данных должна быть доказана
выбранной реализацией. Proxy implementation/внешние зависимости одним runtime hash
не фиксируются. Публикация нового adapter остаётся доверенным полномочием, задержка
сама по себе не аудит. В исходном deployment также нельзя выбирать практически
бесполезный slippageBps и выдавать это за защиту.

## Что проверено

Тестовый PrizePriceFixture расположен только в test/contracts: любой может менять
его цену. Он НЕ кандидат для deployment. Swap — прежний PrizeSwapFixture с балансами
и fault controls. Все новые проверки локальные, не реальные рыночные сделки.

Команда через scripts/test-launcher.cjs:

```js
runTests({profile:'scheduled-converter',selection:{compile:true,
 files:['test/local-prize-converter.test.cjs']}})
```

9/9, exit0, 45.95 s (compile 19.02 s); 4 новых и 5 прежних converter scenarios.
Лог .local/logs/test-run-lWXPbh/result.json. Первая компиляция остановилась на
синтаксисе объявления двух переменных; исправлено до запуска тестов.
Runtime нового converter 7192 bytes при текущих compiler settings.

Покрыты notice/authority, cancellation/reannouncement, stale ids/version, code drift
кандидата, восстановление без вызова уничтоженного старого runtime (Hardhat-only
setCode), ограничения amount/deadline, zero/future/stale/unavailable price,
независимый от adapter минимум, bad swaps и нулевые allowances. USDG forwarding
работает при сломанном adapter/oracle; повтор не выплачивает снова. Прежние сценарии
сохраняют accounting, fixed destination и frozen prize reserve.

Full suite, новый fork и public sends не запускались. Рабочее prize-flow исполнение
не переведено на этот контракт и не получило новую доверенную oracle authority.

## Что ещё требуется

1. Выбрать проверяемый источник цены для конкретного TOKEN/pool. Не принимать цену
   того же пула непосредственно перед swap за независимую защиту. В Uniswap v4
   oracle behavior может реализовываться hooks; само наличие v4 pool не подтверждает
   подходящий источник для нас: [официальные концепции hooks](https://developers.uniswap.org/docs/get-started/concepts/hooks).
2. Проверить реальный adapter/venue и связать новый ABI с автоматическим worker.
3. Утвердить publisher, notice и численные лимиты для deployment; локальные тесты
   используют notice=60 s, age=3600 s, slippage=100 bps только как fixtures.

Потеря publisher мешает будущим заменам. Необратимо сломанный immutable priceSource
может оставить TOKEN ждать навсегда даже с рабочим adapter. Ошибочный initial
deployment новым контрактом не исправить. Эти ограничения не закрываются admin
выводом, burn или скрытым изменением guard; их нужно учесть при выборе price source.
