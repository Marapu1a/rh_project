# Текущий запрос GPT: monitoring fix + creator allocation / ETH funding design

28.09.2026. Продолжение review3f4d80f. Пользователь одобрил исправление и подготовку
следующего ограниченного пакета; доли и swap ещё не утверждены.

## Что изменено

`promo-operational-status.cjs` теперь обходит failures/claimFailures/requests:
sourceReadUnavailable и beaconUnavailable оставляют waiting; rejected actions —
attention. Успех другой lane не даёт ложный recovered. roundNotDue нормален.
При смене одной проблемы на другую — changed; восстановление только после ухода
распознанных проблем. Никаких новых retries, RNG rounds или денежных действий.

Адресно18/18: `node --test test/promo-operational-status.test.cjs test/local-rpc-watch.test.cjs`.
Переходы gas→source/beacon/claim error→recovered, повторы, совместные причины;
полный suite/fork/live не запускались. Lock окружение повторно не расследовали.

## Следующий шаг — пока design

Читайте [OPS_REVENUE_FUNDING_DESIGN](OPS_REVENUE_FUNDING_DESIGN.md).
Имеющихся slots collector хватает: PromoVault / operations EOA / project EOA.
Предлагаем90/5/5, сравнили альтернативы и условную окупаемость. Это не параметры
production;3% Infinity creator fee уже выбраны, внутренние доли ещё нет.
Спонсоры пополняют PromoVault без fee, prize math не меняется.

Важный стык: существующий bootstrap refill запрещает source=любойrecipient.
Предлагаем явный project-funded mode для pinned slot1, не удаление защиты целиком.
Ops signer для swap/refill требует общего nonce/journal/recovery. EOA ключ имеет
контроль над ops средствами; не называем offchain caps контрактной гарантией.
Если нет seed ETH даже на swap, нужна внешняя подпитка: USDG сам газ не оплатит.

Нашли официальный кандидат Pancake Infinity UniversalRouter для Robinhood;
upstream умеет unwrap, но USDG/WETH pool, liquidity, deployed bindings и calldata
ещё НЕ квалифицированы. Не внедряли произвольный aggregator или непроверенный swap.
При дорогом gas/нехватке средств ждём, старые обязательства сохраняются.

## Вопросы для review

1. Остался ли конкретный false-recovered путь в существующих child reports?
2. Достаточны ли3slots и явный slot1 source mode без новых контрактов? Какие
   реальные конфликтующие пути остаются при rollover/handoff/source drift?
3. Есть ли возражения к90/5/5 как кандидату, без обещания гарантированной окупаемости?
4. Какой подтверждаемый USDG→native ETH рынок доступен на4663? Нужны primary
   sources/адреса/receipt, не предположение из возможностей upstream router.
5. Хватает ли предложенного qualification fork до journaled swap executor?

Не расширять scope до прогнозирования gas, торгового бота или новой призовой модели.
Ближайший порядок: выбрать доли → явный project-funded режим → доказать рынок →
ограниченный swap executor. Public execution отдельно остаётся закрытым.
