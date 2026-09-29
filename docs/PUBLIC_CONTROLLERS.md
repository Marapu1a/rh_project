# Публичное поколение контроллеров: Robinhood + drand

29.09: Monthly переведён на [V2](MONTHLY_RULES_EPOCHS.md):75/25, вес e/(e+1),
новый profile `promo-robinhood-monthly-drand-v2`, runtime19551bytes. Short22738bytes.
Public normal и obligation admission требуют новое поколение. Доказательства ниже
для прежней сборки остаются историческими; новый live/fork deployment не выполнен.


28.09.2026. Код публичных wrappers подготовлен и проверен локально. Реального deployment
на Robinhood нет; публичная отправка executor остаётся запрещена.

## Контрактная структура

`ShortControllerBase` / `MonthlyControllerBase` содержат прежнюю общую execution-логику:
роли и двухшаговую смену publisher, rules notice, gas/native readiness, reserve,
request→callback binding, один результат, settlement и старые credits.
LocalShortController / LocalMonthlyController остаются wrappers только для31337.
Поведение локального minimumUnit=1 сохранено. Proxy и новых admin полномочий нет.

Новые `RobinhoodShortController` / `RobinhoodMonthlyController`:

- допускают только chain4663; другая сеть требует отдельного явно проверенного wrapper;
- проверяют drand PROFILE, CHAIN_HASH, zero fee, собственный consumer binding и отличный
  ненулевой peer. Это constructor binding checks, НЕ аутентификация bytecode — runtime pins
  проверяются отдельно deployment admission;
- требуют ранее записанный checkpoint для begin и closeEmpty, без обхода recent-only;
- Monthly фиксирует interval30days; Short сохраняет6hours;
- Short принимает явный genesis minimumUnit. Публичная корзина не наследует молча
  тестовую единицу1 raw USDG. Реальные rules/weights/minimumUnit/maxBudget ещё нужно выбрать;
- публикуют CONTROLLER_PROFILE. Никаких constructor clock overrides или подмен RNG нет.

Правила участников/призов, finality trust, permissionless seal и невозможность reset frozen
draw не менялись. Достоверность snapshot остаётся обязанностью publisher/worker и replay.
Cache не становится finality oracle; третья сторона может вызвать seal после Ready.

## Размер и воспроизводимость

Обычный solc0.8.37, optimizer200, Cancun, без viaIR/source overrides:

| Контракт | Runtime bytes | До лимита24576 |
|---|---:|---:|
| RobinhoodShortController | 22738 | 1838 |
| RobinhoodMonthlyController | 17943 | 6633 |
| LocalShortController | 22540 | 2036 |
| LocalMonthlyController | 17745 | 6831 |

[Build evidence](../research/public-deployment/controller-build-2026-09-28.json) содержит
selected source hashes и SHA256 обычного compiled artifact. Runtime template hash ещё
не deployment pin: immutable значения заполняются конструктором. Реальные pins нужно
независимо сверить после deployment. Calibration renderer теперь учитывает оба base-файла.

## Конфигурация запуска

[План](../config/robinhood-launch-plan.json) — намеренно НЕ исполняемый deployment config.
`node scripts/public-launch-plan.cjs` перечисляет незаполненное и всегда оставляет
executable/publicLaunchReady=false. Не заполнять его адресами локального fork.

Уже зафиксированы chain4663, Infinity creator fee300bps, USDG6 decimals, entry100USDG,
Next target100USDG, интервалы6h/30days, FINALIZED_CHECKPOINT. USDG address/runtime hash
перечитан на реальной сети. Token/pool/source/наши contracts/roles пока null.
Timing1800/30/5/1200/15 — только кандидат. Creator allocation90/5/5 принято. Параметры корзины,
notice, gas caps, archiveRPC, durable runtime и refill явно перечислены как unresolved.

Deployment admission для public scope дополнительно проверяет chain4663,
FINALIZED_CHECKPOINT и оба CONTROLLER_PROFILE. Он по-прежнему возвращает blocked с
publicExecutionNotImplemented, даже при совпадении всех bindings. Это не разрешение
снять31337/loopback guard у существующих workers.

## Реальные RPC-чтения

`node scripts/public-rpc-check.cjs NEW_OUTPUT.json` — только read-only. Можно задать
RH_RPC_URL; endpointOrigin сохраняется без пути с API key. Проба читает code, decimals,
totalSupply, storage на finalized и двух более старых высотах, сверяет hashes повторно.
Нет fallback к latest при отсутствии history. Это sampled capability check, не SLA.

28.09 наблюдали:

- [Official RPC](../research/public-deployment/rpc-official-2026-09-28.json): историческое
  состояние недоступно даже на sampled finalized height.
- [Blockreq public](../research/public-deployment/rpc-blockreq-2026-09-28.json): finalized
  и finalized−10000 успешно; finalized−864000 отклонён лимитом recent32768blocks.
  Разные totalSupply на двух высотах подтверждают чтение меняющегося исторического состояния,
  а не только constant decimals. Это ещё не чтение наших будущих cutoffHashes.

