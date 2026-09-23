# Текущий контекст

Обновлено 23.09.2026: role casing canonicalization и совместимая migration проверены.

## Где находимся

Локальный сквозной MVP: meme TOKEN + добровольное Promo, Short раз в 6 часов и
месячный jackpot, денежные призы USDG. Публичного deployment нет.

Работают две соединённые coordinator цепочки:
- BUY → replay/builders → сохранённые jobs → Short/Monthly → awards/claim → следующий цикл;
- source collect/harvest TOKEN+USDG → FeeRouter credits/pay → converter → USDG reserves;
  отдельная доля проекта не поступает в призовую custody.

Это chainId 31337, упрощённый venue, fixed swap fixture и управляемый тестовый RNG.
Реальные DEX/RNG, production finality и автоматическое эксплуатационное финансирование
ещё не готовы. Локальный скелет связан, production-продукт не завершён.

## Правило проверки следующих шагов

23.09 пользователь отменил автоматический full run после каждого небольшого шага.
По умолчанию — затронутый путь и значимые соседи; docs-only — ссылки/diff.
Полный набор — по масштабу/риску или на контрольной точке с кратким обоснованием.
Именованные адресные профили runner пока не реализованы. [Правила](REVIEW_TESTING.md).

## Канонический полный baseline

23.09: `npm run test:review` на чистом HEAD `0e5d8ea` — **336/336**, 1466.8 s
тестов, install/test/final exit 0, cleanupError null. Temp worktree удалён.
Node v24.21.0, npm 11.19.0, Hardhat 2.29.1, ethers 6.17.0, solc 0.8.37;
зависимости установлены через npm ci --ignore-scripts. Fork/live не запускались.
Адресные проверки отдельно: `node --test --test-name-pattern="role casing|inspection manifest" test/local-coordinator.test.cjs` — 3/3 (53.0 s).
Наборы пересекаются, не суммировать. После проверенного HEAD менялись только документы.
Evidence: `.local/logs/role-casing-review.log`,
`C:\Temp\rh-review-oJ1Q1P\.local\logs\review.log` и `result.json`.
[Процедура](REVIEW_TESTING.md), [identity/migration](LOCAL_NATIVE_REFILL_INSPECTOR.md).

## Предыдущий результат: manifest и refill

[Native refill planner](LOCAL_NATIVE_REFILL.md) реализован как чистый расчёт: отдельный
native ops source, общий payer/RNG forecast, low/target, source floor, gas перевода,
лимиты периода/операции, cooldown, stale/pending stop. Один план — один перевод,
Приоритет committed → candidate → buffers, общий payer считается один раз. fundingReady не подменяет draw readiness.

Local executor делает один native transfer под существующим coordinator lock, проверяет
source signer/provider, balances/fee/estimate/head/nonce и сохраняет intent до send.
Автосбор draw obligations и запуск funding подключены к coordinator через optional nativeRefill/CLI.
Один anchor для obligations/balances; после одного refill текущий pass заканчивается.
В ops-контуре TOKEN/USDG не конвертируются,
project share не утверждается, призовые buckets не являются источником ops.
State policy/source/network hash не позволяет тихо сбросить funding history при смене config.

Двойные lock failures теперь сохраняют primary error и cleanupErrors вместе с
классификацией исходной транзакции. Runtime state/lock должен быть на постоянном локальном
volume без фоновой синхронизации checkout; lock не является distributed lease.

Предыдущая [калибровка](LOCAL_EXECUTION_CALIBRATION.md): N100/1k/10k, 10/64 места,
два seed и 34 clean child handoffs. Это sampled envelope, не доказанный worst-case.


Чистые переходы intent/hash/receipt готовы: success учитывает value + gas, mined revert — gas;
обе попытки включают cooldown. Ledger и очистка pending сохраняются одним atomic save.
Coordinator направляет nativeRefill pending в typed receipt recovery; unknown hash остаётся stop.

Intent сохраняет type/gasLimit/maxFeePerGas/maxPriorityFeePerGas; returned/RPC tx сверяются.
Mismatch сохраняет hash, учитывает receipt и ставит durable nativeRefillHalt. Coordinator
и refill executor останавливают автоматику, не повторяют перевод. Это обнаружение после
broadcast, не гарантия против первого перерасхода неисправным signer.

