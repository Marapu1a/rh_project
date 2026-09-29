# Deployment profile и допуск нового розыгрыша

29.09: текущая версия — [операционный профиль V2](OPERATIONAL_LAUNCH_PROFILE.md).
Он добавляет явные genesis/roles/notice/gas/BUY expectations; normal checks получают ops.
V1 продолжает локальные репетиции, но помечен legacy-incomplete. Публичные controllers
и4663 runtime уже существуют, public sends остаются закрыты. Ниже исходное описание
базовых pins/timing, дополненное этим V2; совпадение не является release authorization.

28.09.2026. Проверяемый профиль конкретного deployment, без новых контрактных прав,
без деплоя и без разрешения публичной сети. `scripts/deployment-admission.cjs`.

## Граница пакета

Профиль связывает funding/delivery/scheduler config с chainId, ожидаемым executor,
адресами и runtime hashes девяти компонентов, USDG decimals и точными immutable timing.
Pins берутся из уже подготовленной конфигурации; sourceCodeHash и все timing значения
задаются явно. Экспорт не запрашивает RPC и не «принимает» автоматически текущий код.
Оператор отвечает за происхождение ожидаемых pins; checksum/configHash не заменяет аудит.

`inspectDeployment(provider, profile, config)` читает один latest blockTag, проверяет
code и обратные связи vault/controllers/adapter/collector/assets/registry, instance IDs,
publisher, drand PROFILE/CHAIN_HASH, интервалы и cutoff delay, активную campaign policy,
source binding/fingerprint и deployment anchors. В конце перепроверяет hash наблюдавшегося
блока. RPC failure/отсутствующий код/reorg/несовпадение → blocked, не положительный допуск.
Это snapshot-наблюдение, не защита от изменения сети или внешнего проекта после чтения.

Внешняя mutable политика PAIR по-прежнему проверяется funding worker/collector при pull;
этот профиль не объявляет её неизменяемой. Он также не проверяет ликвидность, экономическую
целесообразность комиссий, честность входных pins. Операционные роли дополнительно проверяются V2.

Два scope:

- `local-rehearsal`: matched допускается только для chain31337 и совпавших проверок.
- `public-launch`: всегда содержит блокер publicExecutionNotImplemented. Public controllers и отдельный4663 runtime подготовлены, но публичные sends закрыты. Замена chainId/scope не открывает публичный запуск.

В обоих случаях publicLaunchReady=false, authorizationToFreeze=false. Отдельный успешный
отчёт нельзя сохранить как вечное разрешение на freeze.

## Подключение к общему executor

CONFIG может содержать `deploymentProfile`. Он входит в immutable runtime identity.
Перед созданием новых jobs и отправками begin/beginMonth/seal/sealMonth executor читает
профиль заново. Несовпадение сохраняется в lastDeploymentAdmission и откладывает действие.
Так неправильный профиль не начинает новую публикацию прежде, чем обнаружит несоответствие.

Непосредственно перед фиксацией intent/send freeze, после проверки профиля и gas estimate,
повторяется существующий drandPreflight; результат записывается в lastTimingAdmission.
При сомнительном времени — deploymentTiming wait, без нового request или reroll.
Уже frozen draws, delivery/settlement и старые claims не требуют нового profile/freshness
допуска. Неверный ожидаемый lead не мешает выплатить уже подтверждённый выигрыш.

Старые **локальные** конфигурации без профиля сохраняют прежнее поведение; это явно legacy
режим для существующих tests/fork, не альтернативный путь в public. Подключать профиль к
существующему journal следует через handoff после завершения jobs. Handoff не разрешает
удалить уже подключённый профиль; successor profile должен совпасть с цепью.

## Временные параметры

Все значения — десятичные строки секунд, кроме cutoffDelayBlocks:
leadSeconds, maxClockLag, maxClockAhead, maxFinalizedLag, maxBeaconLag,
shortInterval, monthlyInterval, cutoffDelayBlocks.

