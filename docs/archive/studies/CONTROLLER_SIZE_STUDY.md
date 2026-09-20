# Размер будущего controller — 17.09.2026

> Архив на 19.09.2026: исторический отчёт/обсуждение, не текущий план и не самостоятельная спецификация.
> Начало работы: [CURRENT_CONTEXT](../../CURRENT_CONTEXT.md). Условия и выводы ниже относятся к указанному этапу.

Продолжение: выбрана и локально проверена [архитектура двух контроллеров](../../DUAL_CONTROLLER_ARCHITECTURE.md).
Ниже — исторический опыт с лимитом **24 KiB для переносимости**, а не доказательство
невозможности deployment в Robinhood с её отдельными chain limits.

**Вывод:** текущий Short помещается, но простое добавление содержательных RNG и
Monthly даёт слишком большой монолит. Комбинация viaIR + fixed selection helper
позволяет вместить исследовательский макет с запасом всего 47–132 байта.
Это не достаточный запас для незавершённого production controller.

Рабочие contracts, compiler settings, hardhat.config и основные tests не менялись.
Исследование находится в `research/controller-size`, компилирует отдельные варианты
в памяти и не заменяет обычные artifacts. Ни публичных транзакций, ни сетевого fork.

## Что именно добавлено в макет

1. **ShortRngSizeStudy:** настоящий существующий ShortSettlement; Ownable2Step,
   смена publisher в два шага; фиксированный provider; requestId ↔ drawId/context/kind;
   только provider callback и одна доставка; нулевой seed допустим; запрет
   синхронного callback во время request. Reserve + платный request атомарны.
2. **Простые readiness gates:** число подтверждений, верхний предел Short D,
   tx.gasprice, provider.ready(), native balance >= request fee + floor.
   Это исполняемые проверки, но НЕ доказательство gas-достаточности всего draw.
3. **FullControllerSizeStudy добавляет Monthly:** отдельные publishing/ready/
   waitingSeed/processing/terminal, root/count/attempts и hash каждой порции;
   supersede только до freeze; реальный PromoVault.startMonthly; независимый
   pending; запрос randomness через общий binding; последовательная обработка;
   выбор одного кандидата; реальный settleMonthly win/no-win; AttemptsConsumed;
   новое ожидание после terminal; предыдущие claimable не блокируют следующий цикл.
4. **ExternalSelectionSizeHelper:** только чистый selectTopK. Для варианта helper
   компилятор получает копию ShortSettlement с `new` helper и immutable address;
   Short и Monthly вызывают внешний pure метод. Helper не имеет storage/ролей,
   не может распоряжаться PromoVault, не заменяется; нет delegatecall/proxy.

Monthly использует описанный в PRODUCT_SPEC кандидат: допуск, затем минимальный
равномерный hash rank, без второго веса за entries. **30 дней, q=0.2*e/(e+3),
фиксированные monthly rules, minimumUnit=1, численные readiness limits — только
допущения исследования**, не утверждённые продуктовые параметры. Для Monthly
используются study-specific context/root/result domains; это не утверждение его ABI.

Нет реализации BUY indexer daemon, monthly rules epochs, production finality,
ценового оракула/конвертации, real provider protocol/verification, keeper/autorefill,
политики выбора D, emergency recovery. Непустой Monthly dataset обязателен в макете;
полный дизайн пустых циклов остаётся за пределами замера.

## Результаты компиляции

Solc **0.8.37**, Cancun. Лимит runtime, проверяемый обычным локальным Hardhat:
**24 576 байт**. Initcode измеряется отдельно; лимит runtime нельзя сравнивать с
размером creation bytecode или размером файлов Solidity.

| Вариант | Short + RNG/roles/readiness | С Monthly | Запас полного root |
|---|---:|---:|---:|
| Обычная сборка, runs=200 | 21 866 | 28 475 | −3 899 |
| Та же сборка + fixed selection helper | 20 786 | 27 452 | −2 876 |
| Обычная сборка, runs=1 | 21 704 | 28 206 | −3 630 |
| viaIR, runs=200 | 18 911 | 26 288 | −1 712 |
| viaIR + helper, runs=200 | 17 893 | 24 529 | **47** |
| viaIR + helper, runs=1 | 17 881 | 24 444 | **132** |

