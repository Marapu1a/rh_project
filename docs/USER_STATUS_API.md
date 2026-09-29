# Read-only API покупок и билетов

29.09.2026. Реализован локальный HTTP endpoint поверх indexer snapshot и существующего
replayAttempts. Призы, выплаты, frontend и публичный hosting не входят в этот пакет.

```powershell
node scripts/user-status-api.cjs CONFIG.json 8787
```

CONFIG — тот же полный scheduler/indexer config. Сервер слушает только127.0.0.1.
`GET /v1/wallets/0xADDRESS?offset=0&limit=25` (limit1..100).
Локальный адрес после запуска: http://127.0.0.1:8787/v1/wallets/0xADDRESS
Для публичного размещения нужен отдельный reverse proxy/service deployment; здесь
не открывается внешний порт, не подключается RPC или signer. Методы записи дают405.
Плохая query даёт400, неизвестный route404, недоступные данные503. Cache-Control:no-store.

## Содержание

- balances.SHORT/MONTHLY: mintedTotal, open, frozenByDraw, consumedTotal и byEpoch,
  если доступен. Расходованные попытки берутся из lifecycle, не из minted BUY totals.
- carryRaw, entryThresholdRaw, quoteDecimals: целые raw units, не округлённые доллары.
- purchases: постраничный список decoder-кандидатов с доказанным payer данного
  кошелька, hash/block/log, status/reason, учтённой суммой и начисленными attempts.
  Не все неподдержанные операции имеют доказанный payer: отсутствие в списке НЕ
  означает «покупка проверена и отвергнута». Это не поиск произвольной транзакции
  в сети и не endpoint pending receipts.
- provenance: chain/anchor, processed head/hash, manifestHash, ledgerHash,
  время успешного снимка и возраст, indexerState и наблюдавшийся targetBlock.
  RPC URL, config целиком, файлы журналов и ключи не выдаются.

## Свежесть и доверие

Checksum и config identity обязательны, policy должна быть admitted. Исходные blocks
заново проходят replayAttempts; head и buyLedgerHash сверяются с сохранёнными.
observed означает достаточно свежий успешный локальный снимок, НЕ свежую RPC-проверку
каноничности, контрактную финальность или разрешение freeze.

Если снимок устарел либо indexer ждёт — status=stale, прежние балансы сохраняются
с возрастом. observedAt сохраняется на успешном index.index, отдельно от времени
сообщения о сбое. Старый формат без observedAt показывается stale до следующего sync.
Если файла нет, config/checksum/replay неверны или policy unadmitted — status=unavailable,
balances/purchases=null, HTTP503. Нули возможны только для отсутствующего кошелька
в корректно пересчитанном снимке и относятся строго к указанной высоте.

Это read-only наблюдение доверенного проектного индексера. Checksum не доказывает
честность оператора. Самостоятельное воспроизведение исходных данных по RPC остаётся
отдельной проверкой. JSON загрузка и replay линейны; performance/load qualification,
ограничения публичного proxy и supervisor пока впереди.

## Проверки29.09

Адресно8 различных сценариев прошли: расширенный admitted scheduler/оба draw/API
(32.2s), policy publication+cache reorg+unstarted job (9.6s после исправления fixture),
6соседних indexer tests (1.5s). API проверен после terminal обоих draws: open0,
consumed1 отдельно Short/Monthly; stale сохраняет balances, пропавший файл даёт503/null,
невалидная page limit400, POST405, GET200.

Команды:
- `node --test --test-name-pattern="persistent indexer feeds|policy publication reorg" test/cutoff-scheduler.test.cjs`
- Повтор исправленного fixture: `node --test --test-name-pattern="policy publication reorg" test/cutoff-scheduler.test.cjs`
- `node --test test/persistent-buy-indexer.test.cjs`

В первом прогоне reorg fixture использовал hardhat_mine и не прошёл проверку
непрерывности ещё до целевого сценария; заменён последовательным evm_mine.
После реального отката policy/cache сохранённый job получает явный policy mismatch:
нет отправки и изменения artifact. Это осознанная остановка спорного unstarted job,
не автоматическое восстановление произвольной переорганизации финализированной истории.
Solidity не менялась; тесты использовали compiled artifact с SHA256. Не full/live/fork.
