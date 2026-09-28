# USDG → ETH: первый fork proof

Исторический первый proof. Текущий script уже использует [CLQuoter и точную read-only симуляцию](OPS_MARKET_QUOTE.md); trial/snapshot ниже описывают сохранённый первый прогон.

28.09.2026. **Исполнение на локальном fork прошло; production swap executor ещё нет.**
[Evidence](../research/ops-funding/market-fork-2026-09-28.json),
[воспроизводимый research script](../scripts/ops-market-fork.cjs).

Команда: `node scripts/ops-market-fork.cjs .local/logs/ops-market-fork-4.json`.
По умолчанию read-only proxy перед Blockreq, override RH_RPC_URL. Создаётся только
in-process Hardhat31337; upstream допускает только чтение, public sends невозможны.
Выходной файл должен быть новым. USDG баланс sandbox пользователя искусственный,
ETH аккаунта Hardhat тестовый; код router/manager/tokens не подменяется.

## Реальный маршрут

Официальный [WETH/USDG pool](https://blog.pancakeswap.finance/articles/rh-lp-fees)
прочитан через poolIdToPoolKey и getLiquidity. Block74775375, hash и runtime hashes
сохранены в evidence. Pool id пересчитан из key и совпал. Hook нулевой, manager
0xee04…bc6f, WETH0x0bd7…ad73, USDG0x5fc5…d168. Fee field90pips и protocolFee
вместе требуют чтения chain, не копирования округлённой надписи0.01% с сайта.

Router0x57fc…E504 — официальный Infinity UniversalRouter. Его runtime hash
проверяется script перед действием. [Pancake Permit2](https://github.com/pancakeswap/pancake-developer/blob/master/docs/pages/contracts/permit2/addresses.md)
на4663 —0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768, НЕ стандартный Uniswap адрес.
Первый trial со стандартным Permit2 дал AllowanceExpired(0); после проверки
официального адреса и его присутствия в runtime повтор прошёл.

Bounded USDG approve → bounded Permit2 allowance с expiry → router commands
INFI_SWAP + UNWRAP_WETH, без ALLOW_REVERT. Swap: exact-input single USDG→WETH,
SETTLE_ALL не больше input, TAKE на router; unwrap выдаёт ETH непосредственно
sandbox operations адресу. Обе последние операции — одна транзакция.

| Измерение | Результат |
|---|---:|
| USDG списано | 10.000000 |
| ETH получено до gas | 0.003754920360290634 |
| minOut, trial quote минус0.5% | 0.003736145758489180 |
| estimate swap+unwrap | 226066gas |
| actual swap+unwrap | 198876gas |
| USDG approve / Permit2 approve | 57976 /47665gas |
| Все3комиссии на этом fork | 0.000308391730190142ETH |

Native output проверен по фактическому изменению баланса получателя с возвратом
комиссии swap в расчёт; USDG debit ровно10USDG. Завышенный minOut (двойная quote)
отклонён без списания USDG. Trial quote выполнена реальной локальной транзакцией
под snapshot/revert; её комиссия не входит в3боевых шага выше.

**Эти gas/fee — локальная Hardhat модель, не тариф Nitro/L1-data и не расчёт
самоокупаемости.** Proof показывает исполнимость маршрута и output; расходы реальной
отправки worker должен проверять по актуальным данным сети.

## Осталось перед автоматическим swap

- Production read-only quote/estimate: trial transaction+snapshot не переносится
  в публичный worker. Подтвердить quoter либо другой безопасный способ preview.
- Полные source/immutable pins (Sourcify ABI доступен, runtime-details API ограничивал
  rate/timeouts); saved hashes/поведенческий proof не заменяют полный source audit.
- Один владелец ops signer/nonce и durable steps approve/swap/refill; сверять неизвестный
  receipt прежде повторов. Существующие refill recovery tests не доказывают swap recovery.
- Выбрать bounded batches/slippage/gas caps; ожидание при тонком рынке и дорогом gas,
  проверить плохую ликвидность. Текущий negative case — minOut, не исчерпывающий stress.
- Не зависеть от собственного TOKEN и не расходовать prize reserves; seed ETH нужен.

В этот пакет входит native refill из slot1, но сам swap script остаётся только
research. Публичный execution gate не открыт; production approval этим proof не дан.
