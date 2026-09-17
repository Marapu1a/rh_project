# Текущий ответ GPT

Обновлено: 17.09.2026.

Просмотрен latest commit `7f02b635ac1543f92106c5a4b3fc361e2a107033` — `Cover successive Monthly epochs and document RNG provider feasibility`.

Прочитаны новый RNG study/evidence, `GPT_REVIEW_REQUEST.md`, две M1 → M2 → M3 регрессии и предыдущая Monthly epoch реализация. Дополнительно перепроверены внешние источники по drand evmnet, `randa-mu/bls-solidity`, Quiver, RH-VRF и Dice. GitHub CI/status для latest commit пусты; заявленный Monthly suite `13/13` в этом проходе мной независимо не запускался, и сам repo прямо отмечает, что полный `npm test` после последних двух тестов не повторялся.

## Короткий вердикт

Предыдущий Monthly test gap закрыт нормально. Новые contract+vault и independent replay сценарии реально проходят второй переход `M1 → M2 → M3`, обе ветки `M2 terminal / M2 empty`, сохранение старых policies, остаток старых attempts и последующий M3. Нового конкретного correctness blocker в epoch state machine я здесь не вижу.

А вот RNG действительно вывел нас на более неприятную границу:

~~~text
готовый callback-сервис
→ проще интеграция
→ но почти везде есть withholding / timeout / refund semantics

public beacon (drand)
→ намного лучше ложится на no-reroll
→ но verification + future-round/finality мы берём на себя
~~~

Из просмотренного сейчас **drand evmnet выглядит лучшим структурным кандидатом**, но production-ready вариантом его пока считать нельзя.

Две главные проблемы:

1. найденный Solidity verifier существует и очень точно совпадает с evmnet, но сам автор маркирует библиотеку как **experimental, unaudited cryptographic code**; репозиторий сейчас архивирован;
2. для public beacon недостаточно «выбрать round через 6 секунд». Надо доказать, что frozen draw окончательно зафиксирован **до того, как target round становится известен**, иначе reorg/inclusion timing может превратиться в скрытый выбор randomness target.

Поэтому следующий шаг действительно должен быть **feasibility**, а не production adapter.

---

## 1. M1 → M2 → M3: прежний пробел закрыт

Добавленный контрактный тест проверяет два настоящих successive transitions и сохраняет on-chain policy history. Есть две ветки:

~~~text
M1 → M2
обычный M2 draw
announce M3
activate M3
M2 draining
→ terminal M2
→ M3
~~~

и

~~~text
M1 → M2
...
activate M3
M2 действительно empty
→ closeEmpty(M2)
→ clock не переносится
→ M3
~~~

При этом следующий `announce M4` разрешается только после закрытия M2 draining, а policy entries M1/M2/M3/M4 не перезаписывают друг друга.

Replay regression дополнительно проверяет именно более важную off-chain часть: поздний M2 остаток остаётся M2, M3 attempts не смешиваются с ним, cumulative attempt numbers/conservation сохраняются, Short epochs идут независимо.

То есть главное обещание конструкции теперь проверяется не только на первом переходе:

> история epochs может расти, но одновременно живы максимум old draining + current.

Контракты в этом commit не менялись. Полный suite всё равно разумно прогнать перед следующим кодовым package, но отдельного архитектурного замечания по Monthly я больше не добавляю.

---

# 2. drand evmnet — это не выдуманный experimental endpoint, а реальная mainnet сеть League of Entropy

Официальная drand документация сейчас перечисляет `evmnet` как mainnet network:

~~~text
chain hash:
04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3

period: 3 seconds
scheme: unchained BN254
public keys on G2
~~~

и прямо объясняет мотивацию BN254: совместимость с EVM precompiles.

Источники:

- https://docs.drand.love/developer/
- https://docs.drand.love/developer/API-v2/drand-http-api/

Repo evidence получил тот же chain hash, `bls-bn254-unchained-on-g1`, публичный key и настоящую 64-byte signature из HTTP API. Это хорошая база для test vector, но текущая пометка repo правильная: HTTP response сам по себе ещё не доказан cryptographically.

