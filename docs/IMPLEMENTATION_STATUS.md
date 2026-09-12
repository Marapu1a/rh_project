# Состояние реализации

Проверено по локальным контрактам и package.json: 12.09.2026. Это карта кода, а не утверждение реализации всей [продуктовой схемы](PRODUCT_SPEC.md).

| Часть | Фактическое состояние |
|---|---|
| FeeRouter | Прототип TOKEN/USDG accounting, фиксированный PAIR source, recipient credits, атомарный rollover |
| PromoVault | Резервирование draw, назначение обеспеченных призов и claim; поддерживает оба актива |
| Три продуктовых USDG-резерва | Не реализованы |
| Внешнее funding 3:2:1 / targeted / overflow | Не реализовано |
| Конвертация TOKEN → USDG | Не реализована |
| Indexer, регистрация и entries | Production-реализации нет |
| Production controller, capped odds, RNG | Нет; DrawControllerFixture — неограниченная тестовая заглушка |
| Frontend, спонсорские физические призы | Не реализованы |

## FeeRouter

Исходник: [FeeRouter.sol](../contracts/FeeRouter.sol). Permission model: Ownable2Step и ReentrancyGuard; владелец однократно привязывает source и выполняет rollover. Collect/harvest/sync/pay допускают permissionless исполнение с фиксированными получателями.

`rollCampaign(expectedCampaignId, next)` собирает доступное source revenue обоих активов, учитывает прямые TOKEN/USDG, закрывает старый accounting и переключает policy атомарно. Ошибка финального сбора откатывает переход. Старые unpaid credits сохраняются. `endsAt` — плановое время/нижняя граница перехода, бухгалтерская граница — успешная rollover transaction. Изменение PAIR source epoch вызывает отказ, автоматической миграции нет.

Три recipient slots текущего FeeRouter — **не Short/Current/Next**. Контракт распределяет активы между адресами, не ведёт новый внутренний jackpot accounting и не меняет TOKEN на USDG. Действует cumulative rounding; остаток закрытой кампании относится старому Promo-recipient. [Подробный отчёт](FEE_ROUTER_ROLLOVER_REPORT.md).

## PromoVault

Исходник: [PromoVault.sol](../contracts/PromoVault.sol). По активу: available = balance − reserved − claimable. Только immutable controller резервирует бюджет и назначает ненулевые обеспеченные награды. Claim разрешён любому caller, но только заранее указанному winner; transfer failure сохраняет долг. Owner withdrawal, срок сгорания claim, proxy и arbitrary rescue не добавлены.

Пустой finalize разрешён бухгалтерски, но контракт не доказывает, что random действительно дал no winners. `campaignId` — metadata, не проверенная связь с policy FeeRouter. Controller может назначать winners в пределах бюджета; безопасность production rules этим не обеспечена.

Полная финализация списком O(N), максимальный production размер не установлен. Нельзя заменять gas-проблему произвольным исключением уже назначенных winners. [Подробности](PROMO_VAULT_DESIGN.md).

## Проверки и воспроизведение

Последний подтверждённый unit run перед реорганизацией документов: 25 контрактных tests (16 FeeRouter + 9 PromoVault), 9 offline farming tests — passed. Документационная реорганизация не является новым прогоном тестов.

```powershell
npm ci --ignore-scripts
npm test
npm run test:farming
```

Офлайн-исследования на сохранённых данных, Python 3:

```powershell
npm run report:farming
python scripts/farming-defenses.py
```

Они относятся к историческим экономическим кандидатам, **не проверяют нынешний random admission + budget rejection**.

Необязательные локальные fork-прогоны требуют сети для чтения RPC. Публичных транзакций не отправляют:

```powershell
npm run test:fork
npm run test:fork:farming
```

PAIR route и доступность блока могут измениться; прошлый успех не гарантирует повтор. Выходы могут перезаписываться. [Политика research-файлов](../research/README.md). Исторический подтверждённый путь PAIR → FeeRouter → rollover → PromoVault → claim приведён в архивном отчёте экономики.

## Следующий этап

Проектирование и реализация USDG funding/трёх резервов согласно разделу 5 PRODUCT_SPEC. До новых контрактных изменений определить API, rounding, direct transfers и переходы pending. Конвертация, RNG и полный draw — отдельные последующие задачи. Наличие готового денежного vault не означает готовность к публичному запуску.
