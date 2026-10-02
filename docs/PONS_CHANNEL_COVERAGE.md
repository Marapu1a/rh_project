# G10 — текущий охват покупки через Pons

Обновлено02.10.2026. Матрица относится к тестовому контуру, не публичному допуску.
Исследования, прежние статусы и receipts сохранены в [истории этого модуля](archive/context-2026-10-02/docs/PONS_CHANNEL_COVERAGE.md).
Новые маршруты не меняют старые genesis/frozen результаты автоматически.

## Что поддержано и проверено

| Маршрут | Тестовый статус | Основание |
|---|---|---|
| Прямой USDG→curve | Поддержан | pons-curve-buy; refund/graduation, index/attempts |
| USDG/ETH→curve, подтверждённый self-batch | Поддержан отдельными genesis-профилями | Signed type4/type2, execution/delegation, funding basis; [история](PONS_BATCH_ATTRIBUTION.md) |
| Прямой USDG→pool Universal Router | Поддержан | pons-v4-buy, точные commands/actions/settlement |
| Терминал ETH→USDG→pool, последовательно | Поддержан для подтверждённого direct BUY | Funding отдельно, один целевой BUY |
| Терминал USDG/ETH→pool, self-batch3/6 calls | Поддержан в новом genesis launch-v2 | [Fresh fork → policy/index/API](PONS_AUDIT_2026-10-02.md) |
| Pons API через 0x | Исполнение трёх quotes проверено, **допуск не добавлен** | [RDH curve / WETH / graduated PRIORS](PONS_ZEROEX_EXECUTION.md); PRIORS split-route не использует Pons pool |
| Произвольные relayers, smart wallets, другие swaps | Не допускаются автоматически | Transfer/баланс TOKEN не доказательство подходящего BUY |

Единый реестр: scripts/pons-profiles.cjs. Новый профиль:
`direct-buy-pons-launch-v2` / `rh-pons-curve-pool-self-batch-v1`.
Старый launch-v1 не допускает pool batches; это сохранённая семантика, не текущий пробел v2.
Форматы exact; расширение допуска требует нового доказательства и явной версии.

## Что означает PASS

Исходные функции терминала использованы в harness с pinned sources. На локальном fork
выполнены calls, затем локальная policy admission, durable index и HTTP/worker API.
USDG101 даёт один Short и один Monthly, carry1; ETH funding учитывается по платежу BUY,
не по общему балансу кошелька и не вторично за обмен. Повтор не удваивает результат.
Это не полный click-through установленного MetaMask и не production finality.

## Осталось для завершения G10

1. 0x execution/spender/payer/recipient и вход/выход подтверждены в трёх
   [локальных сценариях](PONS_ZEROEX_EXECUTION.md). Остались refund, точный допуск
   безопасной ветки. [Реальные pool receipts найдены](PONS_GRADUATION_REVIEW_2026-10-02.md),
   включая 0x/EntryPoint; нужен локальный replay и точная attribution. Сам API quote
   не доказывает выбор UI; текущий frontend сравнивает direct/aggregator после graduation.
2. После proof определить минимальный adapter и проверить policy/index/API либо
   зафиксировать конкретную неподдержанную ветку. Одно предупреждение не заменяет охват.
3. Проверить обнаружение неизвестных покупок целевого рынка, сохранённую причину,
   пользовательский статус и сигнал оператору. Не обещать ретроначисление в закрытые draws.
4. Реальный wallet UX: account/chain changes, rejected/pending/unknown submissions,
   batch/fallback. Исторический Pons stub показал text-based fallback даже при4001;
   эту политику нельзя некритично копировать в наш sender.
5. Сверить итоговую матрицу на одном тестовом кандидате; затем продолжать этап A
   [roadmap](ROADMAP.md), а не переходить сразу к боевому deployment.

## Evidence по вопросам

- [Исходные терминальные функции и pool receipts](PONS_POOL_TERMINAL.md).
- [Curve batches и EIP-7702](PONS_BATCH_ATTRIBUTION.md).
- [Предыдущий общий профиль](PONS_LAUNCH_PROFILE.md).
- [Последний пакет и исправления](PONS_AUDIT_2026-10-02.md).

Порог100USDG, распределение90/5/5 и frozen обязательства не менялись.