### Почему модель нам подходит

У drand нет «request, который оператор потом может refund/cancel».

Для draw можно заранее закрепить:

~~~text
immutable evmnet chain/public key
+ exact targetRound
~~~

После публикации этого round **любой** может принести ту же публичную подпись. Keeper не владеет randomness и не может заменить её другой.

Это очень хорошо совпадает с нашей логикой:

~~~text
один frozen draw
→ один target
→ один seed
→ сколько угодно повторных attempts доставить ТОТ ЖЕ proof
~~~

То есть provider/keeper становится liveness transport, а не источником права выбрать результат.

Но остаётся катастрофическая liveness boundary: если сам evmnet перестанет производить beacon или конкретный target round по какой-либо причине никогда не станет доступен, draw остаётся pending. На текущем trust philosophy это всё равно чище, чем автоматически выбирать новый round после timeout. Новый round — уже новый исход и потенциальная reroll-лазейка.

Перед production надо отдельно проверить exact round/outage/catch-up semantics drand: нельзя просто предположить, что любой scheduled round обязательно когда-нибудь будет backfilled.

---

## 3. Нашёлся очень подходящий Solidity verifier — но именно как research input, не как готовый production dependency

`randa-mu/bls-solidity` содержит буквально demo:

~~~text
src/demos/EvmnetRegistry.sol
~~~

который:

- hardcode'ит evmnet public key;
- использует exact DST
  `BLS_SIG_BN254G1_XMD:KECCAK-256_SVDW_RO_NUL_`;
- строит message из round;
- проверяет BN254 BLS signature;
- сохраняет `sha256(signature)` как randomness.

Исходник:

https://github.com/randa-mu/bls-solidity/blob/main/src/demos/EvmnetRegistry.sol

Библиотека MIT:

https://github.com/randa-mu/bls-solidity

И тут важная плохая часть. README самого проекта говорит буквально:

> Experimental, unaudited cryptographic code. Use at your own risk.

Кроме того, GitHub сейчас помечает repository archived/read-only.

Поэтому я бы **не импортировал его как npm/forge dependency и не объявлял вопрос закрытым**.

Хороший путь feasibility:

~~~text
pin exact commit
→ воспроизвести настоящий evmnet vector
→ сравнить с официальным drand verifier/client
→ bad proofs
→ gas
→ Robinhood precompiles
→ затем отдельный crypto/security review
~~~

Если дойдём до production, лучше vendor'ить минимально необходимый pinned verifier code в наш audit scope, а не зависеть от плавающего внешнего package.

### Пустого 0x08 smoke test недостаточно

Это важно поправить в голове до эксперимента.

`BLS.sol` делает не только pairing 0x08. Hash-to-curve использует modular arithmetic/ModExp и ECADD, затем pairing. То есть настоящий test vector должен реально пройти весь verifier на Robinhood/fork.

Иначе:

~~~text
0x08 отвечает 1
~~~

доказывает только существование pairing precompile, а не совместимость всего пути drand verification.

---

## 4. Canonical seed для drand уже очевиден

Я бы не придумывал свой дополнительный randomness transform на границе provider.

Drand публикует randomness как hash подписи; `EvmnetRegistry` также сохраняет:

~~~text
sha256(signature)
~~~

Это можно и использовать как наш `seed`.

Дальше наш Short/Monthly outcome уже domain-separates:

~~~text
context + seed + wallet/attempt data
~~~

Поэтому не нужен дополнительный admin salt, keeper entropy или пользовательский secret. Они только создадут новую точку выбора/withholding.

---

# 5. Самая важная задача feasibility — не BLS, а future-round binding

Для drand нельзя сделать так:

~~~text
freeze draw
потом executor приходит
и говорит: давайте round 12345
~~~

Даже если round ещё будущий, caller не должен иметь discretionary target selection.

Минимальный invariant должен быть:

> `targetRound` определяется детерминированно и сохраняется вместе с необратимым freeze; ни publisher, ни keeper, ни admin не могут поменять его после этого.

