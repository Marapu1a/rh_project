# Постоянный ответ GPT

Обновлено: 20.09.2026.

Это независимое review-мнение, не задание на автоматическое исполнение. При следующем
обращении файл следует полностью перезаписать.

Просмотрен commit `c618afc0d1765b675aa0d5c3b4c714f9a86c5c2d` —
`Review local execution boundaries and clarify portable deployment roadmap`.
Runtime coordinator взят из `571c068`; в `c618afc` менялись документы, а не код.

## Короткий вердикт

Основная transaction/restart модель coordinator сделана правильно для заявленного
локального scope. Durable marker ставится после успешного estimate и до broadcast; hash
дописывается после ответа RPC; unknown outcome оставляет marker и не разрешает draw после
prize либо новый pass после restart. Confirmed receipt исходной tx снимает marker, после
чего workers восстанавливаются из on-chain state и сохранённых draw jobs. Повторной выплаты,
swap, forward, freeze или begin в проверенных сценариях я не получил.

Есть один узкий preflight-дефект, который стоит закрыть до наращивания gas-budget модели:
coordinator проверяет общий `prize.provider === scheduler.provider`, но не проверяет, что
все publisher/executor runners действительно привязаны к этому provider. Поэтому прямой
API допускает split-brain: preflight/read/reconciliation идут через provider A, а estimate,
broadcast и receipt wait подключённого signer могут идти через provider B.

Pending marker не даёт после этого продолжить отправки, то есть это не найденный double
spend. Но неверный runner успевает дойти до broadcast вместо отказа до первой записи. Для
компонента, заявляющего один shared provider, это настоящая недостающая binding-проверка.

После её узкого исправления блокеров перед отдельным project gas budget я не вижу.

## Что подтверждено по pending/restart

Граница `before → sent → confirmed` расположена разумно:

- estimate failure не создаёт marker и не считается возможной отправкой;
- marker с intent/target/calldata сохраняется до вызова broadcast;
- outage/crash во время broadcast оставляет hashless marker и запрещает retry;
- полученный hash/from/nonce сохраняется до receipt;
- success либо status 0 именно исходной tx переводит intent в `lastResolved`;
- timeout, abort после send, receipt outage, replacement и чужой receipt marker не снимают;
- неизвестность в prize-flow не допускает draw, неизвестность в draw не допускает
  следующий coordinator tick.

Restart с известным hash проверяет receipt и canonical block hash текущей локальной ветки.
Если receipt отсутствует или RPC-чтение падает, новых sends нет. Hashless marker также
остаётся закрытым независимо от равенства pending/latest nonce.

Сбой записи hash я проверил отдельно: первый вызов ещё может вернуть hash из памяти, но
если последующие сохранения также недоступны, на диске остаётся hashless marker. Новый
процесс получает `unknownHash` и не отправляет ничего. Это плохая liveness, но именно
заявленная fail-closed граница, а не тихий retry.

## Восстановление без денежных дублей

При receipt-read outage исходный `collect` успел mined, coordinator сохранил hash и
остановился. После восстановления RPC restart сначала разрешил receipt, затем выполнил
новый bounded pass. Он может сделать ещё один `collect`: этот action не имеет уникального
job id и новый pass явно разрешает собрать новое поступление. В проверке второй collect
оказался пустым; TOKEN был продан один раз, credits/pay/forward не удвоились.

Это важное различие: счётчик вызовов source collect может увеличиться, но прежние деньги
не распределяются повторно. Converter inventory/balance delta, FeeRouter credit и on-chain
controller phases остаются фактическими idempotency boundaries.

Отдельно воспроизведён status 0 после успешного estimate: внешнее изменение состояния
заставило исходный `collect` revert уже в блоке. Receipt исходной tx снял pending как
definite rejection, prize-flow стал `degraded`, а независимый draw продолжился. То есть
изоляция known rejection после добавления coordinator не сломана.

## Finding: signer/provider binding

В `runCoordinator` сейчас проверяются:

- равенство provider объектов двух worker options;
- chainId 31337 этого provider;
- TOKEN/USDG/vault bindings;
- множество адресов publisher/executor в config hash.

Но contract sends используют `contract.connect(signer)`, следовательно реальный runner
и его provider важнее read-only worker option. Я передал runner с неверным `provider`:
валидация его приняла, intent сохранился, транзакция дошла до broadcast и только receipt
path упал. Coordinator безопасно заблокировался, но обещанная проверка одного provider
не была выполнена до записи.

Минимальная граница исправления:

