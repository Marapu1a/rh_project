# Автоматический локальный prize flow

20.09.2026. [Worker](../scripts/local-prize-flow.cjs), [тесты](../test/local-prize-flow.test.cjs).
Только chainId 31337 и loopback CLI. Solidity, доли и математика prize reserves не менялись.
Старые USDG jobs продолжают работать по старому API; для converter используется отдельная schema.

## Порядок прохода

1. Проверить весь job на одном pinned head до первой записи: chain/router/assets,
   current campaign/policy, source position/epoch, converter/vault/adapter и параметры,
   bounded legacy entries с доказательством присутствия в указанной historical policy.
2. Признать direct USDG в перечисленных vaults, sync router, выплатить USDG и TOKEN credits.
   USDG сначала; quote converter доставляется в его immutable vault через forwardQuote.
   TOKEN prize share разрешён converter, а не USDG-only vault. Project recipients получают
   оба policy assets; это их уже выделенная доля, её worker не конвертирует.
3. Один collect при совпадении source epoch; harvest claimable USDG, затем TOKEN.
   Epoch drift запрещает collect, но допускает старые bound-epoch claims.
   Временный transport failure чтения source пропускает остаток collect/harvest
   в текущем pass; операции с уже имеющимися средствами продолжаются (см. ниже).
4. Повторить распределение: свежий USDG доходит до vault прежде swap.
5. Не более одной convert-порции на каждый converter, затем forward полученного USDG.
   При definite forward failure в этом pass не продаём дополнительный TOKEN этого converter.

Каждая tx отдельная: late failure не откатывает прежние успешные операции. USDG не ждёт
успешного swap. Пустой collect по-прежнему может расходовать gas.

## Изоляция source reads, 26.09.2026

Только вызовы `source.epoch()` / `source.claimable(...)` после первого distribute
обёрнуты в обработку `retryableRead` из existing local-rpc-watch. Это транспортные
timeouts/reset/допущенные HTTP ошибки, не общий catch источника. При первой такой
ошибке failures и onStep получают `reason: sourceReadUnavailable`, method/target
и asset для claimable; итоговый нормальный проход имеет status=degraded.
В этом pass не будет дальнейших source reads/collect/harvest, но второй distribute,
ограниченная conversion и forwarding проверенного inventory продолжаются.

Успешные collect или первый harvest до позднего read failure уже подтверждены;
они не откатываются. Следующий pass повторно читает источник, и обычные claimable/
credits не допускают двойной выплаты. Внутреннего retry-loop и принятия новой epoch нет.

CALL_EXCEPTION, BAD_DATA, неверные bindings/policy, deficit и local balance read errors
сохраняют прежнюю остановку. Send/receipt processing и onStep callbacks находятся
вне read catch. Definite send rejection изолируется прежним send helper; unknown send
останавливает worker и coordinator с pending journal. Это не механизм переживания
любой поломки PAIR; при недоступности общего RPC локальное продолжение тоже может упасть.

Coordinator не менялся: degraded prize допускает draw при legacy порядке prize→draw;
с ops порядок draw→prize. Проверка state.pending остаётся раньше дальнейшего запуска.
Итог coordinator=complete означает завершённый pass, не отсутствие ошибок источника:
`results.prize.status=degraded` и failures должны оставаться видимыми в отчёте.

Адресные проверки26.09 (не full):

```powershell
node -e "require('./scripts/test-launcher.cjs').runTests({profile:'source-isolation-targeted',pattern:'source isolation:|flow collects both|broken swap|bounded portions|unknown.*receipt|pending receipt blocks|hashless broadcast|serializes real',selection:{compile:true,files:['test/local-prize-flow.test.cjs','test/local-coordinator.test.cjs']}}).then(r=>process.exitCode=r.exitCode)"
node --test --test-name-pattern="source isolation: deficit" test/local-prize-flow.test.cjs
```

Первый адресный прогон:26pass/1fail, 285.63s с одной compilation20.66s;
failure был в подготовке нового deficit-теста: MockToken по умолчанию блокирует
zero recipient и не позволял fixture burn. Подготовка исправлена без изменения
worker; отдельно deficit1/1, 23.69s включая compilation. Все27 выбранных сценариев
имеют успешный результат, но единого повторного зелёного прогона27/27 не заявляем.
Уже прошедшие проверки не повторялись. Логи `.local/logs/source-isolation-tests.log`,
`.local/logs/source-isolation-deficit.log`, report `test-run-cTA7fj/result.json`.

