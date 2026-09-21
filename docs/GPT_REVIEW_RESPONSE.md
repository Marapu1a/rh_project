# Постоянный ответ GPT

Обновлено: 21.09.2026.

Это независимое review-мнение, не задание на автоматическое исполнение. При следующем
обращении файл следует полностью перезаписать.

Просмотрен commit `f049befa7c71127c7e8b44bcca7adba78642b3c4` —
`Clean up failed lock initialization and calibrate local execution gas`.

## Короткий вердикт

Подтверждённый PID-init defect закрыт в нужной границе. После успешного `openSync('wx')`
запись PID и первоначальный close теперь защищены тем же `finally`, который удаляет только
уже приобретённый этим вызовом lock. `EEXIST` остаётся до owned cleanup. Fault tests на
одиночные write/close failures корректны: action не начинается, fd закрывается, lock
удаляется, повторный вход проходит.

Первая gas calibration пригодна как вход в **локальный** дизайн funding/refill. Разделение
execution gas, fixture seed delivery, controller RNG transfer и модельной native-стоимости
в коде проведено корректно. Старые 3M действительно нельзя считать достаточным bound:
сохранённые max estimates для `processShort` и `finishShort` выше него. Профиль точно
соответствует формуле `ceil(maxEstimate × 1.10)`, после чего monetary forecast отдельно
применяет `safetyBps=12500`.

Ключевой N1000/admitted64/BOTH boundary я независимо воспроизвёл: 34 свежих CLI child,
уникальные transaction hashes, последовательный chain progress, отсутствие lock после
каждого child и в конце, ожидание после повышения заниженного bound, topup и точное
равенство native delta сумме receipt fees. В моём повторе completion потребил
41 144 068 gas / 0.082288136 native при 2 gwei. Отличие от сохранённых 41 825 829 gas
ожидаемо для другого block/address/context и не вышло за кандидатный profile.

Блокера для следующего ограниченного design-step нет. Но сохранённый evidence пока нельзя
называть самодостаточно воспроизводимым: его `sourceHashes` не фиксируют commit, dirty state,
сами calibration/render/child scripts, budget/lock code, все генераторы входных данных и
версии Node/Hardhat/ethers. Это не опровергает измерения текущего commit, но ослабляет их
provenance. До production bound всё равно далеко: sampled seeds/rules/N10k не дают worst-case,
а contract MAX_N отсутствует.

## Lock cleanup

Текущая структура соблюдает основные свойства:

- чужой lock при `EEXIST` только инспектируется и не удаляется;
- после приобретения своего lock initialization failure не продолжает чтение state/action;
- cleanup close обёрнут так, что попытка unlink выполняется даже при ошибке close;
- нормальная action rejection по-прежнему освобождает lock до наблюдаемого rejection.

Остаётся узкий диагностический недостаток при **двойной** ошибке. Если PID-write падает,
а cleanup-close тоже падает, исключение из `finally` заменяет первоначальную ошибку. Я это
воспроизвёл: primary `EPRIMARY` был заменён на `ECLEANUP`, хотя unlink всё же прошёл.
Аналогично release error может замаскировать action error. Это не liveness-блокер и не
основание добавлять stale-lock reset, но для эксплуатации полезно сохранить primary error
как `cause`/поле либо агрегировать обе ошибки. Текущие тесты проверяют только один
инъецированный отказ за раз и этот случай не покрывают.

Во время review был ещё один важный эффект среды. Запуск с output под `.local` в общем
синхронизируемом workspace один раз получил EEXIST, а после успешного traced run старый
lock снова появился уже после assertions. У восстановленного файла birth time был примерно
на 2,3 секунды позже сохранённого mtime, owner принадлежал предпоследнему завершённому child.
Тот же сценарий с output в `/tmp`, вне синхронизации workspace, прошёл полностью и lock не
оставил. Поэтому это не возвращённый finding против `withState`, а внешнее восстановление
удалённого ephemeral-файла. Для shared/synced checkout путь state/lock нужно размещать на
настоящем локальном runtime volume; сам lock всё равно не является distributed lease.

## Что подтверждено в calibration

Сохранённый JSON внутренне согласован:

- 8 cases, 16 seed-вариантов и 2 280 measured transactions;
- все перечисленные source hashes совпадают с текущими файлами;
- каждый gas bound измеренного метода равен `ceil(global max estimate × 1.10)`;
- `executionGas` включает prepare/freeze и completion выбранного seed, но не `deliver`;
- `fixtureDeliveryGas` вынесен отдельно;
- `executionNativeActual` — фактический gas расход плательщиков транзакций;
- `controllerRngFee` — native transfer контроллера в fixture provider, а не gas executor;
- boundary `nativeSpent` считается только для уже frozen completion и не смешан с
  подготовкой двух draw.

