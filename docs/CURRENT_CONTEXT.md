# Текущий контекст

Обновлено 23.09.2026: watch принят review; подготовлен кандидат численного MVP-профиля.

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
Группы и --match добавлены в launcher/review runner; compile-once и per-file timing
проверены. [Правила и карта выбора](REVIEW_TESTING.md).

## Предыдущий канонический полный baseline

23.09: `npm run test:review` на чистом HEAD `4efca7d` — **341/341**,
fail/skipped/cancelled 0. Прежние 336 сценариев сохранены, добавлены 5 infrastructure.
Compile 17.05 s + tests 1112.25 s = 1129.30 s (18m49s); полный review 1136.57 s,
install 5.74 s. Одна обычная компиляция проекта, 22 reuse; маленькие Probe-компиляции
инфраструктурных тестов отдельно. Install/test/final exit 0, cleanupError null,
worktree удалён. Предыдущий baseline 0e5d8ea: 1466.8 s, экономия около 23% / 5m37s
на compilation+tests; прежний review total отдельно не измерялся.
Node v24.21.0, npm 11.19.0, Hardhat 2.29.1, ethers 6.17.0, solc 0.8.37;
npm ci --ignore-scripts. Fork/live не запускались.
Evidence: `.local/logs/compile-once-review.log`,
`C:\Temp\rh-review-nPLCK9\.local\logs\result.json` и `test-run-dkTHDw.json`.
Адресные проверки: infrastructure 9/9 (~2.5 s), два контрактных файла 24/24
(47.3 s включая compile), isolated math --match "two draws": 2 сценария, exit 0,
cleanup OK. Эти выборки пересекаются с full, результаты не суммировать.
[Процедура и измерения](REVIEW_TESTING.md).

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

## Текущий шаг к релизу

Ответ GPT b4a89ef прочитан. По указанию пользователя sponsor/merchant ветка отложена;
[архив обсуждения](archive/studies/SPONSOR_PARTNERSHIP_DISCUSSION_2026-09-23.md).
Никаких sponsor API и новых условий участия не утверждено.

[Численный профиль](MVP_ECONOMIC_PROFILE.md) остаётся кандидатом. Добавлен локальный
scripts/mvp-economic-sweep.py: 72 аналитических single-draw сценария концентрации и
9 funding-сценариев. Assertions прошли. Выявлено усиление ожидаемых наград при дроблении
по wallets и субсидировании Short. Это не full calendar/farming profitability model.
Контракты/config не менялись; unit/full/fork/live не запускались.

Календарный этап выполнен: [MVP_CALENDAR_CHECK](MVP_CALENDAR_CHECK.md),
13 сценариев × 20 seeds × 2 порядка = 520 прогонов по 120 дней. Инварианты денег/
попыток/интервалов прошли. scripts/mvp-calendar-model.py использует Short reference
model; контракты/config не менялись, full/fork/live не запускались. Отдельный риск —
стоимость множества no-win draws при одном wallet; расходы в этой модели отсутствуют.

Дальше двигать базовый MVP: окончательная экономика с реальными execution costs,
затем ограниченный реальный integration slice из ROADMAP §4. Не объявлять кандидаты
утверждёнными и не снимать local guards для запуска на реальной сети. До deployment
нужны реальные venue/swap/RNG/finality, execution funding, recovery и внешний аудит.

## Последний кусок: watch RPC recovery

Тестовая инфраструктура принята review 130a029. Следующий пакет — восстановление
CLI --watch после временных RPC read outages. Backoff 1–30 s; known receipt сначала
сверяется по сохранённому hash. Отправка без hash, state/config/lock/cleanup errors,
смена сети, policy halt и неизвестные ошибки останавливают цикл.
Нет auto-unlock, reset, replacement, fallback RPC/signers или supervisor.
Сигналы прерывают ожидание; мгновенная отмена in-flight scan не обещается.
[Модель и ограничения](LOCAL_PROMO_COORDINATOR.md#watch-временная-недоступность-rpc-23092026).

Проверки 23.09 (actual executedCases, не file wrappers):
- `npm run test:group -- --profile watch` — 6/6, 0.26 s, compile=0.
- `npm run test:group -- --profile coordinator --match "watch "` — 8/8,
  62.2 s вместе с compile; journal recovery и CLI. Первый тестовый fault injection
  не сработал из-за ethers wrapper; заменён реальным timeout с выключенным automining.
- `npm run test:group -- --profile coordinator --match "watch CLI|hashless broadcast failure|native refill pending|scheduler isolates known rejection|cleanup"`
  — 10/10, 87.7 s вместе с compile; финальная CLI/neighbor проверка.
- `npm run test:group -- --profile infrastructure` — 9/9, 2.19 s, catalog/review guards.
Выборки пересекаются; не суммировать. Full/fork/live не запускались. Старый full baseline
выше относится к предыдущему code HEAD, а не ко всему текущему пакету.
Evidence: `.local/logs/rpc-watch-{final-unit,integration,neighbors,catalog}.log`.

Ближайшая незакрытая эксплуатационная граница: process-death всего coordinator,
владение stale lock и ограниченный recovery design. Refill process-death уже проверен;
это не доказательство автоматического перезапуска всей системы.

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