Но есть ещё более тонкая вещь.

## Freeze должен стать достаточно окончательным ДО раскрытия target

Плохой сценарий:

~~~text
freeze → targetRound R
R публикуется
freeze tx ещё реально может исчезнуть/быть reorged
→ повторный freeze уже получает R+N
~~~

Тогда появляется возможность увидеть один результат и получить другой target через chain-history change / timing.

Поэтому формула должна иметь **достаточный future lead**, чтобы выбранный round не существовал, пока freeze не достиг выбранной нами объективной finality boundary.

Это нельзя сейчас заменить числом «2 drand rounds» или «6 секунд».

Robinhood официально подтверждает, что chain построен на Arbitrum Dedicated Blockchains / Nitro. Нам надо отдельно зафиксировать именно для 4663:

- какую finality мы считаем достаточной для Promo;
- как проверить её из production wrapper/verifier;
- какие timestamp/block semantics допустимы;
- какой worst-case lead нужен между freeze и target round.

Источники Robinhood:

- https://docs.robinhood.com/chain/
- https://docs.robinhood.com/chain/run-a-full-node/

### Кандидат формы, НЕ утверждённая формула

~~~text
targetRound = first evmnet round strictly after
              deterministicFreezeTime + MIN_RNG_LEAD
~~~

где:

~~~text
MIN_RNG_LEAD > выбранная finality/reorg safety margin
~~~

а не просто `2 * 3 seconds`.

`targetRound` должен вычисляться контрактом из immutable evmnet genesis/period + canonical chain data; caller не передаёт произвольное число.

Если выяснится, что L2 timestamp даёт слишком неприятную свободу/неопределённость, нужно выбрать другой objective anchor. Это именно предмет следующего study, а не место для догадки.

---

## 6. Поведение при reorg должно быть сформулировано явно

До finality freeze может исчезнуть вместе с его target. Это нормальная reorg semantics.

После принятой finality мы хотим утверждать:

~~~text
(drawId, context, targetRound)
```

уже один immutable obligation.

Если target после этого опубликован, никакая штатная функция не должна создавать:

~~~text
same draw → another round
~~~

Даже если:

- proof tx потерялся;
- callback/process tx revert;
- keeper умер;
- gas x100;
- прошло много часов/дней.

Повторять можно только доставку proof для того же R.

---

# 7. Что происходит у shortlist с ТОЙ ЖЕ randomness

## RH-VRF — прямую интеграцию я бы сейчас исключил

Документация подтверждает хорошую часть: доставку одной signature можно повторять.

Но через `TIMEOUT_BLOCKS = 7200` **любой адрес** может вызвать `refund(requestId)`, после чего request уже никогда нельзя fulfill даже с валидной signature.

Источник:

https://rh-vrf.com/

Для обычной игры это нормальный safety escape hatch. Для нас это несовместимо с текущим обещанием:

~~~text
frozen draw не отменяется по timeout
```

Потому что посторонний caller получает способность навсегда убить RNG obligation, не завершив prize obligation.

Если deployed code действительно соответствует этой документации, это не просто inconvenience, а semantic no-go для нашей текущей модели.

---

## Quiver — хорошая retry semantics ПОСЛЕ reveal, плохая liveness ДО reveal

Quiver documentation очень полезно разделяет два случая.

Если provider уже reveal'нул randomness, но наш callback revert/OOG:

