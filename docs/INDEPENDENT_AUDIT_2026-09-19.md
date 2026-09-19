# Независимый аудит состояния проекта — 19.09.2026

> Это мнение аудитора по состоянию репозитория на commit `eddc952`, а не план
> исполнения и не инструкция автоматически вносить изменения. Любое продолжение
> требует отдельного решения владельца проекта.

## Короткий вывод

Проект уже нельзя называть набором идей: основные математические и бухгалтерские
примитивы реализованы, сложные переходы покрыты тестами, а границы доверия в документации
обычно описаны честно. Но это всё ещё **исследовательский прототип системы**, а не готовый
к публичному запуску MVP.

Главный разрыв проходит не внутри `PromoVault`, а между готовыми частями:

```text
BUY history -> canonical dataset -> finality -> future random -> settlement -> USDG
```

Каждый участок отдельно изучен, но production-цепочка целиком не собрана. Наиболее
серьёзные незакрытые вопросы — finality/привязка drand, власть publisher над snapshot,
конвертация TOKEN в USDG и отсутствие deployable production controllers.

Моя оценка текущей стадии: **хорошо проработанный pre-production R&D**, которому ещё рано
доверять реальные пользовательские деньги. Количество тестов не меняет этот вывод.

## Что реально сделано

### 1. Казна и денежная бухгалтерия

- `FeeRouter` ведёт раздельные кампании, cumulative split, credits и атомарный rollover.
- Источник PAIR привязывается один раз; смена epoch блокирует rollover fail-closed.
- `PromoVault` отделяет free, reserved и claimable balances, сохраняет долг при неуспешном
  claim и не содержит owner withdrawal/rescue.
- USDG funding реализован по принятой схеме 3:2:1, затем 50:50 после заполнения Next.
- Short и Monthly разделены фиксированными controller capabilities и namespace `drawId`.
- Monthly win/no-win, перенос Next в Current и независимость claims от следующего цикла
  реализованы и протестированы.

Это самая зрелая часть проекта. Локально бухгалтерские инварианты выглядят продуманно;
простого пути украсть reserved/claimable через публичные методы при ревью не найдено.

### 2. Учёт участников, BUY и attempts

- Есть публичный `ParticipantRegistry` без backdating и административной регистрации.
- Реализован строгий decoder одного direct Universal Router route TOKEN/USDG.
- Replay проверяет непрерывную ветку блоков, receipts/log provenance, регистрацию до BUY,
  carry и mint attempts.
- Short и Monthly attempts имеют независимые OPEN/FROZEN/CONSUMED состояния.
- Reorg моделируется полным replay, а stale commitment приводит к остановке, не к тихой
  подмене истории.
- Версии правил Short и Monthly forward-only; старые attempts обслуживаются по старым
  правилам.

Это хороший проверяемый фундамент, но пока CLI/library, а не работающий production indexer.

### 3. Short и Monthly settlement

- Dataset публикуется chunks, проверяется по root/count/attempts и резервирует деньги
  атомарно при seal.
- Short использует deterministic admission, streaming top-K, случайное сопоставление
  корзины призов и максимум один приз кошельку.
- Monthly выбирает одного лучшего допущенного кандидата тем же проверяемым принципом.
- `process`/`finish` permissionless и могут быть продолжены другим исполнителем.
- No-winner является терминальным исходом, не разрешает reroll и освобождает бюджет по
  заданным правилам.
- Контексты разделяют chain, controller, instance, registry, vault, assets, draw и policy.

Однако `ShortSettlement` и `MonthlySettlement` — abstract components. Рабочие внешние
entrypoints сейчас находятся в test/research wrappers с ручной подачей seed или mock RNG.

### 4. RNG и Robinhood Chain

- Исправлена путаница L1/L2 block number: на chainId 4663/46630 используется ArbSys.
- Реальная подпись drand evmnet проверена локальным BN254 verifier; измерены размер и gas.
- Модель закрепляет один round и запрещает replacement/reroll.
- Воспроизведены опасные counterexamples: stale L2 clock, disclosure до finality и reorg
  freeze после раскрытия результата.

Это важный результат исследования: репозиторий не маскирует проблему. Но результат пока
`NO-GO` для безусловной production-гарантии, а не готовая RNG-интеграция.

### 5. Проверки, выполненные во время этого аудита

