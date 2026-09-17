# PAIR / Robinhood Promo MVP

Обычный meme TOKEN и отдельная Promo-программа: eligible BUY создаёт билеты, creator revenue и внешние пополнения финансируют призы. Текущая концепция — **все денежные призы в USDG**, короткие розыгрыши и месячный jackpot с ограниченным шансом кошелька и возможностью отсутствия победителей.

## Начать здесь

- **[Продуктовые правила](docs/PRODUCT_SPEC.md)** — что принято, что предложено, как движутся деньги и билеты.
- **[Состояние реализации](docs/IMPLEMENTATION_STATUS.md)** — что действительно реализовано и ближайший этап.
- [Карта документации](docs/README.md) — порядок чтения и правила актуальности.
- [Текущее обращение к GPT](docs/GPT_REVIEW_REQUEST.md) — постоянная ссылка на вопросы очередного обсуждения.

Утверждено внешнее общее пополнение без project fee: Short/Current/Next = 3:2:1, после заполнения Next — 50:50 между Short и Current. Излишки Next, включая целевое пополнение, идут в Current. Призовой фонд невозвратен проекту/спонсорам. Концепция Short: допуск на основе entries без Luck, случайная раздача заранее обеспеченной корзины, не больше одного приза кошельку. Допуск не является выигрышем; полный розыгрыш ещё не реализован.

Это **не полностью реализованный продукт**. Есть прототипы [FeeRouter](contracts/FeeRouter.sol) и [PromoVault](contracts/PromoVault.sol), unit tests и исследования. USDG funding, три свободных резерва и Monthly accounting реализованы. Есть регистрация, BUY/attempt replay, [атомарная фиксация Short с резервом](docs/SHORT_DRAW_COMMITMENT.md) и [проверяемый расчёт результата](docs/SHORT_OUTCOME_VERIFICATION.md). Полный production controller/RNG, конвертация и автоматическое исполнение ещё не реализованы. Публичного deployment нет.

17.09: выбрана и реализована локальная [архитектура двух фиксированных контроллеров](docs/DUAL_CONTROLLER_ARCHITECTURE.md):
общая USDG-казна с раздельными полномочиями, Short и Monthly settlement, replay из двух
источников. Версии правил Short уже реализованы внутренним компонентом. Production
RNG/readiness/keeper и конвертация ещё предстоят; ручной seed разрешён только в тестах.

## Локальные проверки

```powershell
npm ci --ignore-scripts
npm test
npm run test:farming
```

Для контрактов нужны Node/npm; для offline-модели Python 3. Дополнительные команды и границы проверок — в [карте реализации](docs/IMPLEMENTATION_STATUS.md). Тестовый DrawControllerFixture не является production controller.

## История

[Архив обсуждений и исследований](docs/archive/README.md) сохранён для evidence, а не как параллельное ТЗ. Старые TOKEN-призы, обязательная треть winning entries, распределение по весам и исторические farming-модели не переопределяют актуальную PRODUCT_SPEC.
