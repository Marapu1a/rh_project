# Pons: локальный сбор комиссий и ручное исполнение

01.10.2026. [LocalPonsCollector](../contracts/LocalPonsCollector.sol) — прототип,
не контракт для публичного deployment. PAIR-код и его runtime config не изменены.

## Этот шаг

Реализованы независимые curve/hook sweep, escrow claim, накопительные credits90/5/5,
перевод PromoVault и syncUSDG. Адресные тесты используют fixture escrow/venue;
отдельный fork использует настоящий runtime Pons и реальный PromoVault из проекта.
Dual-controller draws, BUY indexer и билеты этим пакетом не проверены.

Constructor фиксирует predicted TOKEN, USDG и escrow. Owner один раз связывает
PromoVault с совпадающими TOKEN/USDG. pull читает balanceOfToken, вызывает claimToken,
требует полный фактический прирост USDG и нулевой оставшийся due. Return claimToken
не используется. Пустое получение безопасно, TOKEN не признаётся доходом.

Escrow codehash закреплён и проверяется при pull. Это обнаружение замены runtime,
не доказательство исходников, proxy implementation или честности getters. Полное
deployment admission, quote/proxy graph и real source verification ещё отсутствуют.

sync и pay не обращаются к escrow: уже полученные деньги можно учесть и выплатить,
даже когда escrow недоступен/изменился. Неудачный pay откатывает списание credit.
Политика фиксирует9000/500/500bps; накопительное округление как у InfinityCollector,
пыль кампании поступает призам при rollover. Owner может назначать ops/team следующей
кампании, PromoVault закреплён. Rollover учитывает только уже полученные USDG и не
требует claim: задержанный доход относится к кампании фактического получения.
Неполученный escrow credit не распределяется задним числом и не входит в GENERAL.

## Поле для последующего расширения

После bindPromo owner однократно вызывает bindVenue(factory). Проверяются factory
record, TOKEN/USDG/recipient300bps/buyback off, curve getters и hook factory/escrow.
poolId вычисляется из валют, fee, tickSpacing и hook. Runtime hashes factory/curve/hook
закреплены; при каждом sweep проверки повторяются, включая hook pool registration
после graduation. Изменение recipient/source блокирует sweep, не старый escrow claim.
Это identity/runtime guard, не доказательство всех deployment sources/proxy graphs.

sweepCurve разрешён только phase0; sweepPool только phase2 без pending TOKEN fees/tax
и quote buyback. Phase1 означает незавершённую graduation. sweepState возвращает
phase/waiting/gross quote fees. Gross fees не равны creator revenue и не бюджету призов.
Если curve требует внутренний buyback по оставшемуся bucket, simulation/реальный
вызов отклонятся: собственной конвертации и обхода permissions нет.

Ни один sweep не вызывает pull/pay. Отказ sweep, source drift или ожидание оператора
не скрывают независимые доступные действия. recipient migration, generic execute,
proxy или смена escrow не добавлены; прототип ещё не прошёл production admission.

Ручной исполнитель и scheduler будут вызывать одни методы; больше информации о
Pons меняет их проверки/расписание и разрешённые маршруты, не prize math. Не обещаем
обновление immutable deployment без новой версии. Возможность будущей смены получателя
требует отдельного дизайна сохранения старых credits; generic admin execute/proxy
в этом шаге не добавлялись.

## Проверки

01.10: `node scripts/test-launcher.cjs --profile pons-collector` —7/7 PASS,
fullSuite=false, одна компиляция. Binding/посторонний caller/неверный vault,
claim/повторные pull/pay/реальный GENERAL, частичный и blocked claim, failed payout,
накопительное округление, rollover при недоступном escrow, code drift и старые credits.
Дополнительно: venue bind/неверный quote/recipient, wrong phase, curve/pool sweeps,
manual plan с отказом sweep и доступным claim. Отчёт `.local/logs/pons-sweep-tests.txt`.

`node scripts/pons-collector-fork.cjs .local/logs/pons-collector-fork-20261001.json`
— COLLECTOR_MANUAL_FORK_PASSED,27шагов, anchor77216884,
hash0xc855c6e73a7c4111f0296f56ca37e07b96471347e67f17cd1bd7530a6c069c1f.
Launch с predicted collector/token → buy101/sell → curve sweep → manual claim/pay;
graduation с permissionless retry → v4 sell/quote-only sweep → v4 buy/pending TOKEN →
waiting operator при успешном manual claim/pay старого escrow → локально имитированный
operator conversion → claim/pay. Итог PromoVault289.338015USDG равен сумме GENERAL
reserves. Full suite не запускался. Не mainnet sends и не проверка SLA оператора.

Тестовые допущения: in-process Hardhat4663, synthetic20000USDG и ETH, impersonation
owner/operator; threshold minOut0 и широкий price limit test-router, conversion minOut1.
Они не допускаются в публичном runner. В PromoVault controller=hook только как
контрактный адрес для конструктора; draws не выполняются. On-chain funding budget
для реального запуска из этой репетиции не выводить.

## Ручной runner

[pons-collector-manual.cjs](../scripts/pons-collector-manual.cjs) без execute только
читает snapshot и независимо симулирует готовые действия. Никаких private keys.

```text
node scripts/pons-collector-manual.cjs --rpc URL --collector 0xCOLLECTOR --from 0xCALLER
```

Действия: sweep, pull, sync, pay-prizes, pay-ops, pay-team. Статусы ready/empty/waiting/
blocked/unavailable, raw amounts; block number/hash и simulation error сохраняются
в выводе. После каждой операции нужно новое чтение: sweep сам не выполняет claim.

Отправка разрешена только loopback Hardhat Robinhood fork с точным instanceId,
проверенным hardhat_metadata и forkedNetwork.chainId4663. Нужен unlocked local account.

```text
node scripts/pons-collector-manual.cjs --rpc http://127.0.0.1:8545 --collector 0xCOLLECTOR --from 0xCALLER --execute pull --instance INSTANCE_ID --out .local/logs/pons-manual-receipt.json
```

Новый output обязателен. Intent пишется до операции, receipt после подтверждения.
Если процесс оборвался, intent не доказывает отсутствие send: сначала проверить local
nonce/receipt, не повторять автоматически. Это не durable production sender.
In-process fork проверяет тот же inspect/executeLocal напрямую; CLI-файл нужен
для отдельно запущенной локальной fork-ноды. Никаких public sends в этом пакете.

Публичное объяснение ограничений: [страница](../web/transparency/index.html).
