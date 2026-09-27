# Drand adapter и операционная проверка перед freeze

27.09.2026. Владелец явно принял для MVP: один проверенный результат без повторного
выбора; worker откладывает новый draw при сомнительных свежести или состоянии сети.
**Операционная проверка не является контрактной гарантией финальности.**

## Завершённый пакет

`contracts/DrandRandomAdapter.sol` реализует существующий asynchronous transport.
Контроллеры всё ещё local31337; публичный deployment этим пакетом не разрешён.
Adapter не содержит owner/proxy/seed setter/reset/withdraw/cancel/замену provider.
Разрешены ровно два immutable consumer: Short и Monthly. Предсказанные адреса можно
закрепить до их deployment; request дополнительно требует code по адресу consumer.

Конструктор закрепляет lead и операционные пределы clock/finality/beacon age.
В тестах lead3600s, clock lag30s/ahead5s, finalized lag1800s, beacon lag15s.
Это **тестовый кандидат параметров, не утверждённые production значения/SLA**.
Lead должен превышать сумму clock lag, clock ahead и finalized lag; это проверка
согласованности настроек, не доказательство будущего поведения сети.

- `request(context)` вызывается атомарно из seal и фиксирует consumer/context/round.
  Round строго позже block.timestamp+lead. Context повторно не принимается от того
  же consumer; callback внутри request отсутствует. Вызов и freeze откатываются вместе.
- `verify(round, signature)` проверяет настоящую evmnet BN254 BLS подпись.
  Chain hash/public key/DST постоянны. Нового источника случайности при сбое нет.
- `prove(id, signature)` разрешён любому отправителю; проверяет точный round,
  записывает seed с domain separation chainId/adapter/id/consumer/context.
  Повтор того же proof не меняет seed; повреждённый proof не проходит даже после кеша.
- `deliver(id)` вызывает фиксированный consumer.fulfill. Revert callback сохраняет
  proven seed и позволяет повторить доставку. Успешный повтор — no-op. ReentrancyGuard
  закрывает вложенную доставку. Флаги proven/delivered отдельны от значения seed.

Оплата request=0. Это **не бесплатный RNG**: executor оплачивает gas prove и deliver.
Prize USDG adapter не принимает и не расходует. Автоматический delivery worker,
его journal/gas budget и связка с общим coordinator — следующий пакет.

## Worker перед новым freeze

`drand-preflight.cjs` включён в Short/Monthly executor перед seal/sealMonth:
читает закреплённые параметры, latest/finalized headers, evmnet latest и проверяет
его подпись через настоящий adapter.verify. Перепроверяет прочитанные block hashes.
`drand-timing-readiness.cjs` выявляет устаревшие/опережающие часы, lag finalized,
устаревший beacon, уже известный target и недостаточный наблюдаемый запас.
Отказ/неполные наблюдения → wait, без нового freeze. Существующим запросам эта
проверка не меняет target и не запрещает позднюю доставку/settlement.

Источник времени — часы сервера; finalized утверждает RPC. Один официальный drand
HTTP endpoint сейчас влияет на доступность новых freezes; подделка подписи не проходит.
Сеть может ухудшиться после проверки/пока tx ожидает inclusion. Прямой вызов
permissionless seal обходит worker. Нельзя рекламировать это как on-chain enforcement.
Бюджет доставки и наличие работающего исполнителя не следуют из ready()=true.
Legacy LocalRandomFixture остаётся для прежних tests; отсутствие PROFILE допускает
старый local путь, не является production admission неизвестного RNG.

## Почему не просто готовый OpenVRF

Проверен upstream HEAD `9fb960cfc4d41e38f9d3057bf547e0d9cdcd4cc2`:
[OpenVRF.sol](https://github.com/Robinhood-OSS/OpenVRF/blob/9fb960cfc4d41e38f9d3057bf547e0d9cdcd4cc2/src/OpenVRF.sol).
Там MIN_DELAY2s, то есть target через2–4s, и прямо указаны свежие timestamps/stable
sequencer ordering вместо L1 finality. Он не закрывает наш timing вопрос. Исходники
router не заимствованы; зависимость не добавлена. [SECURITY](https://github.com/Robinhood-OSS/OpenVRF/blob/9fb960cfc4d41e38f9d3057bf547e0d9cdcd4cc2/SECURITY.md)
указывает beta/отсутствие независимого production audit.

Использована уже проверенная в проекте MIT BLS библиотека kevincharm/bls-bn254 на
commit9f70fb4dff2cd0921dc2144929dc0aff6f21a9b9, без изменений исходников.
[Source pins и лицензия](../contracts/vendor/drand/sources.json). Теперь библиотека
включена в обычную Solidity compilation; криптоаудит этим не заменён.
Evmnet параметры: [drand documentation](https://docs.drand.love/developer/).

## Проверки

- Adapter+timing:6/6 (`test-run-3BC089`,22.66s с compile), реальный historical round9337227.
  Runtime10957bytes; local prove214696gas, deliver86794gas. Это измерение fixture,
  не цена сети, не полный бюджет draw и не гарантия callback gas другим consumers.
- Новый preflight:1/1, затем расширен healthy/stale/offline/invalid proof и снова1/1.
- Интеграция Short+Monthly:1/1 после исправления двух тестовых допущений — запрещённой
  вероятности100% и вызова begin до разрешённого расписания. Оба запроса закрепляют
  один historical round в одном блоке, но seed различается по domain.
- Real proof → оба settlement → claim USDG → повторный claim запрещён: доказано локально.
  Synthetic participants/weights, MockToken как USDG; не Infinity BUY/fork.
- Отдельный no-win:1/1, оба цикла закрыты, claimable0, деньги остались в free reserves.
- Соседний штатный scheduler:1/1, два BUY cycles и restart прошли с прежним fixture RNG.

Команды и logs:
`node --test test/drand-timing-readiness.test.cjs`;
`node -e "require('./scripts/test-launcher.cjs').runTests({profile:'drand-adapter',selection:{compile:true,files:['test/drand-adapter.test.cjs','test/drand-timing-readiness.test.cjs']}}).then(r=>process.exitCode=r.exitCode)"`.
Дополнения запускались с --test-name-pattern и reuse SHA-проверенного compiled artifact;
`.local/logs/rng/{controller-fixed,no-win,preflight-final,controller-workers}.log`.
Это раздельные адресные результаты, не общий full baseline. Full/fork не повторялись.

[Read-only observation](../research/drand-adapter/timing-2026-09-27.json): latest lag
~0.7s, finalized ~1147s, beacon ~1.7s относительно локальных часов при завершении
опроса. Safe tag на выбранном public endpoint недоступен. Не SLA, не bound будущей
финальности; beacon этого HTTP наблюдения отдельно не проверялся криптографически.
`node scripts/rng-timing-observe.cjs NEW_FILE.json` повторяет наблюдение без подписания.

## Следующий пакет

Автоматический prove/deliver worker: exact-round HTTP fetch + local verify до gas,
existing journal/unknown-send reconciliation, own gas budget, retry того же request.
Затем совместить Infinity funding/BUY и этот RNG в одном сквозном прогоне.
Production timestamps/finality settings, keys, source admission и readiness полного
бюджета исполнения остаются launch blockers. Кворум drand может не выпустить round;
никто не получает права выбрать другой результат из-за ожидания.
