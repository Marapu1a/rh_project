# План до первого публичного запуска

01.10: текущий шаг — передать GPT [исследование Pons sources/operator](GPT_REVIEW_REQUEST.md), разобрать ответ, затем реализовать минимальный ручной сбор доступных USDG. Полная независимость от Pons не обязательна; недоступные комиссии ждут и не финансируют призы. Запрос подготовлен, ответ ожидается.

30.09: перенос придержан по решению владельца до внешней проверки. Hook runtime воспроизведён; реальные TOKEN→USDG conversion и escrow credits подтверждены. Factory source не собирается, source escrow/operator не найден; независимый вызов operator-контракта не доказан. [Проверка и вопросы Pons](PONS_VERIFICATION.md).

30.09: по решению владельца начинаем перенос на Pons V2; PAIR сохранён как резервная интеграция на прежних путях и в проверенном локальном ZIP (676 файлов). Шаг 1 выполнен: snapshot/manifest, отдельный draft profile и ABI module. Следующий шаг — PonsCollector + реальные PromoVault funding tests. Runtime/public deployment не переключены. [План переноса](PONS_MIGRATION.md).

30.09: Pons local fork diagnostic PASSED на anchor76626917: launch, curve buy101/sell, probe90/5/5, graduation, v4 buy/sell, operator conversion/claim. Подтверждены creator tax3% +70% base1% при buyback off и зависимость conversion от Pons operator. Следом решение по этой зависимости, production collector/BUY integration; миграция ещё не выполнена. [Результаты](PONS_V2_RESEARCH.md).

30.09: первичная проверка Pons V2 — USDG доступен в UI (graduation8090), live canLaunch владельца=true, fee0.0005ETH, tax cap10%. Открыты точный fee split и зависимость post-graduation conversion от Pons operator. Следом same-block economics и отдельный fork proof; миграция не принята. [Исследование](PONS_V2_RESEARCH.md).

30.09: исследуем самостоятельный запуск на PancakeSwap Infinity по новому запросу владельца; переход с PAIR ещё не принят. Live UI Robinhood ETH/USDG котирует, поддержка собственного fee hook внешним routing не доказана. Найдена официальная форма hook review; текущие collector/BUY завязаны на PAIR. [Результаты и следующий локальный прототип](DIRECT_INFINITY_RESEARCH.md). Прежнее решение о PAIR ниже — исторический контекст текущего сравнения.

Решение владельца30.09: первый запуск остается PAIR Infinity, другие сети позднее. Продолжаем review новой wrapper; подготовлен local-only trace diagnostic. Opening API сейчас503 из-за upstream RPC rate limit, source review остается открытым. [Детали](KT1_BUY_REHEARSAL.md).

Расследование PAIR30.09: новая wrapper хранит прежнюю legacyImplementation; одиночный диагностический launch eth_call со сборщиком прошел. Но появились2непроверенные зависимости, verified source недоступен (Explorer403/Sourcify404/IPFS timeout). Pins не меняли, КТ1 остается BLOCKED до source review. [Evidence и границы](KT1_BUY_REHEARSAL.md).

КТ1 начата, но BLOCKED до fork/BUY: PAIR proxy implementation сменился с0x4AdC… на0x557cb0e797973ef01f0e7fe9de0b75f2b5b587b7 (2RPC подтвердили). Runner same-chain подготовлен, compile и5адресных tests passed; интеграционный путь еще не доказан. Следом review новой implementation, затем повтор КТ1 без обхода pins. [Отчет](KT1_BUY_REHEARSAL.md).

Картинки владельца подготовлены локально: token logo256x256 и preview1080x800, оба PNG<1MiB; web/assets/qianqi-{logo,preview}.png. Metadata draft использует новый logo, старый TOKEN prediction требует пересчета. Не опубликовано; ближайший основной этап остается КТ1. [Детали](LAUNCH_PREPARATION.md).

30.09: прочитан ответ GPT61663a8 (review8192d35), два pagination дефекта сверены с кодом. Подготовлены [КТ1–КТ7](FINAL_CHECKPOINTS.md): same-chain BUY/indexer → funding → draws/payout → recovery/UI → full baseline → конкретный launch review. Ближайший пакет КТ1. Все точки TODO; текущий шаг docs-only, новые тесты/финансовые sends не выполнялись.

30.09: по решению владельца следующий этап — финальный review всей цепочки и воспроизводимый сквозной прогон до mainnet. Текущий пакет фиксируется в git; [обращение GPT](GPT_REVIEW_REQUEST.md) обновлено, [проверки/пробелы](FINAL_TESTING_HANDOFF.md) перечислены. Нового full baseline нет; GPT делает static review/матрицу, Codex выполняет финальные проверки. Public sends закрыты.

30.09: prepare-pair-launch создает draft calldata collector/PAIR и выполняет live read-only simulation: обе eth_call прошли, gas estimates получены (~0.00061634ETH с launch fee только за эти2операции). USDG109.622644 подтверждены. Metadata/настройки draft, public sends нет. Последовательный local fork collector→PAIR прошел; получатель комиссий проверен. Остальные Promo contracts не покрыты оценкой. [Детали](LAUNCH_PREPARATION.md).

