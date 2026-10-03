# QIANQI — текущий контекст

Обновлено 03.10.2026. Это основной документ для продолжения работы, не журнал всех шагов.

## Где мы и как работаем

**Сначала доводим проект до правильной работы в тестовом окружении. Затем отдельным
этапом переносим проверенный результат на боевой.** Это решение пользователя 02.10;
03.10 разрешена отдельная staging-установка на сервере; публичную финансовую
логику не включаем и local-only guards не снимаем.
Тестовое окружение включает локальные модели, Hardhat/fork, API и browser rehearsal.
Mainnet fork не является боевым deployment. Ранее размещённый сайт — отдельный факт,
он не означает готовность или запуск промо-контрактов и автоматики.

Первый выбранный venue — Pons V2 / Robinhood Chain 4663. PAIR/Infinity сохранён как
резерв и история, не активная задача. Продуктовые правила — только в [PRODUCT_SPEC](PRODUCT_SPEC.md).

## Что подтверждено

- Локальный путь BUY → policy/index → билеты → Short/Monthly → drand → выплаты
  проверен отдельными сквозными прогонами; [индексированный цикл](PONS_INDEXED_CYCLE.md).
- Genesis v2 объединяет curve direct/self-batch и pool direct/self-batch; v3 добавляет
  узкий прямой 0x USDG → целевой pool BUY; v4 — одну подписанную EntryPoint/Alchemy
  операцию того же BUY с проверенным parent delegation.
  Подтверждённые терминальные покупки за USDG и ETH после конвертации проходят до API.
  Перезапуск не удваивает результат. [Текущий охват](PONS_CHANNEL_COVERAGE.md).
- Общий config writer/API/coordinator реализован; восстановление, reorg и сохранение
  старых обязательств проверялись в тестовом контуре. [Связка](SHARED_INDEX_CONFIG.md).
- Исправлены повторный обход истории/idle replay, повторные funding-планы и проблема
  чужой невалидной authorization. Последний расширенный прогон: **239/239**, плюс
  отдельная проверка evidence **4/4**. Это рабочее дерево поверх b9b7e04, не полный RC baseline.
  [Отчёт, команды и ограничения](PONS_AUDIT_2026-10-02.md).

## Текущая задача и следующий шаг

[Итоговая проверка кандидата](TEST_CANDIDATE_2026-10-03.md) завершена:
на чистом1a29a13 full893/894, единственная ошибка каталога тестов исправлена
и launcher5/5 прошёл; отдельно browser35/35 и Python39/39 PASS.
В итоговом baseline runtime не менялся; после review исправлена только проекция
waiting/clear. Полного зелёного повторного baseline после fixes не заявляем.
Открыто отдельное замечание по build/test dependencies (audit:8 high,2 moderate,10 low).
[Итоговое GPT review разобрано](FINAL_REVIEW_TRIAGE_2026-10-03.md).
Подтверждённая мелкая ошибка waiting/clear исправлена:3/3 адресных tests PASS.
Новых блокирующих ошибок учёта/выплат review не выявило. Dependency triage
остаётся обязательным для боевой упаковки: динамический solc fallback подтверждён.
[Первый пакет подготовки фронта](FRONT_LAUNCH_READINESS_2026-10-03.md) завершён локально:
точечная актуализация HK/transparency,19/19 browser tests и responsive/link check.
Стиль сохранён. [Runtime-сборка и экспорт config](RUNTIME_PACKAGE_2026-10-03.md)
проверены изолированно:8/8, API/site smoke, runtime audit0.
[Обвязка эксплуатации](OPERATIONS_READINESS_2026-10-03.md)
подготовлена: ownership/status, integrity, offline backup/staging и unit templates;
38 уникальных адресных tests. [Серверный staging](SERVER_STAGING_2026-10-03.md)
подготовлен: отдельные API8788/site4175, Linux start/stop/crash recovery PASS.
Публичный сайт/API не переключались. [Read-only Pons profile](PONS_PUBLIC_PROFILE_2026-10-03.md)
реализован и проверен моделью RPC (5/5); сам отчёт не разрешает отправки.
[Публичный исполнитель](PONS_PUBLIC_EXECUTION_2026-10-03.md) добавлен отдельным режимом:
36 адресных tests PASS, EVM drain/restart/газ/owner drift и защита перед intent.
[Release-репетиция](PONS_RELEASE_REHEARSAL_2026-10-03.md) завершена на локальном fork:
HTTPS/keystore, новые оба draw,22 signed tx,107.337115 тестовых USDG выплат,
cold restart без повторных отправок;25 уникальных адресных tests PASS.
Исправлен порядок budget/admission; тестовая finality явно отделена от production.
[Подготовка deployment](PONS_DEPLOYMENT_PREPARATION.md): принятые данные и порядок
собраны; [executor создан, off-server recovery проверен](PONS_EXECUTOR_CUSTODY.md).
[Collector/deployment review](PONS_COLLECTOR_DEPLOYMENT_REVIEW.md):10/10 tests,
разделены policy/dataset publisher, порядок зависимостей и свежий RPC snapshot.
[Первый deployment-пакет](PONS_DEPLOYMENT_PACKAGE_2026-10-03.md) технически завершён:
USDG implementation pin для новых задач/drain,27 адресных tests;10tx fork PASS
с обычными конструкторами и раздельными ролями. Контроллеры теперь создаются до
launch: ранний BUY101 даёт Short1/Monthly1. Source gaps Pons открыто описаны;
владелец принял продолжение с этими ограничениями. [Пакет эксплуатации/metadata](PONS_OPERATIONS_PACKAGE_2026-10-03.md)
подготовлен на сервере отдельно: credentials/RPC, gated units, backup/restore, PNG опубликованы.
Telegram подключён: получатель подтверждён владельцем, тест доставки и dedup PASS.
Monitor timer enabled; его service ждёт activation marker. Financial units/backup timer disabled.
[Предпусковой пакет3A](PONS_PREFLIGHT_HANDOFF_2026-10-03.md) завершён: hourly Windows backup pull,
свежий preflight, deployment fork10tx и отдельная signing-queue6tx PASS.
Учтены timestamp immutables контроллеров; constructor bytecode не менялся.
Владелец проверил первый шаг через MetaMask; после повторного live preflight консоль4176
перезапущена с --enable-signing для проверенных6 CREATE. На момент включения
completed0/pending=null, публичных отправок0; далее подписи владельца и сверка receipts.
Launch/policy готовятся отдельно из реальных receipts.
При первом клике найден чрезмерно строгий gas/request equality: до intent/подписи
отказывал при изменении fee. Исправлено сохранением просмотренных лимитов (20% fee headroom
в пределах cap) и повторной проверкой достаточности;7 адресных tests PASS.
Консоль перезапущена, nonce14/pending14, intent ещё не создан.
Затем исправлен UI reconnect/refresh: кнопки вычисляются из актуального состояния,
истечение review и смена аккаунта отключают подпись явно;2 UI tests + catalog PASS.
публичный сервис ещё не включён,
канал уведомлений проверен; штатный мониторинг ждёт активации, финансовый запуск не выполнен.

