# PAIR / Robinhood Promo MVP

Спекулятивный TOKEN и отдельное добровольное промо: короткие 6-часовые розыгрыши
и месячный jackpot, денежные призы в USDG. Комиссии и внешние пополнения финансируют
призы; эксплуатационные расходы отделены от призовых обязательств.

Сейчас это локальный MVP в разработке, без публичного deployment. Работает путь
от локальных BUY через replay и два Short + два Monthly цикла до claim. Торговый стенд и RNG тестовые.

## Продолжить работу

- [Текущий контекст](docs/CURRENT_CONTEXT.md) — читать первым.
- [План](docs/ROADMAP.md) — что делаем следующим шагом.
- [Продуктовые правила](docs/PRODUCT_SPEC.md) — принятые решения.
- [Карта кода](docs/IMPLEMENTATION_STATUS.md) и [навигация](docs/README.md).

## Локальная проверка

```powershell
npm ci --ignore-scripts
npm run test:local:buy-cycle
```

`npm run test:local:controllers` — отдельная проверка контроллеров;
`npm test` — основной Node-набор. Нужны Node/npm; Python нужен только для отдельных
моделей. Последний фактически проверенный объём указан в текущем контексте.

[Локальный Short executor](docs/LOCAL_SHORT_EXECUTOR.md) продолжает подготовленный job
после перезапуска: `npm run local:short -- --job FILE --rpc http://127.0.0.1:8545 --publisher 0 --executor 1 --watch`.
Нужен уже развёрнутый локальный узел; автономная проверка — `npm run test:local:executor`.

[Monthly worker и совместный контур](docs/LOCAL_MONTHLY_EXECUTOR.md):
`npm run test:local:monthly`; запуск существующего Monthly job — `npm run local:monthly -- --job FILE --rpc http://127.0.0.1:8545 --publisher 0 --executor 1 --watch`.

[История](docs/archive/README.md) читается по конкретному вопросу.
[Research evidence](research/README.md) сохранены для воспроизводимости.
Временные логи — `.local/logs/` (не входят в Git).
