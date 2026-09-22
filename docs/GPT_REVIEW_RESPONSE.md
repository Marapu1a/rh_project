# Постоянный ответ GPT

Обновлено: 22.09.2026.

Это независимое review-мнение, не задание на автоматическое исполнение. При следующем
обращении файл следует полностью перезаписать.

Просмотрен HEAD `cec8db3a7dfbe4121ed3abde34826a19c9271078` —
`Share coordinator identity with verified inspection manifests`. Дополнительно сделан
релизный срез продукта и реализации в целом, а не только review последнего diff.

## Короткий вердикт

Новый manifest/identity package пока **не принимаю окончательно**: в нём два подтверждённых
дефекта воспроизводимости identity. Денежной safety-уязвимости они не создают, но инструмент,
который должен доказывать точную конфигурацию, не должен зависеть от случайной формы checkout
или регистра букв в эквивалентном Ethereum-адресе.

По проекту в целом: идея архитектурно целостна, локальный сквозной skeleton действительно
собран и хорошо протестирован. Но до публичного релиза с реальными деньгами мы **не близко**.
Мы близко к завершению архитектурного прототипа и можем готовить testnet/fork canary.
Production-контроллеров, production RNG/finality, постоянного indexer/keeper, реального swap,
deployment pipeline, frontend и утверждённой экономики ещё нет.

Особенно важно: сейчас не только интеграции являются заглушками — часть самого продукта
не определена числами. Пока не утверждены creator shares, Short budget, K/weights/minimum,
вероятности Short/Monthly и точный production schedule/finality, нельзя посчитать payout,
farming economics или даже сформулировать окончательные условия промо. Большое количество
зелёных тестов этого не заменяет.

## Findings по текущему пакету

### 1. Confirmed: exporter не работает без `.git`

`inspection-manifest.cjs export` безусловно выполняет:

```text
git rev-parse HEAD
git status --porcelain
```

В чистом source archive, deployment bundle или ином checkout без `.git` export падает до
создания manifest. Это воспроизвёл полный `npm test` в чистом `git archive`: **329/330**,
единственный fail — manifest integration с `fatal: not a git repository`.

Это не просто тестовая причуда: заявленный операторский artifact нельзя воспроизвести из
исходного release bundle. Предпочтительная граница — явный provenance input
(`--provenance FILE` или эквивалентные обязательные build values), а git discovery оставить
удобным режимом для developer checkout. Verifier должен проверять форму provenance, но не
изображать, будто локальный `.git` сам доказывает одобрение или deployed bytecode.

Нужен regression: export/verify из копии без `.git`, с явно переданными commit/source digest,
dirty/generatedAt. Исправление только теста, чтобы он перестал вызывать export, скроет дефект.

### 2. Confirmed: role casing меняет configHash

`buildCoordinatorIdentity` проверяет роли через `ethers.isAddress`, но сохраняет
`roles.prizeExecutor/executor/publisher` в budget identity в исходном регистре. Runtime получает
обычно checksummed адрес из `signer.getAddress()`, а независимый deployment JSON может законно
содержать тот же адрес lowercase. Оба значения валидны и семантически равны, но канонический
JSON hash различается.

Минимальный probe на стандартном Hardhat address дал:

```text
checksumValid=true, lowerValid=true, sameSemantic=true, hashEqual=false
```

В результате exporter/verify успешно создают внутренне согласованный manifest, который затем
не совпадает с реальным runtime state. Это безопасный false mismatch, но ломает основное
назначение инструмента. Роли следует канонизировать одним способом внутри общего builder
(например, `ethers.getAddress`) до построения legacy/budget/refill identity. Для обычных
runtime signer addresses это сохраняет текущий hash. Нужен regression lowercase deployment
roles ↔ checksum runtime roles.

### Что в пакете сделано правильно

- общий pure identity builder действительно устранил дублирование формулы runtime/manifest;
- legacy и budget shape для обычного runtime ввода сохранены тестами;
- refill domain строится из полного source/policy/protected set, а не берётся из journal;
- controller objects теперь сверяются с lifecycle addresses до journal access;
- независимое изменение source/network/config/protected set не проходит verifier даже после
  пересчёта checksum;
- manifest не выдаётся за on-chain attestation или внешнее approval;
- nonce read стал best-effort: known receipt проверяется при nonce outage, hashless всё равно
  не получает разрешения на retry;
- inspector/verify остаются read-only, signer/send/reset/lock deletion не появились.

После исправления двух findings пакет можно принять без расширения его полномочий.

## Целостность идеи

Сильная часть проекта — одна непротиворечивая денежная и lifecycle-модель:

- TOKEN остаётся обычным спекулятивным активом, Promo — отдельным добровольным контуром;
- только фактически полученный USDG становится денежным призовым резервом;
- project share отделяется до prize custody, а frozen/claimable не оплачивают эксплуатацию;
- free, reserved и claimable не считаются одними деньгами дважды;
- Short и Monthly имеют раздельные immutable capabilities и пространства draw ID;
- BUY создаёт независимые Short/Monthly attempts; freeze/terminal/claim разделены;
- no-win, недоставленный RNG и неготовый draw не смешаны;
- старые долги и старые версии правил не переписываются новыми циклами;
- нет admin withdrawal, reroll, reset, proxy или подмены результата.

