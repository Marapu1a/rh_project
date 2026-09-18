# Состояние реализации

Обновлено по локальному коду и проверкам: 18.09.2026. Это карта кода, а не утверждение реализации всей [продуктовой схемы](PRODUCT_SPEC.md).

Текущий этап 18.09: [Nitro block identity](ROBINHOOD_BLOCK_SEMANTICS.md).
Cutoff, genesis/activation и terminal heights используют L2 ArbSys на Robinhood.
Окно 1..256 сохранено; runtime Short 22 368, Monthly 17 445, vault 8 496 bytes.
Finality/RNG binding пока не реализован.
Проверки: прежний основной набор **167/167**, новые Nitro tests **5/5** (отдельно),
оба RPC passed; новые тесты уже включены в `npm test`, теперь 172.

Предыдущий этап 17.09: [drand feasibility](DRAND_FEASIBILITY.md): настоящие подписи
проверены standalone verifier локально (2/2) и read-only в Robinhood RPC mainnet/testnet.
Runtime 9 139 bytes, local prove+store 225 068 gas. Production integration отсутствует;
следующий кусок — timing/future-round binding. Код Short/Monthly и казны не менялся.
Полный текущий `npm test`: **167/167 passed**; отдельный research suite **2/2 passed**.

Предыдущий этап 17.09: закрыта регрессия M1 → M2 → M3 и выполнен
[первичный отбор RNG](RNG_PROVIDER_STUDY_2026-09-17.md). Monthly suite **13/13 passed**;
добавлено два теста, набор вырос до 167. На тот момент полный suite не повторялся.
Production RNG не добавлен; запланированная тогда проверка подписи/gas выполнена
в текущем feasibility package, future-round binding остаётся впереди.

Предыдущий этап: [Monthly admission epochs](MONTHLY_RULES_EPOCHS.md).
Полный `npm test`: **164/164 passed**. После него расширенный replay/CLI suite — **6/6**,
дополненная RPC publication/genesis проверка — **1/1**. На том этапе набор содержал 165
различных тестов; повторный полный запуск после добавления CLI-теста тогда не выполнялся.
Отдельный dual size/readiness deployment check также passed. Старые числа ниже — предыдущие этапы.