| Проверка | Результат |
|---|---:|
| Основной Node suite | 172/172 passed |
| Python model suites | 39/39 passed |
| drand feasibility | 2/2 passed |
| drand binding model | 7/7 passed, включая небезопасные counterexamples |
| Solidity custom compile | passed |
| Controller size checks | passed |
| PAIR economics fork | passed |
| Direct BUY fork/replay | passed |
| npm production dependencies | 0 advisories |
| npm dev toolchain | 18 advisories: 6 high, 2 moderate, 10 low |
| Live Nitro/drand RPC probes 19.09 | mainnet и testnet timeout |

Тесты сильные для прототипа, но это не coverage report, не fuzz/invariant campaign и не
внешний smart-contract audit.

## Критические незакрытые границы

### A. Finality и future-round binding

Текущий контракт может проверить недавний L2 block hash, но это не доказательство finality.
Если chain clock отстаёт от wall clock или freeze откатывается после раскрытия drand round,
оператор получает возможность связать replacement history с уже известным результатом.
Fixed lead сам по себе это не лечит — репозиторий уже воспроизводит данный контрпример.

Пока не выбрана точная finality policy и момент необратимой привязки round, production RNG
интегрировать рано. Это текущий главный архитектурный стопор.

### B. Snapshot можно проверить, но нельзя остановить до выплаты

Полный replay позволяет обнаружить пропущенный или выдуманный BUY. Но on-chain controller
сам не доказывает, что опубликованный dataset соответствует всей канонической истории.
Авторизованный publisher потенциально может заморозить ложный snapshot, получить random и
завершить settlement. Независимая проверяемость после факта не возвращает уже назначенные
деньги.

Сейчас отсутствует предотвращающий механизм: on-chain proof, challenge window/optimistic
verification либо явно принятая доверенная роль publisher с понятной ответственностью.
Это не мелкая реализационная задача, а сознательный выбор trust model.

### C. Денежный цикл проекта не замкнут

PAIR приносит TOKEN и USDG. Призы задуманы только в USDG, но production-конвертации
TOKEN -> USDG нет. `FeeRouter` умеет раздать TOKEN credit, а dual vault запрещает TOKEN
prize reserve. Поэтому тезис «торговля финансирует лотерею» пока работает лишь для USDG
половины комиссий и внешних пополнений.

Нужны не просто swap-вызовы, а политика slippage/MEV, маршрут, лимиты, исполнитель,
обращение с ошибками и точная принадлежность результата кампании. До этого экономика
ядра неполна.

### D. Нет production controllers

Два controller-компонента и shared vault архитектурно выбраны, но deployable contracts с
реальными ролями, finality gate, drand verifier/binding, readiness и operational funding
не существуют. Research wrapper не является черновиком, который безопасно «просто
задеплоить»: там mock provider и ручной seed.

Controller size уже был проблемой: монолит превышал EIP-170, split-вариант помещается, но
финальный runtime после настоящего RNG adapter ещё не измерен как единый deployment graph.

## Существенные операционные и продуктовые затыки

### Indexer и доступность истории

Текущий независимый scanner читает каждый блок и receipt от anchor последовательно. Это
удобно как доказательный replay, но непригодно как единственный production daemon на
быстрой L2. Нет durable checkpoints, incremental rollback, нескольких RPC, очереди,
метрик, alerting и опубликованной команды `verify-draw`.

Проверяемость также зависит от архивного доступа к полной истории. Один публичный RPC —
не инфраструктура. Во время этого аудита official mainnet/testnet endpoints не прошли
15–20-секундные Nitro и drand probes, хотя тяжёлые локальные forks по сохранённой точке
позже завершились успешно.

### Liveness без права на reroll

Если drand quorum окончательно перестал публиковать выбранный round, frozen draw остаётся
pending навсегда. Это честнее, чем подбирать новый random, но блокирует следующие draws.
Репозиторий это признаёт, однако продуктовый ответ — принимается ли такой permanent halt,
как он показывается пользователю и что происходит с operational layer — не оформлен.

### Внешняя зависимость PAIR

Уже назначенные prizes и credits переживают исчезновение UI PAIR, но новые комиссии и
rollover зависят от конкретного внешнего vault/position/epoch. `bindSource` не доказывает
каноничность source, правильность `positionId`, custody LP или отсутствие upgrade.
Внешняя смена epoch может навсегда оставить router на старой кампании.

### Открытые параметры продукта

