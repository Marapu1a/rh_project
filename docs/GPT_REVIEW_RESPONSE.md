# Постоянный ответ GPT

Обновлено: 21.09.2026.

Это независимое review-мнение, не задание на автоматическое исполнение. При следующем
обращении файл следует полностью перезаписать.

Просмотрен HEAD `0652d24cf7259ffc82831d1bf1d1cfb1b01249a8` —
`feat: execute bounded local native refill with durable receipt recovery`.

## Короткий вердикт

Предыдущий priority defect закрыт по правильной границе. API теперь явно разделяет
`committedObligations` и `candidateObligations`, legacy flat input отвергается, общий payer
получает один buffer в combined forecast. Очередь committed → candidate → buffer реально
следует данным, а не соглашению caller. Моя прежняя inversion reproduction теперь покрыта
регрессией и проходит.

Pure intent/hash/receipt transitions и единый coordinator pending сделаны убедительно.
Mined success учитывает value + gas, revert — только gas; обе попытки двигают cooldown.
Expense ledger и очистка pending попадают в один atomic save. Ошибка сохранения оставляет
старый pending/spend и позволяет ровно один раз завершить receipt после reload.

Обнаружен один подтверждённый defect перед автоматическим wiring: transaction identity не
связывает fee envelope. После `sendTransaction` и при recovery проверяются
`chainId/from/to/value/nonce/data/hash`, но не `type/gasLimit/maxFeePerGas/maxPriorityFeePerGas`.
Signer с правильным address/provider может отправить ту же выплату с более дорогими fee.
Planner cap и source floor тогда нарушаются; `budgetExceeded` лишь честно фиксирует уже
потраченные деньги.

Это не требует переделывать executor или journal. Нужно связать fee envelope с prepared
intent и проверить returned/on-chain transaction. После этого пакет можно подключать к
обычному coordinator pass.

## Подтверждённый fee-envelope defect

Я повторил реальный Hardhat transfer через допустимый интерфейс signer-wrapper:

- executor сформировал request с `gasLimit=30000`, max fee в рамках 10 gwei profile;
- wrapper сохранил from/to/value/nonce/data, но отправил `maxFeePerGas=100 gwei` и
  `maxPriorityFeePerGas=50 gwei`;
- executor принял transaction, сохранил hash, нашёл canonical receipt и вернул `confirmed`;
- planned `maxSourceDebit` был `1,375,000,000,000,000`;
- actual debit стал `2,068,375,000,000,000`;
- source balance был `1.0015 native` при floor `1 native`, после receipt осталось
  `0.999431625 native` — floor физически нарушен;
- `lastResolved.budgetExceeded === true`, но предотвратить расход уже невозможно.

Это не атака через подмену source address: `getAddress()` и provider binding прошли. Конечно,
полностью злой signer может потратить source вне приложения; но buggy/remote signer,
изменивший fee policy, находится внутри заявленной transaction boundary. Поэтому обещание
caps/floor требует проверки фактического transaction envelope, а не только доверия к
реализации `sendTransaction`.

Минимальный fix:

1. Prepared pending сохраняет ожидаемые `type=2`, `gasLimit`, `maxFeePerGas` и
   `maxPriorityFeePerGas=0` вместе с остальным intent.
2. `txData` извлекает эти поля из returned transaction и RPC transaction.
3. `verifyTransaction` требует точного совпадения с intent и проверяет fee ceiling.
4. Регрессия signer-wrapper повышает fee/priority и не должна завершаться как обычный
   confirmed refill.

Поскольку mismatch обнаруживается уже после возможного broadcast, его нельзя выдавать за
«транзакции не было». Лучше best-effort сохранить известный hash и состояние
`broadcastPolicyMismatch`, затем reconcile фактический receipt/расход и остановить
автоматику для оператора. Оставить prepared/hashless тоже fail-closed, но это теряет уже
известный hash и ухудшает восстановление. Автоматически повторять нельзя в обоих вариантах.

`budgetExceeded` правильно сохранить как post-factum alarm. Но это accounting evidence,
не enforcement caps.

## Priority и shared payer

Текущая математика tier-ов корректна:

- committed budget считается отдельно;
- total budget считается по committed + candidate;
- signer buffer в total добавляется один раз на фактический gas payer;
- committed shortfall использует committed snapshot;
- candidate shortfall использует incremental gap до total required;
- buffer начинается только после покрытия total required;
- внутри tier адресный tie-break детерминирован;
- transfer покрывает только deficit выбранного tier и не прыгает сразу к target;
- `committedFundingReady` отделён от total `fundingReady`.

Regression со smaller-address candidate и cap ровно на frozen transfer теперь выбирает
frozen payer. Shared payer между tier-ами сначала получает committed 15, затем incremental
candidate 12, а не второй signer buffer. Замечаний к этой части нет.

Важно сохранить смысл при интеграции: `committedFundingReady=true` ещё не разрешает новый
candidate, а `fundingReady=true` не доказывает общую draw readiness. И наоборот,
`blocked/waitExpensiveGas` только у optional buffer не должен останавливать уже обеспеченный
frozen draw.

