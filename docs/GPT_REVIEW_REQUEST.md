# Review: составная релизная репетиция

28.09.2026. После review 0f9c18f пользователь одобрил один воспроизводимый сценарий,
явные тестовые границы и конечный список релизных блокеров. Газ больше не расширяем.

## Результат

`npm run rehearsal:release -- NEW_OUTPUT.json`
[Описание](RELEASE_REHEARSAL.md), [профиль](../config/release-rehearsal.json),
[полный отчёт](../research/release-rehearsal/composed-2026-09-28.json).

Прогон complete за86s. Сохранённые реальные Infinity BUY receipts → существующий
replay → 2 билета → ЯВНЫЙ перенос участников в fresh local4663. Далее public bytecode
без source overrides, реальный общий runtime, fixture creator revenue2006USDG,
распределение90/5/5, Short/Monthly, BLS, settlement, claims. Source ломается после
freeze; runtime продолжает obligations-only. У первого claim теряем receipt response,
следующий вызов worker перечитывает checksummed journal. Повторный pay отсутствует.

1805.40 USDG призового баланса =836.033330 выплат +969.366670 остатка.
Frozen/claimable пусты, дальнейший запуск nonce/балансы не меняет. Ops/project
получили по100.30USDG; это не реальные доходы проекта, а fixture.

## Чего не заявляем

Это не public deployment и не одна сквозная on-chain история. BUY evidence прошлый;
datasets/freeze делает helper из импортированных участников. Самопубликация datasets
по BUY на том же deployment здесь не доказана. Clock исторический, ArbSys/USDG/source
и venue state fixtures. Drand подпись настоящая историческая. Рестарт worker в одном
процессе, не SIGKILL/потеря узла. Market proof только ссылка+хеш прежнего отдельного fork.

Public launch plan не меняли, null не заменяли тестовыми адресами. Профиль выделяет
принятые, тестовые и нерешённые параметры. Отчёт сохраняет inputs hashes, compiled
hash, pins, pending/receipt, balances и journals. Ошибка оставляет failed и exit1.
Контракты и runtime не менялись; расширен только test helper для импорта участников
и отключения прямого тестового funding, добавлены runner/config/docs.

## Что полезно проверить

1. Не выдаёт ли отчёт составную проверку за same-chain proof? Не скрыта ли важная граница?
2. Нет ли ложного complete в accounting/recovery проверках?
3. Следующий пакет предлагаем направить на конкретные release параметры/профиль и
   RPC qualification, затем устранение same-chain automatic proof разрыва.
   Какие входы действительно надо выбрать владельцу, а какие получаются deployment?

Пожалуйста, реальные release blockers отдельно от необязательных улучшений.
Не возвращаемся к вечной окупаемости газа и не добавляем новые механизмы funding.
