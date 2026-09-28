# Текущий запрос GPT: durable operations swap и native refill

28.09.2026. Продолжение review 90f19ba. Распределение 90/5/5 принято пользователем.
Не доказываем вечную окупаемость газа: дорогой gas или нехватка ETH означают ожидание,
пополнение и продолжение. Призовые frozen/claimable не используются. Public sends закрыты.

## Что сделано

1. Локальный poolKey теперь хешируется и сверяется с pinned poolId до quote;
   manager key независимо сверяется с тем же poolId. Есть regression test локальной подмены.
2. Добавлен [operations sender](OPS_MARKET_EXECUTOR.md): точный USDG approve →
   Permit2 approve → swap + unwrap → существующий native refill. Один этап за проход,
   общий automation lock/journal и operations signer; pending сначала reconciles.
3. Coordinator распознаёт ops intent и проверяет receipt по operations адресу,
   а не адресу executor. History, caps и halt сохраняются при runtime handoff.
4. Intent сохраняется до отправки, hash — после. Неизвестная отправка блокирует
   повторную; подтверждённый receipt учитывается один раз. Revert/anomaly останавливают
   дальнейшие swaps, чтобы не прожигать seed ETH повторами.
5. Ограничены batch USDG, расходы USDG и native fees за период, gas price/units,
   native floor, cooldown, slippage/impact и свежесть quote. Это worker policy,
   не контрактное ограничение владельца operations EOA.
6. Permit2 expiry покрывает cooldown и следующий quote deadline, иначе approvals
   могли бы бесконечно обновляться. Swap подготавливается свежим на каждом проходе.
7. При нехватке средств конверсия идёт перед частичным refill, сохраняя seed для approve.
   При исчерпанном лимите/отсутствии USDG доступный ETH всё ещё может пойти в refill.

На реальном fork выяснилось: pinned WETH сообщает unwrap через Transfer(router, zero),
а не Withdrawal. Поддержаны оба формата без двойного учёта; расхождение блокирует swaps.
Это evidence pinned маршрута, не универсальное доказательство доставки ETH любым router.
Refill независимо читает фактический native balance.

## Проверки

49 адресных продуктовых тестов + 1 catalog check прошли. Команды и границы —
[в документе модуля](OPS_MARKET_EXECUTOR.md). Полный suite не запускали.

[Ограниченный fork](../research/ops-funding/sender-fork-2026-09-28.json), block 74812400:
operations начал с 0.002 ETH, потратил 10 USDG, получил 0.003720768049085340 ETH,
после чего пустой executor получил 0.001 ETH. Реальные router/Permit2/USDG/WETH,
но искусственно выданный USDG и локальная модель gas; это не тариф Nitro.

Для каждого из трёх этапов отправка состоялась, ожидание receipt искусственно оборвано,
журнал перечитан с диска, receipt восстановлен без повторной отправки. Это не OS SIGKILL
и не полный watch end-to-end. Unknown hash, save failures, revert, caps и anomalies
проверены локальными тестами. Исправленные ошибки первоначального fork не скрываем:
именно он выявил формат WETH burn event; итоговый повтор прошёл.

## Что пока не закрыто

- Автоматическое получение slot1 credits из collector. Сейчас USDG уже на operations EOA.
- Полный watch proof всей цепочки и выбор реальных deployment caps.
- Source/immutable audit и остальные public-launch gates.
- Начальный seed ETH нужен; approvals и сбор credits тоже требуют gas.

## Вопросы review

1. Есть ли конкретная ошибка в intent/receipt accounting, unknown-send recovery,
   периодных caps или общей nonce последовательности с refill?
2. Нет ли пути, где coordinator преждевременно расходует seed, дублирует отправку
   или трактует operations receipt как executor receipt?
3. Достаточны ли условия expiry/cooldown для отсутствия approval loop при обычном
   polling? Задержка сверх expiry допустима, автоматические бесконечные повторы — нет.
4. Следующим ограниченным пакетом предлагаем durable pay(slot1) для накопленных
   credits, затем полный watch proof. Какие существующие recovery границы надо переиспользовать?

Просьба оценивать реализованный объём, не требовать гарантии вечного достатка ETH.
Нехватка денег и дорогой gas — штатные причины ожидания, а не смерть проекта.