| Часть | Фактическое состояние |
|---|---|
| Два контроллера / новая казна | DualControllerPromoVault: immutable Short/Monthly capabilities, общая бухгалтерия, USDG-only prizes. Старший бит drawId разделяет типы с проверкой при begin и reserve; pre-seal cross-kind collision закрыт. Research wrappers 22 368 / 17 445 байт, vault 8 496; стандартный deploy прошёл без viaIR |
| Внутренний Monthly settlement | MonthlySettlement: chunks, один seed, permissionless process/finish, atomic start/settle/consume. Допуск имеет future epochs; interval/notice immutable. Empty не двигает clock. Нет production RNG. [Модель](MONTHLY_RULES_EPOCHS.md) |
| Monthly epochs / replay v4 | Независимые Monthly ranges, B+1, старый набор первым, неизменяемая policy на draw. Builder/CLI сверяет публикации и context; empty assertion проверяется replay, а не доказывается контрактом |
| Replay v3 | Два source, kind-specific events, deployment domain связывает controllers/vault/assets/policy, RPC reverse-binding verification. Offline authenticity не доказывается |
| Исследование полного controller | 17.09 отдельный исполняемый макет RNG/roles/readiness/Monthly, шесть compile profiles. Обычный root 28 475 байт; viaIR+fixed helper+runs=1 — 24 444, лишь 132 байта запаса. Production contracts/settings не менялись. [Измерения и ограничения](CONTROLLER_SIZE_STUDY.md) |
| Оптимизация Short selection | 17.09 общий validated primitive, повторное использование ranks; runtime fixture 18 497 байт вместо 20 340. Пять сравнений газа на одинаковом state/seed с exact resultHash и vault accounting. Новых внешних helpers нет. [Результаты](SHORT_SELECTION_OPTIMIZATION.md) |
| Canonical Short settlement | 16.09 внутренний ShortSettlement соединяет dataset + epochs + streaming top K + реальный finalize/consume. Один seed, permissionless process/finish, независимый JS result/recovery. Seed вручную только в fixture; настоящий RNG/readiness/keeper ещё отсутствуют. [Границы](SHORT_SETTLEMENT.md) |
| Версии правил Short | 16.09 внутренний ShortRulesEpochs + lifecycle v2: notice, B+1 mint boundary, обслуживание старой версии, fresh cutoff после задержки, проверяемое empty assertion. Нет production economic/finality policy или authenticated terminal. [Описание](SHORT_RULES_EPOCHS.md) |
| Подготовка Short dataset | 16.09 внутренний ShortDatasetPreparation: Publishing/Ready/Superseded/Sealed, фактические root/count/attempts, atomic reserve, новый единый context без partition/executor. Replay-builder и CLI сверки публикации. Нет production authorization/activation/terminal. [Границы](SHORT_DATASET_PREPARATION.md) |
| FeeRouter | Прототип TOKEN/USDG accounting, фиксированный PAIR source, recipient credits, атомарный rollover |
| PromoVault | Резервирование draw, назначение обеспеченных призов и claim; поддерживает оба актива |
| Три продуктовых USDG-резерва | Реализованы free Short/Current/Next; target immutable; monthly win переносит Next → Current |
| Внешнее funding 3:2:1 / targeted / overflow | Реализовано, direct USDG — GENERAL, дробление учитывается общей фазой |
| Monthly accounting | start/settle win/no-win, один pending, cycleId, независимый claim; без календаря/RNG/attempts |
| Конвертация TOKEN → USDG | Не реализована |
| Публичная регистрация | 15.09 реализован ParticipantRegistry: самостоятельный opt-in, публичное событие, без admin/backdating. Пока не подключён к indexer/controller. [Описание](PARTICIPANT_REGISTRY.md) |
| Indexer и entries | 15.09 реализованы узкий direct BUY decoder, полный replay регистраций/покупок → carry/начисленные attempts, CLI чтения блоков через свой RPC и сравнения отчёта. Проверены на настоящем router в локальном fork. Нет daemon и production finality. [Результат и границы](DIRECT_BUY_REPLAY.md) |
| Жизненный цикл attempts | 15.09 реализован replay OPEN/FROZEN/CONSUMED по Short/Monthly: inclusive block cutoff, пересчёт снимка, проверка его hash, диапазоны и conservation. Есть test-only event source; нет production связи с RNG/денежным settlement или выбора eligible cutoff. [Описание](ATTEMPT_LIFECYCLE.md) |
| Production controller, capped odds, RNG | Нет; DrawControllerFixture — неограниченная тестовая заглушка |
| Атомарный Short commitment | 15.09 V2: правила сохраняются отдельно на draw, JSON + ABI hashes участников, snapshot/cutoff/D и настоящий reserveUSDG одной транзакцией. Только внутренний API; нет активации версий/readiness/authorization. [Границы и тесты](SHORT_DRAW_COMMITMENT.md) |
| Детерминированный Short outcome | Solidity + независимый JS verifier, сверка двух хешей, параметрический допуск/очередь/призы/resultHash. Terminal только в test fixture с caller seed. Локальный gas sweep N=10..1000, K=10. [Алгоритм, цифры и ограничения](SHORT_OUTCOME_VERIFICATION.md) |
| Исследование масштабирования | Test-only streaming: публикация/валидация полного ordered dataset до reserve, последовательная обработка одним seed, permissionless продолжение, atomic finish. До 5000 участников локально, RPC limits отдельно. Не production интеграция. [Выводы/evidence](SHORT_SETTLEMENT_SCALING_STUDY.md) |
| Short без Luck и корзина призов | 14.09 реализована локальная Python-модель полного short; параметры открыты, production-реализации нет. [Описание и результаты](SHORT_MODEL.md) |
| Расчёт корзины на Solidity | 15.09 реализована pure-библиотека ShortPrizeBasket: положительные призы, порог базовой единицы, точный остаток. Проверена с PromoVault; production controller пока не подключён. [API и границы](SHORT_PRIZE_BASKET.md) |
| Frontend, спонсорские физические призы | Не реализованы; 14.09 принята граница отдельного спонсорского слоя поверх постоянного промо, без доступа к основной казне |

## FeeRouter

Исходник: [FeeRouter.sol](../contracts/FeeRouter.sol). Permission model: Ownable2Step и ReentrancyGuard; владелец однократно привязывает source и выполняет rollover. Collect/harvest/sync/pay допускают permissionless исполнение с фиксированными получателями.

`rollCampaign(expectedCampaignId, next)` собирает доступное source revenue обоих активов, учитывает прямые TOKEN/USDG, закрывает старый accounting и переключает policy атомарно. Ошибка финального сбора откатывает переход. Старые unpaid credits сохраняются. `endsAt` — плановое время/нижняя граница перехода, бухгалтерская граница — успешная rollover transaction. Изменение PAIR source epoch вызывает отказ, автоматической миграции нет.

Три recipient slots текущего FeeRouter — **не Short/Current/Next**. Контракт распределяет активы между адресами, не ведёт новый внутренний jackpot accounting и не меняет TOKEN на USDG. Действует cumulative rounding; остаток закрытой кампании относится старому Promo-recipient. [Подробный отчёт](FEE_ROUTER_ROLLOVER_REPORT.md).

## PromoVault

