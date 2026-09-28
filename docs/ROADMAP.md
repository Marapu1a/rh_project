# План до первого публичного запуска

28.09.2026. Это текущие релизные блокеры, а не журнал всех выполненных итераций.
История: [снимок прежнего плана](archive/snapshots/ROADMAP_BEFORE_DEPLOYMENT_PROFILE_2026-09-28.md).
Текущий пакет и проверки: [CURRENT_CONTEXT](CURRENT_CONTEXT.md).

## Что уже связано

PAIR Infinity creator fees → USDG reserves → BUY/entries → Short и Monthly → drand →
автоматическая выплата. Один signer, журнал неизвестных отправок, очередь старых долгов,
общий gas forecast, drain и проверяемый переход между runtime/campaign в одном deployment.
Short доказан на свежем Infinity fork; Monthly — на локальном fixture с исторической
BLS подписью. Это разные уровни доказательства, ни один не является публичным запуском.
[Общая автоматика и ограничения](PROMO_AUTOMATION.md).

## Завершённый пакет 28.09: профиль допуска deployment и времени

[Deployment profile](DEPLOYMENT_ADMISSION.md): pins, роли, активы, on-chain timing,
проверка перед новыми jobs/begin/freeze и повторная freshness-проверка перед отправкой.
Профиль не разрешает публичный запуск local-контроллеров и не выбирает production
параметры по тестовым значениям. Public deployment ещё отсутствует.

## Завершённый пакет: cutoff history

[Ранний checkpoint](CUTOFF_HISTORY.md) сохраняет подлинный hash без proposal. Автоматика
ждёт finalized блока и самой записи, затем строит dataset; empty draining тоже поддержан.
Больше не требуется полный scan в256blocks. Это ядро и локальный исполнитель, не public launch.
[Public wrappers](PUBLIC_CONTROLLERS.md) теперь подготовлены, частичный fork пройден.
[RPC qualification](PUBLIC_RPC_QUALIFICATION.md) готов: оба публичных endpoints не прошли
полную историческую доступность; живой reference BUY ещё не квалифицирован.
[Общий runtime4663](ROBINHOOD_RUNTIME.md) подготовлен и проверен в локальной репетиции;
public sends закрыты. [Recovery admission](RECOVERY_ADMISSION.md) отделяет старые
обязательства от новых funding/draw при source drift; frozen оба draw автоматически
завершаются на4663 rehearsal. Далее archive provider и реальные параметры; Timing1800s пока кандидат.

## Оставшиеся релизные блокеры — в порядке работы

1. **Публичное исполнение и реальные параметры.** Wrappers и incomplete launch plan готовы;
   shared worker получил отдельный4663 контекст и локальную репетицию. Public activation
   закрыта; нужны реальные pins, signing/key custody и qualified RPC. Проверенные сборки контрактов,
   chain/block model, future-round timing/finality policy, рабочие адреса/пулы и единый
   профиль. Local31337 guard нельзя просто удалить. Production timing нужно обосновать
   наблюдениями и явно принять; preflight не становится контрактной финальностью.
2. **Эксплуатационный бюджет.**90/5/5 принято (призы/ops/команда), записано в launch plan.
   [PROJECT_NATIVE](PROMO_NATIVE_REFILL.md) подключает стабильный slot1 к bounded ETH refill;
   USDG→ETH [первый fork proof](OPS_MARKET_PROOF.md) прошёл. [Read-only quote/estimate](OPS_MARKET_QUOTE.md) с pinned CLQuoter и точным router call
   реализованы и проверены на новом fork. Далее journaled swap/approve recovery в общем ops signer контуре.
   Дорогой gas/нехватка ETH → resumable wait/top-up; вечная самоокупаемость не gate.
   Призовые frozen/claimable не расходуются. Public sends закрыты.
3. **Постоянный сервис.** Ключи и один владелец signer, supervisor, устойчивый несинхронизируемый
   runtime volume, резервные RPC, recovery/runbook и внешний канал уведомлений.
   [Статусы ожидания и события](PROMO_OPERATIONAL_WAITS.md) уже подключены к CLI; delivery пока нет. Неизвестная отправка и stale
   lock требуют сверки; их нельзя удалять ради продолжения. Handoff не переносит deployment
   или BUY policy и не исправляет потерю журналов.
4. **Indexer и пользовательский слой.** Постоянное накопление/reorg/restart вместо повторного
   полного scan, публичная проверка datasets, прозрачные билеты/условия/результаты/claims на
   сайте. Поддерживаемые маршруты объявлять явно; не обещать билеты за любой transfer.
5. **Общий контрольный прогон.** Оба draw и следующий цикл на реальных интеграциях, без
   подмены constructor clock или других fixture-допущений. Проверить gas/размеры/EVM,
   delayed delivery, нехватку native, recovery, invariants/fuzz и внешний аудит.
6. **Воспроизводимый выпуск.** CI/build/source verification, deployment manifest и source
   pins, процедуры запуска/резервного восстановления, условия промо для выбранных рынков.

Реальный TOKEN→USDG converter не является обязательным блокером первого Infinity USDG
профиля сам по себе: он нужен там, где источник действительно приносит TOKEN. Нативный
ETH refill и его рынок/маршрут — отдельная эксплуатационная интеграция.

## Не включаем в эти пакеты

Спонсорские физические призы — отдельный слой; новые сети требуют отдельного профиля и
проверки, а не смены chainId. Luck, welcome tickets, reroll/reset и вывод призовой казны
не возвращаем. Переносимость не даёт права менять уже frozen результат или custody.