Покрыты epoch/обе claimable transport failures и последующий recovery без двойной
выплаты; late read после confirmed collect/harvest; CALL_EXCEPTION/BAD_DATA и
observer errors; deficit/policy/local balance stops; source epoch drift; оба порядка
coordinator; unknown collect/harvest и соседние convert/forward receipt сценарии.
Solidity, job schema, chain gates и transaction journal не менялись; fork/live не запускались.

## Job / запуск

```js
{
  schema: 'local-prize-flow-v1', chainId: '31337',
  router, token, quote, campaignId: '1',
  recipients: [converter, zeroAddress, project], bps: [8000, 0, 2000], // TEST ONLY
  active: {
    kind: 'converter', address: converter, vault, adapter,
    floorNumerator: '2', floorDenominator: '1', // TEST raw-unit floor, NOT a market price
    maxInput: '1000', maxHorizon: '300', swapLimit: '1000', deadlineSeconds: '120'
  },
  legacy: [],
  source: {vault: pairVault, positionId: '123', epoch: '1'},
  distribution: 'GENERAL', pollSeconds: 300, maxGasPrice: '1000000000000'
}
```

Это схема с символическими адресами, не deploy-ready JSON. Доли и raw-unit параметры
примера не являются production экономикой. Job должен содержать параметры именно своего
converter; изменением JSON нельзя ослабить on-chain floor или переназначить vault.

`npm run local:prize -- --job .local/prize-flow.json --rpc http://127.0.0.1:8545 --executor 1 --watch`

Watch ждёт pollSeconds после pass (включая yielded/degraded). При error выходит с кодом 1.
Последняя строка JSON — prizeFlowPass: status, failures, unsafeDebt, steps, при завершении
remainingInventory. Unknown error включает action/target/asset/recipient где известны,
message/code/stage/transactionHash. Нет автоматического retry неизвестного intent.

## Legacy recipients

Максимум восемь entries; active обрабатывается первым, затем текущие project recipients,
затем legacy. История не сканируется без границ. Каждый legacy содержит address,
campaignId < current и slot; router.policy должен подтверждать этот адрес.

- `converter`: historical slot 0, остальные поля как active; pay TOKEN/USDG, forward,
  одна optional conversion при наличии TOKEN.
- `usdgVault`: historical slot 0; pay только USDG и syncUSDG. TOKEN credit остаётся
  unpaid и включается в unsafeDebt с суммой и причиной.
- `project`: historical slot 1/2 с положительной долей; pay обоих активов.

Повторяющиеся адреса, legacy текущего recipient и несовместимые role/slot отвергаются.
Сохранившемуся current recipient старые долги платятся по общему credit, без отдельной
legacy записи. Один адрес не получает выдуманный campaign-specific P&L.

Список legacy задаётся конфигурацией: worker обслуживает перечисленное, но НЕ доказывает
полноту истории старых получателей. Неуказанный долг не исчезает и не обслуживается сам.
Проверка bindings/getters — не bytecode attestation. Job и классификация получателей
доверенные; до production нужен deployment manifest и проверка реальных implementations.

**Unsafe report не является on-chain карантином.** Другой caller всё ещё способен вызвать
публичный FeeRouter.pay(TOKEN, oldVault). Worker лишь не совершает этот опасный платёж сам.
Уже застрявшие TOKEN не возвращаются. Новый deployment обязан сразу использовать converter.

## Отказы и пределы

Общий private skip на весь pass: action/target/asset, для pay также recipient. Definite
отказ отдельного pay/forward/swap/collect/harvest не блокирует независимую работу; повтор
адресу/операции — в следующем pass. Ошибка router accounting/sync или неверные bindings
останавливают pass. Для unknown исхода send/receipt нет catch-and-continue.

Перед каждой tx: gas cap, pending nonce, сохранность anchor hash, current campaign, signal.
Это preflight, не finality и не блокировка policy от изменения до inclusion.
Слишком дорогой gas, pending tx, отсутствующий signer дают waiting; abort — stopped.

