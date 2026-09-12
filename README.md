# PAIR / Robinhood Promo MVP

Исходные требования: [PAIR_PROMO_TOKEN_MVP.md](docs/PAIR_PROMO_TOKEN_MVP.md).

Текущее состояние: исследован PAIR launch и путь комиссий; реализованы прототипы FeeRouter и PromoVault. Rollover и полный путь до claim проверены вместе с текущим PAIR на свежем fork; измерены четыре BUY/SELL-сценария. Публичных deployments нет.

Для знакомства с проектом начните с этого README, затем прочитайте отчёты по rollover, PromoVault и farming ниже. `CODEX_CURRENT_CONTEXT_2026-09-11.md` и `GPT_REVIEW_BRIEF_2026-09-11.md` сохранены как исторические документы: их перечни следующих шагов и количество тестов уже не отражают текущую реализацию. Сейчас обсуждаем математическую устойчивость призовых правил; окончательная антифарминг-политика, indexer, production draw controller и RNG ещё не реализованы.

- [FeeRouter: модель, права, результаты и ограничения](docs/FEE_ROUTER_DESIGN.md)
- [PromoVault: учёт, API и граница доверия controller](docs/PROMO_VAULT_DESIGN.md)
- [Экономика и успешная fork-интеграция 12.09](docs/ECONOMICS_FORK_2026-09-12.md)
- [Farming: сценарии атак и условные пороги прибыльности](docs/FARMING_RESEARCH_2026-09-12.md)
- [Успешная симуляция launch](docs/PAIR_LAUNCH_SIMULATION_2026-09-11.md)
- [Исследование fee path](docs/PAIR_FEE_PATH_2026-09-11.md)
- [Первичное исследование](docs/PAIR_TECHNICAL_RECON_2026-09-11.md)
- [Дополнительные проверки](docs/PAIR_FOLLOWUP_2026-09-11.md)

```powershell
npm ci --ignore-scripts
npm test
npm run test:farming
```

Офлайн-расчёты на сохранённых данных (Python 3, без дополнительных пакетов):

```powershell
npm run report:farming
python scripts/farming-defenses.py
```

Необязательная интеграционная проверка с чтением состояния через RPC; все транзакции исполняются локально:

```powershell
npm run test:fork
```

Контракты: `contracts/FeeRouter.sol` и `contracts/PromoVault.sol`. Тестовые контракты находятся в `test/contracts/`; controller там — заглушка, не production-модуль. PromoVault резервирует средства, фиксирует обеспеченные призы и выплачивает их; выбор победителей и RNG не реализованы.

Граница учёта — успешный атомарный `rollCampaign`: финальный сбор обоих активов и закрытие accounting старой кампании предшествуют открытию новой. См. [отчёт о rollover](docs/FEE_ROUTER_ROLLOVER_REPORT.md).