[Официальная документация](https://docs.robinhood.com/chain/connecting/) рекомендует archive
endpoint для history/indexing; публичные endpoints rate-limited и не рекомендуются для
production. Для постоянного replay/recovery нужен проверенный archive provider.

## Частичный fork

`node scripts/public-controller-fork.cjs NEW_OUTPUT.json`, read-only upstream proxy,
локальный in-process Hardhat4663. [Evidence](../research/public-deployment/controller-fork-2026-09-28.json).

Развёрнут обычный bytecode public controllers + real DrandRandomAdapter + dual vault;
проверены bindings и существующий USDG, записаны оба checkpoint, проверено старение>256.
Gas checkpoint49254/49244 — измерение локального EDR с shim, НЕ цена на Nitro.
Reserved=0, оба интервала после настоящего constructor timestamp ещё не истекли.

Ограничения: EDR не исполняет ArbSys как Nitro, поэтому установлен явный test shim
только на адресе precompile0x64. Project TOKEN синтетический; реальный PAIR launch/BUY
этим скриптом не проверялся. Source/constructor timestamps не переписывались, timestamp
override не вызывался; mining после checkpoint стандартный локальный. Не делали вид,
что новый Monthly можно честно закончить за минуты: полного live drand/monthly/finality
прогона здесь нет. Никаких публичных транзакций или пользовательских ключей.

## Адресные тесты

18 продуктовых сценариев отдельными запусками +1 проверка каталога, не full baseline:

- `test/public-controllers.test.cjs`:5 сценариев прошли отдельными запусками. Оба draw
  завершаются с реальной сохранённой BLS signature; synthetic participants, историческая
  local genesis и продвижение test time, не live network. Checkpoint requirement,
  publisher guard, пустые epochs, non-drand/binding/interval отказ, explicit minimumUnit,
  public deployment inspection остаётся blocked. Первоначальный negative test пытался
  развернуть LocalRandomFixture на4663 и был исправлен на provider без drand ABI.
- `node --test test/public-launch-checks.test.cjs`:4/4 — historical heights/no latest
  fallback, incomplete plan и wrong-network rejection.
- `node --test test/local-controllers.test.cjs test/cutoff-history.test.cjs`:7/7 —
  прежние роли/claims/reentrancy/recovery и Nitro cutoff history после выделения base.
- `node --test --test-name-pattern="deployment profile matches|deployment read failure" test/deployment-admission.test.cjs`:2/2.
- `node --test --test-name-pattern="profile catalog" test/test-launcher.test.cjs`:1/1.

Использовалась одна финальная обычная сборка с SHA-checked reuse. Адресный профиль для
повторного review: `node scripts/test-launcher.cjs --profile public-controllers`.
Этот профиль включает больше соседних admission tests, чем выполненные выше команды.

## Следующий пакет

Подключение публичного runtime к новому поколению: network-aware admission/RPC, один signer
и durable journal, строгий FINALIZED_CHECKPOINT, production source/asset pins. Старые guards
не удалять массовой заменой. Перед включением отправок нужны реальные deployment/roles,
archive RPC, принятые timing/экономические параметры и эксплуатационный native budget.
Полный Short + Monthly + empty/recovery на реальной интеграции остаётся релизным условием.

## Отчёт профиля запуска 28.09

`node scripts/public-launch-plan.cjs` теперь сверяет принятые продуктовые значения
и перечисляет обязательные поля даже при их удалении из JSON. `conflicts` показывает
расхождение с принятыми значениями; `missing` — незаполненные обязательные поля.
Заполненное поле имеет статус `provided-not-verified`: этот инструмент не валидирует
адреса, типы всех настроек, bytecode или подлинность approval и не заменяет admission.
Даже полностью заполненный план всегда имеет executable/publicLaunchReady=false.

| Категория | Уже известно / следующий источник |
|---|---|
| Принятые решения | Infinity3%, 90/5/5, entry100USDG, Next100USDG, Short6h / Monthly30days; сверяются с планом |
| Deployment-derived | TOKEN, pool, source, наши contracts и runtime pins получают из настоящего deployment, не из fork; quote pin нужно перепроверить |
| Owner-choice | Адреса ролей, Short/Monthly rules, weights/minimumUnit/maxBudget, notice, gas caps/native floor; timing принимается после наблюдений |
| Operational-qualification | Archive RPC, durable runtime и refill policy: нужны конфигурация и проверка, не просто непустая строка |
| Независимое evidence | Полный pinned admission, history/repeated BUY replay, timing, сервис/ключи и единый автоматический цикл |

Timing остаётся `candidate-not-qualified` даже при наличии записи approval: отчёт
не устанавливает её подлинность и не подменяет измерения. Отдельные параметры нельзя
молча взять из fixtures. Monthly30days — текущий контрактный интервал, не календарная дата.

Проверки на рабочем дереве поверх2616d17/830bf84: фильтр
`node --test --test-name-pattern="launch plan|launch report|filled planning|archive probe|missing historical" test/public-launch-checks.test.cjs`
—5/5; `node --test test/public-rpc-qualification.test.cjs` —8/8. Это13 адресных
сценариев, не full baseline; Solidity и правила выплат не менялись.
