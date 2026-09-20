# Постоянный ответ GPT

Обновлено: 20.09.2026.

Это независимое review-мнение, не задание на автоматическое исполнение. При следующем
обращении файл следует полностью перезаписать.

Просмотрен commit `60ac0e75d36423f5dbf627591f802a90543d9b80` —
`Automate local prize conversion flow and bounded legacy payouts`.

## Короткий вердикт

Новый `local-prize-flow-v1` по существу соединяет безопасный локальный custody path:
оба актива доходят из source до FeeRouter, TOKEN prize share платится converter'у,
фактический USDG доставляется immutable vault, project recipients получают свою долю,
а старые явно перечисленные долги не теряются. В денежной conservation, повторном pay,
двойном swap/forward или обходе ветки unsafe legacy я блокирующего дефекта не нашёл.

Полный основной набор независимо прошёл **232/232** (`fail 0`, ~511 s). Старые USDG,
draw/scheduler и CLI пути в этом прогоне не сломались.

Есть один подтверждённый дефект операционной телеметрии: после успешной tx переменная
`current` сохраняет её action/hash. Если следующий обычный RPC-read падает, результат
ошибочно приписывает read error предыдущей уже подтверждённой транзакции. Внутри pass новых
writes после ошибки нет, поэтому это не денежный exploit. Но перед общим coordinator это
нужно закрыть: reconciliation не должен отправлять оператора проверять не тот intent.

## Подтверждённый finding: stale action/hash после read failure

В `runPrizeFlow` объект `current` устанавливается перед `send`, после успешного receipt
получает `transactionHash`, но затем не очищается. Outer catch дополняет любую следующую
ошибку через `...current` и даже использует `current.transactionHash` как fallback.

Я отдельно воспроизвёл сценарий:

1. `collect` успешно mined, `source.collections() == 1`;
2. следующий `source.claimable(...)` падает с synthetic `NETWORK_ERROR`;
3. `runPrizeFlow` корректно останавливается со `status: error`, но сообщает:

```json
{
  "action": "collect",
  "transactionHash": "<hash успешного collect>",
  "message": "synthetic read outage",
  "code": "NETWORK_ERROR"
}
```

То есть hash настоящий, но относится не к неизвестной tx, а к уже успешной. Такой же stale
context возможен после pay/forward/harvest/convert, если следующий read или callback упадёт.

Граница исправления узкая: pending intent должен жить только внутри незавершённого `send`.
После confirmed receipt и после обработанного definite rejection его надо очистить; read error
не должен получать `transactionHash` предыдущей tx. Если полезно хранить последнюю успешную
операцию, это отдельное поле `lastConfirmed`, а не evidence неизвестного intent. У error из
`sendLocalTransaction` уже есть собственные `stage/transactionHash`, fallback на старый hash
не нужен.

Нужна одна регрессия: confirmed collect → RPC failure на следующем `claimable`; результат
должен быть `error` без ложного tx intent/hash и без последующих writes.

## Назначение активов и legacy

Для доверенного локального job роли проведены правильно:

- active prize slot 0 обязан быть проверенным converter;
- TOKEN для `usdgVault` никогда не вызывает `FeeRouter.pay` и остаётся credit;
- USDG старому vault платится и синхронизируется;
- old converter получает оба актива, продаёт свой inventory и сохраняет своё immutable
  назначение;
- project entries допустимы только из historical slots 1/2 с положительным bps;
- повторяющиеся и пересекающиеся current/legacy addresses отвергаются до writes.

`unsafeDebt` обновляется после обеих distribution-фаз, поэтому новый TOKEN, полученный после
collect/harvest, тоже попадает в отчёт. Worker не выдаёт эту диагностику за on-chain
quarantine: публичный внешний `pay(TOKEN, oldVault)` всё ещё возможен. Это честная граница.

Двойного исполнения не видно:

- успешный `FeeRouter.pay` обнуляет credit;
- converter accounting исключает повторную продажу/доставку;
- в одном pass разрешена одна convert-порция на converter;
- общий private skip не повторяет definite failure во второй distribution-фазе;
- unknown outcome выходит через outer catch и новых writes не разрешает.

При failed forward converter пропускается в swap-фазе, поэтому worker не наращивает у него
новый USDG поверх уже недоставленного quote. Broken swap, напротив, не блокирует USDG,
project recipients, collect или harvest — порядок фаз выбран правильно.

## Skip keys и статусы

Ключи достаточно узкие для текущего scope:

- pay: action + router + asset + recipient;
- harvest: action + router + asset;
- forward/convert: action + конкретный converter;
- allocate: action + конкретный vault.

Поэтому отказ TOKEN payment не блокирует USDG тому же recipient, отказ одного converter не
блокирует другой, а collect failure не маскируется под harvest failure. Router `sync` оставлен
неизолированным, что верно: accounting deficit/ошибка recognition не должна разрешать
дальнейшие writes.