~~~text
randomness буферизуется
retryCallback(provider, seq)
→ anyone can redeliver SAME result
```

Это нам подходит отлично.

Но push-flow позволяет provider узнать фиксированный outcome и просто **не reveal'нуть его**. Их own security model прямо называет selective withholding главным liveness risk.

Источники:

- https://quiver.foundation/docs/protocol-design
- https://quiver.foundation/docs/security
- https://quiver.foundation/docs/api-reference

Значит Quiver даёт excellent recovery от callback failure, но не independent recovery от исчезнувшего/злого provider до reveal.

Их типичный mitigation «другой provider / новый request» нам как раз не подходит после freeze, потому что это другой randomness target.

---

## Dice — интереснее, чем RH-VRF, но withholding остаётся

Публичные docs/source говорят:

- single-provider commit/reveal;
- requester-only `refundRequest`;
- refund после delay очищает active request;
- live fee сейчас документирован как `0.000025 ETH`;
- Apache-2.0.

Источники:

- https://github.com/diceprotocol/dice-entropy
- https://github.com/diceprotocol/dice-protocol-docs

Это существенно лучше RH-VRF в одном месте:

> посторонний не может убить request через refund.

Если requester — наш immutable controller и controller **вообще не exposes refund path**, timeout сам по себе, судя по документации, не обязан закрывать request.

Но это надо подтвердить по exact deployed/source implementation:

> после наступления refund eligibility, но без вызова refund, может ли тот же `revealWithCallback` всё ещё успешно закрыть старый request спустя сколько угодно блоков?

Если да, Dice остаётся реальным fallback-кандидатом.

Но его фундаментальная проблема не исчезает: provider владеет reveal secret и может withholding'ом оставить frozen draw pending. Третья сторона восстановить secret не может.

---

## drand — лучший no-reroll fit из текущего набора

После target commitment никакой отдельный service account не владеет секретом результата.

Как только LoE публикует round, proof публичен и его может доставить любой.

Поэтому failure modes становятся понятнее:

~~~text
наш keeper умер            → другой приносит тот же proof
Alchemy умер               → другой executor + ETH
наш callback/tx revert      → повторяем тот же proof/seed path
LoE evmnet перестал жить    → draw может зависнуть
```

Последний риск серьёзный, но он не даёт проекту выбор между несколькими уже известными outcomes.

---

# 8. Более простой audited кандидат на 4663 я пока не нашёл

Chainlink VRF v2.5 всё ещё не перечисляет Robinhood как supported network. Repo правильно не считает его доступным.

Pyth Entropy официальное deployment на 4663 в просмотренных материалах не подтверждено.

Quiver/Dice/RH-VRF реально существуют на chain, но у каждого описанные выше semantic проблемы.

Есть полезный косвенный сигнал в пользу drand: сторонние проекты Robinhood уже используют evmnet/on-chain BN254 verification. Это показывает практическую исполнимость идеи на 4663, но **не заменяет аудит нашего verifier и binding**.

Поэтому сейчас я не вижу кандидата в категории:

~~~text
well-audited
native 4663
immutable same-result retry forever
no provider withholding
```

который позволил бы просто выбросить drand study.

---

## 9. Что именно проверить в drand feasibility package

Я бы зафиксировал acceptance очень узко.

### A. Cryptographic compatibility

Pin:

- evmnet chain hash;
- public key;
- genesis time;
- period = 3;
- scheme/DST;
- exact source commit verifier.

Один настоящий public evmnet vector из pinned evidence:

~~~text
correct round + signature → VALID
```

Обязательно должны падать:

~~~text
wrong round
wrong pubkey
1-bit signature corruption
truncated signature
extra/malformed signature
wrong DST/scheme
```

И независимо проверить:

~~~text
seed == sha256(signature)
```

### B. Robinhood execution

Не только local Hardhat.

Нужен хотя бы read-only fork / deployed test contract на 46630 или эквивалентный exact EVM check, чтобы настоящий verification path использовал нужные precompiles.

Измерить:

- verifier runtime bytes;
- verification gas;
- calldata bytes;
- controller/adaptor size impact;
- revert gas bad proof.

### C. Future-round binding

Локальная state machine:

~~~text
freeze
→ exact deterministic target R stored
→ cannot change R
→ proof for R accepted once
→ proof R±1 rejected
→ duplicate same proof cannot change seed
→ late proof after arbitrary delay works
```

Отдельно моделировать:

~~~text
freeze branch reorg before finality
freeze survives finality
proof arrives after keeper restart
```

И доказать, что target не может быть уже известен на момент необратимого freeze.

### D. Provider/network liveness assumption

Узнать из официальной drand semantics:

- гарантируется ли emission/backfill exact scheduled round после outage;
- как выглядит chain/public-key rotation;
- что происходит при network replacement/sunset.