Default maxSteps=128 (считает попытки tx, включая estimation reverts), hard maximum=256.
При достижении — yielded, без следующей записи. Малые maxSteps предназначены для тестов:
нет persistent phase cursor, поэтому слишком маленький лимит в повторных pass может
постоянно обрывать работу до swap. CLI использует default; лимит не вынесен в job/watch.
Конечный список и один swap/адрес ограничивают штатный проход без бесконечного drain-loop.
Оставшийся TOKEN после одной порции даёт yielded; failures или unsafe debt дают degraded.

SwapLimit — лимит нашего pass, а maxInput — одной tx. Это не on-chain rate limit: публичный
caller может делать другие convert вызовы. Fixed local floor не имеет рыночной freshness.
Real DEX/price policy, MEV, journal/supervisor, ops refill и finality не реализованы.

## Проверка

Новый набор: 11/11 (~74 s), включая полный CLI pass. Есть conservation/repeat, broken
swap и forward, old converter rollover, unsafe legacy vault debt, два неисправных legacy
recipients, реальные pending forward/convert и их однократное продолжение после mining,
preflight mismatch, step/portion/gas/abort и source epoch drift. MockPairVault revenue
вносится явно, а не рассчитывается из реальных AMM swap fees.

Команда: `node --test test/local-prize-flow.test.cjs`.
Лог: `.local/logs/local-prize-flow-tests.log` (ignored).

## Итог проверок текущего шага

- Новый prize-flow набор: **11/11**, ~74 s.
- `node --test --test-concurrency=1 test/local-usdg-funding.test.cjs test/local-prize-converter.test.cjs test/local-transaction.test.cjs test/local-buy-cycle.test.cjs`: **35/35**, ~228 s.
- Итого **46** уникальных проверок; основной набор теперь **232**, полного запуска 232 не было.

Регрессионный BUY-cycle продолжает проверять прежний USDG профиль; новый converter flow
проверен отдельным source→collect→harvest→pay→convert→forward тестом и реальным CLI,
а не выдан за уже встроенный в BUY fixture профиль. Contract converter tests дополнительно
проверяют сохранность frozen reserve. Реальный PAIR/DEX не использовался.
Логи (ignored): `.local/logs/local-prize-flow-tests.log`, `.local/logs/local-prize-flow-regressions.log`.

## Коррекция error attribution и лимита, 20.09

После confirmed receipt и после обработанного definite rejection контекст текущего
send очищается ДО callback onStep. Ошибка следующего read/callback больше не получает
action/hash завершённой tx. Для истории результата есть отдельный lastConfirmed;
error.transactionHash берётся только из самой текущей ошибки, без fallback.
Unknown send/receipt сохраняет собственные stage/hash и по-прежнему останавливает writes.

MAX_LEGACY=8 и DEFAULT_MAX_STEPS=128 вынесены рядом с control-flow bound:
2 × (9 vault sync + 2 router sync + 2 × 11 pay + 2 × 9 converter forward)
+ 3 source operations + 2 × 9 swap/forward = 123 попытки.
Все условные ветки берутся сверху; замена converter на usdgVault уменьшает bound.
Assertion запрещает default ниже формулы; при изменении структуры фаз формулу нужно
обновлять. Это не автоматический анализ программы. Дополнительный integration test
обслуживает восемь старых converter, новый converter и двух current project recipients.

## Проверки исправления, 20.09.2026

`node --test --test-concurrency=1 test/local-prize-flow.test.cjs test/local-scheduler.test.cjs test/local-executor-stability.test.cjs test/local-transaction.test.cjs test/local-buy-cycle.test.cjs`
— **42/42**, fail 0, ~380 s. Добавлены 8 регрессий/интеграций; основной набор теперь
**240**, полный запуск 240 не выполнялся. Лог `.local/logs/error-boundary-fixes.log` ignored.

Проверены stale read/callback context после success и definite rejection; максимальный
legacy list; unknown Short broadcast/receipt, unknown Monthly broadcast без следующего
Short tick, definite estimate rejection с продолжением Monthly; restart только после
подтверждения исходной pending tx. Прежние reorg/empty/funding/state/cutoff/abort/timeout
и BUY-cycle также прошли. Денежная математика и Solidity не менялись.
