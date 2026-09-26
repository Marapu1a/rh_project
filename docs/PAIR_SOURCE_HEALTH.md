# Pinned PAIR source: manifest и read-only monitor

26.09.2026. [Проверка](../scripts/pair-source-health.cjs),
[CLI](../scripts/inspect-pair-source.cjs), [тесты](../test/pair-source-health.test.cjs).
Это профиль native mode1 с одной TOKEN/USDG позицией, а не универсальный аудит проекта.
ChainId задаётся профилем; алгоритм не требует именно4663. Публичного нашего deployment нет.

## Зачем отдельно от existing inspection manifest

[Refill inspection manifest](LOCAL_NATIVE_REFILL_INSPECTOR.md) сверяет coordinator
journal с независимой локальной конфигурацией. Он не удостоверяет текущий PAIR vault.
Новый профиль описывает внешний source и привязанный FeeRouter. Старый inspector,
identity, funding, prize workers и journal не изменяются.

## Доверенная исходная конфигурация

Manifest `pair-source-health-v1` содержит только явные поля:

- chainId, deployment anchor number/hash;
- contracts: token, quote, feeRouter, vault, positionManager, hook, poolManager, registry;
- для каждого contract: address, runtime codeHash, implementation;
- implementation=null означает отдельно проверенный direct-code профиль, не автоматически
  обнаруженное отсутствие proxy. Иначе задаются kind (eip1167/eip1967), address и codeHash;
- TOKEN обязан иметь pinned eip1167 implementation, соответствующий native factory clone;
- positionId, sourceEpoch, полный PoolKey (TOKEN/USDG, fee10000, tick200, pinned hook);
- futureLaunch=null или ожидаемые coordinator/handler/version registry для будущих запусков.

Профиль не загружается из latest PAIR API и не обновляется из ответа RPC.
`--expected-hash` — обязательный независимый hash уже одобренного manifest, алгоритм
канонизации существующий `direct-buy.hash`. Смена файла без смены доверенного hash
отвергается до RPC. Сам hash не подпись и не даёт полномочий: если оператор слепо
скопирует manifest и hash из одного недоверенного источника, независимой проверки нет.
Хранить approved hash в отдельно контролируемой deployment-конфигурации.

Первичная фиксация — после проверки deployment receipt, исходников и roles.
Изменение ожидаемых pins требует отдельного review; запуск монитора ничего не принимает.
[Пример из fork](../research/native-launch/health-manifest.local.json) имеет chain31337
и локальный anchor. Это исторический кандидат, **не готовый mainnet profile** и не
описание любого нового Hardhat процесса с тем же chainId.

## Что проверяется

Сначала сеть и deployment anchor. Затем все code/storage/eth_call читаются на одном
наблюдаемом head; в конце его hash перечитывается. CLI отключает provider cache.
Другой программный caller тоже должен обеспечить свежее повторное чтение блока.
При reorg/неудачном recheck результат unavailable, даже если промежуточные чтения
показали несовпадение. Latest head не объявляется finalized.

Основные проверки:
- runtime всех восьми ролей; точный EIP-1167 clone target/runtime и implementation code;
- EIP-1967 implementation slot и code его ожидаемой implementation (включая USDG);
- FeeRouter token/quote/vault/position/sourceEpoch;
- vault token/positionManager/policyController/mode1/epoch и единственная позиция;
- epoch содержит единственного recipient=FeeRouter, share10000;
- registry.vaultOf(TOKEN), NFT ownership, registered position, quote, poolId;
- реальный PoolKey из positionManager и его poolManager.

Отдельная scope=futureLaunch сверяет currentCoordinator, currentHandler/version/enabled
и launchEnabled. Изменение этих настроек само по себе не доказывает поломку уже
созданного source. Оно отражается в issues, не меняет expected profile и не становится
source mismatch. Недоступность только этих наблюдений тоже остаётся отдельным issue.

## Результаты и автоматический запуск

