# GPT: переход первого релиза на PAIR Infinity — план и оставшиеся решения

27.09.2026. Новый запрос после твоего review `beeef4e` на fork `5a31ff5`.
Ответ оставь в существующем `docs/GPT_REVIEW_RESPONSE.md`, переписав его под этот запрос.
История прежних обращений сохранена в git; не нужно заново пересматривать весь архив.

## Что теперь решил пользователь

- **Основная площадка первого релиза — PAIR Infinity**, это уже не просто кандидат.
- Creator policy fee **3% (300bps)**. Protocol/pool/router fees отдельно; не обещаем,
  что полная стоимость сделки равна3% или что повышение ставки гарантирует оборот.
- Денежные призы — USDG. Для первого интеграционного пути — один TOKEN/USDG pool.
- V2 сохраняем как прежнюю проверенную интеграцию, без параллельной разработки двух
  релизов. Призовое ядро должно оставаться пригодным для других площадок/сетей.
- Внутренние10/90 project/prizes **не утверждены**. Газ/ops только из проектной доли
  или отдельного funding; frozen/claimable и призовая казна для этого недоступны.
- Прозрачность условий и автоматизация обязательны. Без ежедневного оператора,
  arbitrary calls, proxy, новых emergency admin, вывода призов, reroll/reset.

## Проверенная база и её границы

[Исследование и новый fork](INFINITY_INTEGRATION_RESEARCH.md),
[harness](../scripts/infinity-launch-fork.cjs),
[raw evidence](../research/infinity-source-audit/fork-success-2026-09-27.json),
[локальный receiver](../research/infinity-source-audit/LocalInfinityReceiver.sol).

Обычный creator → новый Infinity TOKEN/USDG с300bps → BUY → permissionless contract
claim → SELL → claim. Покупка:100USDG pool input,103.30gross. Продажа всех купленных
TOKEN:94.580748net. Receiver получил5.934252USDG. В обеих Swap pool fee11098pips,
уже отражённая в amounts; PAIR hook0.3% отдельно. Это один сценарий, не обещание
постоянной стоимости round-trip. Offline4/4; новый fork действительно запускался.

SandboxETH, искусственное USDG funding покупателя, гипотетические opening ticks,
minOut1 и выключенная launch protection — допущения proof. Нет production collector,
PromoVault funding, Infinity tickets, RNG/draw/payout или доказательства UI coverage.

Твои замечания приняты как полезные ограничения, не как автоматически утверждённая
конфигурация. Согласны: не подменять source ABI старого FeeRouter; не смешивать fee
base и gross debit; не считать две внешние policy одной; не превращать10/90 в default.

## План миграции

1. **Отдельный узкий USDG-only Infinity collector.** Переиспользовать проверенные
   принципы accounting, не переписывая V2 FeeRouter/worker. Immutable source/asset,
   permissionless pull/pay, credits и детерминированный rounding. Сначала модель/API.
2. **Полученные USDG → существующее funding резервов.** Фиксированный recipient
   призовой доли и GENERAL sync; ops/project отдельно. TOKEN conversion на этом пути
   не нужен. Внутренние bps до production утверждает пользователь; fork — явный fixture.
3. **Infinity decoder + automatic eligibility.** Новый genesis/profile без обязательной
   регистрации для будущего запуска, старые snapshots/ledger не переписываем. Отдельно
   выбрать и объявить базу100USDG/entry. Не обещать поддержку неизвестных маршрутов.
4. **Deployment profile/health/worker.** Pin актуальной граф-схемы; reconciliation,
   gas waits, retry и диагностика. Проблемы PAIR не должны блокировать уже обеспеченные
   призы и выплаты старых credits. Permissionless функции всё равно требуют worker.
5. **Сквозной fork/локальный release proof.** Trade → fees → reserves → entries →
   draw → payout. Различать реальные зависимости и оставшиеся RNG/finality допущения.

## Ближайший пакет: предлагаемый API, пока НЕ решение

- `bindSource(vault, expectedPolicy...)` один раз, с канонической проверкой graph,
  TOKEN/USDG, hook, creator recipient и300bps. Либо constructor binding, если решим
  циклическую зависимость адресов при launch. Источник дальше не меняется.
