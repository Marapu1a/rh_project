# Обращение к GPT — автоматический локальный prize flow

20.09.2026. Прочитай текущий commit, укажи его hash. Ответ полностью перезапиши
в docs/GPT_REVIEW_RESPONSE.md. Review не является разрешением автоматически менять код.

## Обновление после ответа 68eba9f

Узкий fix до coordinator выполнен:

- Stale error context очищается после confirmed tx/обработанного definite rejection,
  причём до вызова onStep. LastConfirmed — отдельная история, не fallback hash ошибки.
  Регрессии: collect success → claimable read outage; callback после success/rejection.
- Short/Monthly/closeEmpty используют общий sendLocalTransaction. Scheduler прекращает
  все последующие kinds/ticks при unknown tx и неклассифицированном coded RPC error.
  haltedKind/requiresReconciliation + code/stage/hash сохраняются. Обычные локальные
  validation failures и definite rejection не теряют независимость видов.
- Формула worst-case123 рядом с MAX_LEGACY=8/DEFAULT128 и assert. Maximal-legacy integration
  с восемью старыми converter, новым и двумя current project recipients. Формула ручная,
  её нужно сопровождать при изменении control-flow; это не статический анализ кода.

Проверь, не потеряли ли мы unknown evidence, не создали ли новые continuation paths и
не сломали ли изоляцию known rejection. Новый coordinator пока НЕ реализован.
Ниже сохранён контекст законченного денежного шага; результаты новых тестов — в конце.

## Контекст проекта

TOKEN + отдельное добровольное Promo: 6-часовой Short, месячный jackpot. Все денежные
призы USDG; Luck удалён. Project share до prize custody; frozen/claimable не используются
на gas, нет withdraw/reroll/reset/proxy. Сначала полный локальный скелет, затем hardening.
Штатная работа должна автоматизироваться, а не требовать ручных кнопок.

Сначала CURRENT_CONTEXT, ROADMAP, LOCAL_PRIZE_FLOW; PRODUCT_SPEC — продуктовые правила.
Архив не перечитывать без конкретного вопроса. Реальные доли не утверждены; 80/20 и 50/50
— fixtures. PAIR V1 70/30 не universal V2 split; source policy/ABI/claim надо проверять
на выбранном deployment. В этом шаге live PAIR и DEX не трогали.

Shared converter допустим при неизменном назначении; campaign-specific conversion P&L
не обещается. Новое назначение = новый converter, старые credits/inventory остаются
старому immutable vault. Local converter только chainId 31337 с fixed test floor/adapter;
maxInput — одна tx, а не лимит суммарной продажи. Неизменяемый адрес не доказывает
неизменность внешнего implementation — будущая проверка deployment обязательна.

## Что реализовано после ответа 437c34b

Новый scripts/local-prize-flow.cjs и schema local-prize-flow-v1, запуск через общий CLI.
Solidity и старые USDG jobs не менялись. Новый pass:

1. Весь configuration preflight на pinned head, включая current policy, source,
   converter/assets/vault/adapter/параметры и bounded исторические policy witnesses.
2. Доставка доступного USDG, выплата credits обоих assets только допустимым recipients.
3. Один collect и harvest USDG/TOKEN; epoch drift запрещает collect, но не старые claims.
4. Повторное распределение, затем максимум одна swap-порция/converter и forward результата.

Definite pay/forward/convert/source failures изолируются общим private skip на pass.
Router accounting failure и unknown send/receipt останавливают writes. Stage/hash остаются
в результате и CLI. Не используем внешний skipRecipients/failures из caller в новом API.
При failed forward не продаём дополнительный TOKEN этого converter в этом pass.
Quote proceeds не зависят от успешности swap. Existing USDG paths не заменяли молча.

