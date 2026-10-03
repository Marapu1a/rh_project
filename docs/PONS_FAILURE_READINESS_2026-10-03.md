# Pons: точечная проверка отказов и задержек

03.10.2026. Тестовое дерево поверх f660b5f. Production не менялся.
Цель — понятное ожидание и сохранение денег/билетов при конкретных отказах,
без новой архитектуры мониторинга или очередного большого нагрузочного прогона.

## Изменения

- CLI `run-pons-automation.cjs` добавляет `operational` к прежнему результату:
  waiting/attention/clear/stopped, стабильные коды причин и короткие инструкции.
  Объясняет ожидание индекса, drand, газа, пополнения, receipt и неизвестного
  исхода отправки; ошибку funding и вложенные ошибки не объявляет восстановлением.
  Это только объяснение текущего прохода: не меняет retries, sends, journal,
  cadence или admission. `clear` не означает готовность всех draws.
- Кабинет различает fresh/catchingUp и stale: показывает известные числа с
  сообщением о задержке. При outage — прочерки и явное «не означает отсутствие
  билетов», после восстановления данные снова появляются.
- Полнота наград API сверяется с отдельным чтением исходных vault-событий
  RewardAssigned/RewardPaid: количество, draw, получатель, сумма, статус.
  Проверка включена в будущий joint harness и доступна отдельно для сохранённого
  отчёта. Это не независимый пересчёт победителей/математики розыгрыша.

## Матрица

| Отказ | Проверка и ожидаемое поведение | Основание |
|---|---|---|
| RPC завис/оборвался | Timeout, следующий проход восстанавливается; API не выдаёт ложный ноль | Сейчас: indexer-service, user-status-cache |
| Индекс отстал, снимок старый/исчез/повреждён | CatchingUp/stale/unavailable различимы; повреждённый snapshot не принимается, восстановление возвращает данные | Сейчас: service/cache, browser site; freeze wait — прежний joint |
| Receipt потерян/ещё pending | Сверка того же hash; неизвестный hash блокирует, повторной отправки нет | Сейчас: pons-automation, claim-journal, real vault Claim |
| Receipt/tx подменён или сменился блок | Сверка sender/target/data/value/nonce/каноничности отвергает результат | Сейчас: pons-automation |
| Процесс индексатора убит | Собственный lock снимается только после подтверждённого выхода ребёнка; API остаётся доступен | Сейчас: indexer-service с SIGKILL |
| Процесс отправителя убит между send/save | Старые обязательства и unknown/known intent сохраняются | Прежний pons-crash-recovery; в этом пакете не повторялся |
| Диск переполнен до intent save | Нет send, прежний файл не изменился | Сейчас: pons-storage-failure, инъекция ENOSPC |
| Диск переполнен после send до hash save | Ровно один send, на диске остаётся intent без hash; restart требует reconciliation | Сейчас: pons-storage-failure; mock transport, реальные save/boundary |
| Rename/lock/запись состояния не удались | Атомарная замена не портит прежний файл, чужой lock не удаляется, ошибка сохраняется | Сейчас: local-state-lock |
| Не хватает ETH | Ждём ближайшую транзакцию, уведомление о пополнении; призовые активы не используются | Сейчас: pons-gas-budget |
| Funding reverted/недоступен | Планы перечитываются после попытки; причину видит оператор | Сейчас: pons-funding-pass, delay-status |
| RNG/история недоступны | Не выбираем новый seed/draw; останавливаем неподтверждённые действия | Текущее отображение причин; исполнение — прежние drand/history recovery tests |
| Кошелёк отказал/сменил сеть/аккаунт, automatic payout опередил Claim | Неподходящее действие блокируется; повторная выплата не отправляется | Сейчас: real vault Claim, браузер не-MetaMask, claim-journal/site |
| API потерял одну или все награды | Проверка полного списка падает, даже если оставшиеся строки правильны | Сейчас: completeness negative tests и сохранённый joint report |

## Результат и воспроизведение

57 уникальных адресных tests PASS: основной запуск55, отдельно2 ENOSPC теста.
После уточнения обработки вложенных ошибок повторены только2 delay-status tests.
Это частичный результат, не A5/full baseline. Логи и SHA-256:
[evidence](evidence/PONS_FAILURE_READINESS_2026-10-03.json).

Основная команда:

```powershell
node --test --test-concurrency=1 test/pons-delay-status.test.cjs test/wallet-reward-completeness.test.cjs test/pons-automation.test.cjs test/pons-gas-budget.test.cjs test/pons-funding-pass.test.cjs test/local-state-lock.test.cjs test/indexer-service.test.cjs test/user-status-cache.test.cjs web/site.test.cjs web/claim.test.cjs web/claim-journal.test.cjs
node --test test/pons-delay-status.test.cjs test/pons-storage-failure.test.cjs
node --test test/pons-delay-status.test.cjs
node scripts/verify-wallet-reward-completeness.cjs .local/logs/pons-joint-128-alchemy-b.json
```

Последняя команда:129 кошельков/11 наград PASS; снимок не изменился, новых sends
и RPC-запросов нет. Проверяется сохранённая история, не текущая публичная сеть.
Добавлен воспроизводимый профиль `--profile pons-failures` для launcher/review;
сам профиль целиком повторно не запускался, его составляющие проверены выше.

## Что делать оператору

1. При штатном ожидании индекса/RNG/газа/funding сохранить состояние и устранить
   указанную причину. Нехватка эксплуатационного ETH не отменяет билеты/призы.
2. При неизвестной отправке сначала найти её результат по кошельку/цепочке и
   сохранённому intent. Не удалять journal, не пересчитывать checksum вручную,
   не отправлять повтор вслепую.
3. При повреждении файла/диска остановить writer, сохранить повреждённые файлы и
   logs, восстановить согласованную копию и сверить её с цепочкой. Restore не
   означает разрешение на reroll, reset или расход frozen/claimable.

## Честные границы

Нет внешнего канала уведомлений, автоматического archive failover или dashboard.
Причины — в CLI; возраст/высота и состояние индекса — в существующих API/health и
кабинете. Не заявляем общий realtime backlog или время последней успешной отправки
по всем процессам. При аварии до получения результата CLI остаётся stderr/exit1.
Ошибки диска инъецировались, питание машины физически не отключалось.
Все будущие маршруты одновременно не нагружались; внешний Pons operator не
тестировался. Эти границы не превращаем в новый мегапроект: следующий шаг —
сверить оставшиеся обязательные условия и закрепить A5 на одной ревизии.
