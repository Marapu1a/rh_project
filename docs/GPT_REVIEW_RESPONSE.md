# Текущий ответ GPT

Обновлено: 15.09.2026.
Просмотрен latest commit `e2e27ed48a3ede3c8171e3bba8f21d92f4da4747` — `study permissionless Short streaming without participant cap`.

Фактически прочитаны `SHORT_SETTLEMENT_SCALING_STUDY.md`, `ShortStreamingStudy.sol`, streaming tests/fixtures, scaling/RPC evidence, текущий `GPT_REVIEW_REQUEST.md` и `IMPLEMENTATION_STATUS.md`. GitHub CI/status для commit пусты; заявленные `110/110` tests и локальные scaling runs в этом проходе мной независимо не запускались.

Тема: **ревью streaming study и следующий production-oriented dataset-preparation шаг**.

## Короткий вердикт

Исследование получилось действительно полезным. Главный вывод поддерживаю:

> продуктовый MAX_N не нужен; текущую probability semantics можно сохранить для всех N, распределив полный scan по permissionless транзакциям.

Прототип доказал важную вещь: ограничение было свойством single-tx verifier, а не лотереи.

Для `N=5000, K=10` отдельная транзакция осталась около 1.04M gas, при этом все 5000 wallets участвуют в одном snapshot и одном seed. Цена — ~74.9M суммарного gas и 162 tx, то есть масштабирование переносит работу во время/число вызовов, а не делает её бесплатной.

Математическая композиция local top-K → global top-K корректна. Существенной ошибки в study state machine, которая ломала бы заявленный результат, я не вижу.

Но перед переносом этого подхода в будущий immutable controller есть один **особенно важный архитектурный invariant**, который стоит зафиксировать сейчас.

---

## 1. Completeness / global top-K

Индукция корректна.

Для любого chunk:

```text
x не входит в topK(chunk)
→ внутри этого же chunk уже есть минимум K admitted candidates лучше x
→ x не может войти в global top-K
```

Следовательно:

```text
topK(topK(prefix) ∪ topK(chunk))
= topK(prefix ∪ chunk)
```

при одном и том же полном порядке `(rank, wallet)`.

Прототип сохраняет необходимые условия:

- publication проверяет строгий global wallet order между chunks;
- каждый publication chunk получает immutable hash;
- processing требует точный следующий `index`;
- chunk payload должен совпасть с сохранённым hash;
- replay/duplicate/replacement/out-of-order отвергаются;
- `processed == count` и `nextChunk == chunkHashes.length` нужны до result/finish;
- admittedCount складывается по всем chunks;
- local winners ShortOutcome уже отсортированы тем же `(rank,wallet)`.

Простого сценария omission/replay, проходящего эти проверки без hash collision или нарушения EVM state, я не вижу.

---

## 2. HIGH для будущего controller: execution path не должен менять random outcome

Это не дефект study fixture, но критическая граница до production.

Сейчас V2 single-tx и streaming study используют **разные participant commitments / context domains**:

```text
V2: flat abi Participant[] hash + SHORT_COMMITMENT_V2
study: ordered rolling root + SHORT_STREAM_CONTEXT_STUDY_V1
```

Для исследования это правильно: публичных обязательств V2 нет, и делать вид, что rolling root — drop-in-compatible hash, не надо.

Но если будущий immutable controller поддерживает одновременно:

```text
fast single-tx path для малого N
и
streaming path для большого N
```

то выбор transport/execution path **не должен менять context, admission hashes, winner ranks или prize permutation**.

Иначе после появления seed потенциально можно выбрать из двух технических путей тот, который даёт более выгодных winners, даже если оба пути по отдельности «честные».

Production invariant:

```text
один canonical draw context
+ один canonical participant commitment
+ один seed
→ один outcome

execution mode влияет только на способ вычисления/проверки результата.
```

Поэтому перед production лучше выбрать новый canonical dataset commitment format (rolling root допустим) и заставить **и single-tx, и streaming** использовать один и тот же context/result domain.

Single-tx тогда просто вычисляет тот же root из полного массива за один вызов; streaming — получает тот же root порциями.

Это важнее byte-for-byte совместимости со старым исследовательским V2.

---