До сих пор не утверждены creator shares, формула Short budget `D`, `K/weights/minimum`,
Short и Monthly admission parameters и минимальная готовность draw. Код умеет безопасно
фиксировать версии, но фиксировать пока нечего. Это блокирует экономическую проверку
системы как продукта, даже если технический pipeline будет собран.

### Исполнение и gas

Permissionless не означает, что кто-то согласится оплачивать `process`/`finish`. Модель
operational ETH buffer, вознаграждение keeper/paymaster, лимиты расходов и bootstrap не
приняты. Призовые обязательства при этом правильно не разрешено уменьшать задним числом.

## Конкретные проблемы репозитория и tooling

1. `scripts/short-scaling-rpc.cjs` завершился кодом 0, когда оба RPC фактически вернули
   пустые результаты/timeout. Более того, live scripts перезаписывают последний успешный
   evidence неуспешным снимком. Для security evidence это fail-open поведение.
2. Есть две сборочные реальности: `scripts/compile.cjs` явно компилирует под Cancun, а
   `npx hardhat compile` с текущим config выбрал Paris и предупредил, что Solidity 0.8.37
   не полностью поддержан Hardhat 2.29.1. Воспроизводимый production artifact не определён.
3. Custom compile отбрасывает все compiler warnings. Обычный Hardhat compile показал
   unreachable-code warnings из-за dual-vault capability override; они ожидаемы, но
   скрывать все предупреждения целиком — плохая граница контроля.
4. `check:controller:size` меняет committed JSON даже при успешной проверке
   (`helpers:false`), то есть проверка не идемпотентна относительно репозитория.
5. Нет CI, зафиксированной версии Node/Python, deployment scripts, release manifest,
   bytecode verification flow, monitoring/runbook, SECURITY policy и project-level
   LICENSE. Solidity-файлы имеют SPDX MIT, но это не лицензирует весь публичный repo.
6. Default `npm test` не включает drand feasibility/binding, Python-модели, live probes
   и size checks. Единой команды, которая однозначно означает «всё обязательное прошло»,
   нет.
7. Dev dependencies содержат известные advisories через Hardhat/solc toolchain. Для
   deployed contracts это не прямой exploit, но сборочную машину и CI нельзя считать
   чистой доверенной средой без отдельного решения.

## Что предстоит до осмысленного testnet

Это не backlog для автоматического выполнения, а зависимый порядок, в котором работа
имеет смысл:

1. Зафиксировать trust model finality/RNG/publisher: что именно предотвращается on-chain,
   чему доверяем, и какой отказ считается допустимым permanent halt.
2. На основе этого собрать два настоящих controller contracts и отдельный immutable
   verifier/adapter; повторно измерить bytecode/gas и весь deployment graph.
3. Замкнуть TOKEN -> USDG conversion и утвердить экономические параметры, иначе тестируется
   механика без собственной экономики.
4. Сделать incremental indexer и независимый `verify-draw`, работающие на нескольких RPC
   и переживающие reorg/restart без полного ручного replay.
5. Добавить deployment/release pipeline, CI, observability, keeper funding и recovery
   runbook; затем провести canary на конкретном PAIR release.
6. После заморозки архитектуры — независимый аудит Solidity/crypto, invariant/fuzz testing
   и юридическая оценка purchase-linked chance prizes в целевых юрисдикциях.

Frontend имеет смысл после первых четырёх пунктов. Сейчас UI только красиво замаскирует
непринятые trust assumptions.

## Условия, при которых я бы не пускал реальные деньги

- finality/drand binding всё ещё допускает известный reorg/grinding counterexample;
- publisher может провести ложный snapshot до независимой блокировки settlement;
- TOKEN revenue не имеет безопасного пути в USDG prize reserve;
- production controllers и их точный bytecode не существуют;
- нет воспроизводимого release/deployment manifest и внешнего аудита.

## Итоговое мнение

Кодовая база лучше своей текущей продуктовой готовности: здесь много хорошей инженерии,
отказоустойчивой бухгалтерии и редкой для раннего проекта честности насчёт ограничений.
Но последние шесть дней дали в основном доказательства отдельных частей и отрицательные
результаты по trust boundaries. Это полезный прогресс, а не повод ускорять launch.

Разумная точка сейчас — не писать ещё один слой кода по инерции, а принять одно жёсткое
решение о finality + publisher trust. Пока оно не принято, production controller будет
цементировать неизвестность, а не завершать архитектуру.
