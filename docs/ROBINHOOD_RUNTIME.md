# Robinhood runtime: общий исполнитель и локальная репетиция

28.09.2026. Подготовлен отдельный вход для chain4663 поверх существующей автоматики.
Контракты, распределение резервов и правила розыгрышей не менялись.
**Отправки в публичную сеть остаются закрыты.** Нет `--execute`, approve-флага или
ключа в JSON, которым можно превратить текущую проверку в mainnet запуск.

## Режимы

- Прежние CLI и прямой вызов общего worker без нового контекста:31337/loopback,
  прежние `local-*` schemas и state identity. Не получили разрешения на другие сети.
- `robinhood-inspect`:4663, HTTPS или локальный HTTP для проверки. Проверяет полный
  профиль/граф/роли/байткоды/timing. Возвращает `publicExecutionDisabled`; не создаёт
  журналы и не отправляет. CLI использует VoidSigner — приватный ключ не загружается.
- `robinhood-rehearsal`:4663, только loopback HTTP и один локальный Hardhat instance.
  Provider исполнителя и endpoint сканера сверяются по chainId, block hash и
  hardhat_metadata.instanceId. Перед каждой отправкой перепроверяются сеть и instance.
  Реальные отправки допустимы только в этот локальный узел.

`runtime-network.cjs` передаёт контекст через AsyncLocalStorage, как уже применяемая
transaction boundary. После выхода возвращается локальный контекст. Это защита от
неправильного штатного запуска, не sandbox против изменённого JS/злонамеренного RPC.
Само наличие chainId4663 или флага rehearsal недостаточно.

## Общий путь

`robinhood-automation.cjs` → существующий `promo-automation.cjs` → funding, drand,
scheduler, Short/Monthly executors и claims. Новой копии расчётов или отдельного
журнала nonce нет. Сохраняются четыре связанных state files, один signer, gas forecast,
unknown-send reconciliation, payout queue и drain. Каждая4663tx получает explicit chainId.

Новые сетевые schemas:

- `robinhood-infinity-worker-v1`;
- `robinhood-drand-delivery-v1`;
- `robinhood-promo-scheduler-v1`;
- `robinhood-promo-automation-v1` (оба draw обязательны).

BUY policy, manifest, lifecycle и signed/hashed job formats не переизобретаются.
Исторические имена `local-short-job-v1` / `local-monthly-job-v1` остаются форматом
артефакта; допустимая сеть проверяется отдельно на исполнении. Для4663 требуется
FINALIZED_CHECKPOINT и привязанный BuyPolicySource. Это не перенос старого deployment.

В main identity Robinhood хранится origin+hash RPC URL вместо пути с возможным API key.
Смена URL всё ещё меняет identity: failover/handoff не добавлены этим пакетом.

## Admission и ожидание

Новый вход требует `public-launch` profile с chain4663 и выполняет admission до начала
репетиции. Лишь на подтверждённом локальном Hardhat общий запрет
`publicExecutionNotImplemented` не мешает репетиции; все содержательные checks остаются.
В отчёте сохраняются releaseBlockers, executionScope и `publicLaunchReady:false`.
Сам read-only inspector по-прежнему не разрешает public launch.

Временный RPC transport failure при подготовке/admission даёт `waiting/rpcUnavailable`.
Семантическое несовпадение pins/ролей/параметров — блокировка, не слепой retry.
Нехватка native и высокий gas price до broadcast не создают intent; следующая итерация
может продолжить. Если отправка уже могла состояться, её journal не очищается ради retry:
known hash сверяется с receipt, unknown hash блокирует все следующие lanes.

Обновление28.09: [recovery admission](RECOVERY_ADMISSION.md) теперь сверяет journals
до contract admission, отделяет критические обязательства от полного допуска,
а Robinhood drain запрещает новые funding и freeze сохранённых Ready jobs.
Стартовое ограничение на обслуживание старых выплат при source drift снято.

