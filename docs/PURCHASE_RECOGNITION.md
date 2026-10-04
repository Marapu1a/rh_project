# Позднее подтверждение покупок

Статус04.10.2026: реализован **локальный тестовый контур**. В production не
развёрнут, конфигурация VPS и финансовая автоматика не изменялись.
Решение пользователя: подтверждённая старая покупка может дать билеты только
на будущие розыгрыши. Это заменяет прежний запрет ретроначисления, но не
разрешает переписывать завершённые или замороженные наборы.

## Учёт

- Исходная запись сохраняет block/hash/tx/log покупки. Неизвестный маршрут
  становится `WAITING_RECOGNITION`; ноль билетов пока не означает отказ.
- `PurchaseRecognitionSource` публикует хеш содержимого пакета и число покупок.
  Изменить дату подтверждения аргументом нельзя. Publisher неизменяемый;
  первый пакет разрешён не раньше24ч после deployment. Нет custody, reset,
  назначения wallet/amount или вывода денег.
- Replay заново сверяет каждую покупку с сохранённым canonical receipt,
  calldata, полным callTracer/логами и фиксированными runtime pins.
  Поля суммы/получателя из произвольного пользовательского JSON не используются.
- `creditedAt` — позиция события подтверждения. При сложении carry события
  сортируются по позиции начисления, а не по исходной дате покупки.
  Внутри одного пакета порядок детерминирован по candidateId.
- Порог остаётся100USDG; Short и Monthly получают одинаковое количество entries.
  USDG-форма учитывает проверенное списание кошелька; ETH-форма — фактический
  USDG, доставленный в curve, без пересчёта gas/native fee в билеты.
- Cutoff до подтверждения не видит поздние entries, даже если покупка старше
  cutoff. Старые snapshot domains сохраняют исходный genesis manifest hash.
  При смене правил entries относятся к эпохам на блоке подтверждения.
- Повторное подтверждение той же покупки в другом пакете проверяется, но не
  начисляет повторно и не меняет первую дату. Повтор tx внутри пакета отклоняется.
  Уже учтённый обычным decoder BUY нельзя начислить повторно.

## Ограниченный adapter

`pons-router-65050-v1`: только canonical `swap`65050… с одним прямым USDG→QIANQI
шагом или двумя ETH/WETH→USDG→QIANQI шагами. Проверяются caller/recipient,
minReturn/deadline, exact project asset transfers, исполнители entry/funding/curve,
отсутствие ошибок и дополнительных неизвестных targets, EOA payer, native fee и
WETH deposit. Quote/WETH implementation addresses/hashes закреплены версией.
Authorization-bearing outer tx и другие формы не допускаются этим adapter.

**Модель доверия:** receipt/callTracer, полнота project-log selection и исторические
runtime hashes получены от RPC. Это не cryptographic execution proof и не полный
аудит неизвестного исходника роутера. Проверка одинакового runtime до/после блока
не доказывает отсутствие временной смены кода внутри блока. Поддержка намеренно
узкая; несовпадение исполнения останавливает подтверждение, а не включает fallback.
Publisher определяет момент публикации доказательств и может задержать её.
Штатный формат не принимает готовое число билетов, но честность trace/code
assertions остаётся границей доверия publisher/RPC. Владелец04.10 принял QuickNode
как достаточный источник: второй RPC не обязателен. Независимый аудит не заявляем;
commitment фиксирует evidence, но не доказывает истинность ответа RPC.

## Файлы и запуск

- `contracts/PurchaseRecognitionSource.sol`: append-only commitment,50 покупок максимум.
- `scripts/purchase-recognition.cjs`: trust, проверка, hydration, порядок учёта.
- `scripts/prepare-purchase-recognition.cjs`: read-only сборщик плана.
- `direct-buy.cjs` и `attempt-lifecycle.cjs`: carry и будущие попытки;
  `persistent-buy-indexer.cjs`, `project-history.cjs`: сохранение доказательств.
- `user-status-api.cjs`, `web/app.js`: ожидание и подтверждение без вывода сырых trace.

