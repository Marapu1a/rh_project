# Текущий ответ GPT

Обновлено: 15.09.2026.
Просмотрен latest commit `9bdbe7239771ebbc0c36ca95d09000e2b394ac84` — `audit pre-freeze validation and settlement capacity`.

Тема: **масштабируемость Short без продуктового лимита участников**.

## Уточнение владельца

Важно не перепутать технический предел текущей реализации с продуктовым правилом.

Владелец **не принимает MAX_N как ограничение количества участников розыгрыша** и не хочет сейчас вводить FIFO/очереди/исключение части eligible wallets только потому, что один EVM settlement становится тяжёлым.

Базовое ожидание продукта:

```text
если на cutoff есть N eligible OPEN wallets,
то все N должны участвовать в этом Short draw
```

независимо от того, N=100, 1 000, 10 000 или больше.

Если текущая архитектура `передать весь Participant[] → пересчитать всех → finalize в одной tx` перестаёт масштабироваться, это в первую очередь проблема **способа верификации/settlement**, а не основание менять смысл участия.

Поэтому предыдущую идею `MAX_N` следует трактовать только как временный safety observation для нынешнего fixture, а не как желаемое product rule.

---

## Что показал pre-freeze audit и что принимаем

Аудит `9bdbe72` полезный и его findings принимаются:

- нельзя freeze только ненулевой hash, не валидируя payload, если terminal потом требует более строгий формат;
- `Participant[]` должен быть canonical/valid до reserve либо архитектура должна гарантировать эквивалентную проверку;
- техническая стоимость зависит совместно от N и K;
- нельзя silently drop лишних участников;
- нельзя использовать timeout/no-win/new seed как recovery;
- current atomic path при N=1000..2000 ещё работает локально, но это не production bound.

Отдельно согласен с замечанием, что `participantCount`, сообщённый оператором рядом с hash, сам по себе ничего не доказывает. Если count используется для safety gate, он должен вытекать из проверенного committed payload.

---

## Главный вопрос Codex

Нужно теперь не сразу чинить `MAX_N`, а **исследовать архитектуру, в которой все eligible participants остаются участниками, даже когда N перестаёт помещаться в одну settlement transaction**.

Иными словами:

> Как сохранить текущую проверяемость, один frozen snapshot, один authenticated seed, отсутствие reroll и полный набор участников, но убрать зависимость `весь N обязан быть обработан одной EVM-транзакцией`?

Это исследовательский пакет. Не менять production contracts до вывода.

Условное название:

```text
short-settlement-scaling-study-v1
```

---

## 1. Сначала установить реальную границу текущей схемы

Нужно отделить:

```text
теоретический EVM/block limit
реальный Robinhood Chain protocol limit
RPC/provider/mempool/tx-size limit
разумный operational safety margin
```

Проверить на актуальной Robinhood Chain, насколько возможно без публичных денежных операций:

- current block gas limit и наблюдаемый gas usage блоков;
- существует ли отдельный tx gas cap;
- practical/max calldata or transaction size limit;
- ограничения RPC `eth_estimateGas` / sendRawTransaction у доступных providers;
- L1/data cost, если для Robinhood Chain он релевантен;
- есть ли chain-specific execution constraints, которые Hardhat 60M block gas не моделирует.

Не выводить лимит из одного документа или одного RPC: сохранить источники/блок/дату и различать protocol constraint и provider policy.

После этого дополнить local/fork measurements:

```text
N = 1000, 2000, 5000, ... до явной границы
K = 1, 10, 32, 64
```

но не бесконечной сеткой. Нужны:

- worst/conservative insertion path;
- calldata size;
- verification gas;
- finalize gas;
- full transaction gas;
- запас под будущую seed authentication/controller logic.

Цель — понять, насколько далеко реально тянется нынешний простой atomic design.

---

## 2. Проанализировать, что именно заставляет нас делать O(N) on-chain

Текущий ShortOutcome semantics:

```text
для каждого wallet:
  проверить admission hash против q(entries)

из admitted:
  найти глобальные top-K по rank

отдельно:
  permutation корзины
```

Нужно явно ответить:

> Можно ли доказать тот же самый outcome без проверки всех N wallets on-chain?

Если нет без succinct proof / challenge mechanism — так и написать.

Особенно важно отличать:

- доказательство membership одного winner;
- доказательство, что winner admitted;
- доказательство, что **нет omitted admitted wallet с лучшим rank**;
- доказательство completeness всего результата.

Обычный Merkle proof winner'а решает только первые пункты и не доказывает глобальный top-K.

---

## 3. Сравнить архитектурные варианты, не выбирать заранее самый модный

Нужен сравнительный разбор минимум четырёх классов.

### A. Текущий single-tx full verification

```text
full Participant[]
→ one tx
→ outcome
→ finalize
```

Плюсы: минимальная trust surface, простая атомарность.

Минусы: O(N*K) work + O(N) calldata.

Нужно определить реальный practical ceiling и понять, может ли он быть достаточен для MVP/ранней жизни проекта.

### B. Permissionless multi-tx / streaming verification

Идея:

```text
snapshot + seed уже immutable
→ participants обрабатываются диапазонами/chunks
→ контракт хранит progress + текущий top-K
→ любой может продолжить следующий chunk
→ после обработки всех N permissionless finalize
```

Нужно проверить:

- как контракт доказывает, что chunk — именно следующий кусок frozen canonical list;
- как не позволить пропустить participant;
- как обеспечить data availability без доверия operator после seed;
- можно ли использовать Merkle root/list commitment + proofs;
- gas/storage стоимость;
- что происходит, если никто не продолжает execution;
- разрешены ли duplicate/out-of-order chunks;
- можно ли сохранить **один seed и один outcome**, без reroll;
- как atomic money/attempt semantics меняются, если computation многошаговый.

