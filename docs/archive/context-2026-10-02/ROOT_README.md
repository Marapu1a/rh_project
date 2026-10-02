> Исторический снимок до уборки 02.10.2026. Не текущий план. [Актуальный контекст](../../CURRENT_CONTEXT.md).

# PAIR / Robinhood Promo MVP

Спекулятивный TOKEN и отдельное добровольное промо: короткие 6-часовые розыгрыши
и месячный jackpot, денежные призы в USDG. Комиссии и внешние пополнения финансируют
призы; эксплуатационные расходы отделены от призовых обязательств.

Сейчас это локальный MVP в разработке, без публичного deployment. Работает путь
от локальных BUY через replay и два Short + два Monthly цикла до claim. Торговый стенд и RNG тестовые.

## Продолжить работу

- [Текущий контекст](../../CURRENT_CONTEXT.md) — читать первым.
- [План](../../ROADMAP.md) — что делаем следующим шагом.
- [Продуктовые правила](../../PRODUCT_SPEC.md) — принятые решения.
- [Карта кода](../../IMPLEMENTATION_STATUS.md) и [навигация](../../README.md).

## Локальная проверка

```powershell
npm ci --ignore-scripts
npm run test:local:buy-cycle
```

`npm run test:local:controllers` — отдельная проверка контроллеров;
`npm test` — основной Node-набор. Нужны Node/npm; Python нужен только для отдельных
моделей. Последний фактически проверенный объём указан в текущем контексте.

[Локальный Short executor](../../LOCAL_SHORT_EXECUTOR.md) продолжает подготовленный job
после перезапуска: `npm run local:short -- --job FILE --rpc http://127.0.0.1:8545 --publisher 0 --executor 1 --watch`.
Нужен уже развёрнутый локальный узел; автономная проверка — `npm run test:local:executor`.

[Monthly worker и совместный контур](../../LOCAL_MONTHLY_EXECUTOR.md):
`npm run test:local:monthly`; запуск существующего Monthly job — `npm run local:monthly -- --job FILE --rpc http://127.0.0.1:8545 --publisher 0 --executor 1 --watch`.

[История](../README.md) читается по конкретному вопросу.
[Research evidence](../../../research/README.md) сохранены для воспроизводимости.
Временные логи — `.local/logs/` (не входят в Git).
