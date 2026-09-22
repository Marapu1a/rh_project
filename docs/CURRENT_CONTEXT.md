# Текущий контекст

Обновлено 22.09.2026 после read-only native refill inspector.

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

## Последний результат и проверки

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
Expected configHash/domain берутся из независимо одобренной конфигурации; export manifest ещё нет.
Проверки 22.09: 31/31 inspector/process-death/refill-state/state-lock tests (14.1 s).
Full npm test/fork не запускались. [API и ограничения](LOCAL_NATIVE_REFILL_INSPECTOR.md).

## Последняя проверка отказов

Добавлены реальные child-process kill checkpoints: prepared, send до hash-save, сохранённый hash,
receipt до final-save и после final-save. После смерти child stale lock блокирует restart;
только тестовый harness подтверждает exit и снимает собственный lock для проверки journal recovery.
Hashless остаётся stop, known hash учитывается ровно один раз. RPC receipt outage не меняет state.
Runtime-код не менялся. Детали и границы — [LOCAL_NATIVE_REFILL_RECOVERY](LOCAL_NATIVE_REFILL_RECOVERY.md).

## Ближайший кусок

Review инспектора и выбор следующей внешней integration/stabilization границы.
Диагностика готова; runtime repair/reset, автоудаление lock, reconnect-loop и supervisor
не добавлены. Approved inspection manifest пока задаётся отдельно от deployment tooling.
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

Финальная проверка inspector suite: 10/10, включая idle/other-worker, lock exit code и отказ unsupported fee profile.
