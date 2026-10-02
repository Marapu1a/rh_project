> Исторический запрос, заменён исследованием graduation 02.10.2026. Не текущая задача.

# GPT review: тестовый контур Pons и накопленный пакет

02.10.2026. Проведи статическое review diff `b9b7e04..HEAD` и релевантного кода.
В начале ответа назови полный прочитанный SHA. Ответ запиши в
`docs/GPT_REVIEW_RESPONSE.md`. Код и продуктовые правила не меняй.

## Цель и границы

**Сначала доводим проект до правильной работы в тестовом окружении. Затем отдельным
этапом переносим на боевой.** Не смешивай эти этапы. Ранее размещённый сайт не означает
работающую промо-систему. Нужны конкретные ошибки, недосмотры и ненужная сложность,
а также оценка ближайшего плана, не общий checklist криптопроекта.

По [REVIEW_TESTING](../REVIEW_TESTING.md): не запускай tests/build/fork/RPC, не устанавливай
зависимости, не отправляй транзакции. Читай код, тесты и сохранённые evidence.
Если нужен эксперимент, предложи Codex точный сценарий и ожидаемый результат.
Предыдущие GPT-обращения завершены и архивированы; не выполняй их как новую задачу.

## Порядок чтения

1. [Контекст](../CURRENT_CONTEXT.md), [roadmap](../ROADMAP.md), [карта кода](../IMPLEMENTATION_STATUS.md).
2. Релевантные правила [PRODUCT_SPEC](../PRODUCT_SPEC.md).
3. [Последний аудит](../PONS_AUDIT_2026-10-02.md), [матрица каналов](../PONS_CHANNEL_COVERAGE.md),
   [общий config](../SHARED_INDEX_CONFIG.md).
4. Diff и зависимости по вопросам ниже. Не читать весь архив/raw/research подряд.

## Состав пакета

- Shared index config writer/API/coordinator, отдельный отказ public projection.
- Curve self-batch, EIP-7702 type4/type2, общий genesis launch-v1 и новый launch-v2:
  точные pool terminal batches USDG3 calls / ETH6 calls до policy/index/API.
- Единый dispatch `pons-profiles.cjs`; прежняя семантика старых genesis сохранена.
- Suffix scan, idle ledger/reward reuse, replay revision; сокращение повторных
  funding plans/binding reads; исправление чужой invalid authorization.
- Уборка документации: основной контекст, тестовый/боевой этапы, архив оригиналов.

## Приоритетные вопросы

### 1. Допуск и сумма покупки

Файлы: `pons-batch-route.cjs`, `pons-batch-buy.cjs`, `pons-batch-funding.cjs`,
`pons-launch-buy.cjs`, `pons-pool-batch-buy.cjs`, `pons-v4-buy.cjs`,
`pons-channel-attribution.cjs`, `direct-buy.cjs`.

Проверь signature/domain/nonce/delegation, parent-state и same-block authorization,
atomic mode, полноту calls/approvals, payer=recipient, funding projection,
USDG basis/refund, SELL/другие swaps, receipt provenance и отсутствие двойного начисления.
Безопасно ли исключается ровно matching funding Transfer при сохранении исходных logs?
Правильно ли пропускаются invalid tuples без пропуска значимой смены исполнения?
Не расширился ли допуск старых genesis? Не выводится ли eligibility только из calldata?

### 2. Индексатор, восстановление и лишняя работа

Файлы: `persistent-buy-indexer.cjs`, `replay-direct-buy.cjs`, `buy-policy-*.cjs`,
`shared-index-config.cjs`, API/worker, `local-promo-scheduler.cjs`.

Проверь prefix+suffix, reorg/cache eviction (тот же tx на другой ветке), notices,
replay revision, idle reuse/rewards, cutoff/freshness, integrity против temporary RPC
failure, consumer identities и frozen jobs. Найди оставшиеся необоснованные
исторические RPC/CPU проходы. JSON/write и replay при новых блоках ещё O(history) —
известное ограничение: оцени приоритет и минимальный измеримый следующий шаг,
не предлагай новую платформу хранения без обоснования.

### 3. Funding и неизвестные отправки

Файлы: `pons-funding-pass.cjs`, `pons-collector-manual.cjs`, `pons-automation.cjs`,
`pons-transaction-journal.cjs`, `contracts/LocalPonsCollector.sol`, соседние guards.

Кэш плана живёт до попытки транзакции, не между polls. Проверь fresh state после
send/revert, unknown outcome, payout priority, campaigns/старые credits, source drift,
доступные claim/pay при ожидании conversion. Не предлагай тратить frozen/claimable,
reroll/reset, подмену RNG или снятие local-only guards.

### 4. Покрытие и сложность

Найди существенные негативные сценарии, которые отсутствуют либо подтверждены только
моделью. Отличай executed receipts от synthetic RPC chain/code injection/fixtures.
Не приписываем ли установленному MetaMask результаты harness? Есть ли dead code,
опасные defaults/retries, дубли или лишние абстракции? Обоснуй пользу упрощения;
несколько genesis-версий нельзя объединять ценой изменения исторических решений.

### 5. Контекст и следующий шаг

Согласованы ли актуальные документы и код, не потеряно ли принятое ограничение при
архивации? Обоснован ли следующий пакет:0x execution/attribution → минимальный
adapter/index/API, затем unknown-route observability и wallet UX? Если есть более
ранний blocker корректности тестового контура — назови его. Production gaps не
выдавай за неожиданные дефекты этого этапа. Новые сети/продуктовые правила вне задачи.

## Доказательства и пределы

- [Точный список и результаты](../evidence/PONS_AUDIT_TESTS_2026-10-02.json):39 файлов,
  239/239 PASS, затем отдельный evidence fixture4/4. Рабочее дерево поверх b9b7e04,
  не полный RC baseline; commit/push не повод повторять тесты. Недоступный сырой
  .local/logs файл не означает отсутствия проверки; используй committed evidence.
- [Fresh pool batch → policy/index/API](../evidence/PONS_POOL_BATCH_INDEX_API_2026-10-02.json):
  fork78099955, четыре независимые USDG/ETH × sequential/batch ветки. Synthetic funding,
  open lifecycle v1, latest→finalized; не полный draw cycle и не public activation.
  Wrapper оговаривает устаревшие generic limits исходного runner.
- [Общий профиль](../evidence/PONS_COMBINED_PROFILE_2026-10-02.json),
  [signed7702](../evidence/PONS_SIGNED_7702_2026-10-02.json),
  [steady-state7702](../evidence/PONS_STEADY_7702_2026-10-02.json).
- [Прежний indexed draw cycle](../PONS_INDEXED_CYCLE.md) — другая дата/ревизия,
  не проверка нового adapter через все draws.
-0x не квалифицирован. Реальный wallet UI, production manifest/custody/timing/rollout
  не объявляются завершёнными. Ориентируйся на границы конкретного evidence.

## Формат ответа

1. Прочитанный SHA, краткий вывод, реально просмотренный объём.
2. Findings по важности: файл/строка, trigger, последствие, путь по коду, минимальная
   правка и regression-сценарий. Пометки: confirmed / hypothesis / known limitation.
3. До пяти обоснованных упрощений или пробелов покрытия.
4. Следующий осмысленный пакет: что исправить до0x либо почему можно продолжать план.
5. Непроверенные границы отдельно. Если новых дефектов нет — так и напиши.
