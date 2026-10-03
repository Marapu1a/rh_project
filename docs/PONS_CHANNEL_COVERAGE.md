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
| Pons API через 0x, прямой holder → Settler → один USDG/Pons pool | Поддержан узким genesis launch-v3 | [Fork BUY + отдельная policy/index/API интеграция](PONS_ZEROEX_POOL_ADMISSION.md) |
| EntryPoint v0.7 / Alchemy 7702 → один USDG/Pons BUY | Поддержан узким genesis launch-v4 | [Signed fork + policy/index/API](PONS_ENTRYPOINT_POOL_ADMISSION.md); parent code, один UserOperation |
| Другие 0x: curve, split/external pools, refund/partial, native/multi-op/paymaster | Не допускаются этим профилем | [Прежние исполненные quotes](PONS_ZEROEX_EXECUTION.md) не дают общего допуска |
| Произвольные relayers, smart wallets, другие swaps | Не допускаются автоматически | Transfer/баланс TOKEN не доказательство подходящего BUY |

Единый реестр: scripts/pons-profiles.cjs. Новый профиль:
`direct-buy-pons-launch-v4` / `rh-pons-curve-pool-batch-zeroex-entrypoint-v1`.
Он включает прежний v3; старые v2/v3 не получают новые маршруты автоматически.
Старый launch-v1 не допускает pool batches; это сохранённая семантика, не текущий пробел v2.
Форматы exact; расширение допуска требует нового доказательства и явной версии.

## Что означает PASS

Исходные функции терминала использованы в harness с pinned sources. На локальном fork
выполнены calls, затем локальная policy admission, durable index и HTTP/worker API.
USDG101 даёт один Short и один Monthly, carry1; ETH funding учитывается по платежу BUY,
не по общему балансу кошелька и не вторично за обмен. Повтор не удваивает результат.
Это не полный click-through установленного MetaMask и не production finality.

## Осталось для завершения G10

1. Прямой holder BUY за USDG в целевом pool доказан и подключён; [границы](PONS_ZEROEX_POOL_ADMISSION.md).
   Узкий EntryPoint/Alchemy USDG путь также подключён; native, multi-op/paymaster,
   refund/partial, split/external рынки остаются вне допуска.
   Сам API quote не доказывает выбор UI: frontend сравнивает direct/aggregator.
2. Для следующих оболочек получить отдельный proof payer/recipient/debit;
   не расширять текущий адаптер по эвристике переводов или получению TOKEN.
3. Прямые неподдержанные holder-кандидаты видны sender в API с причиной без билетов.
   EntryPoint account-only отказы также видны account без начисления bundler.
   Другие неизвестные оболочки, пользовательское отображение причин и сигнал оператору
   ещё требуют работы. Ретроначисление в закрытые draws не обещается.
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