Опциональная конфигурация `recognition`: `schema=purchase-recognition-v1`, source,
sourceCodeHash, publisher, instanceId, adapter, implementations.quote/weth
с address/codeHash, bundleDirectory. Пример формы — тестовая fixture
`test/fixtures/purchase-recognition.cjs`; её адреса подтверждения **синтетические**,
копировать их в production нельзя. bundleDirectory — только локальный путь,
он не включается в публичный trust. Coordinator передаёт ту же конфигурацию в
shared index; обход индекса для этого режима запрещён.

```powershell
# RH_RPC_URL уже задан локально; команда не подписывает и не отправляет tx.
node scripts/prepare-purchase-recognition.cjs CONFIG INDEX_STATE BUNDLE_DIRECTORY TX_HASH...
```

CLI использует конфигурацию именно постоянного индекса и требует admitted/caughtUp,
свежесть, checksum/config identity. Планv2 проверяет source runtime/immutable/
availableAt, целый bundle обычным replay и read-only eth_call(confirm).
Полнота истории через QuickNode, публичное объявление/24ч и доступность bundle
проверяются отдельно: они перечислены в publicationChecksRemaining. Повторное
чтение через тот же RPC проверяет согласованность, не независимость источника.

Сначала сохранить и проверить bundle, затем отдельно публиковать выданный
`confirm(hash,count)` через владельца. Публикация в публичную сеть не входит
в этот пакет. Одного успешного `prepare` недостаточно для начисления.

Пакет хранится как `<keccak canonical JSON>.json`, максимум8MiB/50 покупок.
При превышении размера его нужно разбить. Индекс сохраняет доказательства
только при событии проекта, не копирует пустые блоки. В proof сохраняются hashes
кода до/после блока, а не повторяющийся bytecode. Сырые пакеты входят в backup.

## Отказы и ограничения

Недоступный/повреждённый bundle, неверный runtime, missing original, другой
получатель/ветка, неоднозначность или неверный source останавливают новый snapshot.
Последний хороший индекс сохраняется, status становится waiting. Нельзя просто
пропустить commitment и продолжить готовить draws. При restart проверка независима
от сохранённого ledger; API дополнительно связывает recognition trust с config.
Удаление внешнего bundle после успешного сохранения не ломает API: копия evidence
остаётся в индексе. При полном rebuild исходные bundles снова нужны.

Reorg удаляет неподтверждённые веткой начисления через обычный полный replay.
Если сохранился freeze, который больше нельзя воспроизвести, действует прежний
fail-closed, без ремонта frozen/consumed. Глубокая реорганизация за retained tail
по-прежнему требует отдельного разбора.

В режиме recognition suffix checkpoint replay отключён: подтверждение ссылается
на старую покупку. Обрабатывается **история проекта**, но стоимость всё ещё
O(project history), trace читается повторно при новом snapshot. Это ограничение
тестового кандидата, не обещание масштабирования до миллионов покупок.
Для большего объёма нужен verified cache подтверждений с инвалидированием по
ветке/домену; он не нужен для доказательства корректности текущего механизма.

## Перед отдельным боевым этапом

1. Review нового adapter, commitment и границ RPC-доверия.
2. Опубликовать уточнённое правило; выдержать24ч. Развернуть source с реальными
   immutable publisher/instance, проверить runtime и availableAt.
3. Согласованно перенести trust, bundle store и backup в индекс/API/coordinator;
   пересобрать индекс из сохранённых покупок. Сверить прежние frozen snapshots.
4. Подготовить пакет реальных покупок, сверить список/суммы, публиковать commitment
   только после доставки пакета на сервер. Проверить finality, кабинет и restart.
5. Включение финансовой автоматики — отдельный preflight, не побочный эффект
   подтверждения покупок. Остальные неподдержанные маршруты остаются pending.

Проверки и измерения: [отчёт04.10](PURCHASE_RECOGNITION_2026-10-04.md).

Разбор свежего GPT review и план первого боевого пути: [04.10](PURCHASE_RECOGNITION_REVIEW_2026-10-04.md).