## CLI

Нужен **полный настоящий** runtime config с deploymentProfile, fundingJob, deliveryJob,
schedulerConfig и ops. Incomplete launch plan не подходит. Нельзя получить правильные
адреса и commitments простым заменением31337 на4663 в fixture.

```powershell
node scripts/run-robinhood-automation.cjs --config PATH --state PATH --rpc HTTPS_URL
```

Это inspect, exit1 при intentional publicExecutionDisabled. Для собственной локальной
репетиции — `--mode rehearsal --rpc http://127.0.0.1:PORT`; поддержаны `--watch` и
`--drain`. Подключается unlocked локальный signer по адресу deploymentProfile.executor,
не пользовательский публичный ключ. Реальная signing/key custody интеграция ещё впереди.

## Проверки и предел доказательства

Новые адресные тесты используют настоящие Robinhood wrappers/DrandRandomAdapter на
Hardhat4663. ArbSys заменён shim, clock исторический; USDG/fee source и participants
тестовые, runtime market bytes сохранены, но торговля PAIR не выполняется.

Проверены: public no-send, строгий локальный default, pins/Hardhat guard, funding ровно
один раз, native top-up/gas wait, transient RPC, known receipt recovery и unknown hash
stop-all. Для обоих заранее frozen draw worker сам выполняет prove/deliver с настоящей
сохранённой BLS подписью, после terminal событий обнаруживает и оплачивает награды;
повторный проход не платит второй раз.

В этом кейсе datasets/begin/publish/seal и process/finish подготовлены вручную тестом.
Это **не** новый автоматический BUY→оба draw→claim e2e на4663. Общие scheduler/Short/
Monthly пути проверены соседними локальными регрессиями. Ни живого deployment, ни
нового fork, ни публичных отправок в этом пакете нет. Nitro gas/finality не доказаны.

Profile `robinhood-runtime` содержит затронутые пути; полный suite не нужен после
каждого шага. Solidity не менялся, использована проверяемая сохранённая compilation
artifact.59 различных продуктовых сценариев прошли отдельными запусками:9 новых
runtime,2CLI,45 соседних,3deployment-admission. Дополнительно1catalog check. Не full
baseline и не полный запуск нового profile. У первого запуска тест native wait ошибочно
ожидал файл без сохранённого intent; проверка исправлена на отсутствие pending/файла
и прошла. Runtime code ради этого не менялся.

Команды (artifact env указывает на `.local/logs/public-compiled.json` и его SHA256):

```text
node --test test/robinhood-runtime.test.cjs
node --test --test-name-pattern="native deficit|RPC outage|public context|delivers drand" test/robinhood-runtime.test.cjs
node --test --test-name-pattern="RPC outage" test/robinhood-runtime.test.cjs
node --test test/robinhood-runtime-cli.test.cjs
node --test test/promo-automation.test.cjs test/infinity-worker.test.cjs test/drand-delivery-worker.test.cjs test/cutoff-scheduler.test.cjs test/local-executor-stability.test.cjs test/short-automation-cli.test.cjs test/local-rpc-watch.test.cjs
node --test --test-name-pattern="profile matches|read failure|observations reject" test/deployment-admission.test.cjs
node --test --test-name-pattern="catalog" test/test-launcher.test.cjs
```

Новые сценарии добавлялись по ходу; первый запуск содержал6cases, затем адресно
пройдены добавления/исправление. Последнее изменение обработки transient admission
перепроверено RPC outage case и3admission tests. Соседний45-case run занял219.6s.

## Следующий участок

Остаются подходящий archive endpoint и реальные deployment/BUY pins, явное принятие
production timing/экономики, key custody и release activation. До открытия отправок
нужны реальные checkpoint storage reads и сквозная квалификация обоих draw/recovery.
Общий shared runtime уже умеет работать в4663 контексте; это не повод снимать gate
или считать локальные fixtures production доказательством.