То есть это уже не набор случайных контрактов. Core accounting, custody и переходы состояний
сходятся. Локальный BUY → attempts → Short/Monthly → award → claim и параллельный revenue →
converter → reserves проходят сквозными сценариями.

Но product thesis ещё не замкнут экономически. Покупка одновременно создаёт комиссионный доход
и шанс на приз; при разрешённом multi-wallet farming устойчивость определяется конкретными fee,
creator share, q, бюджетом и корзиной. Пока этих параметров нет, нельзя проверить, не покупаем ли
мы искусственный объём слишком щедрой ожидаемой выплатой. Технический core не отвечает на этот
вопрос за продукт.

Отдельная честно принятая граница доверия: publisher/indexer может опубликовать неполный snapshot.
Это можно независимо обнаружить, но текущий on-chain контур не обязан предотвратить выплату по
нему. Для MVP такая модель возможна только как явно раскрытое доверие к оператору, с публичными
artifacts и независимым replay; называть её trustless нельзя.

## Насколько близко к релизу

| Слой | Состояние | Релизный вывод |
|---|---|---|
| Product/custody model | Основные инварианты сформированы | Сильная база |
| Экономический профиль | Ключевые значения не утверждены | Блокер спецификации и моделирования |
| Vault/FeeRouter/settlement core | Реализован и широко покрыт тестами | Близок к audit candidate после final profile |
| Исполняемые controllers | Только `Local*`, жёстко chainId 31337 и mock RNG | Production blocker |
| BUY/indexer | Воспроизводимый replay есть, daemon/finality/publication отсутствуют | Production blocker |
| Venue/fees | PAIR-specific допущения и local/fork evidence | Нужна конкретная live integration/canary |
| TOKEN → USDG | Fixed adapter/floor fixture | Нужны real route, oracle/price guard, slippage/MEV policy |
| RNG | Исследование Drand есть, binding не выбран | Production blocker |
| Coordinator/ops | Хороший local journal и fail-closed recovery | Нет supervisor, lease model, monitoring, RPC failover |
| Delivery | Нет deploy scripts/CI/reproducible build/frontend | Production blocker |
| External assurance | Нет invariant/fuzz campaign и внешнего аудита | До public funds обязательно |
| Правовая рамка | В репозитории не определена | Проверить отдельно до публичного промо |

Практическая оценка без фальшивых процентов:

- **локальный demo/architecture MVP — готов;**
- **закрытый testnet/fork canary — следующий большой этап;**
- **публичный запуск с настоящими средствами — ещё несколько независимых release gates, не
  «пара фиксов и заменить заглушки».**

## Следующий необходимый шаг

Ближайший коммит должен оставаться маленьким: закрыть `.git` provenance portability и role
address canonicalization, добавить два regression и вернуть полный suite в зелёное состояние.
Не надо под этот fix добавлять deployment, recovery или новую сеть.

Сразу после принятия этого patch следующий **проектный**, а не технический шаг — утвердить
один `MVP release profile v1`. До новой внешней интеграции владелец должен зафиксировать:

1. creator revenue bps и назначение всех трёх FeeRouter slots;
2. формулу/лимит Short budget D;
3. K, weights и minimum unit корзины;
4. численные q для Short и Monthly;
5. точный Monthly interval и notice rules;
6. finality/cutoff policy и максимальный поддерживаемый participant envelope.

Для профиля нужен один экономический sweep: обычный пользователь, крупный участник,
multi-wallet farmer, низкий/высокий объём, недостаток prize funding и дорогая эксплуатация.
Результат — не «идеальная токеномика», а конкретная версия условий, которую можно закодировать,
показать пользователю и против которой тестировать production adapters.

Только после profile freeze следующий инженерный пакет — bounded real venue/BUY integration.
RNG и swap нельзя тащить в тот же пакет.

## Выполненные проверки

- полный `npm test` в чистом `git archive` checkout: **330 total, 329 pass, 1 fail**,
  663.0 s; fail воспроизводит `.git` dependency manifest exporter;
- все остальные 329 тестов, включая contracts, coordinator, refill и process-death, прошли;
- отдельный local manifest test в синхронизируемом checkout упёрся в восстановленный stale
  `.local` lock; этот результат не смешивается с подтверждённым clean-archive finding;
- ручной role-casing probe подтвердил разные hash для одного Ethereum address;
- `git diff --check af2754c..cec8db3` — чисто;
- live fork/current PAIR, production RNG и внешний audit не запускались;
- пользовательский `docs/INDEPENDENT_AUDIT_2026-09-19.md` не изменялся.

Итог: проект уже хорошо сформирован как архитектура и локальная система, но ещё не как
утверждённый публичный продукт. Сначала чинится воспроизводимость manifest package, затем
замораживается release profile. Если перескочить сразу к venue/RNG/swap, мы начнём дорого и
аккуратно реализовывать параметры, которые пока никто не выбрал.