Проверяется согласованность конструктора drand: lead > clockLag + clockAhead + finalizedLag,
lead <=30дней; положительные lag-пределы. Это арифметическая совместимость, не SLA.
Продуктовые интервалы закреплены в проверке: Short21600s, Monthly2592000s; cutoff1–256blocks.
Конкретный lead/пределы production в этом пакете **не выбраны и не утверждены**. Значения
3600/30/5/1800/15 в tests — historical fixture, значения60/30/5/20/15 старого fork — тоже fixture.
Не переносить их автоматически в release settings.

Для публичного профиля нужны наблюдения выбранной сети/RPC и согласованные параметры
публичного поколения contracts. Использовать `rng-timing-observe.cjs` как read-only
наблюдение, не как доказательство предельной будущей задержки. Часы сервера, finalized от
RPC и доступность drand — принятая операционная граница; on-chain финальности она не даёт.

## CLI без ключей и отправок

`node scripts/inspect-deployment.cjs export --config CONFIG.json --settings SETTINGS.json --out PROFILE.json`

SETTINGS: scope, executor, sourceCodeHash и timing (все поля выше). CONFIG содержит
fundingJob/deliveryJob/schedulerConfig. Export не перезаписывает существующий файл.
Поместить результат в поле deploymentProfile нового CONFIG.

`node scripts/inspect-deployment.cjs inspect --config CONFIG.json --rpc HTTP_RPC`

Read-only HTTP(S), signer не создаётся. Exit0 — matched local, exit2 — blocked,
exit1 — невалидный input/ошибка CLI. Проверка публичного endpoint не включает возможность
исполнения транзакций общим worker.

## Проверки

28.09:8 разных адресных сценариев проверены отдельными запусками, не единый full run.
Контракты/призовая математика не менялись. Использован SHA256-checked ordinary artifact
`.local/logs/test-run-hk3ElO/compiled.json` (Solidity с предыдущего пакета не менялся).

- `node --test --test-reporter=tap test/deployment-admission.test.cjs` — первые3/3,27.30s;
  лог `.local/logs/deployment-admission-tests.log`.
- Фильтр `fresh scheduler|profiled freeze|preserves settlement` —3/3,51.97s; лог
  `deployment-admission-integration.log`, повтор сохранения claim после добавления pre-job gate.
- Фильтр `retained through|missing code` — handoff/CLI passed; missing-code fixture потребовал
  bind методов ethers provider (иначе Proxy ломал private receiver до целевого RPC).
  Лог `deployment-admission-extra.log` (1passed/1fixture failure).
- После исправления fixture фильтр `missing code|read failure` —2/2,6.79s; лог
  `deployment-admission-rpc.log`, теперь проверяются именно целевые RPC/missing code/reorg.
- Фильтр `Monthly freeze` —1/1,16.76s; лог `deployment-admission-monthly.log`.

Для воспроизведения профиля: `npm run test:group -- --profile deployment-admission`.
Он входит также в accounting/promo-automation/full. Полный suite и новый live fork не
запускались. В тестах перед freeze подменяется только operational preflight для historical
clock; это не доказательство production finality или выбранных lead/lag значений.

## 28.09: публичное поколение

[Robinhood wrappers](PUBLIC_CONTROLLERS.md) добавлены. Read-only public inspection
требует chain4663, FINALIZED_CHECKPOINT и оба CONTROLLER_PROFILE поверх runtime pins.
`publicExecutionNotImplemented` сохранён: совпадение bindings не разрешает public worker.
Incomplete launch plan не заменяет полный deployment profile с адресами и approved settings.

## Approved creator allocation28.09

Для public-launch full admission независимо сверяет config и chain с9000/500/500bps.
Согласованная ошибка в fundingJob и policy теперь даёт approvedCreatorAllocation.
Проверка не помещена в структурный validateDeploymentProfile: старые receipt,
frozen draws и claims продолжаются через существующий obligations-only путь.
Математика collector и local31337 profiles не менялись. Для будущего изменения
принятых долей нужно явное продуктовое решение и соответствующее изменение guard;
одного редактирования runtime config недостаточно. Это worker admission, не изменение
полномочий owner контракта. Public execution gate остаётся закрытым.
