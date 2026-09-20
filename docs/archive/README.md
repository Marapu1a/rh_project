# Архив проекта

Не текущая спецификация и не backlog. Читать только для конкретного вопроса о причине
решения, эксперименте или старом API. Начало работы — [CURRENT_CONTEXT](../CURRENT_CONTEXT.md),
последовательность — [ROADMAP](../ROADMAP.md), принятые правила — [PRODUCT_SPEC](../PRODUCT_SPEC.md).

Исторический текст сохраняется; даты, газ, внешние зависимости и статусы реализации
относятся к моменту отчёта. Наличие файла здесь не отменяет доказанного контрпримера
или полезного evidence. Сырые данные/исходники остаются в [research](../../research/README.md).

## Ревью и ответы GPT

- [GPT_REVIEW_RESPONSE](reviews/GPT_REVIEW_RESPONSE.md)
- [INDEPENDENT_AUDIT_2026-09-19](reviews/INDEPENDENT_AUDIT_2026-09-19.md)

## Снимки до уборки 19.09

- [GPT_REVIEW_REQUEST_2026-09-19](snapshots/GPT_REVIEW_REQUEST_2026-09-19.md)
- [IMPLEMENTATION_STATUS_2026-09-19](snapshots/IMPLEMENTATION_STATUS_2026-09-19.md)
- [PRODUCT_SPEC_2026-09-19](snapshots/PRODUCT_SPEC_2026-09-19.md)

## Завершённые исследования и прежние варианты

- [CONTROLLER_SIZE_STUDY](studies/CONTROLLER_SIZE_STUDY.md)
- [EXECUTION_ECONOMICS_QUICK_CHECK](studies/EXECUTION_ECONOMICS_QUICK_CHECK.md)
- [EXECUTION_FUNDING_DISCUSSION](studies/EXECUTION_FUNDING_DISCUSSION.md)
- [PAIR_DEPENDENCY_AUDIT_2026-09-15](studies/PAIR_DEPENDENCY_AUDIT_2026-09-15.md)
- [PAIR_PORTABILITY_AND_SOURCES_2026-09-15](studies/PAIR_PORTABILITY_AND_SOURCES_2026-09-15.md)
- [RNG_PROVIDER_STUDY_2026-09-17](studies/RNG_PROVIDER_STUDY_2026-09-17.md)
- [SHORT_ECONOMY_SCENARIO](studies/SHORT_ECONOMY_SCENARIO.md)
- [SHORT_LUCK_REVIEW](studies/SHORT_LUCK_REVIEW.md)
- [SHORT_PREFREEZE_AUDIT](studies/SHORT_PREFREEZE_AUDIT.md)
- [SHORT_SELECTION_OPTIMIZATION](studies/SHORT_SELECTION_OPTIMIZATION.md)
- [SHORT_SETTLEMENT_SCALING_STUDY](studies/SHORT_SETTLEMENT_SCALING_STUDY.md)
- [SHORT_SWEEP_RESULTS](studies/SHORT_SWEEP_RESULTS.md)
- [TRUST_AND_EVOLUTION_NOTES](studies/TRUST_AND_EVOLUTION_NOTES.md)

## Ранняя история

- [CODEX_CURRENT_CONTEXT_2026-09-11](CODEX_CURRENT_CONTEXT_2026-09-11.md)
- [ECONOMICS_FORK_2026-09-12](ECONOMICS_FORK_2026-09-12.md)
- [FARMING_RESEARCH_2026-09-12](FARMING_RESEARCH_2026-09-12.md)
- [FEE_ROUTER_DESIGN](FEE_ROUTER_DESIGN.md)
- [GPT_PROMO_REVIEW_REQUEST_2026-09-12](GPT_PROMO_REVIEW_REQUEST_2026-09-12.md)
- [GPT_REVIEW_BRIEF_2026-09-11](GPT_REVIEW_BRIEF_2026-09-11.md)
- [PAIR_FEE_PATH_2026-09-11](PAIR_FEE_PATH_2026-09-11.md)
- [PAIR_FOLLOWUP_2026-09-11](PAIR_FOLLOWUP_2026-09-11.md)
- [PAIR_LAUNCH_SIMULATION_2026-09-11](PAIR_LAUNCH_SIMULATION_2026-09-11.md)
- [PAIR_PROMO_TOKEN_MVP](PAIR_PROMO_TOKEN_MVP.md)
- [PAIR_TECHNICAL_RECON_2026-09-11](PAIR_TECHNICAL_RECON_2026-09-11.md)
- [PROMO_CURRENT_SPEC_2026-09-12](PROMO_CURRENT_SPEC_2026-09-12.md)

## Уборка 19.09.2026

- 15 отчётов/обсуждений перенесены из активного каталога в studies/reviews.
- Прежние PRODUCT_SPEC, IMPLEMENTATION_STATUS и GPT_REVIEW_REQUEST сохранены снимками.
- 27 локальных логов из корня перенесены в `.local/logs/`, исключённую из Git.
- Ссылки обновлены. Research vectors, JSON evidence, Solidity, scripts и tests не удалялись.
- Два коротких указателя на старую спецификацию/обращение оставлены в docs для ранее
  переданных ссылок. Это навигация, а не параллельные спецификации.
- Источник актуального состояния теперь CURRENT_CONTEXT, порядка работ — ROADMAP,
  правил продукта — PRODUCT_SPEC. Старые таблицы кандидатов сохранены только в snapshot.