## Period, cooldown и ledger

Переходы ledger согласованы:

- receipt block timestamp выбирает окно расхода;
- success добавляет `value + gasUsed × gasPrice`;
- revert добавляет только gas;
- `lastAttemptAt` обновляется и на success, и на revert;
- `lastSuccessAt` обновляется только на success;
- actual overspend не отбрасывается и помечается `budgetExceeded`;
- `lastNonce` запрещает повтор старого source nonce;
- duplicate finalization отвергается;
- изменённый history не проходит `historyHash`.

Переход транзакции через period boundary разумно относится к окну mined receipt. Pending
в это время единственный и блокирует новый расход, поэтому двойного cap admission здесь нет.

Один semantic пункт стоит явно сохранить в будущих docs/tests: cooldown — это cooldown
attempt, а не только успешного refill. Текущие поля и тесты уже реализуют именно это.

## Receipt identity и atomic save

Кроме fee envelope, чистые проверки достаточны для заявленного local scope:

- intent требует свободный общий coordinator pending;
- history/domain и nonce связаны до send;
- returned transaction связывает source, receiver, value, nonce, chain и empty calldata;
- replacement hash не принимается как оригинал;
- receipt hash, status, block number/hash и transaction сверяются;
- receipt не может предшествовать anchor/предыдущей attempt;
- coordinator dispatches `nativeRefill` в typed recovery до generic recovery и draw work;
- unknown hash/receipt остаётся stop, а не retry.

Контракт `commit` правильный при заявленном синхронном atomic `save`: сначала persistence,
потом mutation объекта in-memory. Failed intent save не отправляет transaction; failed hash
save оставляет prepared stop; failed finalization оставляет известный hash и старый spend.

Это не production finality proof: canonical local block read, trusted provider и exact hash
достаточны только для chain31337 стенда. Отсутствие reorg/finality/replacement recovery не
является дефектом этого bounded пакета.

## Как подключить к ordinary coordinator pass

Не создавать новый state/lock/journal. Следующий шаг можно оставить узким:

1. Выделить из существующей budget collection функцию, которая на одном anchor возвращает
   `committedObligations`, `candidateObligations`, balances и gasObservations.
2. Pending Short/Monthly settlement всегда попадает в committed. Новый active/current
   prepare/freeze — в candidate. Эта классификация строится из chain lifecycle, не адресов.
3. Добавить `nativeRefill.domainHash`, source signer address и hash protected manifest в
   immutable coordinator config. Mutable polling/receipt timeout остаются settings.
4. После startup recovery сначала оценивать committed funding.
5. Если committed недофинансирован — выполнить максимум один refill и закончить pass,
   чтобы следующий pass перечитал chain/state.
6. Если committed обеспечен и есть frozen work — выполнять его раньше candidate refill.
7. Candidate refill допускается, только когда он нужен для следующей ещё не принятой работы.
8. Optional buffer refill выполнять на idle/post-work пути; его cooldown/cap/gas wait не
   блокируют обеспеченные frozen/candidate sends.

После любого refill receipt лучше завершать текущий coordinator pass со статусом progress,
а не продолжать на старом obligations snapshot. Следующий pass дешево пересчитает balances,
progress и gas observations и не создаст скрытого multi-transfer loop.

Существующий `pending.worker='nativeRefill'` и typed finalizer уже достаточны. Generic startup
recovery менять второй раз не нужно.

## Что является ограничением, а не текущим defect

- obligations и protectedAddresses пока trusted caller inputs;
- executor поддерживает только BOOTSTRAP_NATIVE, chain31337 и plain LOCAL_EIP1559;
- PROJECT_NATIVE economics/conversion не реализованы;
- unknown hash требует оператора и не восстанавливается по nonce автоматически;
- source signer должен быть эксклюзивным;
- local canonical block checks не заменяют production finality;
- config migration и calibration provenance остаются отдельными хвостами.

Это честные границы текущего пакета. Их не надо смешивать с подтверждённым fee-envelope
дефектом или использовать для расширения scope в swap/governance.

## Выполненные проверки

- заявленный planner/ledger/executor/budget/lock/transaction набор — **56/56**, fail 0;
- заявленные coordinator regressions — **4/4**, fail 0;
- real Hardhat mutated-fee reproduction — cap и source floor нарушены, defect подтверждён;
- priority regression и shared-payer tier accounting — подтверждены;
- intent/hash/finalization failure и mined revert tests — подтверждены;
- полный `npm test` и fork не запускались;
- `git diff --check 394e793..0652d24` нашёл один whitespace defect:
  лишнюю пустую строку в конце `test/local-native-refill-executor.test.cjs`;
- пользовательский `docs/INDEPENDENT_AUDIT_2026-09-19.md` не изменялся.

Итог: priority/ledger fix и единый recovery design приняты. Перед автоматическим сбором
obligations нужен один маленький transaction-policy fix: persist и verify полный fee/gas
envelope, сохраняя известный hash при post-broadcast mismatch. После этого ordinary
coordinator integration можно делать следующим bounded пакетом без широкого refactor.
