# Постоянный ответ GPT

Обновлено: 21.09.2026.

Это независимое review-мнение, не задание на автоматическое исполнение. При следующем
обращении файл следует полностью перезаписать.

Просмотрен HEAD `459fc3899ccebc29667885562f4e913d23c96f62` —
`feat: integrate bounded native refill into coordinator and CLI`.

## Короткий вердикт

Основная automatic-refill интеграция собрана последовательно. Общий collector не изменил
бюджетную арифметику: frozen Short/Monthly попадают в committed, текущая операция — в
candidate, общий payer получает один signer buffer. Obligations и balances связаны одним
block anchor. После recovery либо фактического refill текущий pass заканчивается; второго
перевода и продолжения на старом snapshot нет. Covered frozen work не уступает candidate
или optional buffer.

Нашёл один подтверждённый migration/liveness defect: при включении native refill старый
state получает новый `configHash` **до** проверки существующего `nativeRefillHistory` и
полноты funding targets. Если последующая проверка возвращает `historyDomainMismatch` или
`missingFundingTarget`, ошибочная конфигурация уже закреплена. Исправить policy/source/targets
обычным следующим запуском нельзя: он отвергается как checksum/config mismatch. Reset/migration
API нет.

Деньги при этом не отправляются и история расходов не стирается, то есть safety fail-closed
сохраняется. Но заявленная config admission способна навсегда остановить этот state после
первой ошибки настройки. Перед тем как считать automatic wiring завершённым, нужен узкий
pre-migration admission fix.

## Подтверждённый defect

Порядок сейчас такой:

1. `runCoordinator` строит новый config с `nativeRefill.domainHash/source`.
2. `withState` видит разрешённый legacy/budget config, сразу записывает новый
   `stored.configHash` и сохраняет state.
3. Только затем coordinator/executor проверяет существующую funding history и фактические
   obligations/targets.
4. При несовместимости возвращается operator stop, но config уже считается принятым.

Минимальная reproduction на реальном `withState`:

- исходный budget state содержит `nativeRefillHistory.domainHash=A`, `spent=7`;
- первая попытка включения с domain B возвращает `historyDomainMismatch`;
- `spent=7` сохранён, но persisted config уже равен B;
- повтор с domain A, соответствующим истории, возвращает
  `Scheduler state checksum/config mismatch`.

Свежий state имеет родственный путь: неполный target set может пройти статическую
`configuration()`, config мигрирует, а `missingFundingTarget` появится только при первой
реальной obligation. Добавление пропущенного payer меняет domain и уже не принимается.

Это не аргумент разрешить сброс history или ослабить config identity. Наоборот, admission
должен завершиться до фиксации новой identity.

## Ограниченное исправление границы

Достаточен небольшой пакет без нового journal:

1. До входа в state migration проверить, что targets покрывают все статически известные
   native accounts: prize executor, draw publisher/executor и Short/Monthly RNG controllers.
2. Для legacy upgrade под lock выполнить pre-migration predicate над сохранённым state:
   если `nativeRefillHistory` уже существует, его domain должен совпадать с принимаемым;
   только после этого сохранять новый `configHash`.
3. Rejected admission не должна менять state ни на байт. Следующий запуск с исправленной,
   history-compatible конфигурацией должен приниматься.
4. Pending по-прежнему запрещает migration; spend/cooldown/lastNonce нельзя обнулять.

Это можно реализовать узким migration guard/callback существующего `withState`. Переносить
проверку после фиксации config или давать автоматический reset нельзя.

## Что в интеграции проверено и принято

- `collectExecutionObligations` сохраняет старую математику current action extras.
- Pending Short/Monthly классифицируются как committed; unfrozen текущий lifecycle —
  candidate. Другие unfrozen proposals не объявляются обязательствами.
- Shared payer buffer не дублируется между committed и candidate snapshots.
- Pre-pass рассматривает только committed; candidate funding возникает через обычный
  budget yield worker-а.
- При наличии committed массива candidate tier откладывается, даже если committed уже
  обеспечен: coordinator сначала даёт frozen work продвинуться.
- Buffer рассматривается после workers и только при отсутствии frozen obligations.
- `allowedTiers` проверяется до source pending nonce, поэтому отложенный buffer не блокирует
  funded work из-за постороннего source nonce.
- Worker не отправляет refill внутри своей transaction boundary; он только возвращает
  актуальный report coordinator-у.
- Executor требует точного совпадения obligations anchor со своим balance snapshot.
- Confirmed и reverted refill завершают pass статусом progress. Обычные cap/floor/cooldown/
  gas/stale ожидания остаются resumable waiting.
- Unknown send остаётся reconciliation stop. Fee-policy halt теперь корректно различает
  `requiresOperatorAction=true` и `requiresReconciliation=false`.
- Source обязан быть отдельным BOOTSTRAP_NATIVE signer на том же provider; execution signers,
  controllers и prize custody не могут стать источником/получателем.
- Funding domain/source входят в coordinator identity; изменение уже принятой policy
  отвергается. Дефект относится именно к моменту первого admission/migration.

## Границы, не являющиеся defect этого пакета

- Это chain 31337, local venue/RNG и sampled gas model, не production deployment.
- Source остаётся заранее пополненным native bootstrap account; TOKEN/USDG → ops native
  здесь не реализуется.
- Signature-before-broadcast, production finality и reorg recovery остаются отдельными
  границами.
- Один pass может только один раз пополнить или восстановить refill; следующий pass обязан
  перечитать chain/state.
- Отсутствие автоматического reset правильно. Нужен безопасный admission guard, а не reset.

## Выполненные проверки

- planner/ledger/executor/budget/lock/transaction — **59/59**, fail 0;
- выбранные recovery/CLI/budget/RNG/frozen/config/automatic-refill сценарии —
  **12/12**, fail 0;
- automatic candidate refill и committed-first refill — прошли;
- fee mismatch/restart/no-repeat regression — прошла;
- отдельная migration reproduction подтвердила: history сохраняется, ошибочный config
  закрепляется, history-compatible retry отвергается;
- полный `npm test` и fork не запускались;
- `git diff --check ecd65ec..459fc38` сообщает одну лишнюю пустую строку в конце
  `docs/CURRENT_CONTEXT.md`; это не runtime defect;
- пользовательский `docs/INDEPENDENT_AUDIT_2026-09-19.md` не изменялся.

Итог: sequencing, tier priority, anchor binding и stop/recovery paths принимаю. Один узкий
блокер остаётся в первом config admission: rejected native-refill upgrade не должен закреплять
новую identity. После byte-unchanged migration regression пакет можно считать готовым к
следующему bounded stabilization step.
