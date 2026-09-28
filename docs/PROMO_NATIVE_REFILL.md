# ETH refill общей автоматики

28.09.2026. Реализация: `scripts/promo-native-refill.cjs` и
`scripts/promo-automation.cjs`. Работает в local31337 и локальной репетиции4663.
Public signer и public sends по-прежнему закрыты.

## Модель

Отдельный заранее пополненный ETH-кошелёк переводит native только на адрес общего
executor. Нет вызовов контрактов, выбора произвольного получателя, USDG swap или
вывода из PromoVault. Это bootstrap эксплуатации, не автоматическая окупаемость
из creator fees. Распределение creator fees и USDG→ETH остаются отдельным шагом.

Опциональный `nativeRefill` в automation config:

```text
kind: BOOTSTRAP_NATIVE
source: отдельный EOA с ETH
minimumBalance: неприкосновенный остаток источника, wei
transferGas: верхняя граница gas units перевода
maxPerRefill: максимум value + резерв комиссии, wei
maxPerPeriod: максимум расходов за periodSeconds, wei
periodSeconds: длительность окна, секунды
cooldownSeconds: пауза после подтверждённой попытки, секунды
```

Все числовые поля — целые десятичные строки. Адрес source не может совпадать
с executor, призовой custody, collector/source, токенами или текущими recipients.
Перед переводом source и executor проверяются как адреса без кода. CLI получает
unlocked signer по source только на локальной сети/rehearsal; inspect не загружает
ключ и не создаёт подписывающий refill signer. API принимает `refillSigner` отдельно.

Старый local-native-refill planner/executor сохраняется для старого coordinator.
Его журнал, набор операций и LOCAL_EIP1559 accounting не совместимы напрямую с
общей автоматикой. Новый узкий исполнитель использует общий `transactionCost`,
bounded receipt wait и существующий main lock/journal, без пятого state-файла.

## Порядок выполнения

1. Сверить main pending, включая refill; затем pending funding/RNG. Неизвестная
   отправка не очищается и не повторяется. При ошибке сверки новые sends запрещены.
2. Проверить критические deployment pins. Source-only outage не запрещает газ
   для frozen обязательств; сломанная критическая binding запрещает новый refill.
3. Обнаружить старые выплаты. До завершения discovery refill не отправляется:
   ещё нельзя корректно оценить приоритет старых обязательств.
4. При нехватке ETH перед действием посчитать оставшийся газ обоих frozen draws
   и найденных claims. Сначала пополнить этот дефицит; затем потребность нового
   действия. Новые действия сохраняют резерв для старых обязательств.
5. Не более одного нового refill за проход; допускается частичное пополнение.
   После receipt пересчитать баланс/допуск. Уже обеспеченные старые действия могут
   продолжаться, даже если source пуст или пополнение ограничено лимитом/cooldown.
6. Если нового газа пока недостаточно, следующий watch-pass продолжит автоматически.

Refill входит в общий maxTransactions. Дорогой gas, недостаток ETH у source,
исчерпанный лимит и cooldown — ожидание, не отмена розыгрыша. Отсутствие refill
config сохраняет прежнее поведение: ожидать внешнего пополнения executor.
Газовые прогнозы остаются прогнозами, не гарантией исполнения по фиксированной цене.

## Журнал и лимиты

Перед send main state хранит `pending.worker = promoNativeRefill`, source/target,
value, chainId, nonce, fee envelope и anchor. После send сохраняется hash.
Сверка проверяет исходную transaction, receipt и каноничность блоков. Фактический
расход — value при успехе плюс `gasUsed * gasPrice`; при revert только комиссия.
Расход относится к окну блока receipt, в том числе если отправка пересекла границу окна.
Отклонение от envelope/лимита учитывается и блокирует последующие refill, но не
расходование уже обеспеченного газа на обязательства.

`nativeRefill` входит в identity. Изменить source/лимиты редактированием config
поверх существующего журнала нельзя. Существующий local handoff может впервые
добавить refill; включённую политику он сохраняет вместе с history/cooldown/halt.
Pending запрещает handoff. Смена refill policy с переносом accounting не реализована.

Оба signer принадлежат одному worker; source нельзя одновременно использовать
в другом runtime или вручную отправлять с него конкурирующие транзакции.
Лимит локальный, не on-chain ограничение ключа. Runtime volume должен быть
постоянным и несинхронизируемым; создание нового пустого журнала не миграция.
Автоматическое удаление locks или unknown intents не добавлялось.

## Границы доказательства

Rehearsal4663 использует Hardhat, ArbSys fixture, историческую BLS подпись и заранее
подготовленные frozen datasets. После подготовки refill→drand→process/finish→claims
исполняет worker. Это не настоящий BUY→freeze и не live proof комиссий Nitro.
Параметры fixture намеренно завышают reserve gas; они не экономический профиль релиза.
Нужны qualified RPC, production gas calibration/fees, ключи и public activation.

Проверки: `test/promo-native-refill.test.cjs`, `test/promo-runtime-handoff.test.cjs`.
Профиль `promo-native-refill` включает значимых соседей; полный suite не требуется
для каждой следующей правки. Подтверждённые результаты текущего пакета — ниже.


## Проверки 28.09.2026

56 различных адресных сценариев +1 catalog прошли **отдельными запусками**:

- `node --test test/promo-native-refill.test.cjs`: первые8/8,217.1s;
  добавленные cooldown/envelope/normal funding —3/3 через `--test-name-pattern`;
  Ready Monthly против frozen Short —1/1. Всего12 различных сценариев.
- После изменения порядка save до in-memory commit повторены
  `--test-name-pattern='empty executor|known refill send|unknown refill send'`:
  3/3,85.6s. Это повтор, не ещё3 новых теста.
- `node --test test/promo-refill-accounting.test.cjs`:4/4, в том числе disk failure,
  revert, граница окна, неверный nonce/noncanonical receipt, превышение envelope.
- `node --test test/promo-runtime-handoff.test.cjs test/promo-automation.test.cjs
  test/infinity-worker.test.cjs test/drand-delivery-worker.test.cjs
  test/robinhood-runtime-cli.test.cjs test/short-automation-cli.test.cjs`:
  40/40,209.3s. Включает новый handoff accounting case.
- `node --test --test-name-pattern='profile catalog' test/test-launcher.test.cjs`:1/1.

Контрактные тесты использовали проверяемый по source/digest локальный compile artifact
через RH_TEST_ARTIFACT/RH_TEST_ARTIFACT_SHA256. Контракты не менялись. Первый новый
прогон выявил слишком низкий refill cap в fixture относительно его завышенного
reserveGasPrice; исправлены тестовые caps и ожидание исходного nonce. Это не изменение
продуктовых комиссий. Full suite, новый fork и live sends не запускались.
Локальные логи: `.local/logs/promo-refill-*.log` (не публикуются).