Промежуточная уборка документации завершена: история отделена, основные документы
обновляются по состоянию, а не дописыванием очередного журнала в начало каждого файла.

Оба ответа GPT прочитаны и сверены с кодом. [Разбор](PONS_REVIEW_TRIAGE_2026-10-02.md).
Пакет исправлений реализован: verifier использует общий config, scanner не читает
parent code чужих self-calls, schedule проверяется до admission. Pons оценивает газ
ближайшей транзакции вместо резерва на будущий цикл; нехватка ETH → ожидание,
сигнал в результате CLI и продолжение после пополнения. Telegram подключён отдельным эксплуатационным шагом; до активации штатные проверки выключены.
[Проверки и границы пакета](PONS_EXECUTION_READINESS.md).

**G10 / EntryPoint:** [подключена узкая Alchemy 7702 USDG-ветка](PONS_ENTRYPOINT_POOL_ADMISSION.md).
Реальная authorization и UserOperation подписаны тестовым ключом на local fork.
Genesis v4 → policy/index/API: 101 USDG даёт account Short1/Monthly1/carry1,
bundler — 0; restart/checkpoint/reorg проверены. Parent code/runtime и подпись
обязательны; смена делегирования в блоке закрывает допуск. 100 адресных tests PASS.
Это не полный baseline: policy/lifecycle интеграция смоделирована отдельно,
исполнение относится к fork, не боевому запуску. [Прямой 0x proof](PONS_ZEROEX_POOL_ADMISSION.md) сохранён.
Native/split/refund, multi-op/paymaster и другие account implementations не поддержаны.
[Пакет кабинета/Claim](WEBSITE_WALLET_ACTIONS.md) реализован локально: внешний Buy,
атрибутированные покупки и ручной Claim через выбранный EIP-1193 provider, journal
и проверки deployment. Только loopback/31337; API browser fixture синтетический,
Claim исполняется реальным локальным vault. Стенд ручного прогона запущен на
loopback4174/RPC18545: signed HTTP RPC → browser Claim → reload/Paid PASS.
Ручной MetaMask Claim70/30 завершён: два Paid на скриншоте, receipts block16/17,
баланс100 тестовых USDG, оба reward=0, по одной выплате на приз. Смена сети
подтверждена скриншотом; отказ/повтор и reload — сообщением пользователя.
Смена аккаунта пока проверена автоматически, не вручную.
[Общий цикл с кабинетом](PONS_WALLET_CYCLE.md) прошёл на свежем fork78518737:
покупки → index/API → оба draw →107.337115 тестовых USDG выплат →2 Paid в UI.
Stop/resume, API outage/restart, по1 OPEN после freeze и idle без транзакций проверены.
Исправлена только конфигурация часов стенда; RNG guards сохранены. Далее —
review накопленного пакета и оставшиеся A4 условия до общего RC baseline. [Матрица](PONS_CHANNEL_COVERAGE.md).
Накопленный пакет подготовлен для [статического GPT review](GPT_REVIEW_REQUEST.md)03.10.
Ответ получен: гонка Claim и отмена review при refresh исправлены, добавлена безопасная сверка hash. [Разбор и проверки](CLAIM_REVIEW_FIXES_2026-10-03.md).
[пакет API выполнен](API_VERIFIED_REPLAY_2026-10-03.md): собственный проверенный BUY-prefix в памяти, независимый lifecycle; 36 адресных tests PASS. На10000 покупок append-refresh API5.61→1.89s, idle5.54→0.99s; cold5.54→6.29s. По решению пользователя масштабирование пока ограничено [планом и изолированными гипотезами](STORAGE_GROWTH_PLAN_2026-10-03.md): до5млн простых строк, без изменения runtime. [Цикл с restore завершён](PONS_RESTORE_CYCLE_2026-10-03.md): direct curve/pool, оба draw,60+40 после freeze, восстановление ранней копии после выплат без отправок;18 адресных tests PASS. Далее — итоговая матрица границ и baseline ревизии; новое хранилище сейчас не внедряем. [Исходная нагрузка](PONS_ADMITTED_LOAD_2026-10-03.md) сохранена.

