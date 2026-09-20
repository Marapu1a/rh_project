# Текущий ответ GPT

> Архив на 19.09.2026: исторический отчёт/обсуждение, не текущий план и не самостоятельная спецификация.
> Начало работы: [CURRENT_CONTEXT](../../CURRENT_CONTEXT.md). Условия и выводы ниже относятся к указанному этапу.

Обновлено: 18.09.2026.

Просмотрен latest commit `307c790a625cbeca3465e71f2ec22a0c9de1be81` — `Use Robinhood L2 identities for draw cutoffs and epoch boundaries`.

Прочитаны `ROBINHOOD_BLOCK_SEMANTICS.md`, `ChainBlocks.sol`, изменения в Short/Monthly, Nitro fixture/tests, RPC evidence и текущий `GPT_REVIEW_REQUEST.md`. GitHub CI/status для commit пусты. Заявленные проверки repo: прежний full suite 167/167, отдельный Nitro suite 5/5, RPC checks 2/2 и dual size/deployment gate passed. Объединённый новый `npm test` на 172 tests в этом проходе мной независимо не запускался и, согласно repo, после добавления пяти Nitro tests ещё не запускался.

## Короткий вывод

Предыдущий L1/L2 blocker исправлен по сути правильно.

Теперь Short/Monthly on-chain boundaries и off-chain replay используют одну координатную систему: Robinhood **L2 block number + L2 block hash**. Для chainId 4663/46630 helper получает L2 height/hash через фиксированный ArbSys `0x64`; fallback на Solidity `block.number/blockhash` при сбое ArbSys отсутствует.

В просмотренных основных компонентах конкретного оставшегося пути смешать L1 и L2 identity я не нашёл.

Это исправляет **идентичность блока**, но не finality. Следующий отдельный вопрос остаётся прежним: как frozen draw необратимо привязать к одному будущему drand round так, чтобы target нельзя было переиграть.

---

## 1. ChainBlocks выглядит корректно для принятого scope

На Robinhood:

~~~text
number()
-> ArbSys(0x64).arbBlockNumber()

recentHash(n)
-> только completed age 1..256
-> ArbSys(0x64).arbBlockHash(n)
~~~

На остальных chain IDs остаётся обычная EVM semantics.

Мне нравится fail-closed поведение:

- неизвестный/current/future/старше 256 -> zero;
- zero hash caller не принимает;
- если ArbSys отсутствует/revert'ит внутри допустимого окна -> весь вызов revert;
- никакого тихого fallback в L1 identity нет.

Это важно: ошибка инфраструктуры не превращается обратно в тот самый смешанный L1/L2 режим, который мы исправляли.

RPC evidence на 4663 и 46630 подтверждает именно нужное поведение: `arbBlockNumber()` совпал с RPC L2 height, отличается от native Solidity `block.number`; hashes для ages 1 и 256 совпали с RPC block hashes, age 0/future/257 дали zero.

Это read-only state-override evidence, не deployment и не finality proof — repo это формулирует корректно.

---

## 2. Основные Short/Monthly границы переведены последовательно

Проверены изменения в:

- `ShortDrawCommitment`;
- `ShortDatasetPreparation`;
- `ShortRulesEpochs`;
- `MonthlySettlement`.

Исправлены не только cutoff checks, но и места, которые легко было забыть:

~~~text
genesis firstBlock
activation B+1
empty cutoff
terminal block
legacy freezeBlock
~~~

Это важно, потому что оставить хотя бы один `firstBlock = block.number` означало бы снова смешать replay L2 attempts с L1-like contract boundary.

В текущем `contracts/` прямых production-use `block.number/blockhash` для этих identities больше не вижу: они изолированы в `ChainBlocks`.

---

## 3. Replay менять не требовалось

Это выглядит правильным решением, а не пропущенной миграцией.

Replay/indexer уже использует RPC event/receipt `blockNumber`, то есть L2 height. События и request ABI не менялись. После перехода Solidity стороны на ArbSys contract и replay наконец говорят об одном и том же числе.

Поэтому отдельная lifecycle v5 только ради этого исправления не нужна.

Nitro regression специально разносит:

~~~text
native EVM number
!=
synthetic L2 number (+1,000,000)
~~~

и проверяет genesis, activation B+1, cutoff, terminal, empty, reorg/retry и legacy path. Это хороший тест именно против возврата старой ошибки.

---

## 4. Окно 1..256 соответствует текущему design

Helper сохраняет прежнее правило:

~~~text
current block    -> нельзя
future           -> нельзя
age 1..256       -> можно
age 257+         -> нельзя
~~~

Новый пакет не пытается незаметно превратить 256 L2 blocks в finality delay. Это правильно.

Отдельно важно: после успешного `begin` cutoff не проверяется повторно при `seal`, даже если прошло >256 блоков. Это не новый дефект — identity уже была проверена и записана при begin, а publication может длиться дольше окна. Nitro test специально это покрывает.

---

## 5. Единственная архитектурная оговорка helper — переносимость

Сейчас Nitro behavior включён только для:

~~~text
4663
46630
~~~

Для другой Nitro chain код пойдёт по стандартной EVM ветке и будет неверен для той сети, пока chain ID не добавлен.

В текущем Robinhood-first deployment это не blocker: scope явно документирован, auto-detection специально отсутствует.

Но deployment checklist должен считать поддержку новой chain отдельной porting task, а не «контракт EVM-compatible автоматически».

---

## 6. Это всё ещё не finality

Исправление отвечает на вопрос:

> какой именно L2 block мы имеем в виду?

Оно НЕ отвечает:

> достаточно ли этот L2 block закреплён на Ethereum, чтобы после раскрытия drand round его нельзя было practically переиграть через pre-finality reorg?

Поэтому названия вроде `confirmations` в research wrappers надо продолжать понимать только как **L2 block distance/readiness**, а не proof of finality.

Правильный L2 hash != L1/Ethereum finality.

---

## 7. Можно ли идти в drand timing/binding study?

Да.

Я не вижу необходимости расширять этот block-semantics package ещё одним механизмом вроде EIP-2935: ArbSys уже даёт ровно тот recent 256-L2-block hash window, который нужен текущему begin/cutoff design и который подтверждён RPC evidence.

Перед следующим package полезно только один раз прогнать новый объединённый `npm test` (172 tests), чтобы старый suite + Nitro tests были подтверждены одной текущей командой. Это regression hygiene, не архитектурный blocker.

---

# Следующий минимальный package: drand-binding-timing-v1

Scope я бы держал узким.

Нужно локально доказать:

~~~text
frozen draw
-> контракт детерминированно получает ровно один future round R
-> caller/admin не передаёт и не выбирает R
-> R ещё не известен в момент допустимого binding
-> после binding R никогда не меняется
-> failed/reorged proof/process tx можно повторить только с тем же R
-> поздняя delivery того же valid proof permissionless
-> если exact R никогда не появляется, draw остаётся pending
~~~

Отдельно зафиксировать finality assumption: что именно production считает достаточной границей до раскрытия R и является ли эта граница on-chain enforced или externally verified/detectable.

Не добавлять в этот шаг:

- provider switching;
- emergency seed;
- новый round по timeout;
- RNG epochs;
- reset/cancel frozen draw;
- изменение prize accounting.

## Итог

`307c790` закрывает найденную L1/L2 identity несовместимость аккуратно и без нового trust surface.

Следующий реальный риск теперь снова тот, ради которого этот фикс понадобился: **future-round/finality binding без возможности target grinding**.

Production RNG provider всё ещё не выбран, но drand feasibility + исправленная Nitro identity дают достаточно оснований переходить к локальному binding/timing study.
