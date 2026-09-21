# Постоянный ответ GPT

Обновлено: 21.09.2026.

Это независимое review-мнение, не задание на автоматическое исполнение. При следующем
обращении файл следует полностью перезаписать.

Просмотрен HEAD `46d95ee8d3ed76350cf8d0db43b82f83ba0150c6` —
`fix: bind refill fee envelope and persist policy violation halt`.

## Короткий вердикт

Предыдущий подтверждённый fee-envelope defect закрыт в заявленной границе local executor.
Подмена signer-ом `type`, `gasLimit`, `maxFeePerGas` или `maxPriorityFeePerGas` больше не
завершается как обычный `confirmed`: известный hash сохраняется, canonical receipt и
фактический расход учитываются, pending очищается, а `nativeRefillHalt` защёлкивается тем же
atomic save. Следующие вызовы executor и coordinator не отправляют новые транзакции.

Это исправляет опасное тихое продолжение и потерю recovery evidence, но не предотвращает
первую уже broadcast-транзакцию неисправного signer. Код и документация это различие теперь
описывают честно. Caps и source floor остаются pre-send гарантиями при signer, соблюдающем
request; post-broadcast mismatch является alarm/stop, а не возвратом денег.

Подтверждённых блокеров перед следующим bounded-пакетом автоматического сбора obligations
я не нашёл. Это не означает готовность production signer/finality boundary.

## Что проверено в исправлении

Prepared intent хранит полный ожидаемый envelope:

- `type=2`;
- точный `gasLimit` из source policy;
- точный `maxFeePerGas` из принятого fee quote;
- `maxPriorityFeePerGas=0`.

Staging дополнительно валидирует fee ceiling. `txData` извлекает эти поля и из returned
transaction, и из RPC transaction. Несовпадение returned transaction сразу переводит pending
в `broadcastPolicyMismatch`; несовпадение, обнаруженное только при RPC recovery, приводит к
тому же durable halt. Если returned response был подозрительным, последующее совпадение RPC
не снимает нарушение.

Legacy pending без `feeEnvelope` не получает неявного доверия: при известном hash его receipt
можно безопасно учесть, после чего автоматика останавливается. Hashless prepared intent, как и
раньше, остаётся неизвестным исходом без автоматического retry.

`finalizeNativeRefill` сначала проверяет прежнюю transaction/receipt/block/history identity,
затем считает actual debit. В одном новом состоянии находятся:

- обновлённый `nativeRefillHistory.spent`;
- `lastResolved` с `actualDebit`, `budgetExceeded` и `policyMismatch`;
- удалённый pending;
- durable `nativeRefillHalt` с expected/observed envelope и transaction hash.

Контракт `commit(save-before-mutate)` сохранён. Поэтому failed final save оставляет старый
известный pending; reload повторно читает original receipt и снова вычисляет тот же halt без
повторной отправки. Отдельный journal не появился.

## Проверка прежней reproduction

Новая real Hardhat regression повторяет существенную часть прежнего сценария: wrapper signer
сохраняет адрес/получателя/value/nonce, но отправляет 100 gwei max fee и 50 gwei priority fee.
При выключенном automine первый запуск сохраняет hash и состояние
`broadcastPolicyMismatch`, а не теряет broadcast. После mining и reload:

- original receipt находится и учитывается;
- фактический перерасход отмечается `budgetExceeded`;
- pending очищается;
- `nativeRefillHalt` сохраняется;
- следующий запуск возвращает `broadcastPolicyMismatch`;
- число send остаётся равным одному.

То есть прежний сценарий больше не возвращает нормальный `confirmed` и не может незаметно
перейти к следующему refill. При этом первый physical debit всё ещё может превысить planned
`maxSourceDebit` и нарушить floor — именно поэтому документация не называет этот механизм
pre-broadcast enforcement.

## Coordinator stop

После typed native-refill recovery coordinator проверяет `nativeRefillHalt` до pending-nonce
checks, budget collection и обоих workers. Targeted regression дополнительно фиксирует, что
при уже сохранённом halt:

- возвращается `reason='broadcastPolicyMismatch'`;
- state-файл остаётся байт-в-байт неизменным;
- nonce execution signer не меняется.

Путь, где recovery сам в текущем pass создаёт halt, тоже корректен: finalizer очищает pending,
после чего общий halt check не допускает draw/prize работу.

Поле `requiresReconciliation=true` при уже очищенном pending фактически означает ручное
решение оператора, а не ожидание ещё одного receipt. Это небольшая терминологическая
шероховатость, но не safety defect; отсутствие автоматического reset соответствует текущей
fail-closed границе.

## Оставшиеся границы

- Нельзя гарантировать fee/floor до broadcast через интерфейс `sendTransaction`, если сам
  signer меняет request. Signature-before-broadcast verification потребовала бы другой
  signing/broadcast design.
- Полностью злой signer всё равно способен расходовать source вне executor; этот пакет лишь
  обнаруживает несоответствие транзакции, отправленной через данный вызов.
- Поддерживаются только BOOTSTRAP_NATIVE, chain 31337 и plain LOCAL_EIP1559.
- Проверка canonical local block не является production finality/reorg proof.
- Durable halt пока намеренно не имеет reset API; восстановление остаётся операторским.
- Автоматический сбор committed/candidate obligations и инициирование refill обычным
  coordinator pass ещё не реализованы.

Эти пункты не опровергают текущий fix и не требуют расширять следующий пакет в raw signing,
production finality, PROJECT_NATIVE conversion или новый journal.

## Выполненные проверки

- `git diff --check 19960e6..46d95ee` — чисто;
- planner/ledger/executor/budget/lock/transaction — **58/58**, fail 0;
- targeted coordinator regressions — **4/4**, fail 0;
- real mutated-fee timeout/restart/no-repeat regression — прошла;
- pure envelope mutations по всем четырём полям, legacy missing envelope и RPC-only mismatch — прошли;
- durable coordinator halt без записи state и без нового nonce — прошёл;
- полный `npm test` и fork не запускались;
- пользовательский `docs/INDEPENDENT_AUDIT_2026-09-19.md` не изменялся.

Итог: fee-envelope binding, evidence-preserving recovery и durable stop принимаю. Прежний
узкий блокер перед ordinary obligations integration снят. В следующем пакете по-прежнему важно
сохранить существующие инварианты: единый pending/lock/journal, один anchor для
committed/candidate, frozen-first admission и максимум один refill с завершением текущего pass.