Исходник: [PromoVault.sol](../contracts/PromoVault.sol). Новый constructor требует четвёртый аргумент — положительный nextStartTarget в raw USDG. По активу: available = balance − reserved − claimable. USDG available включает три свободных резерва и ещё не распознанные переводы; брать из него произвольный бюджет нельзя. reserveUSDG списывает только Short или Current, finalize возвращает остаток в исходный резерв. Старый reserve для USDG запрещён. Только immutable controller резервирует бюджет и назначает ненулевые обеспеченные награды. Claim разрешён любому caller, но только заранее указанному winner; transfer failure сохраняет долг. Owner withdrawal, срок сгорания claim, proxy и arbitrary rescue не добавлены.

Пустой finalize разрешён бухгалтерски, но контракт не доказывает, что random действительно дал no winners. `campaignId` — metadata, не проверенная связь с policy FeeRouter. Controller может назначать winners в пределах бюджета; безопасность production rules этим не обеспечена.

Полная финализация списком O(K), где K — количество winners, не всех участников N. Максимальный production размер не установлен. Нельзя заменять gas-проблему произвольным исключением уже назначенных winners. [Подробности](PROMO_VAULT_DESIGN.md).

## Проверки и воспроизведение

Текущая проверка 16.09: **128/128 tests в npm test прошли**, включая 8 новых epoch tests. Solidity компилируется штатно; проверка локальная, без публичных транзакций/нового fork. На Node 24.21.0 исправлены старые сравнения ethers Result: сравниваются все вложенные decoded values вместо proxy identity; после исправления полный suite повторён успешно. Предыдущие пакеты: dataset 120/120, streaming 110/110. [Scaling study](SHORT_SETTLEMENT_SCALING_STUDY.md): 10 atomic/stress сценариев (два ожидаемо OOG при 32M) и 3 завершённых streaming сценария до N=5000; read-only параметры двух RPC сохранены отдельно. Эти числа относятся к study, не к новому epoch-компоненту. Настоящий PAIR/router на local fork проверен этапом [direct BUY](DIRECT_BUY_REPLAY.md).

Проверка 14.09: 43 контрактных tests (16 FeeRouter + 27 PromoVault), 9 offline farming tests и 11 новых Short tests прошли. Сохранённый Short-отчёт воспроизведён с точным совпадением. Новые тесты funding и monthly accounting включены в npm test. Новый сетевой fork не запускался.

```powershell
npm ci --ignore-scripts
npm test
npm run test:farming
```

Офлайн-исследования на сохранённых данных, Python 3:

```powershell
npm run report:farming
python scripts/farming-defenses.py
```

Они относятся к историческим экономическим кандидатам, **не проверяют принятую схему entries → допуск + случайная раздача корзины**.

Необязательные локальные fork-прогоны требуют сети для чтения RPC. Публичных транзакций не отправляют:

```powershell
npm run test:fork
npm run test:fork:farming
```

PAIR route и доступность блока могут измениться; прошлый успех не гарантирует повтор. Выходы могут перезаписываться. Скрипт адаптирован к новому API, но эта адаптация на RPC не проверялась; USDG Next теперь исключается из тестовых выплат. Старый сохранённый self-funded результат нельзя считать результатом новой версии. [Политика research-файлов](../research/README.md). Исторический подтверждённый путь PAIR → FeeRouter → rollover → PromoVault → claim приведён в архивном отчёте экономики.

## Следующий этап

USDG funding/monthly accounting, регистрация, basket math, BUY/attempt replay, commitment, deterministic outcome, [dataset preparation](SHORT_DATASET_PREPARATION.md), [Short epochs](SHORT_RULES_EPOCHS.md) и [canonical Short settlement](SHORT_SETTLEMENT.md) реализованы компонентами. Новый путь соединяет dataset, immutable policy, streaming outcome и атомарное денежное завершение/consume. Старый V2 и streaming study остаются историческими тестовыми путями. Следующий связанный шаг — authenticated seed: выбрать и привязать источник случайности, определить готовность до freeze. Production controller ещё не собран. Остаются authorization, economic/finality readiness, D/notice/полномочия, keeper и gas funding. Immutable controller должен поддерживать Monthly до deployment. Lifecycle replay не доказывает честность RNG; новый full-sort verifier проверяет результат при заданных dataset/seed, а не истинность BUY history. Target MVP — 100 USDG; конвертация и остальные численные настройки открыты. Публичный запуск не готов.

14.09: Luck удалён из принятой схемы и `short_model.py`; `short_economy.py` использует только entries (рабочий допуск первого билета 20%). Исторические модели изолированы в `short_model_legacy.py` / `short_economy_legacy.py`. Прошли 6 текущих модельных, 5 economy и 19 исторических/сравнительных тестов.
