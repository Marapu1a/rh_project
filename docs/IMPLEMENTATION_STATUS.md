# Состояние реализации

Проверено по локальным контрактам и package.json: 13.09.2026. Это карта кода, а не утверждение реализации всей [продуктовой схемы](PRODUCT_SPEC.md).

| Часть | Фактическое состояние |
|---|---|
| FeeRouter | Прототип TOKEN/USDG accounting, фиксированный PAIR source, recipient credits, атомарный rollover |
| PromoVault | Резервирование draw, назначение обеспеченных призов и claim; поддерживает оба актива |
| Три продуктовых USDG-резерва | Реализованы free Short/Current/Next; target immutable; monthly win переносит Next → Current |
| Внешнее funding 3:2:1 / targeted / overflow | Реализовано, direct USDG — GENERAL, дробление учитывается общей фазой |
| Monthly accounting | start/settle win/no-win, один pending, cycleId, независимый claim; без календаря/RNG/attempts |
| Конвертация TOKEN → USDG | Не реализована |
| Indexer, регистрация и entries | Production-реализации нет |
| Production controller, capped odds, RNG | Нет; DrawControllerFixture — неограниченная тестовая заглушка |
| Short Luck и корзина призов | 14.09 приняты формула допуска, целочисленная корзина и один pending short с интервалом после settlement; параметры открыты, реализация отсутствует |
| Frontend, спонсорские физические призы | Не реализованы; 14.09 принята граница отдельного спонсорского слоя поверх постоянного промо, без доступа к основной казне |

## FeeRouter

Исходник: [FeeRouter.sol](../contracts/FeeRouter.sol). Permission model: Ownable2Step и ReentrancyGuard; владелец однократно привязывает source и выполняет rollover. Collect/harvest/sync/pay допускают permissionless исполнение с фиксированными получателями.

`rollCampaign(expectedCampaignId, next)` собирает доступное source revenue обоих активов, учитывает прямые TOKEN/USDG, закрывает старый accounting и переключает policy атомарно. Ошибка финального сбора откатывает переход. Старые unpaid credits сохраняются. `endsAt` — плановое время/нижняя граница перехода, бухгалтерская граница — успешная rollover transaction. Изменение PAIR source epoch вызывает отказ, автоматической миграции нет.

Три recipient slots текущего FeeRouter — **не Short/Current/Next**. Контракт распределяет активы между адресами, не ведёт новый внутренний jackpot accounting и не меняет TOKEN на USDG. Действует cumulative rounding; остаток закрытой кампании относится старому Promo-recipient. [Подробный отчёт](FEE_ROUTER_ROLLOVER_REPORT.md).

## PromoVault

Исходник: [PromoVault.sol](../contracts/PromoVault.sol). Новый constructor требует четвёртый аргумент — положительный nextStartTarget в raw USDG. По активу: available = balance − reserved − claimable. USDG available включает три свободных резерва и ещё не распознанные переводы; брать из него произвольный бюджет нельзя. reserveUSDG списывает только Short или Current, finalize возвращает остаток в исходный резерв. Старый reserve для USDG запрещён. Только immutable controller резервирует бюджет и назначает ненулевые обеспеченные награды. Claim разрешён любому caller, но только заранее указанному winner; transfer failure сохраняет долг. Owner withdrawal, срок сгорания claim, proxy и arbitrary rescue не добавлены.

Пустой finalize разрешён бухгалтерски, но контракт не доказывает, что random действительно дал no winners. `campaignId` — metadata, не проверенная связь с policy FeeRouter. Controller может назначать winners в пределах бюджета; безопасность production rules этим не обеспечена.

Полная финализация списком O(N), максимальный production размер не установлен. Нельзя заменять gas-проблему произвольным исключением уже назначенных winners. [Подробности](PROMO_VAULT_DESIGN.md).

## Проверки и воспроизведение

Проверка 13.09: 43 контрактных tests (16 FeeRouter + 27 PromoVault), 9 offline farming tests. Новые тесты funding и monthly accounting включены в npm test. Новый сетевой fork не запускался.

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

Они относятся к историческим экономическим кандидатам, **не проверяют принятую схему Short Luck + допуск + случайная раздача корзины**.

Необязательные локальные fork-прогоны требуют сети для чтения RPC. Публичных транзакций не отправляют:

```powershell
npm run test:fork
npm run test:fork:farming
```

PAIR route и доступность блока могут измениться; прошлый успех не гарантирует повтор. Выходы могут перезаписываться. Скрипт адаптирован к новому API, но эта адаптация на RPC не проверялась; USDG Next теперь исключается из тестовых выплат. Старый сохранённый self-funded результат нельзя считать результатом новой версии. [Политика research-файлов](../research/README.md). Исторический подтверждённый путь PAIR → FeeRouter → rollover → PromoVault → claim приведён в архивном отчёте экономики.

## Следующий этап

USDG funding и monthly accounting реализованы; API/ограничения описаны в PROMO_VAULT_DESIGN. Target фиксирован: для MVP deployment 100 USDG, изменения targets не нужны. Для Short сначала проверяем принятую математическую модель, выбираем параметры и оцениваем gas для обновления всех участников; это план, не выполненная проверка. Следующие отдельные задачи — production controller с календарём/проверкой исходов, participants/entries и выбранный RNG; конвертация также отсутствует. Пока можно проверить проводки, но нельзя доказать легитимность outcome, monthly interval или consumption попыток. Публичный запуск не готов.