- `pull()` permissionless: до учёта новых денег проверка source policy, положительный
  claimable → `claim([USDG])`, сверка return/balance delta/нулевого остатка claimable,
  sync поступлений к текущей campaign. Пустой claim не вызываем.
- `sync()` распознаёт прямой USDG; `pay(recipient)` выплачивает только старые credits.
- `rollCampaign(expectedCampaignId,nextConfig)` onlyOwner/nonReentrant: validate
  source → final claim → sync всех direct USDG → close rounding старой → смена policy.
  Ошибка на любом шаге откатывает всё. `endsAt` — условие времени, успешный rollover —
  accounting boundary. Unpaid credits сохраняются и не требуют немедленной выплаты.
- Внешний drift не даёт молча открыть новую кампанию/принять источник. Учтённые pay
  доступны. Для unaccounted денег не придумываем автоматическую атрибуцию/recovery.

## Конкретные вопросы к тебе

1. **Bind и граф запуска.** Кто именно будет recipient — collector или отдельный
   adapter? `claim` платит msg.sender: лишняя прослойка добавляет custody и деньги
   между контрактами на rollover. Мы склоняемся к самому collector. Предложи самый
   простой bootstrap: predeployment + one-time bind или deterministic addresses.
   Какую проверку каноничности сделать on-chain, какую — deployment admission по
   receipt/code hashes? Не предлагай заставлять Solidity перепроверять весь launch log.

2. **Две policy и aggregate claimable.** Какой точный минимальный fingerprint хранить
   для hook и Creator Vault? Достаточно active epoch+mode/fee/destination и
   vault epoch+recipient/fee, или нужно учитывать уже scheduled future epochs?
   Какие getter/code/graph проверки необходимы при bind, pull, rollover? Как заметить
   смену-и-возврат политики, не перечитывая всю историю на каждый вызов? Отдели
   реально доступные внешнему admin действия от лишь существующих методов vault.

3. **Drift и доступность денег.** Принимаем stop нового accounting/rollover и доступный
   pay старых credits. Нужно ли в первом пакете вообще recovery для старого claimable,
   или достаточно честного diagnosed stop без автоматической потери/перепривязки?
   Как поступить с permissionless sync прямого USDG при drift: тоже stop или можно
   безопасно сохранить старую campaign attribution? Дай конкретный invariant.

4. **Граница ответственности collector.** USDG-only проще, но старый FeeRouter учитывал
   прямые TOKEN и USDG при rollover. Предлагаем не переносить TOKEN accounting молча:
   этот источник отдаёт USDG, TOKEN transfers не создают prize revenue автоматически.
   Нужно ли что-то ещё для честного MVP, без универсального rescue и конвертера?
   Нужен ли общий accounting base сейчас или небольшой самостоятельный контракт
   безопаснее? Предпочтение — не менять V2 и не создавать framework ради двух классов.

5. **Билеты — продуктовое решение на следующий пакет.** Сравни pool input100 (текущая
   семантика direct BUY) и фактический gross spend100 с hook fees (новая семантика).
   Что проще доказать и понятно объяснить, учитывая refunds, payer/recipient и маршруты?
   Рекомендуй вариант, но не считай его одобренным пользователем. Отдельно: при новом
   genesis можно обойтись без миграции старой production истории — её ещё нет.

6. **Объём следующего законченного пакета.** Стоит ли сразу включить фиксированную
   призовую выплату в PromoVault→GENERAL вместе с collector, чтобы не оставить новую
   заглушку? Предлагаем временные bps только в test fixture, без runtime default.
   Перечисли минимум unit/fork проверок: final claim failure/atomicity, direct transfers,
   unpaid credits через два rollover, stale calls, rounding, reentrancy, hook/vault drift,
   zero pull и реально полученный GENERAL funding. Не назначай full suite автоматически.

## Какой ответ нужен

Краткий вердикт по плану → выбранная модель/API → таблица нерешённых решений с твоим
вариантом → обязательные изменения ближайшего пакета и критерии готовности.
Ссылки на конкретный код при обнаружении ошибки; отдельно факты из исходников,
проверенные receipts и гипотезы. Если критического препятствия нет, не расширяй шаг
до универсального collector/decoder или идеальной обработки всех будущих аварий.
