# Текущий запрос GPT: monitoring fix + creator allocation / ETH funding design

28.09.2026. Продолжение review3f4d80f. Пользователь одобрил исправление и подготовку
следующего ограниченного пакета; доли и swap ещё не утверждены.

## Обязательный контекст для следующих review

После ответа cd3ecad пользователь повторно уточнил: НЕ требуется доказательная
гарантия покрытия газа доходами. Дорогой gas → ждём; недостаточно ETH → ограниченно
пополняем либо ждём внешнего пополнения; затем продолжаем с сохранённого состояния.
Проверяем стоимость и баланс конкретной операции, сохраняем caps и unknown-send
reconciliation. Не строим прогнозный движок и не ставим разработку в зависимость
от доказанной самоокупаемости. Призовую казну не трогаем. Доли90/5/5 пока кандидат;
их выбор не обязан ждать измерений всех будущих расходов.

Из review принято: стабильный slot1/source между кампаниями, поскольку существующий
handoff запрещает менять nativeRefill policy; отдельная миграция source пока вне scope.
Официальный WETH/USDG0.01% рынок найден, но его liquidity/pins/исполнение ещё предстоит
проверить. Подтверждение источника: https://blog.pancakeswap.finance/articles/rh-lp-fees .

Следующий предлагаемый пакет: project-funded native refill из pinned slot1 с прежними
caps/recovery и тестами rollover/handoff/запретов; отдельно proof реального USDG→ETH
маршрута на fork. Swap executor после proof. Не требуй замены этого шага новым
экономическим исследованием без конкретного дефекта безопасности/исполнения.

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
Ближайший порядок: явный project-funded режим + доказать рынок →
ограниченный swap executor. Public execution отдельно остаётся закрытым.