1. До `withState` и любых sends проверить provider binding каждого непустого
   `prize.executor`, `scheduler.executor`, `scheduler.publisher`.
2. Для текущего локального API логично требовать именно тот же provider object, поскольку
   это уже заявленный контракт coordinator. Если нужны wrapper runners, у них должен быть
   явный проверяемый base provider, а не неявное доверие одному адресу.
3. Добавить negative integration: signer с другим/malformed provider отвергается до
   nonce change, marker и broadcast.

Отдельно уже честно отмеченная проблема role identity остаётся: config хеширует
отсортированное множество адресов, поэтому перестановка publisher/executor с тем же набором
не меняет config hash. Для текущих on-chain ролей это обычно закончится waiting/revert, а не
обходом custody, но при разделении immutable identity и ops settings роли надо связать с
адресами явно.

## Abort: определить commit point

Есть узкая воспроизводимая гонка. `sendLocalTransaction` проверяет signal до
`boundary.before`; если abort приходит во время сохранения durable pre-broadcast marker,
после возврата из `before` signal повторно не проверяется и одна tx всё равно broadcast.
Marker/hash сохраняются, coordinator блокируется, последующих sends нет — денежной
неопределённости система не теряет.

Это можно считать допустимой семантикой, но тогда успешное durable сохранение `before`
должно быть явно названо commit point: abort после него прекращает ожидание и следующие
операции, но не текущий broadcast. Сейчас документация делит только «до/после send», а
реальная граница чуть раньше.

Если нужен строгий контракт «abort до фактического broadcast не отправляет tx», одного
повторного `if (signal.aborted)` недостаточно: он оставит ложный hashless marker. Нужен
отдельный durable cancel prepared-intent до возврата `LOCAL_EXECUTION_STOPPED`. Для
локального coordinator проще и честнее зафиксировать marker persistence как commit point.
Это не блокирует gas-budget после явного решения и regression test.

## Config/deployment и standalone compatibility

Для доверенного CLI текущие bindings достаточны после signer/provider check: CLI создаёт
все signers из одного `JsonRpcProvider`, jobs связывают assets/vault/source, coordinator и
scheduler state paths различаются. Standalone workers не получают AsyncLocalStorage
boundary и прошли прежние regressions.

Checksum/config binding действительно fail-closed, но это не защита от оператора:
другой state path или standalone process с тем же signer обходит локальный lock. Здесь
реализация и документация совпадают — exclusive ownership signers остаётся обязательным
операционным допущением, а не свойством кода.

Разделение identity и ops settings перед gas-budget выбрано верно. Poll interval/gas cap
не должны вынуждать обходить unresolved marker новым state, а применённые настройки должны
оставаться видимыми при recovery. Не надо превращать это в универсальный on-chain registry.

## Документальная ревизия `c618afc`

CURRENT_CONTEXT/ROADMAP теперь заметно честнее отделяют локальный связанный skeleton от
production deployment. Самопроверка правильно называет незакрытые storage/replacement/
finality границы, отсутствие бюджета на завершение уже frozen draw, permissionless claim
и сетевые зависимости. Добавленная ссылка из PRODUCT_SPEC не меняет продуктовые правила.

Локальные markdown-ссылки проверены: битых относительных ссылок не найдено. Существенного
расхождения между runtime `571c068` и новым описанием, кроме неуказанного signer/provider
binding и неявного abort commit point, я не нашёл.

## Выполненные проверки

- `node --test --test-concurrency=1 test/local-coordinator.test.cjs` — **7/7**, fail 0;
- `npm test` — **247/247**, fail 0, примерно 566 s; это первый чистый полный прогон после
  последнего metadata/checksum fix;
- отдельные временные fault probes: receipt-read outage + restart, длительный storage
  failure при записи hash, abort во время pre-broadcast save, mined revert после успешного
  estimate, misbound signer provider;
- `git diff --check` и проверка всех относительных markdown-ссылок — ошибок нет;
- пользовательский `docs/INDEPENDENT_AUDIT_2026-09-19.md` не изменялся.

## Следующий шаг

Сначала один маленький boundary-fix: signer/provider preflight плюс явный abort commit-point
и две regressions. Не нужно расширять его до production journal.

После этого разумно переходить к запланированному project gas budget/readiness: отдельно
учесть RNG fee, publisher/executor balances и стоимость завершения уже начатых Short/Monthly;
started obligations должны иметь приоритет над новым freeze и необязательным collect.
Frozen/claimable не являются ops budget, а автообмен/автопополнение остаются следующим
самостоятельным пакетом.
