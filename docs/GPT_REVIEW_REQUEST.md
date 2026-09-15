# Текущее обращение к GPT

Обновлено: 15.09.2026. **Открыто: ревью ParticipantRegistry/ShortPrizeBasket и правила BUY → entries.**

Реализованные части: commits `d6216fe` (корзина) и `a884f2a` (регистрация и модель доверия indexer). Обнови [GPT_REVIEW_RESPONSE.md](GPT_REVIEW_RESPONSE.md), указав фактически просмотренный commit, файлы и выполненные проверки. Нужны советы и ревью, без изменения кода или PRODUCT_SPEC. Прежний ответ `97b6f91` относится к PAIR infrastructure audit; этот запрос его продолжает по продуктовой реализации. История запросов сохранена в Git.

## Направление, принятое владельцем

Полный MVP пока не готов. Отдельный reproducible deployment/portability пакет отложен: сначала достраиваем продукт небольшими законченными частями, проверяя их по мере реализации. PAIR остаётся первой площадкой; независимый повторный запуск остаётся архитектурным ограничением. Не возвращаемся к проектированию второй сети прямо сейчас.

**Собственный indexer принят как постоянная архитектура.** Публичные исходные данные, открытые правила расчёта, полный доступный снимок каждого draw, фиксация commitment до random и независимый пересчёт через собственный RPC. Подпись/Merkle root не доказывают истинность и полноту билетов. Принимаем, что такая схема позволяет обнаружить первоначально неверный снимок, но сама по себе не блокирует выплату по нему. Не обещаем отсутствие влияния команды.

Indexer не должен получать право произвольно назначать winners/amounts. Проверка результата по снимку и random — отдельная ещё не реализованная задача controller. ZK, challenge system и независимый комитет сейчас не добавляем ради формальной децентрализации.

## Что прочитать

1. [PRODUCT_SPEC](PRODUCT_SPEC.md), особенно разделы 7–9; [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md).
2. [ParticipantRegistry.sol](../contracts/ParticipantRegistry.sol), [тесты](../test/participant-registry.test.cjs), [описание](PARTICIPANT_REGISTRY.md).
3. [ShortPrizeBasket.sol](../contracts/ShortPrizeBasket.sol), [тесты](../test/short-prize-basket.test.cjs), [описание](SHORT_PRIZE_BASKET.md).
4. [INDEXER_TRUST_MODEL](INDEXER_TRUST_MODEL.md) — принятая граница доверия и ещё не реализованные требования.
5. [PromoVault.sol](../contracts/PromoVault.sol), [его тесты](../test/promo-vault.test.cjs), [DrawControllerFixture](../test/contracts/DrawControllerFixture.sol). Fixture намеренно unrestricted/test-only и не является production controller.
6. Для attribution: [PAIR source audit](PAIR_PORTABILITY_AND_SOURCES_2026-09-15.md), [manifest](../research/pair-source-audit/manifest.json), [native hook](../research/pair-source-audit/sources/PairV5LaunchV2NativeFeeHook.sol), [coordinator](../research/pair-source-audit/sources/PairV5LaunchV2NativeFeeCoordinator.sol), [исторический economics fork script](../scripts/economics-fork.cjs), [его evidence](../research/economics-fork-2026-09-12.json).

Последний набор не гарантирует наличие всех нужных swap receipts/traces. Не называй исторический fork реальной пользовательской mainnet-сделкой и не угадывай недостающий swap-router ABI. Начни с сохранённых данных; если их недостаточно, перечисли конкретные недостающие receipts/события/исходники и зачем они нужны.

## Что реализовано в этом этапе

### ParticipantRegistry

- Самостоятельный `register()`, mapping `registered(address)`, событие `Registered(participant)`.
- Без owner, third-party enrolment, backdating, удаления/замены записи, proxy и внешних вызовов.
- Повторная регистрация revert, первое событие сохраняется.
- Smart wallets допускаются; сохраняется `msg.sender`, не `tx.origin`. Вызов через посредника регистрирует посредника.
- Отдельный экземпляр registry не наследует прежнюю регистрацию.
- Историческая eligibility требует replay канонических событий: `(blockNumber, transactionIndex, logIndex)`. Текущий bool недостаточен. Регистрация должна предшествовать подтверждению eligible BUY; конкретное событие BUY ещё не выбрано.

### ShortPrizeBasket

Pure internal library: `build(budget, weights, minimumUnit)` → prizes/total/remainder.

```text
sum = сумма положительных weights
unit = floor(budget / sum)
unit < minimumUnit → BudgetNotReady
prizes[i] = unit × weights[i]
total = unit × sum
remainder = budget − total
```

Пустой шаблон, нулевые веса/минимум и переполнение суммы отклоняются. Порог проверяется делением без переполнения minimum × sum. Количество мест фиксировано шаблоном, порядок весов сохраняется. Ограничение production K ещё не выбрано. Библиотека не фиксирует snapshot, не выбирает D и не проверяет random/winners.

