# Постоянный ответ GPT

Обновлено: 21.09.2026.

Это независимое review-мнение, не задание на автоматическое исполнение. При следующем
обращении файл следует полностью перезаписать.

Просмотрен commit `c7a5171cc0e30e2d9a680e331516fb625f6d86fd` —
`Plan bounded native refills and preserve primary cleanup errors`.

## Короткий вердикт

Чистая математика refill в основном собрана аккуратно: общий payer не дублируется,
RNG liability остаётся отдельной, source floor сохраняется, transfer gas входит в оба cap,
низкие observations не уменьшают baseline, partial transfer не объявляет обязательства
покрытыми. Trusted-input/RPC/authority/ledger границы в документации названы честно.

Исправление lock cleanup принято. При двойной ошибке primary и cleanup errors теперь
доступны вместе, а нужные coordinator поля `code/stage/transactionHash/definiteRejection`
сохранены на верхнем AggregateError. Unlink всё равно пробуется; ложного сообщения об
успешном cleanup нет.

Но подключать executor к текущему planner ещё рано: плоский массив `obligations` потерял
главный lifecycle priority — уже frozen/committed completion против нового unfrozen
кандидата. Planner видит оба дефицита одинаковыми и выбирает адрес лексикографически.
При ограниченном period cap это позволяет потратить единственный refill на будущую работу,
оставив уже принятое обязательство без native. Это противоречит frozen-first архитектуре.

Это локальный API defect, а не провал всей модели. Его лучше закрыть сейчас, пока executor
не закрепил неверный контракт.

## Подтверждённый priority defect

Я передал два дефицита по 10 native units:

- `candidate-unfrozen-short` с payer `0x1111…`;
- `frozen-monthly` с payer `0xeeee…`;
- period/refill cap покрывает ровно один transfer: value 10 + gasReserve 21000.

Planner вернул transfer на `0x1111…`, потому что после общего признака `shortfall > 0`
использует адресный tie-break. Frozen Monthly остался без средств, а period cap исчерпан.
Названия/id obligations на решение не влияют.

Текущие тесты этого не видят: их Short и Monthly оба считаются одинаково critical. Формат
`evaluateBudget` (`id/publisher/executor/counts/rng`) вообще не несёт стадии commitment.

Минимальная безопасная форма API — два явных уровня, например:

```text
committedObligations  // frozen draws, физически обязаны завершить
candidateObligations  // текущая подготовка/freeze, ещё можно не начинать
```

Можно вычислить два budget snapshot:

1. `committedRequired` только из frozen;
2. `totalRequired` из committed + candidate, с одним signer buffer на адрес.

Очередь тогда однозначна:

1. deficits относительно `committedRequired`;
2. deficits относительно `totalRequired`;
3. low-watermark/target buffers.

Пока в более высоком уровне остаётся дефицит, перевод не должен тратить остаток на target
или нижний уровень. Лексикографический tie-break внутри одного уровня нормален. Нужен
регрессионный тест с разными payer и cap только на один перевод: unfrozen address меньше
frozen address, но получателем обязан стать frozen.

Альтернатива «caller передаст только frozen obligations» слишком неявная: следующий вызов
всё равно должен уметь оценить candidate funding перед freeze, и ошибка orchestration снова
вернёт priority inversion. Граница должна быть выражена в данных, а не в комментарии.

## Gas, caps, source floor и partial transfer

В остальном расчёт согласован:

- `validateOps` гарантирует `maxGasPrice <= reserveGasPrice`, поэтому refill gasReserve не
  ниже разрешённого gas threshold;
- `maxPerRefill` и `maxPerPeriod` действительно ограничивают `value + gasReserve`;
- `minimumBalance` вычитается до caps, источник не расходуется ниже floor;
- если envelope не покрывает gas, transfer не создаётся;
- positive transfer гарантирован условием `envelope > gasReserve`;
- один адрес publisher/executor получает объединённую liability и один signer buffer;
- source запрещён как execution/RNG account, target и protected custody;
- fundingReadyAfter проверяет required после фактического value, а не target;
- смена периода обнуляет только period spend, но не cooldown.

`transferGas` остаётся доверенным model input. Planner не знает block gas limit, наличие
кода у receiver и поведение receive/fallback. Это нормально только потому, что executor
обязан повторно проверить estimate и receiver binding до intent.

Есть интеграционный footgun: при уже покрытых obligations, но недоступном optional buffer,
planner может вернуть `blocked`/`waitExpensiveGas` при `fundingReady=true`. Coordinator не
должен трактовать один лишь `status` как запрет draw. Единственный execution gate здесь —
`fundingReady`; refill status описывает только возможность пополнения. Лучше закрепить это
отдельным integration test, иначе честно обеспеченный frozen draw легко остановить из-за
необязательного target buffer.

## Trusted inputs и authority

Разделение описано достаточно ясно для pure planner:

- balances, anchor/head, history, obligations и protectedAddresses не доказаны функцией;
- `PROJECT_NATIVE` — только label уже разрешённого native source, не доказательство доли;
- domain mismatch блокирует тихий reset history;
- decisionKey — fingerprint canonical inputs, не nonce и не idempotency barrier;
- prize buckets и TOKEN/USDG conversion не притворяются реализованными.

