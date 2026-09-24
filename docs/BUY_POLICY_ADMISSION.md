# BUY policy: типизированные расширения и admission

24.09.2026. Новая версия source для нового deployment. Старый JSON ABI не
совместим; публичного deployment у проекта нет. Prize custody и payout math не менялись.

## Граница поколения

В этом поколении расширяется способ доказать ту же покупку: TOKEN, pool,
зарегистрированный payer=recipient, nominal USDG и отсутствие двойного зачёта.
Изменение оценки через оракул, бенефициара или основания начисления — отдельное
решение о новом поколении. Новые маршруты сейчас НЕ добавлены.

Новый decoder release может расширить каталог versioned adapter ids без замены
source. Это возможность протокола публикации, не готовая поддержка любого router:
сам adapter, runtime binding, attribution и tests ещё должны быть реализованы.
Одно имя версии нельзя переиспользовать для другой семантики. Id равен keccak256
имени версии; это обязательство по идентификатору спецификации, НЕ hash JS-кода
и не доказательство его правильности. Воспроизводимость executable release ещё
требует дисциплины версий/аудита; в этом пакете не добавлен произвольный plugin loader.

## Контракт

`BuyPolicySource` не имеет proxy, prize custody, reset или смены publisher.
Constructor: instanceId, genesisHash, publisher, noticeBlocks, initialAdapters.
Начальные ids непустые/уникальные; их ordered hash закреплён immutable.
`SCHEMA_VERSION=1` — версия нового typed wire protocol, не прежнего JSON API.

`announce(previousHash, adapterId, fromBlock)` добавляет ровно один id.
Контракт отклоняет чужого sender, неверного parent, нулевой/повторный id (включая
начальные), раннюю/неупорядоченную активацию, второе объявление до предыдущей
активации и блок за пределом JS safe integer. Время — ChainBlocks/RPC координаты.
Нет произвольного JSON, nextHash вызывающий не задаёт:

```text
nextHash = keccak256(abi.encode(previousHash, uint256(1), adapterId, fromBlock))
```

`currentHash` — цепочка ОБЪЯВЛЕНИЙ, не hash восстановленного manifest.
`publishedCount/currentHash/lastFromBlock` проверяют полноту событий.
Manifest hash продолжает связывать dataset с правилами его cutoff.

**Честный остаточный риск:** source допускает новый ненулевой id без знания его
семантики. Невозможно проверить произвольный будущий off-chain decoder в этом
контракте. Ошибочный/неподготовленный id от уполномоченного publisher потребует
исправленного выпуска индексера и может остановить новые datasets с активации.
Нет автоматического skip/cancel или обещания восстановить любую ошибку. Обычный
prepare отклоняет неизвестный id до send; прямой авторизованный вызов может его
обойти. Устранён arbitrary JSON/parser payload, не вся власть publisher над доступностью.

## Admission и cutoff

`buy-policy-admission.cjs` сверяет chain/anchor, pinned runtime, schema, genesis
adapters, immutable identity/authority/notice, все finalized events с receipt и
block provenance, typed commitment chain и completeness getters. Publisher может
быть контрактным кошельком: внешний tx.from не подменяет source.msg.sender.

`buy-policy-format.cjs` восстанавливает manifest из trusted genesis и известных
ids, не принимает произвольные поля от publisher. Прошлые routes не заменяются.
Неизвестный будущий id возвращается в pendingAdapters, а текущая политика работает.
На cutoff >= его fromBlock старый decoder выдаёт `BUY adapter update required`.
При запросе старого cutoff после новой активации прежний manifest доступен;
полная цепочка announcements всё равно проверяется. Returned history применима
к admitted cutoff, не является разрешением сканировать будущие блоки.

Scheduler проверяет сохранённые jobs на их собственном cutoff до загрузки новой
политики для нового dataset. Поэтому неизвестная активная версия не блокирует
завершение ранее frozen Short/Monthly. Отключение source/RPC всё ещё может мешать
admission; offline bypass для исполнения не добавлен.

