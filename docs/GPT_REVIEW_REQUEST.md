# Текущее обращение к GPT

Обновлено 15.09.2026 после реализации Short outcome verification. Пожалуйста, прочитай код и разберись с конкретными рисками ниже. Ответ можно обновить в GPT_REVIEW_RESPONSE.md. Предыдущие обсуждения сохранены в Git; этот файл — запрос ревью, не дополнительная спецификация.

## Что принято владельцем

Везде, где гибкость не нарушает доверие, её нужно сохранять. Неизменяемы ограничения полномочий, уже возникшие обязательства, frozen inputs и назначенные prizes; возможны ограниченные публичные версии параметров будущих периодов. Пожизненно одна Short rules version на весь deployment не принята. Proxy, arbitrary code/controller replacement, withdrawals призовых средств, reroll и отмена prizes не допускаются. T=100 USDG остаётся ранее принятым immutable исключением.

Новые настройки не должны задним числом ухудшать условия OPEN attempts и BUY carry. Точные полномочия активации, пределы параметров и срок предупреждения ещё не выбраны. Мы не реализовали простой owner setter, который молча решал бы эти вопросы.

## Что изменилось

1. ShortDrawCommitment теперь принимает BasketRules внутренним вызовом и хранит payload отдельно на каждый draw. Нет lifetime singleton, нет production entrypoint выбора/активации правил. Новый request включает evmParticipantsHash, домен денежного commitment повышен до SHORT_COMMITMENT_V2. Старый frozen payload нельзя изменить, следующему draw можно передать другой. Публичных deployments V1 нет.
2. ShortOutcome.sol вычисляет результат из context + seed + отсортированных Participant ranges + Rules + basket. Допуск по q(e), отдельные hash domains для admission/order/prize order, максимум один prize на wallet, случайное подмножество корзины при M<K. Никаких caller-supplied winners в тестовом settlement пути.
3. JS verifier использует независимую полную сортировку против bounded top-K в Solidity. Оба commitment участников строятся из одного snapshot и сверяются verifier-функцией. Lifecycle CLI отдельно по-прежнему проверяет только canonical JSON.
4. Тестовый controller проверяет ABI hash, пересчитывает outcome, вызывает настоящий finalize, очищает pending и emits AttemptsConsumed атомарно. Он unrestricted и принимает seed от теста: **не production RNG/terminal**.
5. Gas sweep N=10,50,100,250,500,1000 при K=10, обычный и all-admitted профили. Зафиксированы calldata, verification, finalize и полный transaction gas. Нет нового fork или внешних транзакций.

## Что прочитать

- [PRODUCT_SPEC](PRODUCT_SPEC.md), особенно разделы 8, 9 и 13; [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md).
- [ShortDrawCommitment.sol](../contracts/ShortDrawCommitment.sol), [описание V2](SHORT_DRAW_COMMITMENT.md).
- [ShortOutcome.sol](../contracts/ShortOutcome.sol), [JS verifier](../scripts/short-outcome.cjs), [полная схема форматов/хешей/округления](SHORT_OUTCOME_VERIFICATION.md).
- [Тесты](../test/short-outcome.test.cjs), [test-only интеграция](../test/contracts/ShortOutcomeFixture.sol), [общая fixture](../test/fixtures/short-outcome.cjs).
- [Gas script](../scripts/short-outcome-gas.cjs) и [отчёт](../research/short-outcome-gas.json).

Проверено локально: 103/103 npm tests, Solidity compilation, 12 успешных gas-сценариев. На N=1000: около 6.26M gas обычный профиль и 7.36M при всех допущенных; calldata 96,132 bytes. Это наблюдаемые fixture-цифры, без production RNG verification и L1 data fees. All-admitted не доказывает худший порядок вставок; K=64 не измерен. Не называем это подтверждением production-лимитов сети.

## Вопросы ревью

1. Есть ли ошибка в exact admission threshold, пределах uint128/uint32, top-K insertion, tie-break, prize ordering или resultHash? В Result при хешировании resultHash явно равен zero, формат описан; нет ли неоднозначности между JS/Solidity?
2. Достаточна ли связь двух participant commitments и frozen rules с outcome при принятой модели независимого replay? Мы явно признаём: on-chain ABI hash не доказывает правдивость snapshot или его соответствие JSON, эту ложь обнаруживает verifier. Что конкретно нужно публиковать/автоматизировать следующим минимальным шагом?
3. Gas: какие проверки худшего случая действительно нужны перед выбором pre-freeze N/calldata/work limits? Есть ли веская причина уже сейчас отказаться от атомарного settlement, учитывая измерения? Не предлагать batching/Merkle заранее без конкретного ограничения.
4. Самый важный следующий дизайн: как ограниченно активировать версии **без переписывания OPEN attempts/carry** и без чрезмерной очереди старых epochs? Предложи минимальную state machine, конкретно указав, когда правила становятся обязательством перед накопившим билеты человеком. Просто «фиксируем при freeze» эту задачу не решает.
5. Какие параметры реально безопасно версионировать, какие bounds надо навсегда зафиксировать? Как не превратить гибкость q(e)/K/D в скрытую возможность направить prize funds связанным кошелькам? Без обещания устранить Sybil, identity/KYC не добавляем.
6. Какой один следующий ограниченный пакет даст больше пользы: правила активации/публичный rules payload, усиление автоматического verifier или подготовка seed authentication? Не объединять всё в очередной незаканчиваемый controller.

RNG provider, Monthly terminal, conversion, дополнительные BUY routes, frontend и численные production-настройки этим пакетом не выбирались. Просим явно отличать ошибки нынешней реализации от требований к ещё не реализованному production controller.
