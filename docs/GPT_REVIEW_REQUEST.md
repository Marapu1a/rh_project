# Ревью замера полного controller

17.09.2026. После оптимизации Short до 18 497 байт измерили содержательный макет
оставшихся частей. Production contracts, compiler settings и основной test suite
не меняли. Исходники, настройки и evidence находятся в research/controller-size.

## Результат

- Short + RNG request binding + роли + простые readiness checks: **21 866 байт**.
- С отдельной полной Monthly state machine: **28 475**, превышение **3 899**.
- Вынос только selectTopK в immutable external pure helper: **27 452** — мало.
- viaIR без helper: **26 288**, всё ещё выше лимита.
- viaIR + helper: **24 529**, запас **47**.
- viaIR + helper + runs=1: **24 444**, запас **132**.

Самая компактная сборка действительно развёрнута при стандартном лимите Hardhat
и прошла сценарии. Большой монолит проверен отдельно: стандартная конфигурация
отвергает deployment, специальная исследовательская конфигурация с отключённым
size limit позволяет проверить только его поведение. Не смешиваем эти результаты.

[Полный отчёт](CONTROLLER_SIZE_STUDY.md),
[размеры/source hashes](../research/controller-size/sizes.json),
[исходник макета](../research/controller-size/ControllerSizeStudy.sol).

## Насколько модель содержательная

Есть реальная публикация/валидация Monthly root/count/attempts/chunks до reserve,
отдельные pending Short/Monthly, общий immutable provider с request↔draw/context/kind,
один callback, настоящие PromoVault startMonthly/settleMonthly, обработка порциями,
win/no-win/AttemptsConsumed, сохранение старых claims. Freeze и request failure
атомарны. Нормальные и ошибочные сценарии проверены на локальном EVM.

30 дней, фиксированные monthly q, бюджетный ceiling, confirmations и native floor
— исследовательские допущения. Production finality, полный gas funding/keeper,
реальный RNG protocol и окончательная policy не реализованы. Параметры/архитектура
этим макетом не утверждены. Monthly algorithm/context domains здесь study-only.

## Наша оценка

132 байта — неприемлемо малый запас для ещё незаконченного контроллера. Поэтому
не переключаем основной compile на viaIR и не объявляем этот макет готовым MVP.
Однако размер конкретного макета не доказывает невозможность любого монолита:
в нём Monthly publication/chunk accounting частично повторяет Short.

Нужен один следующий пакет, который уберёт архитектурное давление, не сократит
гарантии ради байтов. Выбор пока не сделан.

## Вопросы

1. Что рациональнее первым измерить: общий typed dataset/commitment слой для двух
   draw kinds в root, или отдельный фиксированный Monthly state component?
   Назовите конкретный переносимый код и состояния, не просто общий паттерн.
2. Если общий слой: как сохранить два независимых pending, Short epoch draining,
   отдельные clocks/attempt consumption, domain separation и полноту snapshots?
3. Если внешний компонент: root должен оставаться единственным controller PromoVault,
   компоненты immutable без proxy/delegatecall/replaceable modules. Как обеспечить
   атомарность terminal и не дать внешнему компоненту назначать произвольных winners?
4. Насколько наш макет завышает/занижает размер: большие getters/ABI, дублирование
   Monthly preparation, Ownable2Step, невыбранный реальный RNG и readiness policy?
5. Какой практический запас оставить перед внешними интеграциями? Какие оценки
   можно сделать без фиктивных пустых stubs и без бесконечного code golf?
6. Достаточно ли зафиксированных behavioral checks для архитектурного эксперимента?
   Нужны конкретные новые пробелы, а не заявление production readiness.

Отдельный pure selection helper уже измерен и сам по себе недостаточен.
Gas этих новых compile/composition profiles пока не сравнивался; прежде чем
принимать viaIR или fixed helpers в рабочий код, нужны отдельные regression/gas tests.
