# Текущий ответ GPT

Обновлено: 15.09.2026.
Просмотрен latest implementation commit `8747e97265657e426e3f948a6bba7a8c8c4d9cf2` (`direct BUY decoding and reproducible entry replay`).

Тема: **следующий пакет после BUY → entries: attempt lifecycle + cutoff/replay**.

Владелец согласовал это направление как следующий логичный этап. Не открываем заново payer/recipient, nominal 100 USDG и narrow direct route. Production RNG и полный controller пока не писать.

## Почему следующий шаг именно этот

На текущем этапе уже доказана цепочка:

```text
registered wallet
+ supported direct TOKEN/USDG BUY
→ deterministic grossQuoteRaw
→ carry
→ minted short attempt
→ minted monthly attempt
```

Но текущий ledger хранит только накопительные:

```text
shortAttemptsMinted
monthlyAttemptsMinted
```

и сам `DIRECT_BUY_REPLAY.md` правильно предупреждает: это **не available attempts после draws**.

Следующая недостающая граница — доказуемо восстановить жизненный цикл попыток:

```text
OPEN
→ FROZEN(drawId)
→ CONSUMED
```

отдельно для Short и Monthly.

Главная цель этапа:

> независимо воспроизвести из публичной истории, какие attempts на конкретном cutoff были доступны draw, какие были заморожены, какие уже использованы и какие новые BUY остались следующему OPEN.

---

## Базовая семантика, которую надо сохранить

### Mint

Каждая новая entry одновременно создаёт:

```text
+1 short attempt
+1 monthly attempt
```

Они дальше живут независимо.

### Short freeze

При freeze конкретного Short draw:

- берутся только short attempts, доступные на его cutoff;
- monthly attempts не затрагиваются;
- attempts, появившиеся после cutoff, остаются в следующем OPEN;
- пока draw pending, frozen attempts нельзя использовать во втором Short;
- новых Short attempts это не блокирует.

### Monthly freeze

То же отдельно для monthly attempts.

Short freeze/settlement не расходует monthly; monthly не расходует short.

### Skip / not ready

Если draw вообще не стартовал:

```text
attempts остаются OPEN
```

Никакого consumption только потому, что прошёл checkpoint.

### Pending RNG

Если snapshot уже frozen, но random не доставлен:

```text
attempts остаются FROZEN
```

Не возвращаем их в OPEN и не считаем проигравшими.

### Terminal random / settlement

Если random реально состоялся и draw завершён терминально:

```text
все участвовавшие frozen attempts этого типа → CONSUMED
```

включая проигравших и случай no-winner.

Claim не меняет attempt state.

---

## Cutoff — ключевая граница

Следующий компонент должен ввести точную границу draw:

```text
cutoffBlockNumber
cutoffBlockHash
```

и domain конкретного draw.

Snapshot строится строго по истории, каноничной **до cutoff включительно/по явно выбранному правилу**. Не использовать wall-clock, `latest` или произвольное текущее состояние БД.

Пример обязательной семантики:

```text
Short #17 frozen at cutoff H

wallet имел 2 OPEN short attempts к H
→ эти 2 входят в #17

после H wallet покупает ещё на 300 USDG
→ +3 short attempts
→ они уже OPEN для будущего #18
→ они не могут попасть в #17

monthly attempts от обеих покупок продолжают жить отдельно
```

Если нужно выбрать inclusive/exclusive правило относительно конкретного block/log, выбрать одно каноническое правило и version it. Предпочтение: cutoff block/hash задаёт последний block, полностью включённый в replay.

---

## Не сводить модель к одному числу `available`

Нужен ledger переходов, а не только derived balance.

Условно для wallet:

```text
short:
  mintedTotal
  open
  frozenByDraw
  consumedTotal

monthly:
  mintedTotal
  open
  frozenByDraw
  consumedTotal
```

Но source of truth — история mint/freeze/terminal transitions, а не сохранённые aggregate counters.

Инвариант по каждому типу:

```text
mintedTotal = open + frozen + consumedTotal
```

и одна attempt не может находиться более чем в одном состоянии.

Не требуется выдавать каждой attempt отдельный NFT/id. Можно использовать cumulative accounting/ranges, если оно остаётся однозначно воспроизводимым.

---

## Что должно быть публичным входом replay

Текущий BUY replay остаётся первой частью.

Добавить draw lifecycle occurrences, которые verifier может получить независимо:

```text
FREEZE
- drawId
- kind SHORT|MONTHLY
- cutoff block/hash
- snapshot/rules version
- commitment/hash будущего snapshot либо пока тестовый deterministic marker

TERMINAL
- drawId
- kind
- terminal result marker
- ссылка на тот же frozen snapshot
```

На этом этапе не надо доказывать fairness random и winners. Но переход `FROZEN → CONSUMED` должен происходить только от события/состояния, которое явно означает состоявшийся terminal random/settlement, а не от timeout.

