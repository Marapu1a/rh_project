# Прямой USDG BUY — локальный прототип

Продолжение01.10: [browser rehearsal](PONS_PURCHASE_UI.md) реализован отдельно
на simulated adapter. Соединение этого planner с browser wallet ещё впереди.

## Назначение

Покупка с контролируемым форматом для существующих curve/v4 BUY adapters.
Pons UI может выбрать 0x или wallet batch; этот маршрут готовит только отдельные
прямые вызовы. Порог билета100USDG и остальные правила не меняются.

`scripts/pons-direct-purchase.cjs` готовит один unsigned EIP-1193 request.
Он требует точный `hardhat_metadata.instanceId` и chain4663: public RPC
не поддержан. Это ещё не включённая покупка на сайте и не production admission.

## Последовательность

1. Проверить manifest, runtime hashes, factory/curve/hook bindings, фазу,
   баланс USDG и отсутствие кода у выбранного EOA на одном snapshot block.
2. Для curve: approve USDG на curve, только на введённую сумму.
   Для pool: approve USDG на Permit2, затем Permit2 approve на UniversalRouter.
   Недостаточный ненулевой ERC20 allowance сначала сбрасывается в ноль.
   Достаточные approvals пропускаются. Permit2 разрешение ограничено суммой
   и временем; истекающее в ближайшие60сек обновляется на20мин.
3. После каждого receipt подготовить следующий шаг заново, включая фазу рынка.
4. Когда approvals готовы, получить котировку через curve `eth_call buy`
   или Pons v4 Quoter и применить явно переданный slippage (1–500bps,
   для локального прогона100bps). Нулевой минимум запрещён.
5. Симулировать точный следующий вызов. Pool использует command0x10,
   actions0x060c0f, zero price limit, empty hookData и deadline20мин.
6. Локальный wallet bridge исполняет request через тот же проверенный Hardhat
   RPC, без batch. Проверяет hash/receipt и точное соответствие from/to/input/value.
   При revert/pending/ошибке останавливается без автоматического повтора.

`pons-direct-purchase-rehearsal.cjs` моделирует выбранный аккаунт EIP-1193:
Hardhat impersonation не добавляет адрес в eth_accounts. Это не тест расширения
MetaMask или пользовательского переключения аккаунтов. Известный hash сохраняется
в fork evidence сразу после отправки, до проверки receipt.

## Границы

- Curve partial fill, завершающий graduation, пока блокируется: контракт
  масштабирует minTokensOut при возврате части платежа, что требует отдельного
  расчёта/проверки. Сам decoder такие исполнения уже умеет учитывать.
- Промежуточная фаза graduation блокируется до открытия pool.
- Smart/delegated accounts, aggregator, другой входной актив не допускаются.
- Curve ABI не имеет deadline. Production wallet должен проверять свежесть
  review и состояние аккаунта/сети перед каждым пользовательским подтверждением.
- Quoter имеет фиксированный адрес из доставленного Pons UI; наличие кода и
  результат eth_call проверяются локально, но отдельного production source/runtime
  admission Quoter здесь нет. Минимум дополнительно проверяется симуляцией Router.
- Rehearsal не является durable production sender. Pending/unknown hash,
  восстановление после закрытия браузера, отзыв оставшихся approvals, отображение
  комиссии/gas и browser UX требуют отдельного шага перед включением фронта.

## Проверка

Адресные tests: `node --test test/pons-direct-purchase.test.cjs test/pons-v4-buy.test.cjs test/pons-curve-buy.test.cjs`.
Профиль: `node scripts/test-launcher.cjs --profile pons-direct-purchase` (без compile).

Fork: `node scripts/pons-collector-fork.cjs .local/logs/NEW_FILE.json --direct-purchase`.
Флаг включает v4 replay и заменяет BUY101 на curve, а также v4 BUY101/60/40
новым planner/bridge. SELL, funding и graduation остаются существующими fixture
операциями; graduation использует тестовый нулевой minOut. USDG/ETH синтетические,
owner/operator impersonation только локальная. Результат ниже не full suite.

01.10.2026: **PONS_DIRECT_PURCHASE_FORK_PASSED**, anchor77402505
(`0x913044794ff3d3fb5a012bc714f78159666dabb0440d52f713b1928a8dd2ed07`).
12 отдельных запросов: curve approve+BUY101, pool reset+approve+Permit2 approve+BUY101,
затем approve+Permit2 approve+BUY60 и BUY40. Все4 BUY признаны ELIGIBLE;
фактически полученные токены не ниже заданного минимума. Первый101 даёт1 билет
и1USDG carry;60+40 добавляют1 билет. Проверены replay/dedup и funding соседнего
сценария, новый полный draw/automation cycle не запускался.
[Компактное evidence](evidence/PONS_DIRECT_PURCHASE_2026-10-01.json), полный вывод
`.local/logs/pons-direct-purchase-20261001-c.json` / `.txt`.

Адресные tests15/15 PASS (3 planner guards +12 curve/v4 neighbors); после добавления
zero-address guard повторены только3 planner tests, PASS. Логи:
`.local/logs/pons-direct-purchase-tests.txt`, `pons-direct-purchase-guard-final.txt`.
Syntax, profiles JSON, docs links и diff проверены отдельно.

Первый fork остановился на ошибке модели eth_accounts для impersonation; исправлено.
Второй прошёл BUY replay, но унаследовал достаточные mainnet allowances;
финальный прогон специально выставил локально недостаточное/истёкшее разрешение.
Это причина повторного запуска, а не дополнительные доказательства production.

Следующий шаг — локальный browser review flow: сумма USDG, котировка/минимум,
отдельные подтверждения, смена аккаунта/сети, отклонение и pending/unknown receipt.
Public admission, live wallet sender и включение кнопки покупки остаются закрыты.
