# Pons: публичный исполнитель, тестовая квалификация

Статус03.10.2026: код отдельного публичного режима реализован. **Не развёрнут и
не запускался с реальными средствами.** Полная репетиция нового режима из release
остаётся следующей контрольной точкой. Это не разрешение на запуск промо.

## Исполнение и допуск

`run-pons-public.cjs` принимает config `pons-public-automation-v1`, отдельный
`pons-public-profile-v1`, state и зашифрованный JSON keystore. Hardhat instance
в публичном config запрещён; policy/index обязательны. Executor сверяется с
адресом расшифрованного кошелька. RPC допускается только HTTPS.

Используется общий `runPonsAutomation`: те же funding-pass, scheduler, drand,
gas budget, parent/child journal и reconciliation. Второго учёта нет.
Публичная identity содержит профиль, execution scope и hash/origin RPC; сырой URL
не входит в неё. Изменение профиля/config не мигрирует существующий state автоматически.
Сначала нужно разрешить старые pending с прежней конфигурацией.

`pons-public-execution.cjs` проверяет адрес и декодированный метод, chain4663,
нулевой value, sender и отсутствие authorizationList. Для collector.pay
разрешены только три заданных получателя. Governance/approve/переводы ETH
не входят в разрешённые действия.

Перед estimate и после него, **до intent**, выполняется допуск:

- Funding, публикация, closeEmpty и freeze требуют полного совпадения
  [публичного профиля](PONS_PUBLIC_PROFILE_2026-10-03.md).
- Claim, prove/deliver и завершение замороженных Short/Monthly проверяют runtime,
  неизменяемые связи и instance контроллеров, vault/registry/quote/token/adapter,
  deployment anchor и каноничность наблюдения. Текущий owner и получатели будущих
  комиссий не являются условием выплаты уже назначенного приза.

Первый проход scheduler в публичном режиме обслуживает только frozen obligations.
Новые действия идут после funding-проверки и проходят полный допуск перед отправкой.
`--drain` полностью исключает новые задания и сбор комиссий.
Нехватка ETH — ожидание по оценке текущей транзакции, не резерв0.6 ETH и не расход
призовой казны. Unknown hash не очищается; известная tx сверяется, не повторяется.

Старый `run-pons-automation.cjs` остаётся loopback-only. `robinhood-inspect`
по-прежнему не может отправлять. Новый сетевой режим требует guard и journal.
Репетиция нового guard возможна только с явным `rehearsalInstance`, проверяемым
на локальном Hardhat4663. Это другая identity, `publicSends:false`.

## CLI для будущей репетиции поставки

В окружении задаются `RH_RPC_URL` и `QIANQI_KEYSTORE_PASSWORD`; секреты не передаются
аргументами, не печатаются и не входят в репозиторий. Пароль удаляется из env
процесса после расшифровки. Использовать отдельный кошелёк автоматики.

```text
node scripts/run-pons-public.cjs --config CONFIG.json --profile PROFILE.json --state STATE.json --keystore ENCRYPTED.json --watch
```

Добавление `--drain` меняет только выбор действий, не identity и не обязательства.
CLI публикует очищенный operational status, не сырые ошибки RPC дочерних модулей.
Ownership/status wrapper отмечает публичный режим явно. Fatal/blocked останавливают
CLI; pending и stale lock требуют описанной процедуры восстановления, не reset.
Боевые config, keystore и новый systemd unit этим пакетом не создавались.

## Проверки03.10

`node scripts/test-launcher.cjs --profile pons-public-execution`:
**34/34 PASS**, один compile, около243s. Отчёт
`.local/logs/test-run-CT2RZw/result.json`, лог
`.local/logs/pons-public-execution-suite.log`.

После добавления двух сценариев отдельно запущен фильтр
`runtime drift after estimation|public network requires` для
`test/pons-public-execution.test.cjs` и `test/pons-public-runtime.test.cjs`:
**2/2 PASS**, с тем же проверенным compiled artifact. Лог
`.local/logs/pons-public-execution-boundary.log`. Итого **36 уникальных адресных
тестов**, не полный baseline. Оба сценария входят в сохранённый профиль.
Отдельно `node --test test/test-launcher.test.cjs`:5/5 PASS после изменения каталога;
лог `.local/logs/pons-public-execution-catalog.log`.

Новый EVM-сценарий использует реальные public controllers/vault/drand на локальной
сети4663, синтетических участников и исторический проверенный beacon:
ноль ETH → ожидание без nonce; пополнение → оба draw завершены, призы выплачены;
owner drift не мешает drain; повторный запуск не отправляет; reset сети отвергается.
Подмена vault runtime между estimate и intent даёт0 отправок и0 записей intent.
Pons collector настоящий, venue endpoints синтетические и намеренно не проходят
полный допуск. Новый полный funding/freeze путь подтверждён пока моделью RPC,
не этим EVM-сценарием.

Соседние проверки охватывают старый local/inspect запрет, неизвестный hash,
receipt timeout/status0/reorg, процессные kill parent/drand journal, газ и ownership.
Соседние crash-тесты не являются process-kill нового HTTPS CLI.

## Следующий пакет

Изолированная release-репетиция всего нового режима: реальный зашифрованный
тестовый keystore, HTTPS транспорт, полный совпадающий Pons graph,
funding → новые Short/Monthly → выплаты → restart. Проверить работу из runtime
artifact без solc/config/test-зависимостей. После этого отдельно решать deployment
manifest, реальные адреса/роли, квалификацию LocalPonsCollector и установку сервиса.
Сервер, публичный сайт и настоящие средства этим пакетом не менялись.