Следующий executor должен сам доказать непосредственно перед intent:

- signer address равен source manifest binding;
- chain/profile/domain/history всё ещё те же;
- head/anchor, gas price, source и receiver balances перечитаны;
- receiver входит в target manifest и не входит в custody exclusions;
- estimate укладывается в transferGas/block limit;
- source после `value + conservative fee` сохраняет floor;
- committed/candidate forecast не изменился после planner snapshot.

Между этим preflight и broadcast всё равно остаётся transaction boundary; именно поэтому
нужен durable intent, а не надежда на повторный RPC check.

## AggregateError и coordinator classification

Новая реализация сохраняет нужную классификацию:

- одиночный primary без cleanup failure возвращается как прежде;
- одиночный cleanup failure после успешного action остаётся исходной cleanup error;
- primary + cleanup становятся AggregateError с `cause=primary`, полным `errors` и
  `cleanupErrors`;
- primary `code/stage/transactionHash/definiteRejection` копируются наверх;
- close failure не мешает попытке unlink, а unlink failure не объявляется успехом.

Этого достаточно для текущих веток coordinator/scheduler, которые принимают решения по
верхним `code/stage/transactionHash/definiteRejection`. Тест action+unlink корректно
оставляет lock и сообщает обе причины.

Можно позже копировать `shortMessage`/другие diagnostic fields, но это не blocker: primary
сохраняется в `cause` и `errors`, а транзакционная семантика не потеряна.

## Как соединить executor с coordinator

Не нужен второй state-файл, второй lock или отдельный recovery loop. Refill должен стать
ещё одним типом операции внутри существующего coordinator `withState` и его единственного
`pending` journal.

Минимально:

```text
pending.worker = nativeRefill
pending.action = transferNative
pending.domainHash / decisionKey / windowStart
pending.from / to / value / maxSourceDebit
pending.stage / nonce / transactionHash
```

Порядок:

1. На входе coordinator сначала reconciles любой существующий pending, включая refill.
2. Frozen draw forecast строится отдельно от candidate и получает высший refill priority.
3. Pure planner выдаёт один transfer.
4. После повторного preflight coordinator атомарно сохраняет refill intent в тот же pending.
5. Broadcast/hash/nonce и receipt проходят существующую transaction boundary.
6. Reconciliation receipt атомарно обновляет funding ledger и только потом очищает pending.
7. После одного receipt строится новый snapshot/plan; циклического слепого добора нет.

Текущий generic startup resolver просто переносит pending в `lastResolved`. Для refill ему
понадобится typed finalizer: успешный receipt добавляет value + actual fee в period spend;
reverted receipt добавляет хотя бы фактически сожжённую fee, но не value. Unknown receipt
сохраняет pending и блокирует новые расходы. Нельзя сначала очистить pending, а потом
отдельно попытаться записать spend — crash между ними обнулит расходный ledger.

Ещё до executor стоит уточнить cooldown semantics. Поле `lastRefillAt` выглядит как время
успешного пополнения. Но mined revert тоже тратит gas: если он не двигает cooldown, плохой
receiver позволит повторять попытки и жечь cap. Безопаснее сейчас назвать поле
`lastAttemptAt` и обновлять его после любого mined refill attempt; отдельно можно хранить
`lastSuccessAt`. Unknown send уже блокируется pending и cooldown ему не заменяет recovery.

## Минимальная migration

Тихо менять domain hash или удалять state нельзя. Для первой версии безопасная migration
может быть намеренно узкой:

- только при `pending === false`;
- явные `fromDomainHash`, `toDomainHash`, anchor и hash старого history snapshot;
- тот же chain/native asset и тот же `periodSeconds`;
- атомарно переносить `windowStart`, `spent`, `lastAttemptAt` без уменьшения;
- если новый `maxPerPeriod < spent`, remaining просто равен нулю;
- записывать migration record и новый domain в том же state save.

Смену `periodSeconds` нельзя безопасно восстановить из одного scalar `spent`: новые окна
могут пересекать старые иначе. Для неё нужен журнал подтверждённых attempts с timestamp и
actual debit либо ожидание, пока гарантированно истекут старое окно и cooldown. Cross-network
migration также не нужна: это новый deployment/state.

Source/targets/caps в той же сети можно менять только таким явным переходом и с повторной
manifest validation. Pending сначала reconciles по старому domain; переносить его в новую
policy нельзя.

## Выполненные проверки

- заявленный planner/budget/lock/transaction набор — **39/39**, fail 0;
- заявленные coordinator regressions — **3/3**, fail 0;
- отдельный reproduction frozen-vs-unfrozen priority — inversion подтверждён;
- lock dual-fault tests подтверждают AggregateError и сохранение classification;
- `git diff --check 79a8a7b..c7a5171` — ошибок нет;
- полный `npm test` не запускался;
- пользовательский `docs/INDEPENDENT_AUDIT_2026-09-19.md` не изменялся.

Итог: lock fix можно считать закрытым в заявленном scope. Planner годится как основа, но
перед bootstrap executor нужен один ограниченный API fix: явно разделить committed и
candidate liabilities, добавить priority regression и определить учёт/cooldown mined
failed attempts. После этого существующий coordinator journal можно расширять, не создавая
вторую несовместимую recovery-систему.
