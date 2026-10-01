# Pons: учёт curve и v4 BUY

01.10.2026: локальный профиль `direct-buy-pons-v2` / `rh-pons-curve-ur-v1`.
Включает существующий direct curve BUY и один обмен TOKEN/USDG через Universal
Router после graduation. Порог100USDG и призовая математика не менялись.

## Поддержанный маршрут

`execute(bytes,bytes[],uint256)` с единственной командой `0x10` и действиями
`0x060b0e` (exact-input-single, settle, take) либо `0x060c0f`
(exact-input-single, settle-all, take-all). Оплата USDG через Permit2,
получатель тот же, что tx.from; допустим sentinel MSG_SENDER. Permit2 allowance
выдаётся отдельно. Оба порядка TOKEN/USDG в PoolKey покрыты тестами.

Inline permit, allow-revert, multicall, агрегаторы, wrappers, exact-output,
многошаговые маршруты и другие пулы не допускаются этим профилем. Это ограничение
начисления entry, а не запрет торговли. Совпадение с фактическими командами UI Pons
ещё не проверено; успешно проверен вызов реального Universal Router напрямую.

## Как считается покупка

Swap от PoolManager содержит TOKEN до afterSwap hook. Для exact-input BUY hook
удерживает fee и creator tax в TOKEN. Декодер проверяет отдельно округлённые суммы,
HookFeeCollected, перевод manager→hook и TOKEN manager→покупатель после удержаний.
USDG покупатель→manager должны точно совпасть с расходом в Swap. Дополнительные
переводы/возвраты, другое назначение или несогласованные суммы отклоняются.
Комиссия в TOKEN не прибавляется к USDG второй раз.

Внутренние обмены hook/оператора не являются пользовательскими покупками.
SELL не добавляет entry и не отменяет ранее открытые попытки.
Повторная доставка не меняет ledger; reorg восстанавливается полным replay от
anchor. Это ещё не восстановление уже зафиксированного розыгрыша.

## Проверки источников

[Адаптер](../scripts/pons-v4-buy.cjs) подключён к
[replay](../scripts/direct-buy.cjs), [RPC reader](../scripts/replay-direct-buy.cjs)
и существующему attempt lifecycle. Reader проверяет коды и связи на каждом блоке:
factory↔curve/token/quote/hook, pool fee/tick/tax, hook→manager и registered pool
после phase2. Пины UR/manager/Permit2 сверены read-only на77275286 и повторно на fork.
Исходный [curve-профиль](PONS_BUY.md) сохранён, PAIR также не изменён.

Пины runtime не заменяют полный source admission, проверку реализации USDG proxy
и публичное утверждение BUY policy. Постоянный production indexer и public sender
не переключены. Offline evidence не доказывает каноничность само по себе.

Документация Pons перечитана01.10: [v4 pools](https://docs.ponsfamily.com/v2#uniswap-v4-pools).
Она описывает совместимость с v4 routers; конкретный ABI/runtime и fee accounting
проверялись также по локальному source checkout и выполнению на fork.

## Результаты01.10

- `node --test test/pons-v4-buy.test.cjs test/pons-curve-buy.test.cjs test/direct-buy.test.cjs test/infinity-buy.test.cjs test/attempt-lifecycle.test.cjs`
  —55/55 PASS. Группа `--profile pons-v4-buy` задаёт тот же адресный набор, не full.
  Лог `.local/logs/pons-v4-buy-tests.txt`.
- `node scripts/pons-collector-fork.cjs .local/logs/pons-v4-buy-fork-20261001.json --v4`
  —PONS_CURVE_V4_REPLAY_FORK_PASSED,33 транзакционных шага.
  Anchor77277186, hash `0x94bb0611699cc073519668afaf75ce1461ca7d2e39f5865fb24a0ec6fa4138be`.
  Curve101, SELL, partial graduation, UR SELL/BUY101/BUY60/BUY40/SELL и conversion.
  Пять пользовательских BUY учтены; продажи и внутренняя конвертация entry не добавили.
  Сохраняются полные blocks/receipts, ledger и открытые Short/Monthly на этапах.
  Лог `.local/logs/pons-v4-buy-fork-run.txt`.

Только локальная копия сети, synthetic USDG и impersonation владельца/оператора.
В тестовых swaps minOut=1; это не готовая защита реальной торговли. Реальный Pons
operator не вызывался. Розыгрыши, RNG, freeze/settlement и призовые выплаты этим
прогоном не проверены: следующий пакет — общий локальный Promo cycle и recovery.