Статусы в основном честны:

- definite failures или unsafe debt → `degraded`;
- оставшийся inventory без failures → `yielded`;
- gas/nonce/executor/anchor → `waiting`;
- unknown send/receipt/read → `error` и stop;
- abort → `stopped`.

Единственное найденное искажение — не сам status, а stale action/hash в описанном выше
read-failure сценарии.

## Historical witnesses: достаточно ли их

Для заявленного **доверенного local job** проверки campaign/slot/role достаточны. Они
доказывают, что адрес действительно стоял в указанной policy и что job не переименовал
исторический slot 0 в project recipient.

Они не доказывают семантику или неизменность кода. Контракт в slot 0 может быть proxy,
getter'ы показывают только текущее состояние, а один и тот же current recipient получает
агрегированный старый credit без campaign attribution. Поэтому для production нужны manifest,
implementation/code-hash verification и доказательство, что shared address не менял
destination/роль во времени. Это не дефект текущего честно локального worker, а граница
между trusted config и deployment attestation.

## Starvation и default limit

Обычного воспроизводимого starvation при default `maxSteps=128` я не вижу.

При текущей schema максимум:

- 8 legacy entries;
- active converter;
- 2 current project recipients;
- две distribution-фазы;
- collect + два harvest;
- по одному convert и post-swap forward на converter.

Даже если считать истинными все условные send-ветки в обеих distribution-фазах, включая
повторные sync/forward при внешних изменениях, control-flow даёт не более **123 tx attempts**.
Default 128 покрывает текущий путь. Без concurrent mutations обычный максимум ниже — около 94.

Но запас всего пять попыток. Это не текущий bug, зато хрупкая константа: один новый action
может незаметно сделать стандартный watch вечно доходящим только до ранних фаз. Разумно
зафиксировать worst-case bound тестом или вычисляемым assertion рядом со schema limits.
Малые debug limits без persistent cursor действительно могут starvation и остаются честно
названным ограничением.

## Compatibility

Общий CLI различает новую schema до старых funding/revenue/draw validators, создаёт только
нужный binding и сохраняет прежние интервалы watch. В полном прогоне прошли прежние USDG
funding/revenue, transaction classifier, scheduler, BUY-cycle и converter tests.

Новый CLI integration test проверяет реальный полный prize pass. Отдельного regression
для unknown pay/collect/harvest именно через новый wrapper нет, но все действия проходят
через один `send` и прежний `sendLocalTransaction`; общий classifier и старые revenue cases
остались зелёными. Это допустимый coverage reuse, не повод копировать всю матрицу.

## Следующий ограниченный пакет

После узкого исправления stale error context разумен `local-ops-coordinator-v1`, а не
production supervisor и не автоматический refill.

Минимальный scope:

1. Один process/bundle связывает существующие prize-flow и draw scheduler jobs, не переписывая
   их внутреннюю state machine.
2. Для каждого signer существует ровно одна последовательная write lane. Если money и draw
   используют один адрес, параллельных sends быть не может; разные signers всё равно не должны
   гоняться за одним shared custody transition.
3. Unknown outcome в любой lane глобально запрещает следующие writes до reconciliation.
   Definite swap/recipient failure остаётся degraded и не блокирует независимый draw progress.
4. Gas budget на этом шаге только проверяется: explicit ops address, minimum native balance,
   bounded estimate/allowance на pass. Никакого автоматического пополнения из prize funds или
   неутверждённой creator share.
5. Coordinator делает один bounded money pass и один bounded scheduler pass за итерацию,
   публикует раздельные результаты и не выдумывает durable journal/finality.

Критерии готовности:

- один signer: nonce строго последовательны, concurrent send отсутствует;
- unknown money tx не допускает draw tx и наоборот;
- definite broken swap не мешает уже funded Short/Monthly продолжить работу;
- low ops balance даёт `waiting` до первой tx и не трогает prize custody;
- restart после подтверждённой неизвестной tx продолжает из on-chain/job state без дубля;
- один интеграционный сценарий проходит revenue обоих assets → USDG reserves → Short/Monthly
  execution/claim, сохраняя старые claims и frozen budgets.

## Проверки review

- `npm test`: **232/232**, `fail 0`, ~511 s;
- отдельно воспроизведён confirmed collect + следующий RPC-read outage: stale successful
  collect hash ошибочно попал в error context;
- просмотрены `local-prize-flow.cjs`, новый test suite, общий CLI, converter/FeeRouter/vault
  boundaries и документы текущего шага;
- пользовательский незакоммиченный `docs/INDEPENDENT_AUDIT_2026-09-19.md` не изменялся.

Итого: prize flow можно принять как завершённый локальный участок после небольшой коррекции
error attribution. Она не требует менять денежную логику, но нужна до общего coordinator:
автоматизация с ложным hash — это уже не телеметрия, а генератор будущей паники.
