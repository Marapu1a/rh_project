# Проверка последних связок — 20.09.2026

Ограниченная локальная проверка scheduler/state, revenue/funding и границ custody.
Это не полный аудит контрактов, finality или живой интеграции PAIR. Новые продуктовые
модули приостановлены; денежная математика и Solidity не менялись.

## 1. Высокий приоритет: TOKEN можно безвозвратно направить в USDG-only vault — открыто

В локальной конфигурации slot 0 FeeRouter — DualControllerPromoVault. FeeRouter создаёт
credits для обеих валют, а [pay](../contracts/FeeRouter.sol) доступен любому caller.
После появления TOKEN credit любой может выплатить его в prize vault, даже если наш
worker намеренно никогда не платит TOKEN. Credit возникает через sync/harvest или rollover.

У [DualControllerPromoVault](../contracts/DualControllerPromoVault.sol) TOKEN reserve
запрещён; пути обмена/вывода такого TOKEN нет. В воспроизведении 600 raw TOKEN на router
дают 480 TOKEN в vault, credit обнуляется, USDG не прибавляется, попытка TOKEN reserve
даже от controller возвращает ForbiddenReserve. Это не кража USDG, а потеря возможности
использовать TOKEN-часть дохода по существующему API.

Проблема отсутствующего swap была известна; проверка уточняет её серьёзность:
**off-chain запрет TOKEN-выплат не защищает от permissionless pay**. Текущую связку
recipients нельзя переносить в реальный deployment с TOKEN revenue.

Нужно выбрать место конвертации/получателя до USDG-only custody, сохранив запрет вывода
уже призовых средств. Просто добавить административный rescue в vault — не принятое
решение. Архитектура не менялась в этом review; дефект остаётся открытым.

## 2. Высокий приоритет: повторный begin после reorg с сохранившимся cutoff — исправлено узко

Раньше проверка `started` выполнялась только при исчезновении/истечении cutoff.
Если reorg удалял begin/freeze, но оставлял более ранний cutoff, планировщик мог снова
выполнить begin и запросить random для ранее начатого job.

Регрессия сохраняет jobs, делает snapshot до begin, доводит оба вида до freeze,
подаёт seed, откатывает цепь к snapshot и запускает scheduler со старым state.
До исправления он возвращался в ожидание seed вместо требуемого отказа.

Теперь [scheduler](../scripts/local-promo-scheduler.cjs) проверяет сочетание `started`
и on-chain phase None независимо от cutoff; остановка требует явного reorg recovery.
Сохранившийся begin с откатившимся terminal продолжает исполняться по прежней логике.

Гарантия ограничена сохранённым наблюдением `started`. Потерянный state, crash до
сохранения receipt и глубокие reorg без durable transaction journal этим не решены.
Это не production finality и не on-chain запрет повторного запроса после reorg.

## 3. Средний приоритет: неисправный project recipient блокирует сбор нового дохода — открыто

[Revenue pass](../scripts/local-usdg-revenue.cjs) ждёт успешного окончания первой фазы
funding до collect. Funding пробует выплатить каждый credit и выбрасывает ошибку при
неудачном transfer. Ошибка одного project recipient поэтому останавливает не только
его выплату, но и последующие collect/harvest.

В воспроизведении 100 USDG уже на router: prize credit выплачивается, project credit 20
остаётся. При искусственно отклонённом переводе проекту следующие 600 USDG в source
не собираются вообще. Ошибка моделируется MockToken; это не утверждение о конкретных
ограничениях реального USDG. Долги и деньги не пропадают, страдает автоматическое исполнение.

Ограничение ранее отмечалось в описании funding; теперь оно воспроизведено во всём
revenue-проходе и вынесено в ближайшее исправление.

Нужна изоляция **определённых отказов отдельного recipient** с сохранением credit и
диагностикой. Неизвестный broadcast/nonce/receipt outcome по-прежнему должен останавливать
отправки, а не обходиться общим catch-and-continue. Изменение отложено до отдельного
небольшого исправления; в review добавлено воспроизведение существующего поведения.

## Остальные границы

Stale lock после аварийного убийства, полный rescan растущей истории, отсутствие общего
supervisor, gas на пустой collect и связанность config hash со state остаются известными
ограничениями локального прототипа. RNG/finality и publisher truth не закрыты.
Новых доказанных расхождений USDG-accounting в рамках этой проверки не обнаружено;
это не доказательство отсутствия других дефектов.

## Проверки и следующий порядок

В scheduler добавлена регрессия запрета повторного begin. В funding suite добавлены
два **теста-воспроизведения открытых проблем**: TOKEN custody и blocked recipient.
Их успешность означает подтверждение плохого поведения, а не его исправление.
Запуск: scheduler + funding/revenue + сквозной BUY-cycle.

Далее: согласовать результаты review; исправить изоляцию recipient небольшим шагом,
затем проектировать TOKEN route до prize custody. Не считать новые модули заменой
устранению найденных проблем. Полный основной набор в этом review не запускался.

Итог 20.09: **21/21**, ~304 s, команда
`node --test --test-concurrency=1 test/local-scheduler.test.cjs test/local-usdg-funding.test.cjs test/local-buy-cycle.test.cjs`.
Два passed-теста воспроизводят открытые дефекты. Новый scheduler reorg-тест до исправления
падал; после исправления проходит вместе с прежними сценариями. Логи:
`.local/logs/review-reorg-before.log`, `.local/logs/review-automation-verification.log`.
Основной список теперь 201 тест; полный запуск 201 не выполнялся.