Если production on-chain controller ещё отсутствует, допустим fixture/event stream, но формат должен быть близок к будущему production lifecycle и не должен давать indexer права молча переписывать историю.

---

## Минимальный reducer

Псевдологика:

```text
replay BUYs
→ mint short/monthly attempts

on FREEZE(drawId, kind, cutoff):
  derive eligible OPEN state exactly at cutoff
  bind it to draw
  move selected attempts OPEN → FROZEN(drawId)

on TERMINAL(drawId, kind):
  require matching pending freeze
  move all FROZEN(drawId) → CONSUMED
```

Новые BUY после cutoff продолжают обычный mint в OPEN.

Для одного pending Short и одного pending Monthly не разрешать повторный freeze того же kind, пока предыдущий не terminal.

Пропущенные checkpoints не создают synthetic lifecycle events.

---

## Что проверить тестами

Минимальный обязательный набор:

1. `99 + 1 USDG` после регистрации → 1 short + 1 monthly OPEN.
2. Short freeze замораживает short, но monthly остаётся OPEN.
3. BUY после Short cutoff создаёт новые OPEN short/monthly и не меняет frozen старого draw.
4. Второй Short freeze при pending первом запрещён/fail-closed.
5. Monthly может freeze независимо от pending Short, если продуктовая state machine это допускает.
6. Skip/not-ready не создаёт freeze и ничего не расходует.
7. Pending RNG не возвращает attempts и не расходует их.
8. Terminal no-winner всё равно consumes frozen attempts.
9. Terminal winner case consumes ровно тот же frozen набор.
10. Claim никак не влияет на attempts.
11. Duplicate FREEZE/TERMINAL delivery идемпотентна либо конфликтует fail-closed, но не делает double consume.
12. Wrong drawId/kind/cutoff/snapshot reference fail-closed.
13. Reorg, который удаляет BUY до cutoff, меняет frozen snapshot после полного replay новой ветки.
14. Reorg, который удаляет сам FREEZE/TERMINAL, откатывает зависимые transitions.
15. Short consumption не меняет monthly и наоборот.
16. Инвариант `minted = open + frozen + consumed` держится после каждого шага.

Отдельный полезный stress test:

- один wallet с большим числом entries;
- много wallets;
- несколько BUY до/после cutoff;
- verify byte-for-byte deterministic serialization.

---

## Что пока НЕ делать

- не выбирать production RNG;
- не назначать winners;
- не проектировать challenge/ZK;
- не менять `ParticipantRegistry`;
- не расширять supported BUY routes;
- не добавлять Luck;
- не принимать production K/weights/D;
- не делать daemon/finality policy частью этого шага;
- не добавлять timeout, который возвращает frozen attempts после известного random;
- не добавлять admin reset attempts.

---

## Рекомендуемый один пакет работ

Название условно:

```text
attempt-lifecycle-replay-v1
```

Состав:

1. Versioned data model для lifecycle occurrences.
2. Pure deterministic reducer поверх текущего direct BUY ledger.
3. Fixture/event source для FREEZE/TERMINAL без pretending, что это production controller.
4. Canonical serialization + hash результата.
5. Replay tests на cutoff, pending, new BUY, terminal consumption, duplicate/reorg.
6. Документ с чёткой границей: minted/open/frozen/consumed.

### Acceptance criteria

Этап готов, если независимый replay из одной и той же публичной истории однозначно отвечает:

```text
для каждого wallet и каждого kind:
- сколько attempts minted
- сколько OPEN
- какие заморожены и в каком draw
- сколько CONSUMED

для каждого draw:
- точный cutoff block/hash
- точный frozen participant/attempt snapshot
- terminal или pending
```

и невозможно:

- использовать attempt дважды;
- засунуть post-cutoff BUY в старый draw;
- расходовать monthly через Short;
- вернуть attempt после terminal random;
- расходовать attempt при skip/not-ready;
- потерять/добавить attempts из-за duplicate ingestion.

---

## Что подумать Codex перед кодом

1. Лучше ли представлять attempts как cumulative ranges/epochs вместо индивидуальных ids, сохраняя строгий replay?
2. Как минимально моделировать lifecycle events сейчас, чтобы потом не выбросить формат при production controller?
3. Как domain-separate Short/Monthly/drawId/schema, чтобы один freeze нельзя было переиспользовать в другом draw?
4. Как лучше связать cutoff с текущим `direct-buy-ledger-v1`: embed head/cutoff hash, derive sub-ledger до cutoff или новый combined schema?
5. Какие конфликты/reorg cases требуют hard halt, а какие можно безопасно пересчитать полным replay?

Сначала предложить минимальную структуру и failure cases. Код можно добавлять в этом пакете, если дизайн остаётся узким и не тянет за собой RNG/controller целиком.