Boundary проверяет именно заявленную логику: один фактический executor address обслуживает
две frozen obligations, budget одного draw меньше общего; профиль с единичными bounds
сначала допускается, повышение `processShort` переводит gate в `nativeFunding`, затем
topup восстанавливает готовность. Каждый clean child заново читает state bounds и on-chain
`nextChunk`; 34 разных tx и финальные pending=0 исключают повторный process в этом проходе.

Это не проверяет crash между broadcast и сохранением результата. У measurement child нет
pending journal, и использовать его как worker нельзя; существующий coordinator recovery
остаётся отдельной границей. Также не измерены closeEmpty/prize-flow, real RNG, DEX/refill,
keeper/RPC overhead, claims, deployments и chain-specific L1/blob fees. Оставленные для
неизмеренных методов 3M — старые fixture placeholders, не калиброванные значения.

## Достаточность для funding/refill

Для проектирования локального контура данных достаточно: есть несколько масштабов,
совместная Short+Monthly нагрузка, stress64, фактические receipts, изменение estimates и
clean restart. Консервативное применение одного max на каждую оставшуюся порцию плюс 10%
gas и 25% monetary safety намеренно сильно завышает forecast, но безопасно для первого
варианта.

Перед реальным автоматическим refill блокерами будут уже другие решения:

1. Явно определить источник ops-средств и authority. `freeShort/freeCurrent/freeNext`,
   `reserved` и `claimable` — призовые buckets, не «свободная доля проекта» и не могут
   неявно стать источником gas.
2. Либо enforce эксплуатационный предел participants/chunks/rules, либо возвращать
   `unsupportedEnvelope` за пределами калиброванного профиля. Иначе target не является
   гарантией завершения.
3. Зафиксировать fee model конкретной сети и отдельно получить реальные RNG/swap/extra-fee
   параметры. Табличные 1/2 gwei для этого не годятся.
4. До публичного auto-send нужен тот же durable intent/hash/receipt/unknown-send recovery,
   что у coordinator. Повтор после неизвестного результата не может быть обычным retry.

Пробел provenance стоит закрыть до объявления calibration стабильным baseline: записывать
commit hash и dirty flag, хэши трёх calibration scripts, budget/state helpers, fixture/input
generators и lockfile зависимостей; также версии Node, Hardhat и ethers. Это небольшой
evidence fix, а не причина откладывать чистый API design.

## Минимальный API до кода

Сначала достаточно чистого planner, не встроенного swap:

```text
planNativeRefill(anchor, profileId, obligations, balances, fundingSource, policy)
  -> ready | waitExpensiveGas | needsRefill | blocked
```

Вход должен фиксировать anchor block/hash; фактические payer addresses; remaining
obligations и RNG liabilities; доступную **именованную ops/project share**; текущий gas
price; low-watermark, target, signer buffer, max per refill, max per period, cooldown и
минимальный остаток источника. Роли с одним адресом дедуплицируются так же, как сейчас.

Результат должен содержать по каждому recipient `required/current/shortfall/targetAmount`,
причину решения, применённые caps, profile/policy hashes и idempotency key. Правила:

- low-watermark только запускает refill, а target определяет сумму;
- сумма ограничена shortfall, доступной ops-share и per-refill/period caps;
- частичный refill не даёт начинать новую обязанность, если уже frozen completion всё ещё
  недофинансирован;
- дорогой gas, устаревший anchor/quote или unsupported envelope дают wait/blocked без send;
- перед созданием intent balances/anchor перепроверяются;
- intent сохраняется до broadcast, затем сохраняются hash/nonce и receipt outcome;
- unknown send останавливает новые расходы до reconciliation.

Swap adapter, price/slippage guard и реальный RNG adapter можно подключить к этому контракту
позже. В первом bounded шаге достаточно bootstrap/native transfer из уже утверждённого
ops-источника; смешивать одновременно новую accounting policy, DEX и production recovery
не нужно.

## Выполненные проверки

- заявленная targeted выборка — **37/37**, fail 0, 105.5 s;
- отдельный lock suite — **5/5**;
- независимый N1000/admitted64/BOTH run вне synced workspace — успешно, 34/34 child;
- consistency/profile/source-hash проверки сохранённого JSON — успешно для перечисленных
  в нём файлов;
- injected dual-fault — подтверждено маскирование primary error при успешном unlink;
- `git diff --check a395476..f049bef` — ошибок нет;
- полный `npm test` и полный повтор всех восьми calibration cases не запускались;
- пользовательский `docs/INDEPENDENT_AUDIT_2026-09-19.md` не изменялся.
