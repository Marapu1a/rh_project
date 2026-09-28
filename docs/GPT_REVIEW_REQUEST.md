# Текущий запрос GPT: закрытие operations funding перед релизной репетицией

28.09.2026. Review 46fdd34 принят в части зависимости старых obligations от рынка.
Пользователь просит завершать продукт, не расширять газовый механизм бесконечно.
90/5/5 сохраняется; дорогой gas/нехватка ETH — ожидание, не гарантия самоокупаемости.

## Законченный пакет

- Старое obligation сначала получает ETH на одно действие, без quote/swap. Refill
  сохраняет swap.nativeFloor, требует сумму на цель и transfer fee с учётом caps.
  Для старого действия неполный перевод не отправляется. Для новых работ прежний
  накопительный refill сохранён; разрешение freeze остаётся за полным forecast.
- Новые freeze сохраняют полный forecast. Pending сначала reconcile; поверх него
  не отправляется ни refill, ни collect. Призовая математика и custody не менялись.
- collectOps в существующем ops sender вызывает только pay(slot1), если USDG wallet
  не хватает на batch, но вместе с существующим credit его достаточно. Никакого pull.
  Collector/quote runtime pins, quote binding, recipient проверяются. Source не нужен.
- Общие nonce/journal/cooldown/native fee cap. Receipt сверяет Transfer и balance
  на блоке receipt. Чужой permissionless pay может опередить наш: нулевой повторный
  pay допустим, следующий pass прочитает баланс. Swap spending не начисляется на credit.
- Интеграция выявила undefined в новом pending: JSON убирал поле, checksum переставал
  сходиться после reload. Исправлено условными полями. Быстрые sender tests теперь
  проверяют сохранность checksum при JSON roundtrip для каждой стадии.

[Модуль и проверки](OPS_MARKET_EXECUTOR.md),
[fork evidence](../research/ops-funding/credit-fork-2026-09-28.json).
Реальный collector с fixture source и искусственным USDG распределил 200 USDG 90/5/5.
10 USDG operations → реальный рынок → ETH → пустому executor 0.001 ETH.
Seed 0.002 ETH. Четыре receipt-loss/disk-reload recovery без повторных sends.
Не OS SIGKILL, не полный watch→draw fork. Coordinator/старые draw проверены отдельно.
Public sends не было, локальные fees не выдаются за стоимость Nitro.

## Граница завершения

Funding в этом объёме закрываем. Если revenue ещё во внешнем source и нет collector
credit, пустому executor нужен ETH top-up для обычного pull. Не добавляем ещё одну
автоматику ради этой ситуации. Production seed/caps и custody выбираются при запуске.
Следующий пакет — общая релизная репетиция с конечным списком deployment/RPC blockers.

Просьба отмечать прежде всего потерю денег, повторную отправку, неверный результат
или реальную блокировку основного пути. Улучшения диагностики/редких случаев —
отдельным необязательным списком. Вечный достаток ETH и доступность рынка не gate.
