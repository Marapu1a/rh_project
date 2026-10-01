# Pons: допуск политики и сохранённый индекс

[Полный indexed coordinator cycle](PONS_INDEXED_CYCLE.md) — локальный PASS01.10; следующий шаг — независимое review.

01.10.2026: локальная связка реализована. Публичный исполнитель остаётся закрыт.

`buy-policy-format.cjs` поддерживает исходные Pons curve/v4 adapter IDs в
BuyPolicySource. Это допуск конкретного manifest, а не аудит исходников внешних
контрактов Pons. Расширения Pons routes не реализованы: неизвестное изменение
блокирует работу при достижении блока его активации.

`pons-automation.cjs` экспортирует `schedulerConfigFor(config)`. Если переданы
`buyPolicy` и `indexer`, координатор передаёт scheduler режим
`FINALIZED_CHECKPOINT` и `admitted`. Обязательны оба поля, совпадение
genesisHash/chainId/lifecycle.instanceId, абсолютный statePath и maxAgeSeconds
от1 до3600. Без обоих полей сохранён прежний явно исследовательский режим.

Индексатору нужен **точно результат schedulerConfigFor(config)**, сохранённый
как JSON, а не весь конфиг координатора: checksum состояния учитывает конфиг.
Например, из локального Node-скрипта в корне проекта:

```js
const fs = require('fs');
const {schedulerConfigFor} = require('./scripts/pons-automation.cjs');
const config = JSON.parse(fs.readFileSync('.local/pons-config.json', 'utf8'));
fs.writeFileSync('.local/pons-indexer-config.json',
  JSON.stringify(schedulerConfigFor(config), null, 2));
```

Далее использовать существующий once/watch интерфейс из
[PERSISTENT_INDEXER.md](PERSISTENT_INDEXER.md). Routine запуск индексатора
нужен отдельно: scheduler только читает snapshot. При stale/behind, несовпадении
конфига, ветки или политики нет скрытого перехода к полному сетевому scan.
Изменение режима меняет identity журналов; этот пакет не мигрирует старые
frozen jobs и не разрешает удалять/сбрасывать их состояние.

Проверки 01.10:

- `node --test test/pons-policy-indexer.test.cjs test/pons-persistent-indexer.test.cjs test/pons-automation.test.cjs test/persistent-buy-indexer.test.cjs test/direct-buy.test.cjs` —44/44 PASS. Профиль `pons-policy-indexer` содержит тот же адресный набор.
- `node scripts/pons-collector-fork.cjs .local/logs/pons-admitted-indexer-20261001-a.json --policy-indexer` с RH_FORK_RPC_URL —PONS_ADMITTED_INDEXER_PASSED, anchor77447532. Настоящий локальный BuyPolicySource, admitted snapshot,3 отдельных CLI запуска, без исторических Pons reads при повторе, rollback BUY блока и outage/resume. Проверка самой политики при повторе читает RPC заново.
- [Компактное evidence](evidence/PONS_ADMITTED_INDEXER_2026-10-01.json). Полные отчёты в `.local/logs/`, не публикуются.

Это не полный новый coordinator/draw cycle. В fork RPC latest отображается как
finalized только для теста; синтетическое финансирование и локальные impersonated
отправки не доказывают публичную готовность. Положительный snapshotConsumed
не открывает public sender и не подтверждает независимость оператора Pons.

Следующий ограниченный шаг: совместный прогон постоянного индексатора,
координатора и истории finalized cutoff до обоих settlement/claims, включая
ожидание отстающего индекса. Публикацию cutoff проверять явно; не подменять её
LOCAL_HEAD ради прохождения теста.
