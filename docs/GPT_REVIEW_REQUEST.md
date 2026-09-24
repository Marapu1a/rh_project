# GPT: источник цены молодого TOKEN — независимая проверка исследования

24.09.2026. Твой review `892ee39` прочитан. Причин менять state machine scheduled
adapter пока нет. Передаём исследование, которого не было в `47b0299`.
Ответ перезапиши в GPT_REVIEW_RESPONSE.md; код самостоятельно не меняй.

## Контекст

[SCHEDULED_PRIZE_CONVERTER](SCHEDULED_PRIZE_CONVERTER.md): replacement adapter через
notice, id/version checks, immutable priceSource/assets/destination, balance deltas,
сброс allowance. USDG forwarding работает независимо от adapter/oracle.
Твой прогон 9/9 относится к `47b0299`. Контракты в новом пакете не менялись.
Наш TOKEN не запущен. PriceFixture не oracle; реальный venue и worker нового ABI
ещё не подключены. Источник цены и параметры deployment не утверждены.

## Новые материалы

Прочитай [PRICE_SOURCE_RESEARCH](PRICE_SOURCE_RESEARCH.md), затем:

- [исходник hook](../research/pair-source-audit/sources/PairV5LaunchV2NativeFeeHook.sol),
  особенно _beforeSwap, _afterSwap, _writeObservation, _consultAccumulator;
- [локальную модель](../research/price-sampling-model.cjs);
- [probe](../research/price-source-probe.cjs) и
  [сохранённые ответы RPC](../research/price-source-probe-2026-09-24.json).

В hook есть 30-минутный TWAP, freshness 5 минут, интервал записи минимум 60 секунд,
кольцо 32 observations. Но pre-swap tick взвешивается на следующий интервал,
хотя сделка уже меняет цену. Модель показывает расхождение с post-swap историей.
Это source-level контрпример, не EVM exploit и не оценка стоимости манипуляции.

На pinned block 0x4412069 runtime/source hashes совпали с сохранённым manifest.
У reference 5 observations, последняя старше timestamp блока на 966392 секунд;
consult/getQuote отклонены с InsufficientHistory. Это один пул и один RPC,
не характеристика всей сети или будущего TOKEN. Публичных sends не было.
Локальная модель: расхождение, постоянная цена, stale, недостаточная история.
Full suite/fork не повторяли: production код не менялся.

## Предлагаемый следующий шаг

Один эксперимент: восстановить post-swap интервалы по истории reference, сравнить
с hook и исполнимыми котировками продажи разных размеров с учётом fee/impact.
Сценарии: спокойный рынок, редкие сделки, скачок, отсутствие истории/ликвидности.
Отделить реальные наблюдения от синтетических сценариев. При недоступной исторической
RPC явно ограничить доказательство локальным replay. Цель — выбрать модель источника,
а не строить несколько oracle-систем одновременно.

## Вопросы

1. Верен ли вывод о pre-swap sampling? Не пропущена ли семантика hook/PoolManager?
   Если мы ошиблись, укажи конкретный код и контрпример нашей модели.
2. Достаточен ли эксперимент? Какие 2–3 измерения определяют выбор, а какие лишние?
3. Для одного тонкого рынка что практичнее: on-chain sampler, автоматический reporter
   с раскрытым доверием или более простая модель исполнения? Предложи предпочтительный
   путь с ограничениями. Несколько RPC/подписантов не создают независимые рынки.
4. maxInput ограничивает вызов, а не суммарную потерю при повторных продажах.
   Нужен ли иной лимит именно для предлагаемого пути и почему?
5. Как не запереть TOKEN при вечном отказе immutable source, не открыв скрытую
   возможность произвольно менять цену? Раздели необходимое сейчас и отдельное
   решение о доверии до deployment. Fallback на spot/отключение minOut не согласованы.

Не добавлять governance, rescue призов, burn или ручное выставление курса ради удобства.
Полномочия reporter/смены source не утверждены. Routine execution автоматический;
ожидание при плохих данных допустимо, USDG forwarding и frozen/claimable независимы.
Нужен вывод: что подтверждено, где мы ошиблись, следующий проверяемый шаг.
