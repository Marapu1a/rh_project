# Общий профиль покупок Pons

> Актуализация02.10: это модуль с датированными этапами/evidence, а не текущая очередь работ. Подтверждённые curve/pool self-batches теперь подключены к index/API новым genesis v2; scanner читает новый suffix, idle replay устранён. [Текущая матрица](PONS_CHANNEL_COVERAGE.md), [аудит](PONS_AUDIT_2026-10-02.md), [план](ROADMAP.md).

`direct-buy-pons-launch-v1` / `rh-pons-curve-batch-ur-v1` объединяет:

- Прямой USDG BUY на кривой, включая возврат неиспользованной суммы при graduation.
- Проверенный self-batch на кривой: approve→BUY либо ETH→WETH→USDG→BUY; требования к авторизации и parent delegation сохраняются.
- Прямой single-hop BUY через Universal Router после graduation, с проверкой USDG debit, net TOKEN и hook fees.

Все маршруты используют один накопительный ledger: переход в пул не сбрасывает остаток до следующих 100 USDG. SELL, простые переводы, неподтверждённые маршруты не создают билетов.

Это новый genesis profile. Старые curve, batch и curve+v4 политики не меняются и не получают ретроактивный допуск. Публичная политика не опубликована. Перед реальным запуском нужен deployment/config admission.

## Реализация

`scripts/pons-launch-buy.cjs` составляет существующие декодеры без копирования призовой математики. Manifest содержит объединённые зависимости; scanner проверяет runtime/bindings и сохраняет delegation evidence. `buy-policy-format.cjs` фиксирует отдельный adapter ID.

Пакетные v4 покупки, relayers, произвольные агрегаторы и неоднозначные изменения делегации внутри блока остаются неподдержанными. Проверенный прямой Universal Router вызов не является доказательством всех путей терминала Pons.

## Локальный сквозной прогон

```powershell
$env:RH_FORK_RPC_URL='https://rpc.mainnet.chain.robinhood.com'
node scripts/pons-collector-fork.cjs .local/logs/NEW-combined.json --combined-profile
```

Используется отдельная Prague VM и публично известный тестовый ключ. Первая покупка подписана как type4 с authorization; impersonation для неё отключается. Остальные операции выполняются локально через impersonation; funding синтетический. Upstream допускает только чтение. Этот режим предназначен для самостоятельного запуска без других сценарных флагов.

Сценарий: launch → batch101 → SELL → сбор доступных комиссий → частичное исполнение graduation BUY с refund → прямые v4 BUY101 и60+40 → локальный BuyPolicySource → постоянный индекс → повторное чтение → открытые Short/Monthly → HTTP API с перезапуском сервера/worker.

`latest` подставляется вместо `finalized` только в локальном reader. Lifecycle v1 используется для открытых билетов с PromoVault как пустым источником событий; реальный draw lifecycle и выплаты этим прогоном не квалифицируются. Установленное расширение MetaMask не участвует.

## Адресные проверки

02.10.2026: 43/43 PASS, не полный набор:

```powershell
node --test test/pons-batch-integration.test.cjs test/pons-v4-buy.test.cjs test/pons-policy-indexer.test.cjs test/pons-persistent-indexer.test.cjs test/direct-buy.test.cjs
```

Лог: `.local/logs/pons-combined-tests.log`. Проверяются сохранение обоих семейств маршрутов, суммы/остатки, прежние policy/indexer сценарии, отказ неподтверждённым v4 batches и отсутствие неявного обновления старых политик.

Предварительные fork-попытки `a` и `b` не являются PASS. В `a` точный batch approve101 заменил исходный безлимитный allowance; в сценарий добавлен новый approve перед graduation. В `b` торговые проверки прошли, но index/API конфиг не содержал `lifecycle.vault`; конфиг исправлен. Старые отчёты сохранены в `.local/logs/`.

## Подтверждённый результат 02.10.2026

`PONS_COMBINED_INDEX_API_PASSED`, свежий fork78075403, hash `0x6ab75b0fb470b15f9ff4e19383d9382c1e7040e980208900d234d941d3931571`. [Manifest, транзакции, решения и API](evidence/PONS_COMBINED_PROFILE_2026-10-02.json).

5 eligible BUY: подписанный batch101, graduation с refund, прямые v4 покупки101/60/40. Один локально развёрнутый BuyPolicySource; mode=admitted. API возвращает86 открытых Short и86 Monthly, carry79328733 raw USDG. Повтор indexOnce не изменил ledgerHash; два отдельных HTTP server/worker запуска вернули одинаковые balances, покупки и rewards. Выплат/розыгрышей в этом сценарии нет.

Полный отчёт `.local/logs/pons-combined-20261002-c.json`, конфиг `.local/logs/pons-combined-20261002-c.json.combined-config.json`, сохранённый индекс рядом. SHA-256 полного отчёта записан в evidence. Вложенные `api.limits` описывают область общего snapshot-verifier; границы всего свежего прогона указаны в `combined.limits` и выше.

Следующий незакрытый пакет G10 — штатный post-graduation terminal payload Pons: выяснить, где прямой UR, где wallet batch/конвертация, и допускать только подтверждённые пути. Затем окончательный G04 deployment/config manifest. Новый профиль не включён публично.
