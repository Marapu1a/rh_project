# Постоянный ответ GPT

Обновлено: 20.09.2026.

Это независимое review-мнение, не задание на автоматическое исполнение. При следующем
обращении файл следует полностью перезаписать.

Просмотрен commit `5bea9e5861211056f05d6a3591ea8a076fbf1c9f` —
`Add local prize conversion boundary and fix review harness issues`.

## Короткий вердикт

В `LocalPrizeConverter` я не нашёл блокирующего дефекта для заявленного локального scope:
chainId 31337, стандартные TOKEN/USDG, заранее известные неизменяемые контракты destination
и adapter, искусственный fixed floor. Accounting по фактическим balance delta сходится;
donation не учитывается дважды; short output, partial input и output не converter'у откатывают
всю операцию; после revert inventory и allowance не портятся. Разделение `convert` и
`forwardQuote` удачное: уже имеющийся USDG не зависит от доступности swap.

Исправления прошлого review также подтверждены. Полный `npm test` прошёл **221/221**.
Дополнительно `local-buy-cycle` прошёл **1/1** в свежем worktree, где `.local` отсутствовал
до запуска. Structured CLI error сохраняет `code/stage/transactionHash` и ненулевой exit.

Это не делает путь production-ready. Перед реальным swap есть два важных ограничения:

1. immutable адрес adapter ещё не означает immutable маршрут: сам adapter не должен быть
   proxy/upgradeable или иметь admin-переключатели pool/path/recipient;
2. `maxInput` — лимит одной транзакции, не лимит суммарной продажи. Permissionless caller
   может вызвать `convert(maxInput, ...)` много раз и быстро продать весь inventory по всё ещё
   формально допустимому, но устаревшему floor. Для локального proof это нормально; для рынка
   нужны freshness/deviation и, если требуется, on-chain cumulative/rate bound.

## Проверка accounting и запрошенные counterexamples

| Сценарий | Что происходит | Оценка |
|---|---|---|
| TOKEN/USDG donation до `sync` | Разница с уже наблюдённым балансом добавляется один раз | Корректно; provenance намеренно не выдумывается |
| Повторный `sync` | Delta равна нулю | Нет двойного учёта |
| Output ниже ceil-floor | `afterQuote - beforeQuote < minOut`, весь swap откатывается | Корректно |
| Adapter отправил output другому адресу | Баланс converter не вырос, весь swap откатывается | Корректно |
| Adapter списал меньше exact input | TOKEN delta не равна `amount`, весь swap откатывается | Корректно для стандартного ERC20 |
| Adapter/reentrancy/revert | Откатываются transfer, counters и approvals | Повтор безопасен после подтверждённого revert |
| USDG donation плюс swap output | Donation синхронизируется отдельно, output считается по delta swap | Conservation сохраняется |
| Forward отказал | Transfer, `quoteForwarded` и `syncUSDG` откатываются атомарно | USDG остаётся для retry |

Инварианты после успешной синхронизации/операции действительно имеют вид:

- `tokenObserved == tokenSold + TOKEN.balanceOf(converter)`;
- `quoteObserved == quoteForwarded + USDG.balanceOf(converter)`;
- allowance converter → adapter равен нулю вне выполняющейся транзакции.

Нарушить их через проверенные donation/short-output/wrong-recipient/partial-input/retry
сценарии не получилось. Fee-on-transfer, rebasing и враждебные ERC20 остаются явно вне
scope; balance delta не превращает их в поддерживаемые активы.

Есть один полезный отрицательный пример, не ломающий accounting: при inventory 10 000,
`maxInput = 1 000` и устаревшем низком floor любой адрес может сделать десять допустимых
вызовов и продать всё. Deadline ограничивает включение конкретной tx, но не возраст цены,
а `maxInput` не является дневным/эпохальным budget. Не следует так описывать эти параметры.

## Destination и старые credits

В самом converter скрытой перенастройки назначения не видно: нет owner, `setVault`,
`setAdapter`, withdraw или arbitrary call; destination и adapter записаны immutable.
Смена vault через новый converter сохраняет старый inventory у старого назначения.

Но эта гарантия требует, чтобы destination и adapter сами были неизменяемыми реализациями.
Immutable ссылка на proxy оставляет upgrade-path за пределами converter. Для будущего adapter
нужен отдельный проверяемый контракт без admin route changes, с фиксированными TOKEN/USDG,
pool/path/fee tier, exact input, output только caller'у и узкими approvals.

Старый FeeRouter credit нельзя «переиспользовать» новым converter: `credit[asset][recipient]`
платится только записанному recipient. Это хорошо для custody, но даёт жёсткую границу legacy:

- debt старому converter можно и нужно обслуживать старым converter;
- USDG debt старому USDG vault можно безопасно выплатить напрямую;
- **TOKEN debt старому USDG-only vault нельзя безопасно перенаправить текущими контрактами**.