Исправлен config admission: все execution/controller targets проверяются до работы с журналом.
Под lock проверяется совместимость existing funding history ДО сохранения нового configHash.
Отказ не меняет state; правильные настройки можно повторить без сброса spend/cooldown/nonce.
Pending по-прежнему запрещает migration. Repair/reset ранее испорченного admission не добавлен.

Read-only inspector проверяет state/config/domain, lock metadata и исходную transaction/receipt.
CLI выдаёт JSON + nextAction, ничего не пишет и не отправляет. Concurrent state/lock change
делает report неактуальным; known receipt показывает только projected accounting.
Manifest exporter/verifier используют общий с runtime identity builder и независимый deployment JSON.
Checksum/provenance не являются доказательством одобрения. Nonce RPC outage не скрывает known receipt.
Проверки 22.09: основной пакет coordinator + native-refill suites — 70/70 (498.8 s);
финальный `npm run test:local:refill` — 67/67 (15.8 s), включая budget и lock.
После дополнения CLI assertions: `node --test --test-name-pattern="inspection manifest" test/local-coordinator.test.cjs` — 1/1 (40.3 s).
Это пересекающиеся наборы предыдущего пакета, результаты не суммировать.
Актуальный полный baseline приведён выше.
[Команды, clean-cwd проверка и ограничения](LOCAL_NATIVE_REFILL_INSPECTOR.md).

## Последняя проверка отказов

Добавлены реальные child-process kill checkpoints: prepared, send до hash-save, сохранённый hash,
receipt до final-save и после final-save. После смерти child stale lock блокирует restart;
только тестовый harness подтверждает exit и снимает собственный lock для проверки journal recovery.
Hashless остаётся stop, known hash учитывается ровно один раз. RPC receipt outage не меняет state.
Runtime-код не менялся. Детали и границы — [LOCAL_NATIVE_REFILL_RECOVERY](LOCAL_NATIVE_REFILL_RECOVERY.md).

## Ближайший кусок

Полный baseline подтверждён через `npm run test:review` ([процедура](REVIEW_TESTING.md)).
Role-address casing исправлен в общем builder: checksum identity, точные старые
case-варианты для resolved migration, прежние pending/domain guards сохранены.
Канонический прогон 336/336 прошёл. Следующий шаг — независимое review этого пакета; детали в
[inspector/identity](LOCAL_NATIVE_REFILL_INSPECTOR.md).
Диагностика готова; runtime repair/reset, автоудаление lock, reconnect-loop и supervisor
не добавлены. Manifest строится из отдельной deployment-конфигурации, не из проверяемого state.
Полный сценарий аварийного завершения draw/prize coordinator остаётся отдельной проверкой.

## Основные ограничения

- Local guards не снимать для запуска в другой сети. Источник комиссий, BUY decoder,
  block identities, fee model, DEX/RNG и compiler target проверяются для каждого профиля.
- FeeRouter ещё напрямую связан с PAIR API. Новая сеть/площадка — независимый deployment;
  старые prize balances/credits не переносятся и не выводятся.
- Fixed floor не заменяет market price guard. Legacy USDG-only TOKEN debt лишь
  диагностируется; публичный pay остаётся возможным. Полнота legacy list доверена config.
- Budget — off-chain forecast, не escrow и не запрет прямого seal вне coordinator.
  Fixture estimates не доказаны для всех возможных данных/seed; требуется калибровка.
- Seed/finality, publisher trust, durable recovery и incremental indexer не завершены.

## Не пересматривать случайно

Frozen/claimable не финансируют эксплуатацию. External funding не создаёт project fee.
Creator/project shares ещё не утверждены; fixture percentages не продуктовая экономика.
Campaign boundary — успешный rollover; endsAt только плановое время.
Текущие денежные призы USDG, Luck удалён, sponsor layer отдельно. Нет admin prize withdrawal,
proxy, reroll/reset или подмены random. Immutable destination старого converter сохраняется.

[Продуктовые решения](PRODUCT_SPEC.md), [карта реализации](IMPLEMENTATION_STATUS.md),
[исторический снимок статусов](archive/snapshots/PROJECT_PROGRESS_BEFORE_REVIEW_2026-09-20.md).
Ответ GPT — вспомогательное мнение, не автоматическое задание.
