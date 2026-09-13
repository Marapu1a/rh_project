# Текущий ответ GPT

Обновлено: 13.09.2026.
Прочитан запрос commit `bf9014ae5390cf52e88fa21f195ba03192ad45a5`.

Тема: простой jackpot cycle для MVP. Это обсуждение, не разрешение менять код.

## Главный вывод

Упрощённый кандидат бухгалтерски согласован. Фиксированный старт `T = 100 USDG` на весь MVP не создаёт accounting-проблемы. После крупного выигрыша отображаемый jackpot может резко упасть до нового Current порядка `A + 100`, но это продуктовый эффект reset-to-floor, а не потеря денег.

Ключевое уточнение: monthly freeze должен сам после `syncUSDG()` зафиксировать **весь** текущий `freeCurrent` как `F`. Budget лучше не передавать из controller, иначе direct USDG между внешним расчётом и reserve нарушит смысл «весь Current».

## Переходы

| Состояние | Деньги | Attempts |
|---|---|---|
| Next < 100 на checkpoint | ничего не резервируется | OPEN сохраняются |
| Ready → freeze | `F = freeCurrent` → reserved; `freeCurrent=0`; Next=100 остаётся | текущий OPEN locked |
| Pending + funding | F неизменен; новые Current-поступления образуют A | новые BUY → новый OPEN |
| Terminal no-win | F возвращается в Current → `A + F`; Next=100 | locked → consumed |
| Terminal win | F → claimable winner; Next 100 → Current → `A + 100`; Next=0 | locked → consumed |
| Random pending | F остаётся reserved | старые locked, новые копятся OPEN |

## Что должно быть атомарным

Для monthly нельзя использовать общий `finalize()` отдельно от cycle transition. Иначе появляется путь: вернуть F как no-win, а затем отдельно попытаться сделать win-transition.

Минимальная смысловая модель API:

```text
startMonthly(drawId, campaignId)
settleMonthly(drawId, winnerOrZero)
```

`startMonthly` внутри Vault:

1. `syncUSDG()`;
2. проверяет, что другого pending monthly нет;
3. проверяет `freeNext == nextStartTarget`;
4. берёт весь `freeCurrent` как F;
5. резервирует F и отмечает draw как MONTHLY/pending.

`settleMonthly` перед любым переходом снова делает `syncUSDG()` и затем атомарно выполняет ровно один terminal outcome.

При no-win: `reserved -= F`, `freeCurrent += F`, Next не меняется, pending очищается.

При winner: весь F становится одним claimable jackpot-призом, затем `freeCurrent += freeNext`, `freeNext = 0`, pending очищается, `cycleId` увеличивается.

Обязательно: generic `finalize()` должен отвергать MONTHLY; один monthly draw нельзя завершить дважды; Next переводится только внутри terminal monthly-win transition.

Vault при этом пока не доказывает честность participant set, random или факт no-winner — это останется границей будущего production controller/RNG.

## Direct USDG во время pending

Однозначная граница: **и freeze, и settlement сначала делают `syncUSDG()`, а уже потом меняют monthly state**.

Если direct USDG уже лежит в vault до settlement transaction, он синхронизируется пока старый Next ещё полон. Только после этого при win выполняется `Next → Current` и `freeNext=0`.

USDG, пришедший после terminal settlement в порядке blockchain transactions, относится уже к новому состоянию и может снова наполнять Next.

Это не попытка определить реальное время перевода: граница — on-chain ordering. `generalFundingPhase` при cycle transition сбрасывать не нужно, потому что funding policy не меняется.

## Short во время monthly pending

Short можно продолжать: он тратит только `freeShort`, frozen F не меняется.

Один простой reference для ограничения short:

```text
если monthly pending: J = frozen monthly budget F
иначе: J = freeCurrent
```

Так A не увеличивает уже объявленный jackpot, а после terminal settlement новые short используют новый Current. Уже frozen short никогда не пересчитывается.

## No-winner и недоставленный random

Это разные состояния.

`NO WINNER` = существует usable terminal random outcome; attempts consumed; денежный settlement выполняется.

`RANDOM PENDING` = terminal outcome ещё нет; attempts locked; F остаётся reserved; нового monthly нет.

Повторять можно только доставку/завершение того же randomness request, а не новый выбор. Если выбранная RNG-модель способна навсегда потерять результат, immutable система действительно может навсегда оставить F reserved и attempts locked. Без выбранного RNG безопасный универсальный recovery обещать нельзя.

## Pending пережил следующий месяц

Одновременно допускается максимум один pending monthly. Checkpoints, прошедшие во время pending, не создают очередь пропущенных draws. Новые attempts продолжают копиться в следующем OPEN.

После terminal settlement пропущенные draws не replay-ятся. Самый простой clock: следующий допустимый monthly checkpoint — через один обычный monthly interval после settlement.

## Без admin pause

Для этой accounting-модели pause не требуется.

Без pause мы теряем аварийное containment новых draws при обнаружении exploitable bug. Но pause не исправляет frozen draw, claimable debt, плохой random, зависший RNG/controller или ошибку формулы, и сама даёт timing authority над будущими cutoff.

Поэтому для MVP разумно её не добавлять, если этот tradeoff принят явно.

## Фиксированный старт 100 USDG

Бухгалтерского перекоса нет. После win:

```text
старый F = отдельный claimable debt
новый Current = A + 100
Next = 0
```

Если нового оборота нет, следующий monthly просто не готов, пока Next снова не наполнится до 100.

Текущий constructor допускает любой положительный target, поэтому при публичном обещании T=100 deployment должен однозначно проверяться как экземпляр именно с этим immutable значением.

## Один минимальный следующий этап кода

Если владелец подтверждает модель, следующий этап можно ограничить только monthly jackpot accounting, без RNG/entries/indexer:

1. monthly draw kind / отдельный monthly path;
2. один `pendingMonthlyDrawId` и простой `cycleId`;
3. `startMonthly`, который после sync сам замораживает весь Current;
4. атомарный terminal settlement win/no-win;
5. при win весь F → claimable одному winner и `freeNext → freeCurrent`;
6. generic finalize запрещён для MONTHLY;
7. тесты A+F, A+100, pre-settlement sync, double-finalize, concurrent monthly, late claim.

Без RNG, participant logic, pause и target schedule.

## Решения владельцу

Осталось два действительно нужных решения:

1. Подтверждаем ли для MVP `T = 100 USDG` на весь экземпляр/cycles без изменения target?
2. Подтверждаем ли monthly clock: если pending пережил checkpoint, пропущенные monthly не накапливаются, а следующий допустимый запуск — через один обычный interval после terminal settlement?

Если да, бухгалтерская часть jackpot cycle достаточно определена для следующего маленького этапа.