Последний случай worker обязан оставить unpaid и явно вернуть как quarantined/unsafe legacy
debt. Вызов `pay(TOKEN, oldVault)` просто превратит credit в застрявший TOKEN и не закроет A.
Поскольку публичного deployment ещё нет, новый профиль может не создавать такой долг вообще;
но уже существующий такой credit автоматизацией не исправляется.

## Ограничения будущего production adapter

Кроме уже названного fixed local floor, нужны как минимум:

- неизменяемые token pair, pool/path/fee tier, spender и output recipient;
- отсутствие proxy/admin upgrade и произвольного calldata/target;
- проверяемая свежесть цены и допустимое отклонение от независимого reference/TWAP;
- лимит price impact/liquidity и корректная нормализация decimals;
- политика cumulative/rate limit, если весь permissionless inventory нельзя продавать сразу;
- exact-input semantics и поддержка только явно разрешённых стандартных токенов;
- модель MEV/sandwich и способ исполнения, совместимый с permissionless keeper;
- понятная liveness policy при permanently broken route без возможности увести inventory.

Выбирать DEX сейчас не требуется. Но эти свойства должны принадлежать контрактной границе,
а не JSON job: недоверенный caller не обязан соблюдать off-chain лимиты.

## Следующий небольшой пакет

Я бы сделал один `local-prize-flow-v1`, не общий supervisor. В job явно зафиксировать router,
active converter, vault, TOKEN/USDG, adapter и его immutable параметры, campaign/policy,
gas cap и небольшой конечный список legacy recipients. Проверять bindings на pinned head до
первой отправки.

Порядок одного pass:

1. Доделать уже доставленный USDG: `vault.syncUSDG`, USDG `FeeRouter.pay` и
   `converter.forwardQuote` для active/legacy converters.
2. Обслужить допустимые credits без swap. Для TOKEN prize recipient разрешать `pay` только
   проверенному converter; TOKEN на legacy USDG-only vault помечать unsafe и не отправлять.
   Project recipients можно обслуживать по ожидаемой policy отдельно.
3. Выполнить один source `collect`, затем harvest обоих активов, если они claimable.
4. Повторить pay/forward, чтобы новый USDG дошёл до vault независимо от состояния adapter.
5. Только после этого делать bounded `convert`; после успешного swap — ещё один
   `forwardQuote`.

Так definite swap revert даёт `degraded`, но не блокирует уже доступный USDG и collection.
Unknown estimate/broadcast/receipt outcome по-прежнему немедленно останавливает новые writes
и возвращает `stage/hash`; повторять intent до reconciliation нельзя. Известный отказ одного
recipient изолируется общим для pass `(asset, recipient)` skip, как в текущем C.

Legacy не следует искать безграничным сканированием истории внутри каждого pass. Job должен
содержать bounded allowlist записей с типом и разрешёнными действиями, например:

- `converter`: pay TOKEN/USDG, forward, затем optional convert;
- `usdgVault`: pay только USDG;
- `project`: pay ожидаемые policy assets;
- `unsafeTokenVault`: только report/quarantine, без транзакции.

FeeRouter credit агрегирован по `(asset, recipient)`, а не campaign, поэтому drainer не должен
изобретать campaign-specific сумму. Отказ одного legacy адреса не должен голодать active
converter, здоровых recipients или source.

## Минимальные проверки следующего пакета

- active policy slot 0 обязан быть converter, его immutable vault — job vault;
- TOKEN никогда не попадает в PromoVault, включая legacy profile;
- broken adapter не мешает USDG pay/forward, collect и harvest;
- definite swap/forward failure сохраняет balances/counters и повторяется в следующем pass;
- unknown convert/forward outcome прекращает writes и сохраняет hash/stage;
- rollover на новый converter обслуживает старый converter debt и inventory;
- TOKEN credit старому USDG-only vault остаётся credit и явно попадает в unsafe report;
- два отказавших legacy recipient не блокируют здоровый current path;
- repeated pass не дублирует pay, conversion или forward.

## Проверки review

- `npm test`: **221/221**, `fail 0`, ~489 s;
- свежий detached worktree без `.local` до запуска:
  `node --test test/local-buy-cycle.test.cjs` — **1/1**, `fail 0`;
- отдельно просмотрены converter/interface/fixture, FeeRouter и PromoVault boundaries,
  funding/revenue transaction classifier и изменения CLI/test harness.

Итого: контрактный proof можно считать принятым в его честно узком локальном scope.
Следующий полезный шаг — worker/profile, который делает новый custody path реальным и
безопасно отказывается от неразрешимого legacy TOKEN→USDG-only debt. Live DEX, durable
journal/supervisor, PAIR canary и production price policy в этот небольшой пакет не входят.
