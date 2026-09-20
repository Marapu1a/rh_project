# Текущий контекст

Обновлено 21.09.2026 после lock cleanup и gas calibration.

## Где находимся

Локальный сквозной MVP: meme TOKEN + добровольное Promo, Short раз в 6 часов и
месячный jackpot, денежные призы USDG. Публичного deployment нет.

Работают две соединённые coordinator цепочки:
- BUY → replay/builders → сохранённые jobs → Short/Monthly → awards/claim → следующий цикл;
- source collect/harvest TOKEN+USDG → FeeRouter credits/pay → converter → USDG reserves;
  отдельная доля проекта не поступает в призовую custody.

Это chainId 31337, упрощённый venue, fixed swap fixture и управляемый тестовый RNG.
Реальные DEX/RNG, production finality и автоматическое эксплуатационное финансирование
ещё не готовы. Локальный скелет связан, production-продукт не завершён.

## Последний результат и проверки

Lock initialization cleanup исправлен: write/close failure до action освобождает свой
fd/lock, чужой lock сохраняется. Диагностический trace оставлен. Прежнее подозрение на
успешный await с оставшимся lock не подтверждено и отозвано review.

[Калибровка](LOCAL_EXECUTION_CALIBRATION.md): синтетические 100/1 000/10 000 участников,
chunks64, 10/64 места, два seed, Short/Monthly совместно и отдельно при 1 000.
Плоские 3M недостаточны для некоторых stress64 operations; измеренный пример профиля
отделён от старого state. Это sampled envelope, не contract cap и не worst-case proof.

Boundary 1 000 / stress64: один бюджет не покрывает два draw; low estimate требует topup.
32 process + 2 finish выполнены отдельными CLI children с восстановлением state/progress,
при 2 gwei и точной сверке native delta с receipts. Это clean restart, не crash recovery.

Targeted tests 21.09: 37/37 (424 s), state lock / budget / coordinator / local controllers.
Полный npm test не запускался. Solidity и продуктовая математика не менялись.

## Ближайший кусок

На основе измерений спроектировать ограниченный local native funding/refill из bootstrap
и свободной доли проекта: источник, целевой запас, пороги, лимиты и expensive-gas wait.
Не тратить frozen/claimable. Реальный swap/RNG и production fee models отдельно.
Измеренные rules/data/seed не гарантируют любой будущий gas; эксплуатационный диапазон
не enforced контрактом. Полный порядок — [ROADMAP](ROADMAP.md).

## Основные ограничения

- Local guards не снимать для запуска в другой сети. Источник комиссий, BUY decoder,
  block identities, fee model, DEX/RNG и compiler target проверяются для каждого профиля.
- FeeRouter ещё напрямую связан с PAIR API. Новая сеть/площадка — независимый deployment;
  старые prize balances/credits не переносятся и не выводятся.
- Fixed floor не заменяет market price guard. Legacy USDG-only TOKEN debt лишь
  диагностируется; публичный pay остаётся возможным. Полнота legacy list доверена config.
- Budget — off-chain forecast, не escrow и не запрет прямого seal вне coordinator.
  Fixture estimates не доказаны для всех возможных данных/seed; требуется калибровка.
- Seed/finality, publisher trust, durable recovery и incremental indexer не завершены.

## Не пересматривать случайно

Frozen/claimable не финансируют эксплуатацию. External funding не создаёт project fee.
Creator/project shares ещё не утверждены; fixture percentages не продуктовая экономика.
Campaign boundary — успешный rollover; endsAt только плановое время.
Текущие денежные призы USDG, Luck удалён, sponsor layer отдельно. Нет admin prize withdrawal,
proxy, reroll/reset или подмены random. Immutable destination старого converter сохраняется.

[Продуктовые решения](PRODUCT_SPEC.md), [карта реализации](IMPLEMENTATION_STATUS.md),
[исторический снимок статусов](archive/snapshots/PROJECT_PROGRESS_BEFORE_REVIEW_2026-09-20.md).
Ответ GPT — вспомогательное мнение, не автоматическое задание.