## 3. Publication calldata + chunkHashes: достаточно для механики completion, но не считать это вечной DA

Для ближайшего draw схема работает:

```text
publication tx calldata
+ on-chain chunk hashes/indexes
→ третья сторона восстанавливает exact chunks
→ permissionless process/finish
```

Тест с исчезнувшим исходным executor это показывает.

Но root/chunk hashes сами данные не хранят. Для production manifest я бы требовал минимум:

- draw/proposal id;
- cutoff block number/hash;
- root/count/totalAttempts;
- ordered list publication tx hashes;
- chunk index/hash/count;
- canonical snapshot/artifact content hash;
- как минимум один полностью скачиваемый content-addressed artifact;
- recovery command, которая умеет восстановить dataset из собственного RPC и сравнить root.

Для практической устойчивости разумно автоматически зеркалировать artifact минимум в два независимых места/хранилища. Это не consensus и не источник истины — просто availability.

Архивный RPC полезен, но один provider не должен быть единственной долговременной копией. Особенно на rollup нельзя путать факт DA для состояния сети с обещанием, что удобный `eth_getTransactionByHash` конкретного провайдера будет доступен через годы.

Для permissionless **completion** требования мягче: данные должны гарантированно быть доступны в период pending draw. Для долгосрочного **audit** нужен зеркалируемый artifact.

---

## 4. Rolling root вместо Merkle — сейчас нормальный выбор

Для последовательного scan Merkle tree не нужен для correctness.

Текущая схема уже имеет:

```text
canonical order
→ append-only rolling root
→ exact per-chunk hash
→ strict processing index
```

и этого достаточно, чтобы доказать полный последовательный проход опубликованного dataset.

Конкретная выгода Merkle появится, если захочется:

- не хранить `O(chunks)` chunkHashes в contract storage;
- разрешить processing chunk'ов с membership proofs без заранее сохранённого каждого hash;
- изменить модель на non-sequential/arbitrary work distribution.

Но это не бесплатное улучшение: proofs увеличат calldata/hash work и усложнят manifest/verifier.

При `5000 / 64 ≈ 79` chunk hashes текущая схема вполне приемлема как первая production architecture. Однако при Short каждые часы permanent storage со временем накапливается. Перед deployment стоит измерить lifetime state cost и решить: очищать finished chunkHashes, хранить Merkle root либо принять storage cost. Это optimization decision, не причина менять study вывод.

---

## 5. Cutoff BEGIN → SEAL

Проверять старый `blockhash(cutoff)` повторно на SEAL после 256 блоков не нужно.

BEGIN уже существует только в ветке, где:

```text
blockhash(cutoff) == committed cutoffHash
```

Если canonical chain reorg удаляет этот ancestor, он удаляет/переигрывает и зависимое BEGIN state. Поэтому повторная EVM blockhash-проверка через 300 блоков не добавляет безопасности.

Production policy всё равно должна определить **когда cutoff вообще разрешено anchor'ить** — это отдельный finality/readiness gate.

Я бы разделил:

```text
eligibility/finality policy
→ разрешает BEGIN(cutoff)

dataset preparation
→ может длиться сколько нужно

SEAL
→ проверяет уже committed root/count/readiness и резервирует деньги
```

И не использовать SEAL как момент активации новых rules. Rules epoch для attempt должен решаться отдельно; замечание pre-freeze audit про BUY между cutoff и freeze остаётся в силе.

---

## 6. Минимум для verifier следующего модуля

Verifier должен строить dataset сам, а не проверять только то, что дал publisher.

Минимальная цепочка:

```text
own RPC
→ registration + canonical BUY replay
→ carry / attempts / previous consumption
→ exact OPEN Short snapshot at cutoff
→ canonical Participant[]
→ ordered root + count + totalAttempts
→ compare proposal/manifest
→ compare every published chunk/hash/order
→ compare on-chain READY/SEAL context
```

После появления seed:

```text
→ full independent Short outcome
→ compare streaming progress/final resultHash
→ compare PromoVault assigned rewards/finalize
→ compare AttemptsConsumed
```

То есть next verifier artifact должен связывать не только `root`, а:

```text
chain/instance/draw/schema
cutoff number/hash
rules payload/hash
basket/D
snapshot hash
ordered root/count/totalAttempts
publication txs/chunks
seed evidence
resultHash
vault settlement
```

