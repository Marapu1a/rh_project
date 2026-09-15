# Данные исследований

`short-scaling-study.json` — local EVM atomic/streaming сравнение, включая искусственный worst-insertion compiler variant, который не записывается в production sources/artifacts. `npm run report:short:scaling`. `short-scaling-rpc.json` — read-only ответы двух RPC chain 4663 на одном pinned block, precompile parameters и ограниченные estimate-пробы; без sendRawTransaction. `npm run report:short:limits`. [Выводы и ограничения](../docs/SHORT_SETTLEMENT_SCALING_STUDY.md). Эти измерения не доказывают production mempool/tx-size acceptance и не вводят cap участников.

`short-outcome-gas.json` — локальный синтетический sweep N=10..1000, K=10: Solidity outcome + настоящий PromoVault.finalize в тестовом controller. Содержит source hashes, параметры и раздельные gas-замеры. Не fork и не production RNG. `npm run report:short:gas`; [алгоритм и границы](../docs/SHORT_OUTCOME_VERIFICATION.md). Context/block hashes и gas могут отличаться между запусками; сохранённые входы определяют результат однозначно.

`attempt-lifecycle-report.json` — воспроизводимый **синтетический** пример OPEN/FROZEN/CONSUMED поверх прежнего fork BUY evidence. Новые BUY/lifecycle occurrences генерируются тестовым кодом, не получены из новой сети. `npm run report:attempts`; [формат, инварианты и границы доверия](../docs/ATTEMPT_LIFECYCLE.md).

`direct-buy/` — свежий local-fork evidence исполнения native PAIR launch и настоящего Robinhood Universal Router, manifest/code hashes, выбранные внешние MIT/GPL источники и воспроизводимый ledger. Офлайн: `npm run report:direct-buy`; новый fork: `npm run test:fork:direct-buy`. Это локальные транзакции, не публичные сделки. [Доказательства и ограничения](../docs/DIRECT_BUY_REPLAY.md).

`pair-source-audit/` — выбранные публичные MIT-исходники PAIR и manifest их Sourcify/RPC-проверки. Внешние лицензии сохранены; эти файлы не включаются в сборку наших contracts. Обновление: `node scripts/pair-source-audit.cjs` (read-only сеть, перезаписывает snapshot). Полные временные ответы API остаются вне Git. Границы проверки: [исходники и переносимость](../docs/PAIR_PORTABILITY_AND_SOURCES_2026-09-15.md).

В Git включены исходные данные для скриптов и evidence, на которые ссылаются Markdown-отчёты. Адреса и transaction hashes в них относятся к публичным наблюдениям либо локальному fork; приватных ключей для запуска не требуется.

Локальные зависимости `_deps`, скачанные frontend bundles, промежуточные RPC-дампы и большая генерируемая таблица `farming-sensitivity-2026-09-12.csv` исключены из Git. Таблицу можно восстановить офлайн командой `npm run report:farming` на сохранённом `economics-fork-2026-09-12.json`.

`python scripts/farming-defenses.py` воспроизводит отдельные контрпримеры к кандидатам ограничений. Это условные математические сценарии, не принятые продуктовые правила.

Новый локальный запуск `npm run test:fork:farming` требует RPC для чтения состояния и пишет отдельный игнорируемый `farming-fork-2026-09-12.json`. Этот прогон не нужен для офлайн-модели. Fork-скрипты могут перезаписывать свои выходные файлы; сохранённые исходные данные контролируются Git.

`short-model-report.json` — воспроизводимый локальный эксперимент текущей модели Short, без RPC и торговых затрат. Настройки экспериментальные; условия, ограничения и команда воспроизведения — в [SHORT_MODEL](../docs/SHORT_MODEL.md).

`short-economy-report.json` — условный трёхдневный сценарий оборота, комиссионного дохода, резервов и выплат. Допущения и воспроизведение: [SHORT_ECONOMY_SCENARIO](../docs/SHORT_ECONOMY_SCENARIO.md). Ставки не являются подтверждёнными комиссиями PAIR.

`short-sweep.json` генерируется локально и не включён в Git. Команда воспроизведения, допущения и итоговые таблицы — в [SHORT_SWEEP_RESULTS](../docs/SHORT_SWEEP_RESULTS.md).

`pair-dependency-audit-2026-09-15.json` — read-only snapshot chain 4663, pinned block, bytecode/storage/getters и HTTP readiness. Границы доказательств: [PAIR audit](../docs/PAIR_DEPENDENCY_AUDIT_2026-09-15.md).
