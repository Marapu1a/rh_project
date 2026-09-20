# Drand evmnet: проверка подписи и стоимость

17.09.2026. Первый ограниченный feasibility package. **Техническая проверка прошла;
решение о production integration ещё не принято.** Short/Monthly и казна не менялись.

## Что исполнялось

Отдельная research fixture использует неизменённые MIT-исходники
[kevincharm/bls-bn254](https://github.com/kevincharm/bls-bn254/tree/9f70fb4dff2cd0921dc2144929dc0aff6f21a9b9)
на commit `9f70fb4dff2cd0921dc2144929dc0aff6f21a9b9`. В Git сохранены лицензия,
URL и SHA-256; перед компиляцией проверяются hashes. В production dependency graph
библиотека не добавлена. Эксперимент не подтверждает аудит библиотеки.

Round 9337227 взят из API evmnet, промежуточные message/hash-to-point — из
[закреплённого тестового вектора randa-mu](https://github.com/randa-mu/bls-solidity/blob/11af179a8287d978659aae07adb66aa60f64b8a6/test/data/testcases.json).
Лицензия источника сохранена. Дополнительно проверена подпись round 20716103
из предыдущего RPC/HTTP evidence. Это два настоящих historical beacon, не mock.
Сверены порядок координат public key, uint64 big-endian round message, DST,
hash-to-point и canonical `sha256(signature)`.

Исходный deep-research текст нельзя копировать буквально: в нём промежуточная
точка разбита на строки 63/65 hex digits вместо 64/64. Первый запуск теста выявил
это расхождение; fixture теперь использует оригинальный машинный vector.

## Результаты

Solc 0.8.37, optimizer 200, Cancun, без viaIR; стандартный 24 576-byte limit включён.

| Измерение | Результат |
|---|---:|
| Runtime fixture | 9 139 bytes |
| Initcode | 9 167 bytes |
| Calldata prove | 164 bytes |
| Local verify transaction | 176 491 gas |
| Local prove + первое сохранение | 225 068 gas |
| Local повтор того же proof | 183 476 gas |
| Robinhood mainnet prove estimate | 233 440 gas |
| Robinhood testnet prove estimate | 242 540 gas |

Локальные цифры — receipts Hardhat; remote цифры — `eth_estimateGas` в записанных
pinned blocks, не оплаченные receipts и не постоянный тариф. USD-стоимость не выводим.

На **обоих Robinhood RPC** выполнен настоящий bytecode через `eth_call` с state
override: валидная подпись принята, чужой round отвергнут, prove возвращает ожидаемый
hash. Это существенно больше пустого pairing smoke test: исполняется hash-to-curve
и проверка подписи. Но **контракт в публичную сеть не деплоился**, транзакций не было,
изменённое состояние не сохраняется. Это не fork-тест и не проверка mempool/keeper.

## Что проверяют тесты

- Две настоящие подписи, ожидаемая промежуточная точка первого vector и SHA-256.
- Чужой round ±1, неверный key/DST, испорченная подпись, нулевая/не принадлежащая
  кривой точка, координаты за пределами поля.
- Пустые, короткие и избыточные signature bytes; round zero.
- Неуспешный proof не создаёт запись; другой caller может доставить верный.
- Повтор не меняет результат и не создаёт второй event; неверная подпись не проходит
  даже после сохранения. Проверка proof повторяется намеренно — кеш не обходит auth.
- Поздняя первая доставка и повтор после дополнительных 30 суток проходят.
- Формула номера round проверена на 10 000 временных точек, включая точные границы.

`proven` хранится отдельно от randomness; значение zero не является sentinel.
В fixture нет управления казной, seed setter, смены ключа, refund или owner.
Параметризованный `check` существует только для отрицательных тестов и не изменяет
key/DST, используемые `prove`. Это исследовательский интерфейс, не production ABI.

## Воспроизведение

1. `npm run test:drand` — offline local EVM; переписывает local-result.json.
2. `npm run check:drand:rpc` — публичные read-only запросы; переписывает rpc-result.json.
3. `npm test` — прежний основной набор проекта; research drand suite запускается отдельно.

Артефакты и source pins: [research/drand-feasibility](../research/drand-feasibility).
Все API vectors уже сохранены, сеть локальным тестам не нужна.
Проверки этого пакета: полный существующий `npm test` **167/167 passed**;
отдельный `npm run test:drand` **2/2 passed**; remote RPC checks **2/2 passed**.

## Чего это НЕ доказывает

Не доказаны корректность криптографии для всех входов, независимость операторов,
непрерывная доступность exact round, backfill после outage и безопасность production
интеграции. Сопоставление с чужим vector не является независимым криптоаудитом.
Нет frozen draw binding, finality policy, keeper или mainnet deployment.

Формула `roundAtOrAfter(t) = 1 + ceil((t - genesis) / period)` для t >= genesis
исправляет сдвиг в исследовании. Для строго более позднего целочисленного времени
используем deadline + 1. Это только арифметика расписания — **не защита от reorg**.

## Следующий ограниченный шаг

Локально моделировать binding frozen context → один будущий round: задержка seal,
границы расписания, повтор доставки, restart и reorg до принятой finality.
Нужно выбрать модель, которая не допускает известного исхода при freeze и не
превращает опоздание подготовки в вечную блокировку. Не объявлять 60 минут гарантией.
Read-only наблюдение latest/safe/finalized поможет определить assumptions, но RPC
наблюдение само по себе не даёт on-chain доказательство finality.

После согласования timing/binding — production adapter и отдельная проверка в
testnet с настоящей транзакцией. На этом этапе технического gas/size blocker не найдено.
