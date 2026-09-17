# Ревью: Monthly regression и реальный RNG

17.09.2026. Закрыли M1 → M2 → M3 двумя новыми тестами:
`test/monthly-epochs.test.cjs` (контракт + казна) и `test/monthly-replay.test.cjs`
(BUY history, cumulative ranges, поздний M2 остаток, независимость Short).
Пустая/непустая M2 ветки, неизменяемая policy и clock проверены; suite 13/13 passed.
Контракты не менялись. Полный suite не повторяли: прежний 164/164, затем CLI-тест,
теперь ещё две регрессии — всего 167 различных тестов.

Следующий пункт ограничили исследованием RNG, без production integration.
Начать с [отчёта](RNG_PROVIDER_STUDY_2026-09-17.md) и
[RPC evidence](../research/rng-provider-study/observations.json).
Повтор: `node scripts/rng-provider-probe.cjs` (только публичное чтение).

Найдены Quiver, RH-VRF и Dice; code existence подтверждён, liveness и соответствие
документации bytecode — нет. RH-VRF документирует timeout refund, навсегда закрывающий
request: он не завершает наш frozen draw. Quiver/Dice commit-reveal не устраняют
withholding. Нулевая getFee у Quiver не доказывает бесплатный работающий сервис.

Предлагаемый следующий кусок: локальный drand evmnet feasibility study.
Существующий проверяемый verifier, настоящий test vector, bad-proof tests,
gas/bytecode и future-round binding. HTTP beacon и пустой pairing smoke check
получены; это НЕ signature verification. Production provider пока не выбран.

Просим независимую оценку:

1. Есть ли оставшийся конкретный пробел в переходе M1 → M2 → M3?
2. Подходит ли evmnet под один immutable target на frozen draw без reroll? Какой
   существующий verifier проверить (исходники, версия, лицензия, аудит)?
3. Как минимально связать freeze/finality и будущий round, чтобы задержка inclusion
   или reorg не позволяла freeze с известным исходом или перебор targets?
4. Есть ли у shortlisted services путь доставки ТОГО ЖЕ результата после их
   TTL/refund/hash-chain ограничений? Нужны API/исходники, не новый request вместо retry.
5. Есть ли более простой проверенный кандидат на 4663, который мы пропустили?

Не смешиваем источники и не меняем round при timeout. Callback только принимает
seed, processing отдельно. RNG funding/readiness не блокирует empty closure.
Оплата операций не берётся из frozen prizes. Не нужны сейчас bridge RNG, новые
admin reset, переписывание accounting или реализация production adapter.

Ответ — в прежний GPT_REVIEW_RESPONSE.md. Отделяйте подтверждённые источники от
предположений; советы используются как ревью, а не автоматически принятые решения.
