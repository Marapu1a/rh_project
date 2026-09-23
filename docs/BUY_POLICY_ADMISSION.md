# BUY policy admission: локальный read-only прототип

24.09.2026. Реализация: scripts/buy-policy-admission.cjs, `loadBuyPolicy`.
Потребители не подключены, объявлений/deployment/send в сеть нет.

## Модель доверия

Независимо закреплённый trust root содержит chainId, instanceId, source,
sourceCodeHash, publisher, genesisHash и noticeBlocks (>0). Genesis manifest
проверяется против genesisHash. Конфигурация не загружается из объявления.
Это интерфейс будущего deployment policy, а не принятое назначение нового админа.
В текущих контрактах источника таких объявлений нет. Source и publisher из тестов
синтетические, их нельзя переносить в production конфигурацию.

Предлагаемый ABI события (контракт публикации пока не реализован):
`BuyPolicyAnnounced(bytes32 indexed instanceId, bytes32 indexed previousHash,
bytes32 indexed nextHash, uint256 fromBlock, string manifest)`.
В manifest публикуется полный canonical JSON. Нет зависимости от изменяемой ссылки
на сервер, IPFS gateway или отдельной выдачи manifest оператором. Цена публикации
полного документа ещё не измерена. Hash-функция совпадает с BUY replay.

## Что проверяет loader

Вызов `loadBuyPolicy({trust, genesis, rpc})`: rpc — async transport(method, params)
с обычными JSON-RPC результатами. Модуль только читает сеть; не пишет state и не
принимает от caller историю или announcedAtBlock.

1. Chain и canonical genesis anchor; checkpoint берётся только из RPC finalized.
   Отсутствие тега/архива вызывает отказ, fallback на latest отсутствует.
2. Все события выбранного source/instance от genesis до checkpoint. Код source
   совпадает с закреплённым hash на checkpoint и каждом блоке объявления.
3. Каждое событие совпадает с receipt успешной транзакции, canonical header,
   block/transaction/log position. Требуется прямой tx от pinned publisher к source.
   Relayer, Safe wrapper/EntryPoint не поддержаны и не угадываются по tx.origin.
4. Instance и previousHash совпадают; canonical полный manifest соответствует
   nextHash. Unknown routes/изменённая старая история и остальные поля запрещены
   существующим валидатором расширения.
5. fromBlock не раньше notice+noticeBlocks; activation соответствует новой route
   и порядку версий. announcedAtBlock/hash выводятся из сетевого события.
6. Checkpoint перечитывается, регресс/смена finalized checkpoint отвергается;
   продвижение finalized вперёд не требует бесконечного повторения чтений.

Результат: history для pure replay, trustHash, checkpoint, ссылки на объявления.
При отсутствии событий возвращается только genesis, НЕ предложенная локально v2.
Старые snapshots по-прежнему используют manifest своего cutoff.

## Чего пока нет

Это не консенсусный light client. Полнота getLogs/честность RPC и значение finalized
относятся к доверию к RPC и сетевому профилю. Успешный mock-тест не доказывает finality
Robinhood. Соответствие sourceCodeHash смыслу кода должен подтвердить deployment
review; hash сам по себе не доказывает честность контракта или отсутствие proxy.
Никаких произвольных source/proxy из JSON автоматически не одобряем.

До live использования нужно выбрать/реализовать минимальный источник объявления,
явно закрепить его полномочия, instance/genesis и достаточный срок предупреждения,
проверить конкретную finality, доступность истории, публикацию и обработку ошибок.
noticeBlocks в тестах — техническая граница, не утверждённый пользовательский срок.
Замена trust root не является разрешённой миграцией. Поддержка отзыва маршрута
остаётся отдельным решением, прошлые BUY/frozen не переписываются.
Builders/CLI/coordinator и сохранённые jobs пока не принимают результат автоматически.
Локальный pure replay всё ещё допускает синтетическую историю для тестов; новый loader
не делает любой вызов pure replay доверенным. Публикация на сайте и пользовательские
уведомления этим модулем не реализованы.

## Проверки

24.09: `npm run test:direct-buy` — 18/18. Новый admission test содержит положительный
переход, сохранение старого snapshot, 15 отрицательных мутаций (sender/source,
hash-chain, instance, manifest, notice, receipt, duplicate, runtime и другие), отсутствие
события, reorg checkpoint и отсутствие finalized. RPC в этих проверках синтетический;
история BUY основана на ранее сохранённом fork evidence. Новый live/fork/full не запускался.