FeeRouter и PromoVault этим этапом не менялись. **57/57 контрактных тестов прошли**, включая 6 новых для registry и ранее добавленные 6 для basket. В тесте регистрации маркеры BUY проверяют порядок логов, не реальный PAIR decoder. В интеграционном тесте корзины выбор мест задан тестом, не RNG. Indexer, snapshot verifier и production controller пока отсутствуют.

Команды:

```sh
npm ci
npm test
npm run test:registration
npm run test:short:basket
```

Не утверждай, что запускал тесты, если только прочитал их. Не коммить регенерированные исследования при обычном ревью.

## Принятые денежные и билетные правила

- Каждые $100 cumulative eligible BUY дают entry: одна short attempt и одна monthly attempt; остаток BUY переносится.
- SELL не создаёт и не отменяет попытки, holding не требуется. Регистрация не даёт права учитывать более ранние покупки задним числом.
- Short Luck удалён. Допуск по entries, затем случайная раздача фиксированной корзины, максимум один приз кошельку.
- Не стартовал draw — попытки сохраняются. Terminal random/settlement расходует участвовавшие попытки соответствующего типа; недоставленный random не означает no-win. Новые попытки при pending идут в следующий OPEN.
- Минимум 6 часов после Short settlement, один pending Short, без очереди пропущенных draws.
- Призовой номинал текущего продукта USDG. Внешнее funding 3:2:1 и T=100 USDG приняты.
- **Не считай утверждёнными** production K/weights/minimum, параметры допуска, creator shares или D=весь free Short: последнее было предложено, но отдельного однозначного принятия бюджета нет. Текущее согласие владельца касалось архитектуры indexer и её реализации.

## Нужны ответы на следующие вопросы

### 1. Ревью сделанного

Найди реальные дефекты и пропущенные существенные тесты в двух новых компонентах. Для finding дай severity, файл/функцию, сценарий, последствие и минимальную правку. Отдельно проверь, не обещают ли документы больше, чем обеспечивает код.

Есть ли проблема с одноразовым opt-in, отсутствием unregister, smart wallet/посредником, историческим порядком и reorg? Не добавляй управление регистрацией администратором. Для basket проверь границы uint256, минимум базовой единицы, остаток, gas по K и совместимость с vault accounting.

### 2. Кому засчитывать конкретный BUY

Рабочая основа — прямой канонический TOKEN/USDG BUY зарегистрированного кошелька. Нужно определить плательщика и конечного получателя по фактам, а не приравнять обоих к tx.from или PoolManager event sender.

Предложи минимальную таблицу поддерживаемых/неподдерживаемых случаев: обычный кошелёк, smart wallet, payer != recipient, покупка через router, batch/multicall, aggregator/multihop, прямой transfer, SELL. Что можем доказать receipts/logs, где нужен calldata decoder или trace? Если признаков недостаточно, операция не должна молча превращаться в подтверждённый билет; предложи явную обработку неопределённости.

Не требуем покрыть все агрегаторы в MVP. Но exclusion rule должен быть публичным, а поддержка smart-wallet registration не должна обещать поддержку любого торгового маршрута такого кошелька.

### 3. Как измерять gross BUY

Предложение Codex: фактический USDG, потраченный на поддерживаемую покупку, без газа. Уточни swap fee, exact-in/exact-out, refunds, комиссии router и посторонние USDG transfers в той же транзакции. Что именно берём из событий и чего по ним не докажем?

Нельзя считать размер approval, объявленный maximum input или общий wallet balance delta доказательством стоимости BUY. Не подменяй gross на net или creator revenue. Если $100 BUY трактуем как 100 USDG nominal, назови это явным предложением: peg/оценка ещё не завершены. Все вычисления — raw units, без floating point.

### 4. Replay, carry и finality

Предложи минимальную модель данных и алгоритм, позволяющие независимо восстановить результат из публичной истории: identity события, checkpoint block/hash, идемпотентность, rollback при reorg, eligibility после регистрации, BUY carry, отдельные short/monthly attempts и история расхода.

Как проверить полноту, не доверяя списку событий оператора? Как трактовать reorg, затронувший уже committed snapshot? Где достаточно повторного чтения, а где система обязана остановиться? Не выбирай произвольное число confirmations как доказанный безопасный параметр Robinhood Chain.

### 5. Следующий один пакет работ

Предложи маленький законченный этап на пути к реальному indexer: какие реальные данные сначала получить, какой decoder/replay реализовать и какими сценариями доказать корректность. Избегай временного формата, который потом придётся выбрасывать, но не проектируй все controller/RNG/frontend сразу.

Приёмка должна включать отсутствие двойного начисления, пропусков и начисления до регистрации, корректный carry и возможность воспроизвести результат без нашей базы. Не называй JSON из нашего сервера независимым источником истины.

## Формат ответа

Сначала вердикт по реализованному и существенные findings. Затем конкретные предложения по attribution/денежной величине/replay с границами доказательств. В конце — один следующий пакет и только действительно необходимые продуктовые решения владельцу. Не возвращай Luck, portability deployment пакет или полный аудит всей экосистемы как обязательное условие продолжения разработки.
