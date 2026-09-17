# Monthly: версии правил допуска

Принято 17.09.2026. Меняются только параметры существующего алгоритма допуска q.
Monthly interval и notice задаются при deployment и не имеют setter. Казна, Next
target, один jackpot winner/no-win и правила claim не меняются.

## Переход

1. Авторизованный policy publisher объявляет полный payload следующей версии.
   Payload неизменяем; одновременно разрешено одно объявление, без замены/cancel.
2. После notice любой исполнитель может активировать версию, если нет подготовки
   или pending Monthly и наступил срок по фиксированному monthly interval.
3. Activation в блоке B оставляет все minted attempts до B включительно старой
   версии. С B+1 mint относится новой. Carry не сбрасывается, версия определяется
   моментом mint, а не покупками, из которых собрался carry.
4. Старый набор становится draining. Пока он существует, третью версию объявлять
   нельзя. Новые попытки копятся отдельно; следующий draw обслуживает только старый.
5. Snapshot имеет свежий cutoff C >= B+1, но участники draining ограничены mint до B.
   Поэтому задержка более 256 блоков не делает старый набор необслуживаемым.
6. Каждый draw связывает rulesEpoch и policy hash уже при begin; изменение текущей
   версии не подменяет опубликованные правила. Processing читает policy этого draw.
7. Terminal win/no-win атомарно закрывает старую версию, расходует только её attempts
   и обновляет monthly clock. Следующий draw ждёт обычный фиксированный interval.
8. Если старый набор пуст, авторизованный publisher публикует empty assertion с
   cutoff/snapshotHash. Replay проверяет, что старых OPEN действительно нет.
   Закрытие не движет деньги, не расходует attempts и НЕ обновляет monthly clock.
   Новая версия может стартовать сразу, если прежний срок наступил и выполнена готовность.

Short epochs независимы. Announcement допустим во время обычного draw, activation
нет. Активация не резервирует деньги и не гарантирует доставку RNG. Production
wrapper должен добавить readiness/finality policy; отсутствие таких гарантий
не скрывается за локальной проверкой schedule. Empty assertion, как и dataset,
не является on-chain доказательством BUY history и требует независимого replay.

Epoch относится к попыткам и q, а не к отдельному денежному резерву. Старый boundary
draw по прежней бухгалтерии замораживает весь Current на момент seal, включая поздние
пополнения. Новые attempts не участвуют в нём; отдельного бюджета новой epoch нет.

## Минимальный API

Внутренние `_announceMonthlyRules(rules)`, `_activateMonthlyRules()`,
`_closeEmptyMonthlyEpoch(cutoff, cutoffHash, snapshotHash)`. Публичный внутренний
компонент не открывает setter: authorization добавляют wrappers. Fixture publisher
только тестовый; в research wrapper announcement относится owner, empty — publisher,
activation permissionless. Нет возможности изменить interval или чужой draw.

`Input.rulesEpoch` обязателен. `monthlyEpochPolicy(epoch)` возвращает outcome/hash/
firstBlock; current/draining/announced и eligibleAt видимы публично. Genesis хранится
отдельно от изменяемого current. Immutable monthlyRulesHash означает genesis hash.

Replay v4 добавляет независимый Monthly byEpoch, политику genesis и rulesEpoch в
monthly snapshot. V1/V2/V3 не переинтерпретируются. Полная идентичность draw —
(chainId, vault/instance, drawId), а не глобально уникальный bytes32.

## Артефакты и локальная проверка

Конструктор компонента теперь принимает `(vault, registry, instance, interval, notice, rules)`;
в `Input` добавлен `uint64 rulesEpoch`. Новый ABI требует нового deployment, не upgrade.
Monthly random context использует `MONTHLY_DATASET_CONTEXT_V2`, включая Input с epoch,
неизменяемый hash этой policy и реальный frozen budget. Result tag остаётся V1: его
context уже связывает новую схему и конкретный deployment.

Lifecycle v4 сохраняет поля v3 и добавляет в config `monthlyRules: {noticeSeconds,
firstBlock}`. Genesis rulesHash/startedAt/interval по-прежнему находятся в
`monthlyPolicy`. Domain содержит `monthlyRulesGenesisHash`; RPC сверяет его с
`monthlyEpochPolicy(1)`, immutable notice/interval/startedAt. После activation genesis
не подменяется текущей policy. Monthly events из нового controller не принимаются
как v3 epochs; для versionable deployment нужно публиковать v4 manifest.

`scripts/monthly-dataset.cjs` строит только правильный target epoch из raw BUY/lifecycle
history, либо отдельный empty artifact. При сверке публикации проверяются bindings,
genesis, request, epoch policy, все опубликованные chunks из calldata, root/count/
attempts и после seal — context. READY ещё не имеет frozen budget/context. Сверка
publication сама по себе не доказывает BUY history: для этого CLI сначала выполняет replay.

```powershell
npm run test:monthly:epochs
npm run verify:monthly:dataset -- --input input.json --output artifact.json
npm run verify:monthly:dataset -- --input input.json --output artifact.json --rpc RPC_URL --publication yes
node scripts/dual-controller-check.cjs
```

Input JSON: `{manifest, lifecycle, request, rules, blocks?}`. Request содержит
`drawId, campaign, rulesEpoch, cutoff, cutoffHash`; derived root/count/attempts/snapshotHash
рассчитывает builder. При RPC блоки читаются заново, offline evidence явно помечается
неподтверждённым. Для empty output содержит `nextAction: closeEmpty(...)`; никаких
транзакций CLI не отправляет. Сетевая finality и случайность seed не сертифицируются.

История policy хранится для аудита и растёт с обновлениями; ограничение «две версии»
относится к одновременно обслуживаемым наборам, а не к удалению старых записей.

## Проверки перед завершением этапа

Notice, authorization, неизменность объявленного payload, B/B+1, запрет activation
при preparation/pending, old-first, отсутствие третьей живой версии, свежий cutoff
после 256 блоков, закрепление q за draw, atomic failure/retry, old credits, win/no-win,
empty без переноса clock, ложный empty в replay, carry, conservation byEpoch,
независимость Short, reorg и повторный size/deployment gate.

Результат: полный `npm test` 164/164; после расширения CLI-теста отдельно replay/CLI
6/6 и после усиления проверки Short genesis отдельно RPC publication 1/1. Размеры
research wrappers: Short 21 988, Monthly 17 064, vault 8 496 байт; стандартный локальный
deployment без viaIR прошёл. Public chain deployment/fork не выполнялся.
