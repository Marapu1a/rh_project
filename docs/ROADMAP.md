# План до первого публичного запуска

29.09: [Первая страница QIANQI](WEBSITE.md) по пользовательскому макету: responsive, мышата, browser wallet connect и существующий wallet API. Pre-launch без выдуманных банков/claim/buy URL; общий draw API, проверенный asset profile и Claim ещё впереди.3 browser scenarios passed + visual desktop/mobile, не full/live. Локально npm run site →127.0.0.1:4173. Исходные images_for_site сохранены. Public sends закрыты.

29.09.2026. Это текущие релизные блокеры, а не журнал всех выполненных итераций.
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
   реализованы и проверены на новом fork. [Journaled collect/approve/swap](OPS_MARKET_EXECUTOR.md) реализован; credit→market→refill
   прошёл fork, coordinator/продвижение старых обязательств проверены отдельно. Funding пакет закрыт.
   Составная [релизная репетиция](RELEASE_REHEARSAL.md) пройдена с явными fixture-границами.
   Отчёт release profile подготовлен: обязательные поля и конфликты решений видны.
   [Численные правила Short/Monthly](MVP_ECONOMIC_PROFILE.md) приняты29.09;
   [пользовательское описание](USER_RULES.md) подготовлено для будущего сайта.
   D без потолка принят: FREE_SHORT на cutoff реализован; профиль требует uint256.max.
   Funding wait на старом finalized cutoff исправлен и проверен: новый обеспеченный
   finalized блок разрешает обновить unused candidate, не существующий job.
   Monthly75/25 и вес e/(e+1) приняты и реализованы как новое поколениеV2:
   общий исход, обязательный один winner в выплатной ветке, independent worker replay.
   Short10мест/5USDG/q=0.8e/(e+1), Monthly Current>=100USDG приняты;
   planning profile обновлён, public minimum проверяется до RNG.
   [Operational launch profile V2](OPERATIONAL_LAUNCH_PROFILE.md) реализован и адресно проверен:
   явные роли/notice/gas/BUY pins и принятый genesis, drift → только старые обязательства.
   Нужны реальные значения и qualified archive RPC; повтор29.09 оба endpoint не квалифицировал.
   Заполненный JSON не qualification. Следующий ограниченный пакет — постоянное
   накопление индексера/restart и основания пользовательских статусов (пункт4).
   Эксплуатационные параметры выбираются отдельно;
   для RPC нужен другой archive endpoint (official повторно не прошёл history).
   Same-chain automatic proof ещё открыт.
   GPT делает [review без запуска тестов](REVIEW_TESTING.md); повторная диагностика
   его окружения не является условием продолжения.
   Дорогой gas/нехватка ETH → resumable wait/top-up; вечная самоокупаемость не gate.
   Призовые frozen/claimable не расходуются. Public sends закрыты.
3. **Постоянный сервис.** [Read-only supervisor/runbook](INDEXER_SERVICE.md) реализован и локально проверен. Остались установка на сервер, ключи и один владелец signer, устойчивый несинхронизируемый
   runtime volume, резервные RPC, recovery/runbook и внешний канал уведомлений.
   [Статусы ожидания и события](PROMO_OPERATIONAL_WAITS.md) уже подключены к CLI; delivery пока нет. Неизвестная отправка и stale
   lock требуют сверки; их нельзя удалять ради продолжения. Handoff не переносит deployment
   или BUY policy и не исправляет потерю журналов.
4. **Indexer и пользовательский слой.** [Read-only накопление](PERSISTENT_INDEXER.md) реализовано; snapshot подключён к scheduler/lifecycle опционально с admitted/freshness/cutoff проверками. [API покупок/билетов](USER_STATUS_API.md) реализован локально; API wallet rewards сверяет on-chain события/storage; reward checkpoint ограничивает обычные eth_call новыми изменениями, full audit/reorg сохранены; далее frontend/общий список розыгрышей; сервис реализован локально, реальная скорость проверяется перед выпуском. Alchemy прошёл sampled historical reads; admitted BUY/live proof остаются. Постоянное накопление/reorg/restart вместо повторного
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