до seed часть результата, естественно, остаётся незаполненной.

---

## 7. Подготовка proposal и abandoned state

Следующий предложенный пакет поддерживаю:

```text
canonical-dataset-preparation-v1
```

Но production design лучше сразу отделить **proposal/preparation** от **frozen draw**.

Примерно:

```text
PROPOSED
→ PUBLISHING
→ READY
→ SEAL + reserve
→ WAITING_SEED
```

До `SEAL` призовые деньги не reserved и attempts не FROZEN.

Поэтому abandoned/malformed preparation можно безопасно закрыть/протухнуть и начать заново — это не отмена draw, потому что draw ещё не возник.

После `SEAL` никакого cancel/reset/replacement уже нет.

Нужен namespace `proposalId`, чтобы брошенная незарезервированная подготовка не блокировала будущую корректную proposal.

Не надо делать arbitrary delete истории: достаточно пометить superseded/expired proposal, сохранив публичный audit trail.

---

## 8. Исполнитель и экономика gas

На этом этапе **обычного project keeper + публичного recovery runner достаточно**.

Permissionless означает:

> если основной executor умер, другой технически может продолжить тот же draw.

Это не означает, что анонимный пользователь обязан бесплатно оплачивать 75M gas.

Не вижу причины сейчас:

- платить bounty из prize vault;
- вводить fee для участников;
- добавлять отдельную on-chain executor economy.

Основной keeper оплачивается из операционного бюджета проекта, как уже принято для RNG/RPC/executor costs. Recovery runner/documentation нужен как резерв.

Если после реальных fee measurements execution станет материальной статьёй расходов, тогда отдельно проектировать reimbursement из **project funds**, не из frozen prize budget.

---

## 9. Ещё два практических замечания

### Chunk size

`MAX_CHUNK=64` — хороший study bound, но пока не production constant.

Перед immutable deployment полезнее сделать небольшой sweep 32/64/128/256 на реальной целевой VM/fee model и выбрать bound с большим запасом. Это transport limit, не число участников draw.

### Документ IMPLEMENTATION_STATUS

Фраза про `PromoVault` «полная финализация списком O(N)» теперь двусмысленна: vault finalize линейный по числу **winners**, то есть фактически O(K), а N participant scan находится в outcome layer. Лучше позже переименовать, чтобы снова не смешивать participant N и award K.

---

## Следующий один пакет

Я бы действительно не шёл ещё в RNG.

Следующий узкий пакет:

```text
canonical-dataset-preparation-v1
```

Acceptance:

1. Proposal фиксирует chain/instance/cutoff/schema/rules/basket-policy и ожидаемый canonical snapshot identity.
2. Publisher порциями публикует canonical Participant data; invalid order/ranges/vault recipient reject до reserve.
3. Contract сам получает actual root/count/totalAttempts.
4. Verifier из собственного RPC получает **те же** root/count/snapshot без доверия API.
5. `READY` возможно только при полном dataset.
6. `SEAL` атомарно резервирует USDG и создаёт immutable frozen context.
7. Abandoned preparation можно заменить только пока денег/attempt freeze ещё нет.
8. После SEAL dataset/rules/cutoff/context неизменяемы.
9. Manifest + tx list + downloadable artifact позволяют другому оператору восстановить весь dataset.
10. Формат commitment уже выбран как будущий canonical format и одинаков для будущих fast/streaming execution paths.

Последний пункт особенно важен: **не цементировать два разных seed→winner mappings для fast и streaming**.

После этого уже можно вернуться к rules activation, затем seed authentication/production terminal.

## Итог

`e2e27ed` отвечает на главный вопрос исследования положительно:

> все eligible wallets можно оставить в одном Short без product cap и без изменения q(e), если заменить single huge settlement на bounded permissionless scan.

Streaming здесь выглядит не временным workaround, а вполне нормальной базовой архитектурой.

ZK сейчас не нужен; optimistic challenge добавляет больше trust/liveness условий, чем решает; Merkle не обязателен для последовательной модели.

Главное перед production — сделать dataset preparation/replay единым каноническим слоем и гарантировать, что способ исполнения (fast или streaming) **никогда не влияет на outcome**.