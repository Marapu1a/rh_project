# Автоматическая доставка drand

Статус 27.09.2026: локальная реализация, chain31337 и loopback CLI. Не production
admission и не гарантия finality. Правила призов и Solidity контракты не изменены.

## Проход worker

`scripts/drand-delivery-worker.cjs` читает pending draw каждого из двух контроллеров,
затем drawRequest и context. Ручного списка request IDs нет: максимум два активных
запроса и четыре транзакции за проход. Проверяются runtime hashes, deployment anchor,
PROFILE/CHAIN_HASH, взаимные consumer/provider bindings и совпадение draw/context.

Для неподтверждённого запроса worker ждёт закреплённый round, получает именно
`/public/<round>`, сверяет номер и вызывает contract verify через eth_call до траты
газа. Затем отдельные prove и deliver. Уже proven запрос не требует HTTP и доставляется
повторно с тем же seed. Подмена round, новый выбор результата и reset отсутствуют.
Свежесть для нового freeze не блокирует доставку ранее закреплённого результата.

Отсутствующий beacon оставляет запрос waiting; неверная подпись или определённый
revert оставляет degraded. Другой запрос продолжает работу. Неизвестная отправка,
неподтверждённый receipt или общая RPC ошибка не трактуются как локальный callback сбой.

## Журнал и газ

Используются существующие withState, transaction boundary, receipt/watch helpers.
Intent сохраняется до отправки, hash/nonce — после. При рестарте известный hash
сверяется с canonical receipt и transaction sender/target/calldata/nonce; неизвестный
hash блокирует отправки до reconciliation. Автоматического удаления lock/intent нет.

Перед отправкой проверяются gas-price cap, native balance с floor, pending nonce
и сохранённый head hash. Недостаток native или дорогой газ означает waiting.
USDG резервов worker не касается. Это бюджет конкретной операции, не гарантия денег
на весь draw. Для отдельного worker нужен отдельный signer и единственный writer
state; общий nonce/budget coordinator ещё не подключён.

## Запуск

```text
node scripts/run-drand-delivery.cjs --job JOB.json --state STATE.json --rpc http://127.0.0.1:8545 --executor 1 --watch
```

Job: schema=`local-drand-delivery-v1`, chainId=31337; адреса adapter/short/monthly
и соответствующие adapterCodeHash/shortCodeHash/monthlyCodeHash; anchor={number,hash};
maxGasPrice, nativeFloor, gasUnits={prove,deliver} в целых raw units; pollSeconds10–86400.
Gas limits положительные, floor неотрицательный. Hashes — закреплённые runtime hashes.
Изменение job меняет identity журнала: старую pending отправку нужно сверить со старой
конфигурацией, а не обходить новым state. CLI использует только unlocked local signer.
SIGINT/SIGTERM прерывает ожидание; новая отправка не начинается после остановки.

## Проверки 27.09

- Worker9/9: оба реальных local controllers, historical BLS proof, wrong round,
  forged proof, delayed beacon, уже proven без HTTP, known/unknown send restart,
  повтор без транзакций, gas/native wait, pins и receipt mismatch.
- Callback isolation проверена симуляцией estimate revert; реальный callback revert
  отдельно покрыт существующим adapter test. Успешные prove/deliver — реальные local tx.
- CLI2/2: exact-round URL/HTTP failure/abort и отказ от public RPC/неверных аргументов.
- Соседний pre-freeze1/1: healthy/stale/offline/invalid proof после tightening fallback.

Команды: адресный launcher с `test/drand-delivery-worker.test.cjs` (compile+tests55.8s);
`node --test test/drand-delivery-cli.test.cjs`; с SHA-проверенным тем же artifact
`node --test --test-name-pattern="pre-freeze drand" test/drand-adapter.test.cjs` (1.4s).
Локальный отчёт `.local/logs/test-run-gIZYgh/result.json`. Это раздельные адресные
проверки, не full baseline. Fork/live и live HTTP beacon в этих тестах не запускались.

## Следующая граница

Worker доставляет RNG, но не выполняет settlement/claim. Следующий пакет — общий
Infinity funding/BUY → freeze → этот worker → settlement → USDG claim прогон.
Нужно затем объединить исполнение и бюджет, закрыть production keys/admission,
утвердить timing параметры. Часы/RPC finality остаются операционным доверием,
глубокий reorg и невыпуск round не исправляются reroll. См. [adapter](DRAND_ADAPTER.md).

27.09: совместный [Infinity→Short→USDG прогон](INFINITY_PAYOUT_PROOF.md) выполнен. Реальные fork fees финансируют этот же vault; live drand worker и claim проверены. Ускорение часов конструктора/тестовые odds и lead описаны отдельно; Monthly draw и непрерывный coordinator не заявлены.
