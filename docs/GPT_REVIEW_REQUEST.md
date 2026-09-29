# Статический review: операционный профиль V2 и оставшиеся release blockers

29.09.2026. Ответ на review319e5ec из9698403. Тесты/build/fork не запускать:
[разделение работы](REVIEW_TESTING.md). Нужен анализ кода, связей и границ, не ещё один
прогон окружения. Ваши замечания — вспомогательное review, решения принимает владелец.

## Что приняли и сделали

Математика не менялась: Infinity3%,90/5/5; Short10мест7:4:2:1×7, minimumUnit5USDG,
full free budget, q=.8e/(e+1); Monthly минимум100USDG+Next100,75/25 и вес e/(e+1).
USER_RULES теперь прямо привязывает начисление к обработке подтверждённого BUY
индексером и различает обеспеченную награду и перевод USDG. Отдельная
[модель статусов](USER_STATUS_MODEL.md) — требования будущего сайта, не готовый API.

[Операционный профиль](OPERATIONAL_LAUNCH_PROFILE.md) — расширение admission:

- operational-profile.cjs: ожидания формируются офлайн из явных settings и принятого
  genesis. Шаблон с null намеренно невалиден, не берём «одобрение» из on-chain состояния.
- deployment-admission.cjs: V2 проверяет genesis, owner/pendingOwner, ops/project,
  notices, immutable controller caps/floors, BUY source/code/publisher/notice/genesis,
  FREE_SHORT/maxBudget/threshold/Next. Существующие pins/timing/campaign90/5/5 остаются.
- Worker передаёт ops и проверяет рабочий maxGasPrice внутри обоих immutable ceilings,
  reserveGasPrice>=operating cap. Баланс ETH всё ещё проверяется на конкретное действие.
- Legacy V1 сохранён как incomplete для репетиций, handoff V2→V1 запрещён.
  Изменить живую identity простым редактированием файла нельзя.
- Normal drift блокирует новые jobs/freeze. Recovery старых frozen/claimable не требует
  совпадения mutable owner state, но сохраняет критические pins и send reconciliation.

Не добавлены администраторы, proxy, reroll, изъятие призов или автоматическое принятие
deployment. Public sends и public handoff остаются закрыты общим gate. V2 потребуется
при будущей активации, само его наличие не доказывает launch readiness.

## Что реально проверено

11/11 адресных tests в operational-profile + deployment-admission за85.4s.
После добавления downgrade/CLI guards повторены изменённый тест и catalog:2/2.
Есть оба frozen draw → settlement/claims при owner drift и повтор без новой отправки.
Solidity не менялась, reused compiled artifact с SHA256. Не full suite, не fork/live e2e.

[Read-only RPC evidence](../research/operational-profile/README.md): official повторяет
3blocks/receipts, но отказывает historical state; Blockreq проходит ближние высоты,
не глубокую. Ни один не qualified archive. Replay не запускали без admitted manifest.
Timing12samples: finalizedLag824–1209s; кандидат1200s дал бы ожидание1/12.
Не повышали автоматически до fixture1800; это ограниченная выборка, не SLA.

## Просим проверить

1. Нет ли обхода V2-проверок в обычном пути или handoff? При этом не требовать полной
   operational-проверки для завершения старого frozen draw: это сознательная граница.
2. Правильно ли разделены genesis и следующие объявленные epochs, controller ceilings
   и рабочие caps? Нет ли ложного обещания непрерывности или «вечного покрытия газа»?
3. Есть ли существенная недостающая связь ролей/policy, которую разумно закрыть сейчас,
   а не огромным новым слоем? Не путать pub executor и BUY policy publisher.
4. Понятно ли USER_RULES/statuses объясняют временно не обработанную покупку в отличие
   от окончательно неучтённой и назначение в отличие от выплаты?

## Следующий пакет

Предлагаем постоянное накопление индексера/restart/status поверх существующего replay,
без нового поколения продукта. Archive RPC, реальные адреса/notice/gas/timing нужны
параллельно, затем same-chain automatic proof и сайт. Не расширять в этой итерации
экономику, вероятности или бессрочные gas-гарантии. Предлагайте приоритеты по влиянию
на выпуск, не список всех теоретических рисков. Сервер, ключи и public deployment
пока не подключены; приватные ключи не передаются в чат.
