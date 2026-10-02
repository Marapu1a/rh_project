# QIANQI — токен и промо на Pons

Спекулятивный токен с отдельным механизмом призов в USDG. Поддержанные покупки
учитываются автоматически; призы финансируются полученными комиссиями и пополнениями.
Правила и ограничения — в [PRODUCT_SPEC](docs/PRODUCT_SPEC.md).

**Сейчас доводим проект до правильной работы в тестовом окружении.
Перенос на боевой — отдельный следующий этап.** Локальные fork/API/draw результаты
не означают публичный запуск. PAIR/Infinity сохранён как резерв.

## Продолжить работу

1. [CURRENT_CONTEXT](docs/CURRENT_CONTEXT.md) — основной вход.
2. [ROADMAP](docs/ROADMAP.md) — текущий пакет и этапы.
3. [Документация](docs/README.md) и [карта кода](docs/IMPLEMENTATION_STATUS.md) — нужный модуль.

## Локальная проверка

```powershell
npm ci --ignore-scripts
node scripts/test-launcher.cjs --profile pons-channels
```

Это адресная группа, не полный baseline и не live fork. Остальные команды и выбор
объёма — [REVIEW_TESTING](docs/REVIEW_TESTING.md). Последний подтверждённый результат
и ограничения указаны в текущем контексте.

[История](docs/archive/README.md), [полный каталог](docs/DOCUMENT_CATALOG.md),
[evidence и логи](docs/ARTIFACTS.md) сохранены отдельно.