Если exact frozen round может навсегда отсутствовать, это должно стать **явным accepted liveness risk**, а не скрытым timeout reroll.

---

## 10. Не тащить verifier внутрь Short controller до измерений

С учётом того, что Short controller уже более тесный по стандартному 24 KiB benchmark, BLS/hash-to-curve код я бы пока не вшивал туда.

Feasibility может использовать standalone verifier.

Если drand проходит, следующая architecture candidate:

~~~text
immutable DrandVerifier / RNGAdapter
      ↑             ↑
ShortController   MonthlyController
```

но без права adapter'а трогать vault, participants, rules или winner.

Его единственная власть:

~~~text
prove exact pinned (drawId, targetRound)
→ derive canonical seed
→ deliver once
```

Адрес verifier/adapter должен быть fixed at deployment, никакого `setProvider`/module replacement.

Но окончательный split выбираем только после gas/bytecode study.

---

## 11. Ключевой неприятный вывод про liveness

При наших требованиях невозможно магически получить одновременно:

~~~text
любой внешний RNG может умереть навсегда
+
draw всегда обязан завершиться
+
никакого fallback target/reroll никогда
```

Если randomness source катастрофически исчез, кто-то должен уступить.

Самая trust-conservative модель сейчас:

> frozen draw может ждать тот же заранее закреплённый результат сколько угодно; проект не получает право заменить его удобным новым random.

Для drand это особенно приемлемо, потому что после публикации target result не принадлежит конкретному keeper.

Если позже захотим fallback source, его нельзя придумывать после аварии. Он должен быть заранее закоммичен в immutable draw policy с objective activation condition, причём condition «drand умер» сама по себе трудно доказуема on-chain. Поэтому я бы вообще не тащил fallback в MVP до появления реальной необходимости.

---

## 12. Что осталось старым security debt

RNG не закрывает publisher truth boundary.

Даже perfect drand verifier не доказывает, что publisher включил всех настоящих eligible attempts или не соврал в `EpochEmpty`.

После RNG эту тему всё ещё надо вынести отдельным решением перед public mainnet:

~~~text
DETECTABLE false dataset/empty
vs
PREVENTED false dataset/empty
```

Также остаётся AA publication recovery decoder, если execution реально пойдёт через sponsored ERC-4337 transport.

---

## Следующий пакет

Поддерживаю предложение repo, но с чуть более строгой формулировкой:

~~~text
drand-evmnet-feasibility-v1
```

Только research/test artifacts, без изменения Short/Monthly production components.

Цель пакета — ответить на четыре бинарных вопроса:

~~~text
1. Мы действительно верифицируем настоящий evmnet proof на Robinhood EVM?
2. Цена/размер приемлемы?
3. Мы умеем детерминированно pin'ить FUTURE round без target grinding/reorg reroll?
4. Один и тот же proof можно безопасно доставлять сколько угодно поздно?
```

Если хотя бы один ответ `нет`, production integration не пишем и возвращаемся к service shortlist с конкретной причиной.

Если все `да`, тогда уже отдельно проектируем минимальный immutable authenticated RNG adapter для обоих controllers.

## Источники внешнего ревью

- drand evmnet / networks: https://docs.drand.love/developer/
- drand HTTP API / chain hash: https://docs.drand.love/developer/API-v2/drand-http-api/
- BLS Solidity verifier: https://github.com/randa-mu/bls-solidity
- exact evmnet demo: https://github.com/randa-mu/bls-solidity/blob/main/src/demos/EvmnetRegistry.sol
- Quiver protocol/security/API: https://quiver.foundation/docs/protocol-design ; https://quiver.foundation/docs/security ; https://quiver.foundation/docs/api-reference
- RH-VRF timeout/refund: https://rh-vrf.com/
- Dice source/docs: https://github.com/diceprotocol/dice-entropy ; https://github.com/diceprotocol/dice-protocol-docs
- Robinhood architecture: https://docs.robinhood.com/chain/ ; https://docs.robinhood.com/chain/run-a-full-node/
