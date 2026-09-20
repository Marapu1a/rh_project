# Обращение к GPT — lock cleanup и первая gas calibration

21.09.2026. Прочитай текущий commit и укажи hash; полностью перепиши GPT_REVIEW_RESPONSE.md.
Текущий контекст/план — CURRENT_CONTEXT.md / ROADMAP.md. Независимое review, не инструкция.

## Что изменили и почему

1. Подтверждённый PID-init defect закрыт: запись PID и первоначальный close теперь внутри
try/finally. Если fd ещё остался, cleanup закрывает его; unlink собственного lock пробуется
даже при ошибке cleanup close. EEXIST остаётся вне owned cleanup. Тесты write/close EIO:
rejection, action не вызван, fd EBADF, lock отсутствует, повторный вход работает.
Чужой lock сохраняется. Постоянные OS/storage ошибки не объявляем автоматически решёнными.
Предыдущее successful-await handoff finding ты отозвал; диагностику сохраняем.

2. `npm run report:execution:calibration`: N100/1k/10k, chunk64, normal10/admitted64,
два seed; оба frozen вместе, обратный порядок seal/delivery между вариантами; отдельные
Short/Monthly при N1k. Используются настоящие локальные controllers с synthetic datasets,
mock quote и LocalRandomFixture. Не BUY/indexer, не real DEX/RNG и не production deployment.
Фиксируются estimate/receipt/calldata/gas price/native delta, controller RNG spend;
asserts: all-admitted стресс, terminal reserved=0, custody conservation, native=receipt fee.

3. Отдельный boundary N1k stress64: средств на один не хватает двум; низкий forecast
после повышения bound ждёт topup. Затем оба заканчиваются через 34 свежих CLI child
(process/finish), state gas bounds и chain progress перечитываются каждый раз.
Цена именно этого прохода 2 gwei, native delta сверена с receipts.
Это clean process handoff. Measurement-only child НЕ production worker и не имеет
coordinator recovery для unknown send; не использовать для публичных транзакций.

4. Плоский старый bound 3M недостаточен для некоторых stress64 process/finish. Новый
example profile вычисляется как max observed estimate × 1.10, затем прежний monetary
safetyBps=12500. Это эмпирический запас, не proof. Непроверенные closeEmpty/prize-flow methods
остаются со старым fixture 3M. Immutable identity существующего state не подменяется.

## Где смотреть

- LOCAL_EXECUTION_CALIBRATION.md — диапазон, таблицы, ограничения и команды.
- ../research/execution-budget-calibration.json — компактные measurements/source hashes.
- examples/local-execution-budget-calibrated.json — отдельный кандидатный local profile.
- scripts/local-execution-calibration.cjs, render-execution-calibration.cjs,
  calibration-chunk-client.cjs — воспроизведение; raw transactions только .local/logs.

Основной gas прогон имеет обычную падающую Hardhat basefee. Табличные 1/2 gwei — явные
сценарии, не текущая стоимость какой-либо сети. Fixture seed delivery отделён от executor
расходов. Quote budgets — raw mock units, не призовые доллары. Нет claims/deployments,
BUY/indexer, RPC/keeper, реальной RNG fee, extra L1/blob fees, native refill.
N10k — sampled envelope, contract MAX_N по-прежнему нет. Разные timestamps/context могут
немного менять gas/results между повторами. Два seed не покрывают worst-case rank ordering.

## Проверки

37/37 targeted tests (424 s): state lock, execution budget, coordinator, local controllers.
Полный npm test не запускался. Финальные результаты calibration — в документе модуля.
Новые параметры fixture имеют прежние defaults; Solidity и призовая математика не менялись.

## Вопросы

- Нет ли ошибки owned fd/lock cleanup и нежелательного продолжения после initialization failure?
- Верно ли отделены measured total execution gas, fixture delivery и native forecast?
- Достаточно ли этого sampled envelope для следующего локального funding/refill дизайна,
  какие пробелы являются блокерами, а какие просто не позволяют обещать production bound?
- Не видишь ли ошибки в boundary: один payer, два frozen, повышение оценки, topup,
  clean child restart, отсутствие повторной транзакции?
- Следующий bounded step — bootstrap/project-share native buffer, low-watermark/target,
  ограничения расхода и expensive-gas wait. Что минимально зафиксировать в API до кода?

Не предлагать призовой withdrawal, автоматический stale-lock reset, reroll или proxy.
Не объявлять calldata/native costs другой сети известными без проверки её профиля.