Особенно интересен вариант, где freeze публикует/commit'ит полный ordered participant dataset, seed появляется после freeze, а дальнейшая обработка полностью permissionless.

### C. Off-chain compute + on-chain succinct proof

Например ZK/SNARK/STARK либо иной succinct proof полного:

```text
participants commitment
+ rules
+ seed
→ exact resultHash
```

Нужно оценить не лозунгами, а конкретно:

- что является public input;
- можно ли доказать current q(e)+top-K algorithm;
- proving time / infra;
- on-chain verification gas;
- circuit/tooling complexity;
- trusted setup, если нужен;
- насколько это чрезмерно для MVP;
- можно ли добавить такой verifier позже без изменения product semantics/frozen obligations.

### D. Optimistic / challenge architecture

```text
operator publishes result
→ публичное окно challenge
→ fraud proof при неправильном outcome
```

Нужно объяснить, какой минимальный fraud proof действительно способен доказать **omission/global top-K error**, а не только неправильного конкретного winner.

Если это почти так же сложно, как полноценный proof system — сказать прямо.

---

## 4. Отдельно проверить: стоит ли менять сам outcome algorithm ради масштабируемости

Не предлагать изменение автоматически, но исследовать.

Вопрос:

> Есть ли другой deterministic Short algorithm с тем же продуктовым смыслом — entries повышают шанс, максимум один prize/wallet, fixed basket, один seed — который позволяет доказать winners с O(K log N) или близкой стоимостью вместо O(N)?

Например committed weighted/sum tree, deterministic sampling paths и т.п.

Но сравнение должно честно показать, что меняется относительно текущего:

```text
independent admission q(e)
→ global top-K admitted
→ random basket subset/order
```

Не называть альтернативу эквивалентной, если probability distribution реально другая.

Если нынешняя probability model фундаментально требует full scan для exact verification без succinct proof — это тоже ценный вывод.

---

## 5. Очень важная граница: availability участников

Текущий settlement получает full Participant[] от caller.

Даже если hash frozen, это означает потенциальную operational зависимость:

> кто-то должен после seed снова предоставить полный список.

Нужно решить, хотим ли мы, чтобы frozen draw оставался исполнимым, даже если наш indexer/server исчез.

Варианты исследовать:

- participant list полностью опубликован в freeze calldata/event/artifact;
- deterministic artifact mirrored/content-addressed;
- chunks публикуются on-chain до seed;
- root + гарантированная data availability вне одного нашего сервера;
- иной механизм.

Не утверждать, что Merkle root сам обеспечивает availability: он этого не делает.

Желательная цель:

> после успешного freeze и доставки seed третья сторона должна иметь достаточно публичных данных, чтобы довести draw до terminal без участия нашей инфраструктуры.

---

## 6. Никакой очереди/обрезания как скрытого workaround

В рамках этого исследования не использовать как основное решение:

```text
первые MAX_N участвуют
остальные ждут
```

или:

```text
случайно/по FIFO выберем cohort
```

Это меняет product semantics и сейчас владельцем не принято.

Также не использовать:

- discard wallets;
- split одного Short draw на несколько независимых seed;
- reroll;
- emergency no-winner;
- admin cancel;
- перенос frozen денег назад;
- уменьшение уже frozen participant set.

Если в итоге выяснится, что без product-level cohorting практического решения нет, это должно быть **отдельным выводом с доказанной причиной**, а не предпосылкой.

---

## 7. Какой результат исследования нужен

Не нужен новый production controller прямо сейчас.

Нужен документ/отчёт с:

1. фактическими лимитами/наблюдениями Robinhood Chain и сохранёнными evidence;
2. аналитикой текущей сложности по N/K;
3. practical ceiling нынешнего single-tx path с safety margin, без объявления его product cap;
4. сравнением A/B/C/D по trust, complexity, gas, data availability, recovery, совместимости с one-seed/no-reroll;
5. рекомендацией:
   - оставить single-tx для MVP и заранее подготовить migration path;
   - перейти на permissionless streaming;
   - использовать succinct proof;
   - либо другой вариант;
6. ответом, можно ли будущий scaling mechanism добавить **без изменения already frozen/public product semantics**;
7. одним маленьким следующим implementation package после исследования.

Желательно отдельная таблица:

| Подход | Все N участвуют | Один seed | Permissionless completion | On-chain complexity | Off-chain trust | Data availability | Можно добавить позже |
|---|---|---|---|---|---|---|---|

---

## Рабочая гипотеза GPT, которую надо попытаться опровергнуть

На данный момент я бы предположил:

```text
малые/средние N:
single-tx full verification лучше всего

большие N:
product semantics менять не надо;
надо менять verification architecture
```

При этом самым интересным промежуточным вариантом выглядит permissionless multi-tx processing frozen list с одним seed и строгим progress, **если** удаётся обеспечить completeness + data availability без новой доверенной роли.

Но это именно гипотеза. Codex просьба не подгонять вывод под неё: если ZK объективно чище либо single-tx имеет гораздо больший реальный запас, показать это цифрами.

## Пока не делать

- не менять `PRODUCT_SPEC` под MAX_N/cohorting;
- не вводить production participant cap;
- не реализовывать FIFO;
- не подключать RNG provider;
- не менять probability model;
- не переписывать controller/contracts до архитектурного вывода;
- не добавлять batching/Merkle просто потому, что они известны.

Сначала исследование масштабирования и доказательств. После него вернёмся к pre-freeze validation и rules activation уже с пониманием конечной settlement architecture.