Legacy: максимум восемь записей converter/usdgVault/project с campaignId и slot.
Адрес должен быть указан в historical policy; prize slot 0 нельзя объявить project.
Shared current recipient не требует отдельной historical записи, credit агрегирован.
TOKEN credit старому USDG-only vault остаётся unpaid и явно выводится в unsafeDebt.
Это НЕ on-chain quarantine: чужой public pay всё ещё способен загнать TOKEN в old vault.
Новый deployment обязан сразу использовать совместимый recipient, а worker не спасает
уже застрявшие средства. Список legacy доверенный и явно заданный, не доказательство
полноты всей истории; проверки getter bindings не являются bytecode attestation.

## Ограничения и следующий шаг

Default maxSteps=128, максимум256; bound считает tx attempts. Слишком маленький лимит
при repeated pass может голодать поздние фазы, поскольку durable phase cursor нет.
CLI не предоставляет пользовательский maxSteps, использует default. Стандартный pass
ограничен конечным списком и одной convert/адрес; внешние concurrent mutations не исключены.
Remaining inventory после порции -> yielded; definite failures/unsafe debt -> degraded.
Watch ждёт pollSeconds, unknown error -> exit1. Никакого слепого resend.

LOCAL_HEAD/anchor не finality, snapshot completeness доверена publisher, RNG mock.
Нет production journal/supervisor, реального DEX/price guard и ops autorefill.
Следующий предварительный scope: совместный локальный запуск денежного и draw контуров,
избегая конфликтов signer/nonce, затем проектный gas budget; не гигантский framework.

## Просим независимую проверку

1. Нет ли неправильного назначения TOKEN, обхода unsafe legacy ветки, двойного pay/swap/forward?
2. Честны ли статусы, skip-key и порядок фаз? Не разрешается ли запись после unknown outcome?
3. Достаточны ли historical role/slot checks для заявленного доверенного local job?
   Отдели misconfigured job от отсутствующей production attestation.
4. Есть ли обычный, воспроизводимый сценарий starvation при default limits? Малые debug
   maxSteps и отсутствие persistent cursor уже известны; не объявляй это решённым.
5. Нет ли важных compatibility regressions CLI/старого USDG пути?
6. Назови один разумный следующий пакет с критериями готовности. Не возвращай ненужный
   per-campaign converter и не считай весь backlog prerequisite текущего локального шага.

Проверки и их границы ниже; не воспринимай этот текст как доказательство отсутствия ошибок.

## Итог проверок текущего шага

- Новый prize-flow набор: **11/11**, ~74 s.
- `node --test --test-concurrency=1 test/local-usdg-funding.test.cjs test/local-prize-converter.test.cjs test/local-transaction.test.cjs test/local-buy-cycle.test.cjs`: **35/35**, ~228 s.
- Итого **46** уникальных проверок; основной набор теперь **232**, полного запуска 232 не было.

Регрессионный BUY-cycle продолжает проверять прежний USDG профиль; новый converter flow
проверен отдельным source→collect→harvest→pay→convert→forward тестом и реальным CLI,
а не выдан за уже встроенный в BUY fixture профиль. Contract converter tests дополнительно
проверяют сохранность frozen reserve. Реальный PAIR/DEX не использовался.
Логи (ignored): `.local/logs/local-prize-flow-tests.log`, `.local/logs/local-prize-flow-regressions.log`.

## Проверки исправления, 20.09.2026

`node --test --test-concurrency=1 test/local-prize-flow.test.cjs test/local-scheduler.test.cjs test/local-executor-stability.test.cjs test/local-transaction.test.cjs test/local-buy-cycle.test.cjs`
— **42/42**, fail 0, ~380 s. Добавлены 8 регрессий/интеграций; основной набор теперь
**240**, полный запуск 240 не выполнялся. Лог `.local/logs/error-boundary-fixes.log` ignored.

Проверены stale read/callback context после success и definite rejection; максимальный
legacy list; unknown Short broadcast/receipt, unknown Monthly broadcast без следующего
Short tick, definite estimate rejection с продолжением Monthly; restart только после
подтверждения исходной pending tx. Прежние reorg/empty/funding/state/cutoff/abort/timeout
и BUY-cycle также прошли. Денежная математика и Solidity не менялись.
