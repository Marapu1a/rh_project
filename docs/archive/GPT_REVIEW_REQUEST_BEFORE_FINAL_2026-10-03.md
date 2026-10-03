> Архив до итогового review03.10.2026; не текущая задача.

# GPT review: Pons admission, индексатор, кабинет и общий цикл

03.10.2026. Нужен **статический review накопленного пакета**, а не новый обзор
лаунчпадов. База diff: `5f3c497`. Проверяй текущий опубликованный HEAD относительно
этой базы. В начале ответа укажи полный SHA, доступные файлы и ограничения доступа.
Ответ запиши в `docs/GPT_REVIEW_RESPONSE.md`, заменив маркер ожидания.

## Задача и границы

Найти ошибки, которые могут дать лишние/чужие билеты, потерять уже заработанные,
повторить отправку, исказить выплаты/остатки или сделать систему непригодной при
росте истории. Отдельно предложить следующий **ограниченный пакет устойчивости**.

Сначала тестовое окружение; боевой запуск отдельно. Не меняй runtime-код, продуктовые
правила, порог100USDG, призовую математику. Не устанавливай зависимости, не запускай
tests/build/fork, не подключай кошельки и не отправляй транзакции. Тесты выполняет
Codex. Если нужен эксперимент — точный сценарий и ожидаемый результат, без заявления
PASS. Чтение доступных файлов и статический diff разрешены. Не обращайся к третьим лицам.

Исторический ответ о политике атрибуции сохранён в
[архиве](../archive/GPT_REVIEW_RESPONSE_ATTRIBUTION_2026-10-02.md), прежний research-запрос —
[отдельно](../archive/GPT_REVIEW_REQUEST_GRADUATION_2026-10-02.md). Они не результат этого review.

## Вход и состав пакета

Начни с [контекста](../CURRENT_CONTEXT.md), текущего этапа [плана](../ROADMAP.md),
[правил](../PRODUCT_SPEC.md), [карты кода](../IMPLEMENTATION_STATUS.md).
Не читай весь архив. Затем проверяй модули и их прямые зависимости:

1. **Genesis v3/v4, новые пути допуска.**
   [0x](../PONS_ZEROEX_POOL_ADMISSION.md), [EntryPoint](../PONS_ENTRYPOINT_POOL_ADMISSION.md),
   [матрица охвата](../PONS_CHANNEL_COVERAGE.md).
   Код: `scripts/pons-zeroex-buy.cjs`, `pons-entrypoint-buy.cjs`,
   `pons-entrypoint-codec.cjs`, `pons-profiles.cjs`, `direct-buy.cjs`,
   `replay-direct-buy.cjs`; соседние curve/v4/batch decoders и tests.
2. **Checkpoint/cache/snapshot/API.**
   [Рост истории](../INDEXER_HISTORY_SCALING_2026-10-02.md),
   [checkpoints](../INDEXER_CHECKPOINTS_2026-10-02.md).
   Код: `scripts/persistent-buy-indexer.cjs`, `direct-buy.cjs`,
   `local-scheduler-state.cjs`, `indexer-checksum.cjs`, `user-status-api.cjs`,
   `user-status-worker.cjs`, `shared-index-config.cjs` и coordinator consumers.
3. **Кабинет/Claim.** [Описание](../WEBSITE_WALLET_ACTIONS.md).
   Код: `web/app.js`, `web/claim.js`, `web/claim.test.cjs`,
   `scripts/serve-site.cjs`, `site-wallet-rehearsal.cjs`.
   Ethers6.17.0 vendored с MIT license; не трать review на ручной разбор minified bundle.
4. **Достоверность сквозного прогона.** [Отчёт](../PONS_WALLET_CYCLE.md),
   [evidence](../evidence/PONS_WALLET_CYCLE_2026-10-02.json).
   Код: `scripts/verify-wallet-browser.cjs`, `verify-pons-wallet-api.cjs`,
   `pons-automation-rehearsal.cjs`, `pons-collector-fork.cjs`,
   `test/fixtures/pons-wallet-cycle-hardhat.config.cjs`.

## Что уже проверяли — не приравнивать к общему релизному PASS

