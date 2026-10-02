# Pons: пакетные покупки и проверка подготовленного контура

Статус: локальная реализация и проверка 02.10.2026, рабочее дерево поверх b9b7e04.
Не аудит независимой организации и не разрешение публичного запуска.
Правила призов, порог 100 USDG и распределение денег не менялись.

## Новый маршрут до API

`pons-pool-batch-buy.cjs` добавляет genesis `direct-buy-pons-launch-v2`.
Он сохраняет предыдущие curve/direct маршруты и допускает точные терминальные
пакеты после graduation: три вызова для USDG, шесть для ETH→USDG→TOKEN.
Проверяются executor, делегация в контексте блока, все цели/разрешения/вызовы,
исходный receipt, funding и единственный целевой swap. Из расчёта BUY исключается
только однозначно найденное поступление от funding pool; оригинальные logs сохранены.
Это не допуск произвольных wallet batches, relayers или агрегаторов.
Старые genesis-профили не получают новую семантику задним числом.

Свежий локальный fork **78099955**, hash
`0x19e7b9e91fc159c170d6766d403886fba2d921c1fe4b80ec8495b7ea2a8d4de0`:

| Ветка | API после покупки и повторного запуска |
|---|---|
| USDG, последовательные вызовы | 1 Short + 1 Monthly, carry 1 USDG |
| USDG, signed type2 self-batch | 1 Short + 1 Monthly, carry 1 USDG |
| ETH, последовательные вызовы | 0 билетов, carry 2.727777 USDG |
| ETH, signed type2 self-batch | 0 билетов, carry 2.727445 USDG |

Каждая ветка начинает с собственного восстановленного snapshot. Разница ETH-сумм
получена из отдельных котировок. Это не четыре покупки одного накопительного цикла.
Локальный BuyPolicySource настоящий; durable index и HTTP/worker читают его допуск.
Повтор индекса не меняет ledgerHash, повтор API не удваивает покупки/билеты.
Использованы synthetic balances, open lifecycle v1 и local latest как finalized.
Проверка не включает розыгрыш, реальную mainnet finality или клики в установленном MetaMask.

Команда: `node scripts/pons-pool-terminal-fork.cjs .local/logs/pons-pool-admitted-20261002-a.json --admit-batches`.
Результат: `PONS_POOL_TERMINAL_MATRIX_PASSED`, все четыре `indexApi` PASS.
[Полный отчёт с receipts и квалификацией границ](evidence/PONS_POOL_BATCH_INDEX_API_2026-10-02.json).
Generic limits старого runner в raw evidence содержат устаревшую фразу no-index/API;
она явно оговорена в wrapper, исходное evidence не переписано. Формулировки runner исправлены.

## Найдено и исправлено

1. **Повторный проход всей истории индексатором.** RPC-кэш экономил сеть, но scanner
   снова обходил все блоки и bindings, а replay заново считал ledger даже без новых блоков.
   Теперь scanner получает только новый canonical suffix; при reorg хвост удаляется.
   Без изменений повторный replay не выполняется. Версия движка в snapshot заставляет
   пересчитать старое состояние после изменения семантики; policy admission и canonical
   branch проверяются каждый проход. Regression: 102 исторических блока → добавление
   одного сканирует ровно один; idle сканирует/пересчитывает ноль; engine upgrade
   пересчитывает все 103 один раз. Итог совпадает с независимым полным replay.
2. **До десяти одинаковых планов funding за один poll.** `pons-funding-pass.cjs`
   сохраняет read-only план до попытки транзакции. После отправки/определённого отказа
   перечитывает состояние, после неизвестного результата останавливается. Следующий poll
   всегда начинает с нового плана. Idle теперь делает один inspect вместо десяти.
   Порядок pull/sync/pay/sweep и журнал транзакций сохранены.
3. **Дублированные curve binding reads общего профиля.** Результат проверки curve
   передаётся в проверку pool; factory/curve повторно не опрашиваются в том же вызове.
4. **Чужая невалидная authorization мешала покупке.** EIP-7702 пропускает невалидные
   authorization tuples. Их recovery больше не обрывает проверку чужого type2 batch.
   Валидная authorization самого плательщика в том же блоке по-прежнему закрывает
   допуск без более точного execution evidence. [Правило EIP-7702](https://eips.ethereum.org/EIPS/eip-7702).
5. **Разъехавшиеся списки профилей.** `pons-profiles.cjs` — единый реестр для policy,
   decoder, scanner, локального planner и автоматики. Planner проверяет все зависимости
   выбранного профиля, допускает только его pinned delegation marker либо обычный EOA.
   Public/local guards сохранены; новый профиль не означает публичное включение.

Просмотрены boundaries receipt/attribution, curve/pool/funding adapters, scanner/cache,
admission, planner, collector/manual inspection, automation и transaction journal,
browser recovery. Изменений контрактов казны, RNG или продуктовой математики нет.

## Что остаётся открытым

- **0x**: есть unsigned quotes, нет подтверждённого execution/attribution adapter.
  Такие покупки пока не поддержаны. Следующий отдельный пакет G10 — этот маршрут.
- **Рост истории**: JSON snapshot и его checksum/atomic write всё ещё O(history).
  Когда приходят новые блоки, полный ledger replay тоже O(history); per-block runtime
  и binding проверки остаются. Исправлен повторный scanner/idle replay, не создана
  база данных с checkpointed accounting. Перед длительной публичной эксплуатацией
  нужен замер catch-up/памяти/размера на реальной интенсивности, затем отдельная миграция.
- Funding inspection всё ещё читает исторические campaigns для старых credits.
  Убран десятикратный повтор в одном poll, но бесконечный рост campaigns не оптимизирован.
- Внешние runtime pins не равны доказательству неизменности всей внешней системы;
  Pons operator conversion и production binding/source gates остаются в launch checklist.
- Реальные MetaMask UI, публичная политика, deploy config, сеть/finality и итоговый RC
  baseline не подтверждаются этим локальным пакетом.

## Проверки

Адресные запуски в текущем рабочем дереве (не суммировать пересечения):

- `node --test test/pons-funding-pass.test.cjs test/pons-persistent-indexer.test.cjs test/pons-pool-batch.test.cjs`: **10/10 PASS**, `.local/logs/pons-audit-regressions.log`.
- Index/policy/shared-config/batch integration: **18/18 PASS**, `.local/logs/pons-audit-index-tests.log`.
- Profile dispatch/direct/planner/decoder: **41/41 PASS**, `.local/logs/pons-audit-dispatch-tests.log`.

Расширенный набор Pons и соседних сценариев: **239/239 PASS**, 39 файлов,
286.0 s, fail/skipped/cancelled 0. Команда: `node --test` со списком файлов
профилей pons-* и shared-index без повторов; [точная команда и результат](evidence/PONS_AUDIT_TESTS_2026-10-02.json). Лог `.local/logs/pons-audit-expanded.log`;
точный список `.local/logs/pons-audit-test-files.json`. После добавления проверки
свежего сохранённого evidence: `node --test test/pons-pool-batch.test.cjs` — **4/4 PASS**,
`.local/logs/pons-pool-batch-final.log`. Проверены 515 локальных doc links и `git diff --check`.
Полный канонический `test:review` всех модулей проекта не запускался.