Исходная ShortSettlementFixture: **18 497 байт**. При обычной сборке надстройка
RNG/roles/readiness добавляет 3 369 байт, Monthly ещё 6 609. Это разница целых
сборок, не независимые размеры библиотек: optimizer может менять совместный код.

Helper разворачивается отдельно: 2 792 байта в обычной сборке; 2 256 / 2 236 байт
для двух viaIR вариантов. Его размер не исчезает, а выводится из root; добавляются
deployment и external-call/ABI затраты. **Газ этих вариантов не сравнивался.**
Минимальный root initcode — не предмет оптимизации; exact initcode всех вариантов
также записан в evidence. Самый тесный root не является выбранной архитектурой.

## Проверки поведения и честность лимита

`npm run check:controller:size` выполняет отдельные локальные процессы:

- **Обычный лимит:** oversized FullControllerSizeStudy отвергается реальным
  eth_estimateGas на развёртывание; ShortRngSizeStudy действительно развёрнут.
- **Явно отключённый лимит только для поведения большого макета:** отдельный
  `research/controller-size/hardhat.config.cjs`. Проверяется движение настоящего
  PromoVault accounting, а не возвращаемые заглушкой значения.
- **Помещающийся viaIR + helper, runs=1:** стандартная конфигурация, нормальное
  развёртывание и те же сценарии. Это подтверждает возможность размещения именно
  этой экспериментальной сборки; 132 байта запаса не делают её production-ready.

Сценарии: publisher/budget/readiness rejection; request failure откатывает freeze;
Next должен быть заполнен; одновременный pending Short/Monthly; запрет повторной
доставки и ручного fulfill; win сверяется с независимым full-sort; порядок chunks;
ранний/повторный finish; balance deficit и повтор того же terminal; no-win сохраняет
Current/Next и позднее funding; старый jackpot можно claim после новых draws;
publisher меняется в два шага без замены provider/controller.

Выбор seed под win/no-win выполняется исключительно тестовой программой. Код
исследования не содержит reroll или административного setSeed.
Mock-provider разрешает тестовую доставку; это не проверяемая случайность.
Нельзя развёртывать этот исследовательский код с реальными средствами.

Команды воспроизведения:

```powershell
npm run report:controller:size
npm run check:controller:size
```

Измерения и compiler source hashes: [sizes.json](../../../research/controller-size/sizes.json).
Проверки: [limits](../../../research/controller-size/limits-check.json),
[oversized behavior](../../../research/controller-size/behavior-check.json),
[fitting build](../../../research/controller-size/fitting-check.json).
Compiler warnings о превышении размера сохранены, а не подавлены.
Смена settings находится только в этом эксперименте; полный regression suite на
viaIR не запускался, и переход production compile на viaIR этим не одобрен.

## Что из этого следует

Не наращивать один controller вслепую и не объявлять успехом сборку с 132 байтами
запаса. Но и утверждать, что любой правильный монолит невозможен, нельзя:
в макете публикация/commitment/chunks Monthly написаны отдельно и частично
повторяют уже имеющийся Short dataset path. Это содержательная оценка конкретного
варианта, не доказательство нижнего предела размера любой реализации.

Следующий ограниченный пакет: выбрать общее хранение/проверку dataset либо
фиксированное разделение состояния Short/Monthly и измерить root с реальным
запасом. При внешнем разделении root остаётся единственным drawController vault;
компоненты задаются при deployment, не заменяются и не получают произвольных
полномочий над казной. Отдельный selection helper сам по себе проблему не решает.
Решение о разбиении нельзя подменять удалением checks, попыток, Monthly или прав
победителей ради экономии байтов. Новая архитектура этим исследованием не принята.
