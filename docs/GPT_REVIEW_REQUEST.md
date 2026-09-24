# GPT: scheduled prize adapter replacement и immutable price checks

24.09.2026. Пользователь выбрал возможность заменить сломанный swap adapter через
публичное объявление и задержку, сохраняя призовое назначение. Burn отдельно, сейчас
не добавлять. Дополнительно согласовал текущий объём: закончить механизм и проверки,
конкретный рыночный источник цены выбрать отдельным шагом перед deployment.
Ответ перезапиши в GPT_REVIEW_RESPONSE.md; код самостоятельно не меняй.

## Текущий пакет

Прочитай [SCHEDULED_PRIZE_CONVERTER](SCHEDULED_PRIZE_CONVERTER.md),
contracts/LocalScheduledPrizeConverter.sol, IPrizePriceSource.sol и новый блок тестов
в test/local-prize-converter.test.cjs. Старый LocalPrizeConverter и работающий worker
не изменены. Новый ABI convert(amount,deadline,expectedVersion) пока к worker не подключён.

Один pending adapter, только immutable publisher может announce/cancel. Activation
permissionless после immutable notice. Монотонный proposal id, stale id/version reject,
no overwrite, повтор codeHash/assets binding на activation и convert. Старый adapter
при activation не вызывается: его поломка не должна запереть восстановление.

Immutable destination/assets/priceSource/publisher/limits. У source фиксированный runtime
hash и отдельный адрес. minimumOut рассчитывается converter из ratio и свежести price,
со slippage и консервативным двойным ceil; output доказывается balance delta.
Проверяются точный TOKEN debit, minimum USDG credit, amount/horizon, allowance zero
после success. Нет owner withdrawal, произвольного execute, смены priceSource, pause,
proxy или burn. USDG forwarding независимо от работы adapter/priceSource.

## Проверки и честные ограничения

9/9, 45.95 s включая compile 19.02 s: 4 новых и 5 старых scenarios. Runtime 7192 bytes.
Первый compile остановился на синтаксисе объявления переменных; исправлен, тесты потом зелёные.
Новые cases: broken old runtime replacement, authority/notice/cancel/stale id/version,
candidate code drift, fresh/stale/future/zero/unavailable price, bad output/partial input/
wrong recipient/reentrancy, allowance rollback, USDG forward при сломанном oracle.

Price fixture вручную меняет цену, swap fixture искусственный. Это тесты контрактных
границ, не доказательство достоверного рыночного курса. Никакого настоящего oracle
новому поколению ещё не назначено. Full/fork/public sends не запускались.

Существующий constructor guard chain31337 сохранён в новом поколении. Старые balances
immutable converter не мигрируют и не получают новый маршрут автоматически.

CodeHash не фиксирует proxy implementation или внешние зависимости. Разные адреса
adapter/source не доказывают экономическую независимость. Publisher может выбрать
вредный adapter: защитой стоимости должен быть правильно выбранный price source и
параметры, а не один timelock. Источник может сообщать плохую цену с новым timestamp.
При необратимо сломанном immutable source TOKEN снова может ждать бессрочно.
Потеря publisher лишает будущей замены; governance/rotation не добавляли.

## Вопросы

1. Есть ли конкретный обход notice/version/balance/allowance/price constraints?
2. Нужны ли изменения в state machine сейчас, до подключения worker/real adapter?
3. Для будущего молодого TOKEN на существующем PAIR v4 hook какой практически
   реализуемый price source предложить без зависимости от мгновенного spot того же
   swap и без оператора, который постоянно руками выставляет курс? Раздели возможные
   варианты и их честные trust/liquidity/availability предпосылки; не обещай бесплатную
   manipulation resistance для неликвидного meme token.
4. Как учесть доступность priceSource, не превратив его замену в возможность незаметно
   обнулить экономическую защиту? Это открытая модель, не разрешение писать новый governance.

Не предлагай rescue призов, burn или расширение прав ради удобства. Следующий шаг —
решение о реальной цене, затем venue и автоматизация нового ABI.