```powershell
node scripts/inspect-pair-source.cjs --manifest D:/runtime/approved-pair-source.json --expected-hash 0xAPPROVED_HASH --rpc https://YOUR_RPC
node scripts/inspect-pair-source.cjs --manifest D:/runtime/approved-pair-source.json --expected-hash 0xAPPROVED_HASH --rpc https://YOUR_RPC --watch --poll-seconds 300
```

Заменить placeholders реальными одобренными значениями. Одноразовый процесс выводит
JSON и возвращает exit0 для match, exit1 для changed, exit2 для unavailable или
невалидной конфигурации. Watch повторяет проверку с фиксированным загруженным manifest,
выводит JSON каждого pass и завершает цикл по сигналу. Интервал10..86400seconds,
по умолчанию300. Сервис/планировщик в окружении пользователя здесь не установлен.

`status=match` означает совпадение **проверенных source bindings/code**. Читайте также
issues с scope=futureLaunch: при такой scope предупреждения возможны даже с exit0.
`changed` — хотя бы одно подтверждённое несовпадение source; другие недоступные чтения
остаются видны в issues. `unavailable` — проверить обязательные данные не удалось или
snapshot потерял согласованность. Никакой отправки транзакций, signer, записи runtime
state или automatic enrollment нет. Это наблюдатель, не gate coordinator.

## Проверки26.09

- Unit + настоящий JSON-RPC CLI fixture:17/17 (~2.4s). Смена epoch/recipient/NFT,
  runtime/delegated implementation, только future release, RPC outage/reorg, неверная
  сеть, изменение manifest/hash; CLI exit0/1/2, отказ до RPC при неверном hash и только
  read RPC methods. Fixture ответы синтетические, on-chain реальность подтверждена
  отдельным fork ниже. Затем CLI test расширен и повторён отдельно1/1 (~13.4s):
  watch выдаёт два отчёта, замечает смену epoch и не перечитывает изменённый manifest
  с диска. Этот1/1 входит в прежние17, не прибавлять его как новый сценарий.
- Saved fork consistency1/1 и дополнительные anchor/recheck негативные3/3 — отдельно,
  предыдущие успешные проверки не повторялись после добавления этих тестов.
  Команды: `node --test test/pair-source-health.test.cjs`; последующие адресные
  `--test-name-pattern="saved native"`, `"fails closed"`, `"CLI reads"` для этого файла.
  Логи основного и расширенного CLI запуска: `.local/logs/pair-health-unit.log`,
  `.local/logs/pair-health-watch.log`.
- Полный новый `node scripts/native-launch-fork.cjs NEW_OUTPUT.json`: прошёл native
  launch→BUY→collect→claim→reserves и новый source-health этап, **match/0issues,
  36observations**. Upstream block0x45b6fe2, execution31337, proxy394reads/7retries/0errors.
  [Полный evidence](../research/native-launch/health-success-2026-09-26.json).
  Искусственный капитал покупателя и inert draw authority остаются ограничениями
  [native launch proof](NATIVE_LAUNCH_PROOF.md). Public sends отсутствуют.

Harness [native-launch-health](../scripts/native-launch-health.cjs) сохраняет candidate
manifest/hash после уже проверенного launch и запускает inspector. Это подтверждение
совместимости фактических getters/proxy/clone с наблюдателем, не внешнее одобрение
полученного baseline. Для production capture нужен отдельный проверенный deployment.
Tests добавлены в full/watch profiles; весь product suite не запускался.

## Ограничения

Монитор не гарантирует успешный collect, ликвидность, отсутствие ERC20 freeze,
честность RPC, сохранение выручки, призовую solvency или готовность draw. Поддержан
один явный уровень implementation; beacon/diamond/другая delegation здесь не проверяются.
Отсутствие изменений кода не означает неизменности всех его storage policies.
Нельзя трактовать null implementation как результат автоматического proxy discovery.

При source drift нельзя автоматически принять epoch, сделать rebind, менять адреса
или останавливать все уже профинансированные выплаты. Recovery и решения оператора
остаются отдельной границей. Следующий продуктовый шаг — подтверждение native BUY
в нашей eligibility/admission цепочке, затем automatic eligibility/payout; монитор
их не заменяет.
