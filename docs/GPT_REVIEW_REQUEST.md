# GPT: Infinity BUY → автоматические билеты → dataset

27.09.2026. Просим независимое review законченного пакета. Ваш ответ — вспомогательный
материал; продуктовые решения определяет владелец. Ответ оставляйте в GPT_REVIEW_RESPONSE.md.

## Что принято владельцем

Первый релиз PAIR Infinity, creator fee3%. Для нового deployment участие без регистрации.
100 nominal USDG фактических расходов покупателя (fees включены, refunds вычтены)
дают entry; carry сохраняется. SELL не создаёт и не отменяет entries. Неоднозначные
маршруты не засчитываем. Старую V2 историю и snapshots не переопределяем.
Внутренние доли creator revenue всё ещё не утверждены.

## Что реализовано

- Новый `scripts/infinity-buy.cjs`: отдельная schema/adapter version, pinned runtime
  adapter/manager/hook, один TOKEN/USDG pool, direct executeExactInput.
- Проверяем payer=recipient=tx.from, canonical calldata/pool/direction/limits,
  receipt Swap и settlement transfers. USDG максимум не становится объёмом:
  refunds из settlement/adapter вычитаются. TOKEN delivery совпадает с pool output.
- В `direct-buy` automatic только для новой schema. Прежняя registration semantics
  сохранена. Поле grossQuoteRaw по совместимости содержит net debit только в новой
  policy, рядом явные netQuoteDebitRaw/refundQuoteRaw/poolQuoteRaw/quoteBasis.
- BuyPolicySource закрепляет новую genesis; штатный admission и полный block scan.
  Historical runtime проверяется для Infinity каждого блока. Неизвестное расширение
  требует обновлённого decoder после activation, не silent acceptance.
- Старый registry остаётся immutable deployment-domain binding контроллеров, но
  register() не нужен и регистрационные события не влияют на новые entries.
  Контракты и призовая математика не менялись; никаких новых контрактных заглушек.

## Доказательства

[Модуль](INFINITY_BUY.md), [fork evidence](../research/infinity-source-audit/entries-fork-2026-09-27.json).
Новый local31337 fork реальных PAIR contracts: две покупки с maximum110USDG,
refund6.70 каждая → 2entries+6.60carry без register → admission → RPC scan →
scheduler saveJob/begin/publish. Независимый buildFromHistory совпадает с artifact,
повторная доставка блоков не удваивает entries. Прошли43/43 pure BUY/lifecycle tests
и отдельно2/2 saved evidence. Full suite не запускали.

Fork draw vault отдельно пополнен100USDG из искусственно funded buyer; это не
заявление, что две покупки финансируют100USDG призов. RNG — существующий fixture,
вероятности/weights fixture; случайность, seal/settlement/payout здесь не проверены.
Runtime hashes не доказывают отсутствие изменений implementation за proxy.
Production finality/admission, incremental service и единый coordinator впереди.

## Вопросы

1. Не допускает ли net debit attribution лишнего объёма через refunds/transfers,
   смешение плательщика и получателя или неоднозначные receipts в этом узком маршруте?
2. Нет ли протекания automatic semantics в старую V2 историю/commitments?
3. Достаточно ли сохраняется boundary genesis → admission → full scan → dataset?
4. Следующий пакет видим как выбор/подключение production RNG и затем сквозной
   цикл до выплаты. Есть ли конкретный blocker, который нужно закрыть раньше?

Не расширяем охват до всех router forms и не обещаем всем владельцам TOKEN билеты.
Просьба отделить подтверждённые дефекты от будущих эксплуатационных ограничений.