- 0x:84 адресных tests; EntryPoint:100; checkpoint пакет:112 уникальных адресных
  tests. Точные команды, исправленные неуспешные запуски и пределы — в модульных отчётах.
- Claim: реальные локальные vault transactions и browser/provider fixture;
  ручной MetaMask пользователя:70+30 тестовых USDG, оба reward=0, по одной выплате.
  Wrong network подтверждён скриншотом, отказ/повтор/reload — сообщением пользователя.
  Смена аккаунта проверена автоматически, не вручную.
- Свежий fork78518737: покупки до/после graduation → persistent index/API → Short/
  Monthly → live drand proof → выплаты107.337115 тестовых USDG →2 Paid в браузере.
  До draw по86 OPEN, после по86 consumed и1 OPEN от покупки после freeze.
  Stop/prove/resume, реальный API outage/restart и idle без транзакций прошли.
- Первый цикл остановлен из-за локального clock+12s. Для повторного включили
  allowBlocksWithSameTimestamp только в отдельном Hardhat config; RNG guards не меняли.
- НЕТ нового полного baseline всех tests на одном HEAD. Локальные `.local/logs`
  не публикуются: используй сохранённые evidence и назови недоступные сырые данные.

## Приоритетные вопросы

**Допуск и деньги:** доказаны ли payer/account/recipient и USDG basis? Исключены ли
служебные swap, ложная атрибуция bundler, дубли между адаптерами, дополнительный
swap/transfer, refund/split и изменение delegation внутри блока? Есть ли обход
parent-runtime/signature/binding guards? Не меняют ли новые genesis старую историю?

**Индексатор:** эквивалентен ли suffix replay полному при carry, lifecycle, reorg,
policy change, restart и миграции? Можно ли принять чужой/испорченный checkpoint?
Где checksum лишь обнаруживает повреждение, а где consumer действительно проверяет
историю? Нет ли скрытого полного обхода на каждом poll, утечки cache, потери atomicity
или гонок writer/API/coordinator? Оцени O(history) по фактическим путям, а не по пустому
synthetic5000-block benchmark. Не предлагай повышать freshness timeout, чтобы скрыть лаг.

**Кошелёк:** account/network changes во время review/send, auto-refresh, двойной клик,
несколько вкладок, reload, неизвестный исход и поздний hash. Не расходятся ли journal
и receipt? Возможен ли неверный Paid или опасный повтор? Что произойдёт с заменённой
транзакцией и зависшим submitting? Не скрыт ли существенный UX-долг под fail-closed?
Проверить реальные границы local-only guards; это пока НЕ боевой Claim entrypoint.

**Доказательства:** где успешный тест мог дать ложную уверенность? EIP-1193 fixture
не равно extension; operator impersonation не равно доступность Pons service;
управляемый finalized/часы и donor funding не равно условиям mainnet. Последний
полный цикл использует direct curve/v4, а не все wrapper-маршруты одновременно.
Сверь test profile catalog и фактическое включение новых проверок; не запускай их.

**Следующий пакет:** предложи 3–5 измеримых проверок длительной работы/нагрузки/
backup-restore. Мы готовы исправлять измеренную проблему хранения, но не хотим
переписывать всё в БД без доказанной потребности. Нехватка газа → ожидание и сигнал
оператору, а не фиксированный огромный обязательный ETH-резерв. Внешнее уведомление
ещё не подключено. Плата за эксплуатацию не берётся из frozen/claimable.

## Формат ответа

1. Findings по серьёзности: файл/строка, конкретный trigger, последствия, минимальное
   исправление и тест. Раздели подтверждённый дефект, гипотезу и пробел покрытия.
2. Уже известные ограничения не выдавай за новую находку; поясни, если их последствия
   оказались серьёзнее описанного. Не повторяй целиком roadmap.
3. Отдельно: что мешает завершить **тестовый** этап, что относится только к боевому,
   что можно оставить последующим расширением.
4. Следующий пакет устойчивости с критериями завершения. Если блокирующих находок
   нет — скажи прямо, но не объявляй production readiness или аудит безопасности.
