# BUY policy: публикация, admission и исполнение

24.09.2026. Реализована цепочка с настоящим BuyPolicySource и подключением к
существующему scheduler. Публичный deployment не выполнялся. Venue и RNG сквозного
локального теста — прежние стенды, а не новая интеграция PAIR/RNG.

## Контракт и полномочия

contracts/BuyPolicySource.sol — без proxy, custody, reset, setters или смены ключа.
В constructor задаются immutable instanceId, genesisHash, publisher и noticeBlocks.
Права publisher ограничены записью новых commitments; получателей/призы он через
этот контракт не меняет. Publisher может быть EOA либо контрактным кошельком.
Реальный адрес, сеть и notice ещё не назначены; тестовые числа не параметры запуска.
Для EOA потеря/компрометация одного ключа — риск доступности будущих обновлений.
Изменение владельцев Safe относится к политике самого Safe, а не скрытому setter.

announce проверяет msg.sender, previousHash == currentHash, hash полных bytes,
ненулевое изменение, будущую границу с notice и порядок. До activation предыдущей
версии следующую публиковать нельзя. publishedCount/currentHash/lastFromBlock
позволяют независимо от getLogs сверить полноту истории. Номер блока получаем через
существующий ChainBlocks: Robinhood/Nitro и обычная EVM используют координаты RPC.

**Остаточный риск:** контракт не разбирает JSON и не доказывает семантику decoder.
Авторизованный прямой вызов с неверным, но правильно захешированным manifest может
заблокировать admission. Обязательная штатная процедура — prepare/dry-run. Это
операционная защита, не невозможность обхода владельцем ключа. Автоматического
skip/reset плохого объявления нет. До публичного deployment это должно быть
принято как риск либо решено отдельным пересмотром формата публикации.

## Публикация

scripts/publish-buy-policy.cjs: prepareBuyPolicy загружает доверенную историю,
проверяет полный candidate, canonical bytes, notice с запасом хотя бы на один
блок, выполняет eth_call и estimateGas ровно для публикуемых bytes. Задержка
включения может привести к безопасному revert, а не сокращению notice.

publishBuyPolicy использует signer и обязательный persist callback: intent с nonce
сохраняется до send; hash — после. Ошибка send записывается как send-unknown,
автоповтора нет. Если запись после broadcast не удалась, остаётся исходный intent:
проверять nonce/receipt, не отправлять повторно вслепую. persist обязан быть durable.
Для контрактного кошелька готовые calldata отправляются через его штатный workflow;
source проверяет msg.sender, loader не путает outer tx.from с publisher.

CLI подготовки (config содержит genesis manifest и buyPolicy trust):

```powershell
node scripts/run-buy-policy-publication.cjs --config config.json --next next.json --rpc URL --output prepared.json
```

Output не перезаписывается. Для локальной chain31337 есть --local-signer INDEX
--journal FILE: эксклюзивный journal, fsync и atomic replacement перед broadcast.
Существующий journal блокирует повтор; CLI не управляет production private keys.
Для публичного кошелька используйте prepared calldata после deployment review.
Это отдельная операция изменения правил; routine draws ручных действий не требуют.

## Независимый admission

buy-policy-admission.cjs читает pinned chain/source/runtime/publisher/genesis/instance
и notice. На finalized checkpoint сверяет getters контракта с trust, events с receipts
и canonical headers, полный JSON с nextHash, previousHash, notice и append-only routes.
Число событий, последний hash и activation сверяются с состоянием source; пропуск
последнего события теперь ошибка, genesis-only при count>0 невозможен.
Checkpoint перечитывается; fallback с finalized на latest отсутствует. Рост finalized
допустим, смена/регресс checkpoint запрещены.

Полнота теперь проверяется двумя RPC путями, но это не consensus light client:
лживый RPC может согласованно подменить оба. Семантика finalized конкретной сети
остаётся deployment gate. Runtime hash не заменяет аудит source и immutable bindings.
В тестах контрактный publisher — простой wallet fixture, не сертификация Safe.

## Подключение потребителей

buy-policy-runtime.cjs разрешает только genesis + pinned buyPolicy конфигурацию,
получает историю из сети и оставляет prefix объявлений на cutoff. RPC CLI не принимает
произвольный history вместо genesis. Offline evidence по-прежнему явно недоверенный.

Подключены replay-attempts/replay-direct-buy, verify-short-dataset/verify-monthly-dataset
и local-promo-scheduler, вызываемый coordinator. Builders явно берут domain на cutoff.
Scheduler читает live state для исполнения существующих jobs, finalized checkpoint
для нового dataset. Нельзя считать старое finalized состояние отсутствием уже
отправленного begin. При несовпадении эпох на cutoff ожидание finalizedPolicyBoundary.

Конфигурация содержит genesis и постоянный trust; добавление версии не меняет её
identity и не требует миграции state. Источник/trust задним числом не подменяем:
изменение config по-прежнему блокирует сохранённый state. Для старого deployment,
где source ещё не был закреплён, автоматической привязки/миграции нет.
Перед исполнением сохранённого задания проверяется buyManifestHash его cutoff.
Старые snapshots не переписываются, старые попытки/остатки не сбрасываются.

## Проверка и реальные границы

Сквозной тест local-scheduler: реальные deployment source, prepare CLI, транзакция
announce, RPC admission, старые frozen Short/Monthly, BUY нового route с ERC20
transfers, завершение старых и следующих циклов, отказ при подмене persisted job.
Используется существующий LocalBuyFixture, расширенный второй settlement формой.
Только для chain31337 он отмечается routerProfile=local-fixture; публичный decoder
сохраняет проверку закреплённого настоящего router runtime hash.

Отдельно проверены EOA/контрактный publisher, чужой sender, неверные hash/parent,
повторная публикация, неизвестный route до send и пропуск последнего RPC notice.
Итоговый замер EVM: 109562 gas для manifest 1371 bytes (обычная EVM chain31337).
Это не стоимость в USDG и не замер Nitro precompile overhead.

Production gates: конкретные source/authority/genesis/runtime, finality и срок
notice, review остаточного риска неверного авторизованного JSON. Автоматика остаётся
за existing local chain31337 guards; этот пакет их не снимает и проект целиком
production-ready не объявляет. Deactivation route и аварийная смена источника не
реализованы, исторические обязательства не сбрасываются.

Проверки 24.09: custom test-launcher selection из participant-registry, direct-buy,
attempt-lifecycle, monthly-replay, local-scheduler — 59/59, compile once 18.2 s,
весь targeted пакет 208.6 s. Evidence `.local/logs/test-run-12I3zG/result.json`.
После финального разделения live execution/finalized cutoff и CLI-подключения —
адресный --match "BUY policy publication|Monthly CLI|policy admission": 3/3,
включая искусственно отстающий finalized и prepare CLI поверх реальной локальной EVM.
Evidence `.local/logs/test-run-NycuiN/result.json`, 70.8 s включая compile.
Выборки пересекаются, не суммировать; full/fork/mainnet sends не запускались.