Параллельно внешнему research выполнены два подпакета A4: [ограничение cache](INDEXER_HISTORY_SCALING_2026-10-02.md)
и [checkpoint replay / компактный снимок](INDEXER_CHECKPOINTS_2026-10-02.md). В последнем
пакете112 уникальных адресных тестов PASS; synthetic5000-block append ~0.89s → ~0.27s.
Полная evidence-история сохранена; API независимо проверяет BUY и переиспользует собственный доказанный prefix, lifecycle и координатор пересчитываются полностью.


Перед финальным baseline — проверка перегруза. [Замеры50k/100k](DRAW_CAPACITY_FOLLOWUP_2026-10-03.md), [cache исполнителей](VERIFIED_DRAW_EXECUTION_2026-10-03.md) и [лишние записи scheduler](COORDINATOR_CAPACITY_2026-10-03.md) закрыты. [Большой общий scheduler:10k адресов в обоих draws](SCHEDULER_LOAD_2026-10-03.md) PASS:327 транзакций,8m40s активной работы, cold process resume и восстановление старых файлов после выплат без повторных отправок. Это synthetic31337 с общими Pons journal/gas modules, не большой внешний Pons/BUY/API прогон. [Паузы и operational лимит](PONS_CADENCE_2026-10-03.md) выполнены:21 адресный test, малый Pons fork с2/8 resume и восстановлением старых файлов после выплаты PASS. Default лимиты и production не меняли. [Cold restart без истории](PUBLICATION_HISTORY_RECOVERY_2026-10-03.md) проверен на10k адресов в обоих draw:4 отказа без отправок/изменения journal, восстановление,327 транзакций и11 выплат по независимым моделям PASS. Runtime не менялся. [Совместный BUY/index/API/draw прогон](PONS_JOINT_REHEARSAL_2026-10-03.md) PASS через сохранённый Alchemy:396 BUY,129 участников в каждом draw,11 выплат, API и restore без повторных отправок. Исправлен только бюджет ожидания стенда; runtime не менялся. Режим задержки и адресная проверка отказов завершены; далее — сверка условий до A5. Независимый архивный RPC/failover этим локальным тестом не подтверждён.

## Открытые границы тестового этапа

- Нагрузка и рост истории: RPC cache ограничен, replay продолжает checkpoint по suffix.
  Полный JSON, ledger/hash/tx-set и consumer replay ещё зависят от истории. Дальше —
  [путь роста и условия перехода](STORAGE_GROWTH_PLAN_2026-10-03.md) зафиксированы; реализация отложена до измеримой потребности. Quiescent restore всего тестового каталога при продвинувшейся цепочке проверен. Смешанная нагрузка всех маршрутов/draws и перенос на другой узел остаются отдельными границами.
- Реальный MetaMask UI, отказ/unknown outcome, Buy/Claim и пользовательские статусы
  не заменяются успехом harness или synthetic provider.
- Timing/finality, внешние bindings/permissions и зависимость от Pons conversion
  требуют отдельных проверок; pending TOKEN не считается доступным призовым бюджетом.
- Нужен итоговый согласованный тестовый кандидат: сквозные happy/fault/recovery,
  кошелёк, нагрузка и review. Production manifest/custody/cutover идут следующим этапом.

## Куда смотреть

- [ROADMAP](ROADMAP.md) — очередь и граница тестовый → боевой.
- [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md) — код по модулям, без хронологии.
- [Навигация](README.md) — только нужный модуль; [полный каталог](DOCUMENT_CATALOG.md).
- [Артефакты и логи](ARTIFACTS.md) — что хранить и как фиксировать доказательства.
- [История до уборки](archive/context-2026-10-02/README.md) — прежний контекст и планы целиком.