## Режим доверия

`resolveBuyPolicy` при наличии buyPolicy возвращает `policyStatus.mode=admitted`.
Без trust публичная конфигурация и любой v2 genesis отклоняются по умолчанию.
Для read-only исследования разрешено явно `buyPolicyMode: "unadmitted"`:
это отдельный результат, не проверенное обновление публичного instance.
`buyPolicyMode: "admitted"` требует trust; конфликт mode/trust отвергается.
Только прежний v1 genesis chain31337 сохраняет local fixture compatibility;
он также маркируется unadmitted. Удаление trust из существующего scheduler config
дополнительно меняет identity и не допускается сохранённым state.

RPC replay-direct-buy/replay-attempts и Short/Monthly verifiers публикуют
policyStatus отдельно от artifact/ledger hashes. Offline evidence тоже unadmitted.
Сверка ledger проверяет содержимое, не принимает provenance label чужого файла
за собственную аттестацию. Разрешение deployment должно закреплять доверенный
источник вне редактируемых research inputs; production deployment пока отсутствует.

## Выпуск расширения

1. Подготовить adapter, version id, проверяемый runtime/settlement и vectors.
2. Обновить индексер/verifier; проверить реальные примеры и отрицательные случаи.
3. `prepareBuyPolicy` восстанавливает previous, проверяет единственное расширение,
   mining margin, exact typed eth_call и estimateGas. Возвращает nextHash цепочки
   отдельно от manifestHash; receipt не переоценивается как доказательство finality.
4. Опубликовать future activation. `publishBuyPolicy` сохраняет intent/nonce до
   send, затем hash; неизвестный исход не отправляется автоматически повторно.
5. Прежние покупки/frozen commitments не переписывать; сообщить пользователям
   действующую границу поддержки. Отдельного реестра кандидатов нет.

CLI `run-buy-policy-publication.cjs` готовит bytes; send остаётся local31337 с
exclusive журналом. Контрактный publisher отправляет подготовленный вызов своим
механизмом. Его полномочия, production notice и finality ещё не утверждены.

## Открытые границы

Независимый replay persisted dataset до первого begin остаётся отдельным
релизным gate: сверка policy hash и checksum не доказывает список участников.
Нет live deployment/migration JSON source, новых route adapters, oracle, отмены
активации, сайта или production RNG. Локальные venue/RNG fixtures не изменены.

## Проверки пакета typed source, 24.09.2026

Адресный compile-once запуск через test-launcher.runTests:

```js
runTests({profile:'buy-policy-targeted', selection:{compile:true, files:[
  'test/participant-registry.test.cjs', 'test/direct-buy.test.cjs',
  'test/attempt-lifecycle.test.cjs', 'test/monthly-replay.test.cjs',
  'test/local-scheduler.test.cjs'
]}})
```

62 сценария: 60 прошли, 2 упали из-за старого mock event ABI и ожидания нового
цикла в том же terminal pass. Тесты исправлены; первая проверка не названа зелёной.
Evidence `.local/logs/test-run-Q62Tdr/result.json`, 247.4 s, compile 16.2 s.
Финальная адресная проверка:

```js
runTests({profile:'buy-policy-final', pattern:'policy admission|BUY CLI|unknown activated BUY',
 selection:{compile:true,files:['test/direct-buy.test.cjs','test/local-scheduler.test.cjs']}})
```

3/3, exit 0, 46.1 s включая compile 17.6 s:
`.local/logs/test-run-yfL2lu/result.json`. Включены оба исправленных сценария и
дополнительный child CLI тест. После этого продуктовый код не менялся, кроме
try/finally cleanup RPC provider в replay-attempts, проверенного syntax и example CLI.
Это совокупные адресные результаты, НЕ полный baseline на HEAD.
Дополнительно offline attempts CLI выдаёт unadmitted; syntax/links/diff проверены.
Full/fork/live sends не запускались. Во время тестов только локальная chain31337.
Typed announce: 97443 gas / 100 calldata bytes в локальном fixture; не цена сети.
