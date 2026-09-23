# PAIR: текущая граница fee policy

Проверено по публичной документации 20.09.2026; не on-chain verification нашего deployment.
Источник: [PAIR Documentation — Fees & Policy Epochs](https://pair.fund/docs).

- V1 и Launch V2 — поколения продукта PAIR, не L1/L2 сети.
- Документационная 70/30 относится к V1; V2 использует mode/epoch/recipients.
  Уточнение 23.09: изученный V2 vault source тоже содержит MODE_SHARE_BPS=7000,
  но это доля mode в collected fees, не универсальная доля creator в обороте.
- Режимы V2: Creator Fees, Fee Sharing, Buyback/Burn, Holder Distribution.
  Buyback/burn направляет соответствующие комиссии на выкуп/сжигание, а не нам в claim.
- Custom/mixed-custom путь сейчас описан как Creator Fees only.
- Claim entitlement привязан к epoch и asset; смена epoch не ретроактивна.

## Что это означает для нашего кода

Наш вывод: бюджет считаем от фактически доступного нам creator revenue, не от
универсального «оборот × 1% × 70%». Наличие других режимов не означает, что надо
реализовать весь их набор внутри Promo. Режим, который направляет весь доход на burn,
нельзя одновременно считать источником того же дохода для призов.

FeeRouter не содержит 70/30. Он требует при bindSource одного recipient (сам router)
с 10000 bps и фиксирует sourceEpoch; это ограниченный профиль интеграции, не поддержка
всех режимов V2. Наши 80/20 и 50/50 в fixtures делят уже полученный доход, являются
тестовыми и не описывают PAIR protocol fee. Внешняя PAIR epoch и внутренняя campaign
FeeRouter — разные границы.

До выбора реального deployment проверить release/vault/handler, ABI и активную policy,
допустимость router как recipient, конкретные активы и фактический claim. Эти проверки
не выполнялись в текущем исправлении worker. Исторические fork/source исследования
не подтверждают актуальность нынешнего deployment автоматически.

Свежая read-only проверка: [dossier 23.09](PAIR_PROFILE_EVIDENCE_2026-09-23.md).
Релизы/маршруты нельзя смешивать; profile selection остаётся открытым.
