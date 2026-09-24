# Permit2 BUY → admission → Short dataset: local fork

24.09.2026. Завершён один сквозной сценарий на свежем fork; production deployment
и полный розыгрыш этим не объявляются готовыми. [Основной статус](CURRENT_CONTEXT.md).

## Воспроизведение

```powershell
node scripts/permit-buy-fork.cjs NEW_OUTPUT.json --integration
```

Без флага сохраняется прежний одиночный BUY probe. Новый output обязателен, существующий
не перезаписывается. RPC по умолчанию официальный, override — RH_RPC_URL. Публичный
транспорт пропускает только чтение; все deploy/send идут в Hardhat chain31337.
Helper scripts/permit-buy-integration.cjs компилирует локальные контракты и запускает
существующие publishBuyPolicy, resolveBuyPolicy, scan, replay и runScheduler.
Новая реализация decoder/scheduler или обход admission не добавлены.

Evidence: [полный результат](../research/permit-buy-integration-2026-09-24.json).
Содержит raw BUY tx/receipts, RPC branch до dataset cutoff, manifests/policy history,
deployment hashes, publication journal, artifact, scheduler results и final state.
Во время запуска journal policy publication сохраняется также в OUTPUT.publication.json;
scheduler state/locks остаются в уникальном .local/logs/permit-integration-*.

## Что действительно исполнилось

Fork исходного блока 0x4408d5d. Пустой local block после reset устраняет отсутствие
исторической hardfork-конфигурации chain4663; дальнейшее исполнение — local Cancun.
Router, Permit2, PoolManager, hook и TOKEN/USDG — существующий public reference.
Код/ликвидность пула не заменялись. Искусственный капитал — 1000 USDG только у
Hardhat wallet; это не доказательство публичного funding или нашего TOKEN deployment.

Локально развёрнуты ParticipantRegistry, BuyPolicySource, LocalShortController,
LocalMonthlyController, DualControllerPromoVault и LocalRandomFixture. Пользователь
сам зарегистрирован. В Short reserve внесено 100 USDG из тестового кошелька.
Параметры outcome, weights, notice=2 blocks, LOCAL_HEAD и native funding — fixture,
не утверждённая production экономика/finality/authority.

После typed announce нового id:

| Действие | Блок | Результат |
|---|---:|---|
| Реальная покупка за 100 USDG до activation | 71339372 | COMMAND_SEQUENCE, 0 attempts |
| Реальная покупка за 100 USDG на activation | 71339375 | SUPPORTED_BUY, 1 attempt |

Обе покупки прошли в EVM и доставили TOKEN покупателю; promo учитывает только вторую.
Фактический расход/allowance/nonce проверены прежним BUY harness. Policy source
загружается обычным admission, RPC scan проверяет runtime dependencies. Ledger:
один участник, minted=1, carry=0. Старый BUY не получил ретроактивный зачёт.

После локального увеличения времени на 6 часов:

1. Scheduler сохраняет Short job, не отправляя транзакцию. Monthly ждёт свой срок.
2. Отдельный scan/rebuild воспроизводит artifact из полной RPC branch на его cutoff.
3. Budget в сохранённом artifact увеличивается на 15 raw USDG; job/state checksums
   пересчитаны. Scheduler отвергает его: Stored job differs from independent replay.
   Nonce и bytes подменённого файла остаются неизменны: отправки не было.
4. Исходный файл восстановлен. Обычный scheduler выполняет begin, следующим pass — publish.
5. Сохраняются одна запись job и прежний commitment. Повторный scan на старом cutoff
   воспроизводит тот же artifact после begin/publish, без дополнительного начисления.

Прогон завершился stage=complete, exit0; read proxy 283 requests, retries/errors=0.
Лог .local/logs/permit-buy-integration.log. Исходники product modules/contracts не менялись.

## Офлайн-регрессия и ограничения

```js
// scripts/test-launcher.cjs
runTests({profile:'permit-integration-offline',pattern:'saved Permit2 integration',
 selection:{compile:false,files:['test/direct-buy.test.cjs']}})
```

1/1, exit0, 0.56 s; .local/logs/test-run-85Hmod/result.json. Проверены raw branch,
граница activation, попытки/carry, artifact hash, повторная доставка блока и отличие
изменённого бюджета. Recorded admitted/status labels сами по себе не аттестация RPC.
Это адресная проверка сохранённого исполнения, не полный test baseline.

Seal, выдача/доставка random, selection, awards и claim в этом сценарии не выполнялись.
Monthly не запускался, его контроллер нужен для существующих dual bindings.
Нет проверки production финальности, Nitro-specific execution, signature-negative EVM,
боевого price/slippage guard, creator collect/claim или TOKEN→USDG prize conversion.
Публичных sends не было. Для нашего будущего TOKEN нужны отдельные deployment bindings.

Следующий независимый integration slice — источник creator revenue: collect/claim на
reference vault и граница FeeRouter. Это отдельная задача, не продолжение охоты за routes.
