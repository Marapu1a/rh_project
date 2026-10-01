# Запрос GPT: общий config indexer / coordinator / API до реализации

01.10.2026. Нужен архитектурный review конкретной связки G02. Прочитай текущий HEAD
и назови его; изменения после3b36e0a отделили активный Pons plan от PAIR reserve,
но общий config ещё НЕ реализован. Предложение ниже — гипотеза для проверки.

Только статический анализ по [REVIEW_TESTING.md](REVIEW_TESTING.md): не запускать
tests/build/fork/RPC, не устанавливать зависимости, не менять runtime-код и не
отправлять транзакции. Ответ записать в docs/GPT_REVIEW_RESPONSE.md. Предыдущий
[ответ](archive/GPT_REVIEW_RESPONSE_INDEXED_CYCLE_2026-10-01.md) сохранён, не повторять
общий аудит вместо ответа на этот вопрос.

## Проблема и исходные файлы

- scripts/pons-automation.cjs: schedulerConfigFor создаёт scheduler config без publicStatus.
- scripts/start-public-service.cjs требует publicStatus=true.
- scripts/persistent-buy-indexer.cjs: indexOnce пишет state с identity от всего config; readSnapshot сверяет её; publicObservation создаётся только при publicStatus=true.
- scripts/user-status-api.cjs проверяет тот же config hash; public-status.cjs/public-observation.cjs используют дополнительную проекцию.
- scripts/run-indexer-service.cjs и indexer-service-child.cjs: один писатель/изоляция проходов; local-scheduler-state.cjs: locks/checksum/identity.
- scripts/local-promo-scheduler.cjs: потребление истории, prebegin verification и обслуживание frozen; pons-transaction-journal.cjs и RNG journal: отдельные обязательства/intent.

Получается, что произвольное добавление publicStatus=true для API даёт другой
identity относительно config, сформированного coordinator. Это статическое
наблюдение, не воспроизведённый сбой production. Карта: [RELEASE_INVENTORY.md](RELEASE_INVENTORY.md),
активный путь: [ACTIVE_RELEASE_PATH.md](ACTIVE_RELEASE_PATH.md).

## Предложение для критики

Один канонический конфиг данных и один persisted index, единственный writer —
индексатор. Coordinator/API — читатели. Общие manifest, chain, buyPolicy, lifecycle
и необходимые настройки публичной проекции формируются в одном месте. Port/poll
и прочие operational options отдельно. Identity остаётся строгой; нельзя просто
выкинуть поля из hash без обоснования. Не решили пока, нужен ли новый versioned
data config, или достаточно минимального общего builder существующей формы.

Stale/behind запрещает новые jobs; API честно сообщает stale/unavailable; frozen
settlement/claims не зависят от свежего BUY индекса, но нуждаются в chain/RNG.
Старые журналы не сбрасывать, не перепривязывать автоматически, не делать unadmitted
fallback. Сбой необязательной public projection не должен незаметно менять денежные
данные; желаемую политику отказа необходимо спроектировать, а не считать готовой.

## Вопросы, на которые нужен конкретный ответ

1. Правильно ли одно состояние, или цена связи API/координатора выше пользы? Сравни минимальный shared builder и отдельный versioned data config. Рекомендуй один вариант с причинами, без общей инфраструктурной переделки.
2. Дай таблицу полей: влияет на identity данных / identity исполнения / freshness чтения / operational-only. Включи manifest, chain, buyPolicy, lifecycle, publicStatus, cutoffMode, campaignId, shortBudgetMode, chunkSize, statePath, maxAgeSeconds, port и poll. Что требует пересчёта, а что можно менять безопасно?
3. Что произойдёт, если publicObservation RPC вернёт ошибку: останется ли актуальный BUY snapshot? Нельзя ли API сделать причиной остановки draws? Предложи атомарность/статусы проекций без выдачи старых totals за новые.
4. Как обеспечить согласованную generation при atomic rename, одновременном API read и index write, изменении config, reorg, restart, damaged snapshot? Раздели cache integrity и доверие к RPC.
5. Как перейти от существующих state files без потери frozen obligations и pending intents? Нужна ли миграция вообще, можно ли пересобрать только производный индекс? Не разрешай сброс main/RNG/scheduler journals. Учти, что сейчас hash config входит и в scheduler job identity.
6. Какие существующие тесты уже доказывают свойства, а каких не хватает? Предложи компактную матрицу интеграционных проверок, включая один writer + оба readers, public projection outage, stale/behind, config mismatch, replacement during read, frozen claims при недоступном индексе.
7. Дай точный следующий ограниченный пакет: файлы/функции, последовательность правок, критерии PASS. Отдельно отметь фактический баг, архитектурный риск и неподтверждённое предположение.

## Неизменяемые границы и evidence

100USDG → Short+Monthly, creator3%, received USDG90/5/5, pending TOKEN не budget.
Frozen/claimable не идут на ops; reset/reroll/подмена RNG/вывод казны не добавляются.
Public executor ещё закрыт; этот review его не открывает. PAIR остаётся резервом.

Исторический indexed cycle:13 проходов/22tx,107.337115USDG,21 адресный test PASS,
не full baseline; [допущения](PONS_INDEXED_CYCLE.md). Последний пакет разделения
Pons/PAIR:13 адресных planning/route checks и3+3 browser tests PASS. Новые тесты ради
этого запроса не запускались. Полный .local transcript недоступен через репозиторий.

Ответ: сначала краткий вердикт и рекомендуемая конструкция, затем таблица identity,
переход состояния, failure policy и список нужных тестов. Не выдавай предложение
за выполненную реализацию и не объявляй релиз готовым.
