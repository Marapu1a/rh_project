# Ревью оптимизации Short selection

17.09.2026. После ответа на canonical settlement владелец согласовал узкий пакет:
общий отбор кандидатов, эквивалентность результата, размер и газ. Сначала убираем
лишние вычисления; fixed helpers пока не вводим. Предыдущие версии в Git.
GPT_REVIEW_RESPONSE пока относится к предыдущему пакету.

## Изменения и доказательства

- `ShortOutcome.selectTopK`: общий проверяющий inputs primitive для atomic compute
  и canonical streaming; возвращает Candidate[] с готовыми rank и admitted.
  Массив выделяется длиной K, используются только min(admitted,K) элементов.
- `ShortSettlement.processShort`: больше не считает local prizes/resultHash
  и не пересчитывает ранги. Формула, admission/order/prize domains, canonical
  context/resultHash, freeze и terminal semantics прежние.
- Два новых теста: прямой selection (кандидаты/ranks/пустой хвост/invalid inputs);
  два admitted из разных chunks при K=3 с random subset без крупнейшего приза,
  partition 4/1, одинаковый resultHash и настоящий finalize.
- `scripts/short-selection-benchmark.cjs`, `research/short-selection-benchmark.json`:
  baseline 2586de8, тот же frozen state/context/seed через локальные snapshot/setCode.
  Каждая ветка проверяет resultHash full-sort JS и реальные vault liabilities.
  Это эксперимент Hardhat, НЕ механизм обновления production контракта.
- Размер fixture: **20 340 → 18 497 байт**, запас **6 079** до проверяемого лимита.
- N=1000/K=10: processing gas **9 902 387 → 8 981 480** (−9.3%).
  N=1000/K=64, near-certain admission: **46 717 935 → 32 506 799** (−30.4%).
  Finish в пяти сценариях +29 gas, суммарный process+finish дешевле.
- [Методика, все сценарии и ограничения](SHORT_SELECTION_OPTIMIZATION.md).
  Это не production gas bound и не обновление прежней финансовой модели.

## Что проверить

1. Сохранены ли inputs validation, порядок кандидатов/ties и оба result domains?
   Не может ли нулевой хвост Candidate[K] попасть в merge, особенно после пустого
   chunk или при 0 < admitted < K?
2. Достаточно ли проверки partial admission across chunks и сравнения с full-sort?
3. Корректно ли сравнение газа на одном состоянии при подстановке runtime с теми
   же immutables? Есть ли искажение, способное объяснить заявленный выигрыш?
4. Следующий отдельный пакет — содержательный size budget для RNG/Monthly/roles/readiness.
   Какие минимальные реализации нужны для честной оценки, без пустых stubs и
   преждевременного разбиения на fixed helpers?
5. Если понадобится helper, согласны ли оставлять состояние и единственное право
   двигать PromoVault деньги в root, а наружу выносить только фиксированные pure
   вычисления? Никакого proxy/delegatecall/replacement.

Поправка к прошлому ревью: основной ops-кандидат — свой ETH buffer/autorefill до
funding prize reserves. Alchemy/AA обсуждался как fallback, не обязательный основной
transport. Recovery сейчас direct publish; decoder конкретного AA потребуется
при его подключении. В этом пакете transport не меняли.

Настоящий RNG, Monthly controller, D/finality/roles/readiness и keeper ещё впереди.
6 KB запаса не означают, что всё точно поместится. Просим конкретные замечания,
без изменения продукта ради размера и без превращения исследования в большой редизайн.