30.09: владелец назначил creator также governor/project, executor отдельный. Первая покупка101USDG запланирована прямым поддержанным маршрутом после deployment/indexer: встроенный Developer Buy не покрыт текущим decoder. USDG balance0, пополнение/обмен не выполнялись. Адресные plan5/5 и Infinity BUY4/4. [Детали](LAUNCH_PREPARATION.md).

30.09: добавлен read-only PAIR launch preview (readiness/opening/source, без calldata). Live12 checks passed; пользовательский creator записан в launch plan, баланс0.00311832ETH прочитан, total deployment cost еще неизвестен. Следом metadata/роли/immutable settings и проверка token/collector prediction перед simulation. [Детали](LAUNCH_PREPARATION.md).

30.09: прочитаны live PAIR docs и код формы Infinity. Creator Fees UI кодирует подключенный кошелек получателем; наш collector подключается через modeData того же PAIR launchInfinity (существующий fork путь). Следующий шаг — подготовить обозримую транзакцию запуска с collector и актуальными opening данными, без смены fee mode. [Подробности](LAUNCH_PREPARATION.md). Sends не было.

30.09: шаг подготовки deployment: актуальный PAIR source preflight готов, план больше не скрывает launch opening/metadata/protection inputs. Архивный RPC и реальные роли не выбраны; нужен их выбор, затем точные args/estimate/локальная репетиция. [Конкретные результаты и следующие действия](LAUNCH_PREPARATION.md).

30.09: overview/reserves/history/frozen UI реализован и опубликован; API service установлен в standby до настоящего deployment. Observer проверен на локальных EVM contracts, API/browser на synthetic fixtures. DNS/HTTPS закрыты. Следом проверка недостающих deployment/RPC/asset/route pins и подготовка реального запуска, затем activation индексатора. Buy/Claim/executor не объявлены готовыми. [Пакет](PUBLIC_STATUS_API.md).

30.09: инфраструктурный шаг публикации фронта выполнен: HK в корне qianqi.site, HTTPS,404, адресные browser/live проверки. Исправлен silent restore чужого разрешённого адреса. Следующий пакет — подключение read-only API/indexer, draw/reserve/status и frozen/open UI; публичные финансовые sends не открывались.

30.09: новый Timeweb Amsterdam подготовлен со стороны доступа: SSH ключ работает, DNS qianqi.site/www указывает на201.51.22.244. Следующий инфраструктурный шаг — развернуть согласованный HK-фронт и HTTPS; API/indexer/executor на новый сервер ещё не установлены. Это не публичный запуск финансовой логики.

30.09: дизайн, тексты и browser-wallet UX согласованы, этап сайта закрыт в этих границах. Пакет передаётся на static review через [постоянное обращение](GPT_REVIEW_REQUEST.md). Следующий ограниченный шаг после ревью — наблюдаемые draw/reserve данные, состояния и история результатов в текущем UI; полноценный live launch не объявлен.


30.09: локальный этап общего tone-of-voice HK завершён: короткие живые объяснения при сохранении всех продуктовых правил. Следом просмотр владельцем; публикация текущего локального пакета ещё не выполнялась.


30.09: согласованный владельцем живой текст hero вставлен локально в HK: «A speculative token with a little extra thrill…» / «Trading fees fuel the prizes…». Слоган и правила сохранены; публикации на сервер не было.


30.09: локальный этап управления browser-wallet подключением завершён и проверен. Выбор расширения/адреса, restore/disconnect и ошибки реализованы; реальная проверка нескольких расширений и WalletConnect QR остаются отдельными границами. Тестовый сервер пока на предыдущем release.


30.09: по просьбе владельца SVG-стрелки HK удалены полностью; кнопки и ссылки текстовые. connect-label сохранён, чтобы wallet updates не возвращали стрелки. Только локально; тексты владельца сохранены.


30.09: локальный шаг HK-иконок завершён: декоративные стрелки удалены, в действиях SVG; правки владельца продолжаются локально. Публикация этого шага не выполнялась.


29.09: HK выбран владельцем как предпочтительное направление. Этап прозрачных текстов завершён и опубликован: короткое описание проекта, видимое распределение денег и полные правила. Дальше — просмотр владельцем; draw/reserve API и проверяемые launch links остаются отдельным интеграционным шагом.


29.09: текущий дизайн-эксперимент — отдельный HK-вариант `/concepts/hk/`, опубликован рядом с исходным `/`. Этап создания и проверки варианта завершён; дальше визуальное сравнение с владельцем и выбор направления. Интеграционный backlog draw/reserve API остаётся отдельным шагом. [Варианты](WEBSITE.md).


29.09: завершена визуальная правка hero по Figma (F/H и mascot overlap), опубликована
на preview. Следующий интеграционный шаг не изменился: draw/reserve API и результаты.

29.09: визуальная правка сайта опубликована на preview: крупная единая типографика,
короткие тексты без слоганов; правила и состояния данных сохранены. Backend scope
не расширялся; следующий интеграционный пакет остаётся draw/reserve API и результаты.

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
