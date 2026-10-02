> Исторический снимок до уборки 02.10.2026. Не текущий план. [Актуальный контекст](../../../CURRENT_CONTEXT.md).

# План до первого публичного запуска

02.10: G10 versioned pool self-batch→index/API выполнен локально (fresh fork78099955,4 ветки PASS). Проведена проверка подготовленного контура (239/239 расширенных tests PASS) и исправлены найденные scanner/funding/authorization проблемы; см. [отчёт](../../../PONS_AUDIT_2026-10-02.md). G10 остаётся открытым для0x execution/attribution; далее G04. Public rollout не выполнен.

02.10: G10 post-graduation terminal direct path проверен:4 локальных сценария USDG/ETH × sequential/self-batch и3 fixture tests PASS. Прямые покупки поддержаны; пакетные v4 исполняются, но не допускаются к билетам. Следующий пакет — versioned adapter3/6 calls→index/API.0x API выдаёт unsigned quotes; execution/attribution остаются отдельной границей. [Матрица](../../../PONS_POOL_TERMINAL.md).

02.10: G10 — общий genesis profile curve direct/self-batch + direct v4 готов. 43 адресных tests PASS; fresh fork78075403 и local policy/index/API PASS:5 BUY,86 открытых Short/Monthly, carry79328733. Частичный G10: пакетные v4/aggregator пути терминала ещё не подтверждены; дальше их payload/execution coverage, затем G04. Public enablement отсутствует. [Проверки и границы](../../../PONS_LAUNCH_PROFILE.md).

02.10: G10 — curve self-batch подключён к versioned policy/replay/scanner/persistent index и HTTP API. Интеграционный RPC fixture: type4 USDG + type2 ETH→BUY дают Short/Monthly, restart/dedup/reorg (включая тот же tx на новой ветке)/outage PASS. 79 адресных checks PASS; после pin tightening повторены3 integration PASS. Live bindings PASS. Только curve profile, не batch v4; источник policy и цепочка в integration mocked. Публичная политика не включена. [Границы](../../../PONS_BATCH_ATTRIBUTION.md).

02.10: G10 — signed upgrade и steady-state type2 BUY проверены на свежем локальном fork для USDG/ETH; два намеренно reverting batch сохраняют token balances. 30 адресных tests PASS. Пользователь: MetaMask13.48.0; package/yarn lock и generator сверены (tx-controller69.8.1), executor зависит от remote flags. Не завершён допуск: scanner/cache не сохраняют state-at-execution delegation; нужен versioned evidence+policy→ledger→API, а не разрешение calldata. [Evidence](../../../PONS_BATCH_ATTRIBUTION.md).

02.10: G10 signed EIP7702 fork PASS: отдельная Prague VM, настоящие локальные type4 self-calls с подписанной authorization; USDG101 и ETH→USDG→BUY успешны, EF0100 delegation проверена без hardhat_setCode. 32 адресных tests PASS. Пакет допуска НЕ закрыт: нет доказательства формата установленного MetaMask, steady-state type2 и versioned policy/indexer integration; билеты по batch не включены. [Evidence](../../../PONS_BATCH_ATTRIBUTION.md).

02.10: контрольная точка Pons cycle→HTTP API PASS на неизменном сохранённом fork snapshot01.10: 87 minted/86 consumed/1 open обоих типов, carry80328733, покупки/rewards совпали после restart HTTP/worker; stale сохранён честно. verify-pons-wallet-api включён в будущий indexed rehearsal. Новый полный fork не запускался. Работа далее крупными пакетами; текущий blocker — batch runtime/authorization admission, не базовый ledger. [Границы](../../../PONS_INDEXED_CYCLE.md).

02.10: G10 ETH funding shape decoder готов: exact wrap→approve→single-hop swap→approve→BUY, funding2728530 / BUY2701245 / остаток27285 raw USDG. 28 адресных tests PASS. Без обрезки logs, без eligibility; runtime/trace boundaries ещё не доказаны. Следующий шаг — подтверждение executor/router/pool и границ исполнения, до подключения к ledger. [Детали](../../../PONS_BATCH_ATTRIBUTION.md).

02.10: G10 — отдельный research batch decoder распознаёт точный approve→USDG curve BUY и сумму101USDG на сохранённом runtime-model receipt; SHAPE_MATCH не означает eligibility/admission. ETH funding, relayer, дополнительные calls и неоднозначные переводы отклоняются. 20 адресных проверок PASS. Следующий шаг — execution boundaries для ETH funding, затем runtime/7702 admission. [Детали](../../../PONS_BATCH_ATTRIBUTION.md).

02.10: G10 MetaMask runtime model — local fork PASS: USDG101 и ETH funding→BUY исполнены пакетами, по одному CurveBuy. Прямой адаптер оба отклоняет NOT_DIRECT_CURVE_CALL, билеты не начислялись. 2 fixture tests PASS. Код executor скопирован на fake account через hardhat_setCode: это НЕ EIP-7702 authorization и НЕ MetaMask UI. Следующий шаг — отдельный batch decoder с проверкой execution/account/funding, затем настоящий 7702 envelope. [Границы](../../../PONS_BATCH_ATTRIBUTION.md).

02.10: получен настоящий ответ MetaMask для выбранного аккаунта на chain4663: atomic.status=ready, ошибок нет, аккаунт/сеть стабильны. По EIP-5792 это возможность upgrade после согласия пользователя, а не уже включённое atomic execution. Probe ничего не подписывал/отправлял. Следующий шаг — локальный прогон конкретного MetaMask executor; batch admission остаётся закрытым. [Результат](../../../PONS_BATCH_ATTRIBUTION.md).

02.10: G10 — готов локальный read-only MetaMask probe: http://127.0.0.1:4175, запуск `node scripts/wallet-capabilities-server.cjs`. EIP-6963 выбор MetaMask, capabilities chain4663, проверка смены аккаунта/сети, отчёт в .local/logs. Browser smoke с mock provider: supported/unsupported/reject и чужой Origin PASS; настоящий ответ расширения ожидается. Подписи и транзакции отсутствуют. [Детали](../../../PONS_BATCH_ATTRIBUTION.md).

02.10: G10.4 — read-only attribution inspector и реальные RDH flow fixtures готовы. 7 адресных tests PASS, после усиления identity повторены4 PASS. Нельзя отождествлять tx.from, curveCaller и конечного получателя; ETH funding внутри batch нельзя считать curve refund. Выборка indirect не доказывает wallet-batch; активные adapters/начисление не менялись. Следующий шаг — конкретный wallet runtime/envelope (пользователь подтвердил MetaMask; возможности установленной версии ещё не сняты) и mined batch proof. [Разбор](../../../PONS_BATCH_ATTRIBUTION.md).

02.10: G10.3 — исходные функции Pons дали USDG/ETH→curve calldata; последовательное исполнение на свежем local fork PASS (2+5 tx, по одному ELIGIBLE BUY: 101 и 2.697638 USDG). 4 fixture tests PASS. Wallet dispatcher проверен заглушкой: batch-first/fallback, найден text-based fallback даже для 4001. Это не extension/batch receipt и не full admitted indexer. Далее — batch/account attribution, затем v4/0x; G04 остаётся после G10. [Evidence и границы](../../../PONS_CHANNEL_COVERAGE.md).

02.10: G10 получил реальные receipt-fixtures RDH: из первых 8 BUY в выборке pure decoder даёт 1 ELIGIBLE и 7 UNSUPPORTED_ROUTE. Это не статистика рынка и не доказательство UI-origin. 9 адресных tests PASS, runtime/правила не менялись. Browser unsigned capture ещё не выполнен (accounts/chainId только); следующий шаг — изолированный Pons terminal harness для USDG/ETH→curve, затем локальные receipts и v4. [Evidence и границы](../../../PONS_CHANNEL_COVERAGE.md).

02.10: по решению пользователя добавлен G10 — полный охват штатных каналов покупки Pons и расширяемые адаптеры, перед окончательным G04. Статическая инвентаризация выполнена: 47 текущих JS chunks, 4 ключевых совпадают с hashes 01.10; USDG direct, funding conversion, 0x и wallet bundle требуют раздельного подтверждения. Следующий шаг — unsigned terminal payload и локальный receipt для USDG/ETH на curve/v4, без public sends. Порог/математика не менялись; retroactive tickets не утверждены. [План и матрица](../../../PONS_CHANNEL_COVERAGE.md).

01.10: G02 реализован локально: общий indexConfig для writer/API/координатора, прежние scheduler/parent identities сохранены. Временный RPC-отказ проекции не блокирует BUY; integrity/ABI ошибки закрывают новый допуск. Исправлено чтение версии манифеста из admitted policy history. Сквозной локальный цикл с outage/recovery и frozen settlement PASS. Начальный адресный профиль: 37/38; найденный сбой исправлен и перепроверен (6 выбранных кейсов PASS), затем reader/cache/builder и RPC проверки PASS. Не full suite и не новый Pons fork; деплоя/миграции не было. Далее G04: Pons deploy/config manifest. [Детали](../../../SHARED_INDEX_CONFIG.md).

01.10: review G02 b9b7e04 сверено с кодом. Подтверждены config identity mismatch и общий отказ индекса при observePublic error. Рекомендуется builder двух конфигов с неизменной scheduler/job identity, отдельный projection status и явная пересборка только derived index. Реализация ещё не начата. [Разбор](../../../SHARED_CONFIG_REVIEW_TRIAGE.md).

01.10: подготовлен запрос GPT по G02 до реализации: shared config/index для coordinator/API, identity fields, projection failures, migration и frozen obligations. Предложение ещё не реализовано; ждём статический ответ. Предыдущие request/response сохранены в archive. [Запрос](../../../GPT_REVIEW_REQUEST.md).

01.10: активный launch plan переведён на явный pons-v2, PAIR plan сохранён в config/reserve; старые PAIR preparers используют только резерв и отказывают Pons до RPC. Убраны PAIR-тексты из обеих тем, актуализированы ссылки/статус migration draft.13 адресных checks PASS (частичный набор). Публичный запуск остаётся закрыт. Далее — общий config индекса/API/coordinator (G02). [Границы](../../../ACTIVE_RELEASE_PATH.md).

01.10: R0 инвентаризация завершена: local core подтверждён историческим evidence, public release не закончен. Карта9 gaps, runtime/roles/trust; найдено несовпадение shared snapshot config(publicStatus/API vs scheduler), Buy/Claim UI и Pons deploy/config gaps. Код/правила не менялись, tests/live audit не запускались. Далее R1 focused code review. [Карта](../../../RELEASE_INVENTORY.md).

01.10: подготовлен общий план полной проверки перед запуском: R0–R9, code/security review, инварианты, full RC baseline, реальные timing, сбои, нагрузка, кошельки и deployment gates. Это план, не выполненный аудит; код публичного запуска ещё нельзя считать законченным. Следующий шаг — R0 inventory/gap map; timing-пакет включён в R3. [План](../../../PRELAUNCH_VERIFICATION_PLAN.md).

01.10: прочитан GPT review3b36e0a к12e64bb, замечания сверены с кодом. Подтверждённого обхода admission/ошибки учёта не найдено; главный пробел — реальные finality/RNG timing. Следующий пакет: read-only замеры и воспроизведение лага/outage. Timing1800/1200 — candidate, approval=null. Код и правила не менялись. [Разбор](../../../PONS_INDEXED_REVIEW_TRIAGE.md).

01.10: indexed Pons coordinator PASS на fork77469814: 13 проходов, отставание индекса блокирует новые draws, оба finalized checkpoints, Short/Monthly, live drand, stop/resume и выплаты.21 адресная проверка PASS. Public sends закрыты; последовательный локальный прогон, не production/watch. Далее — независимое review накопленного пакета. [Результат](../../../PONS_INDEXED_CYCLE.md).

01.10: Pons policy admission и подключение сохранённого индекса к coordinator реализованы.44 адресных tests PASS; real-runtime fork77447532 PONS_ADMITTED_INDEXER_PASSED: настоящий локальный BuyPolicySource, чтение admitted snapshot,3 перезапуска, rollback и outage/resume. Public sends закрыты. Следующий шаг — полный indexed coordinator cycle с finalized cutoff; в этом пакете он не выполнялся. [Результат и границы](../../../PONS_INDEXED_COORDINATOR.md).

01.10: Pons persistent indexer PASS на fork77435048: bounded catch-up,3 отдельных CLI запуска, без исторических RPC reads на повторе, rollback1 блока с BUY40, outage/resume.21 адресный сценарий закрыт; не full suite/kill/power-loss. Cache теперь включает fixed-height eth_call bindings. Research snapshot остаётся unadmitted. Далее — Pons policy admission и чтение snapshot coordinator; public service закрыт. [Результат](../../../PONS_PERSISTENT_INDEXER.md).


01.10: browser → real local planner/fork PASS77427785:12 запросов/12 reload recoveries,4 BUY101/101/60/40, exact calldata и canonical receipt checks;18 адресных tests PASS. Исправлен найденный fork баг восстановления суммы101 вместо60/40. Далее — Pons persistent BUY indexer/admission, restart/reorg. Публичные отправки и wallet extensions не включены. [Результат](../../../PONS_BROWSER_BRIDGE.md).


01.10: локальный purchase browser rehearsal готов на127.0.0.1:4174/purchase-demo/ (opt-in).13 адресных UI/state сценариев и16 существующих site/wallet tests PASS; это simulated adapter без кошелька/RPC. Следующий шаг — связать browser flow с local-only planner/fork и проверить exact payload/receipt recovery; public gate закрыт. [Границы](../../../PONS_PURCHASE_UI.md).


01.10: local direct USDG purchase PASS: fork77402505,12 последовательных запросов/4 BUY, quote и1% minOut, недостаточные/истёкшие approvals, учёт101 и60+40.15 адресных tests PASS; не full suite и не browser wallet. Фронт/public sender не включены. Далее — локальный browser review flow с account/chain/reject/pending проверками, затем admission/indexer. [Детали](../../../PONS_DIRECT_PURCHASE.md).


01.10: read-only UI Pons выявил direct curve/v4 совместимый формат, но также автоматический 0x route и wallet batching. Полный UI admission остаётся частичным. Следующий bounded step — управляемый direct USDG BUY с последовательными approvals и unsigned/fork проверкой; затем persistent indexer. Runtime/правила не менялись, публичных отправок нет. [Результат](../../../PONS_UI_ROUTING.md).


01.10: пакет после GPT review выполнен локально: historical recipients в manual inspect/pay, crash recovery main/drand (6 сценариев внутри1 теста),25 адресных tests вместе с соседями PASS. Ненулевые reserved/claimable сохранены; known hash без повтора, unknown hash blocked; stale lock требует явной проверки. Transparency обновлена,390/1440 browser PASS. Это31337 journal/worker proof, не новый полный Pons fork/CLI crash admission. Далее — фактический UI BUY route Pons, затем persistent indexer/admission. [Результат и границы](../../../PONS_AUTOMATION.md).

01.10: получен и сверен с кодом GPT review1b70082 для32d2568. Подтверждены слепота manual plan к старым credits и устаревшая transparency; уточнены funding isolation, full replay и пределы crash coverage. Следующий ограниченный пакет — обнаружение старых получателей и настоящий process-kill/recovery, затем UI routing/indexer admission. Реализация не менялась, тесты не повторялись. [Разбор и PASS](../../../PONS_REVIEW_TRIAGE.md).

01.10: подготовлен пакет внешнего статического review Pons MVP относительно67cc1aa. До следующего технического шага разбираем findings GPT. Обновлены [обращение](../../../GPT_REVIEW_REQUEST.md) и [компактное evidence](../../../evidence/PONS_AUTOMATION_2026-10-01.json); прежнее исследование архивировано. Новый ответ пока не получен. В этом handoff код не менялся, продуктовые тесты не повторялись.

01.10: локальный Pons coordinator завершён: fork77338337 PONS_AUTOMATION_PASSED, 13 проходов/22 уникальные транзакции, live drand, stop/resume, оба draw и claims. Выплачено114.657578USDG; reserved/claimable=0; повторный проход без отправок,86 consumed+1 OPEN каждого вида.25/25 scheduler/locks и7/7 новых адресных проверок PASS (не full suite). Далее — сверка фактического BUY routing UI Pons; публичный admission/service ещё закрыты. [Evidence и границы](../../../PONS_AUTOMATION.md).

01.10: локальная сквозная интеграция Pons закрыта: BUY/funding → оба draw → настоящие drand proofs → выплаты и resume, fork77287946 PASS;16/16 соседних tests. Следующий ограниченный пакет — Pons coordinator с durable journal и его recovery checks. UI routing/source admission/public policy остаются отдельными launch-границами. [Результаты](../../../PONS_PROMO_CYCLE.md).

01.10: локальный curve+v4 BUY пакет закрыт:55/55 tests,33 шага real-runtime fork PASS. Следующий ограниченный пакет — связать BUY accounting и funding с существующим Short/Monthly draw/payout/recovery прогоном. Отдельно остаются live UI routing, source/public policy admission и запуск сервисов. [Проверки](../../../PONS_V4_BUY.md).

01.10: curve BUY real-runtime fork77265497 PASS: BUY101 и частичный graduation/refund → entry → открытые Short/Monthly; вместе с funding27 шагов. Только локальный fork, без draws/public sends. [Evidence и границы](../../../PONS_BUY.md).

01.10: bounded step curve BUY реализован локально: платежи/возвраты → entry → открытые Short/Monthly,49/49 адресных тестов. Следующий шаг — отдельный v4 BUY adapter, затем общий draw/payout/recovery прогон. [Границы проверки](../../../PONS_BUY.md).

01.10: локальный денежный Pons пакет завершён: bind/sweep→manual claim/pay→PromoVault,7/7+fork PASS. Следующий ограниченный пакет — curve BUY decoder с net USDG/refunds/recipient, затем v4 и tickets. Public deployment/production sender/source admission остаются отдельными границами. [Результаты](../../../PONS_COLLECTOR.md).

01.10: Pons шаг получения из escrow завершён локально (4/4, не full/fork). Страница прозрачности готова локально. Следующий шаг: curve/hook source binding и отдельные sweep, затем ручной runner и интеграция с Pons fork. До этого прототип не использовать для запуска. [Детали](../../../PONS_COLLECTOR.md).

01.10: ответ GPT67cc1aa разобран; исследование не закрыло source/operator неизвестные. Следующий предлагаемый ограниченный пакет — PonsCollector: отдельные sweep и claim, распределение фактически полученного USDG90/5/5, независимость claim от неудачи sweep; затем ручное исполнение. Полную source verification сохраняем отдельной открытой границей перед публичным запуском, не условием начала локальной реализации.

01.10: текущий шаг — передать GPT [исследование Pons sources/operator](../../../GPT_REVIEW_REQUEST.md), разобрать ответ, затем реализовать минимальный ручной сбор доступных USDG. Полная независимость от Pons не обязательна; недоступные комиссии ждут и не финансируют призы. Запрос подготовлен, ответ ожидается.

30.09: перенос придержан по решению владельца до внешней проверки. Hook runtime воспроизведён; реальные TOKEN→USDG conversion и escrow credits подтверждены. Factory source не собирается, source escrow/operator не найден; независимый вызов operator-контракта не доказан. [Проверка и вопросы Pons](../../../PONS_VERIFICATION.md).

30.09: по решению владельца начинаем перенос на Pons V2; PAIR сохранён как резервная интеграция на прежних путях и в проверенном локальном ZIP (676 файлов). Шаг 1 выполнен: snapshot/manifest, отдельный draft profile и ABI module. Следующий шаг — PonsCollector + реальные PromoVault funding tests. Runtime/public deployment не переключены. [План переноса](../../../PONS_MIGRATION.md).

30.09: Pons local fork diagnostic PASSED на anchor76626917: launch, curve buy101/sell, probe90/5/5, graduation, v4 buy/sell, operator conversion/claim. Подтверждены creator tax3% +70% base1% при buyback off и зависимость conversion от Pons operator. Следом решение по этой зависимости, production collector/BUY integration; миграция ещё не выполнена. [Результаты](../../../PONS_V2_RESEARCH.md).

30.09: первичная проверка Pons V2 — USDG доступен в UI (graduation8090), live canLaunch владельца=true, fee0.0005ETH, tax cap10%. Открыты точный fee split и зависимость post-graduation conversion от Pons operator. Следом same-block economics и отдельный fork proof; миграция не принята. [Исследование](../../../PONS_V2_RESEARCH.md).

30.09: исследуем самостоятельный запуск на PancakeSwap Infinity по новому запросу владельца; переход с PAIR ещё не принят. Live UI Robinhood ETH/USDG котирует, поддержка собственного fee hook внешним routing не доказана. Найдена официальная форма hook review; текущие collector/BUY завязаны на PAIR. [Результаты и следующий локальный прототип](../../../DIRECT_INFINITY_RESEARCH.md). Прежнее решение о PAIR ниже — исторический контекст текущего сравнения.

Решение владельца30.09: первый запуск остается PAIR Infinity, другие сети позднее. Продолжаем review новой wrapper; подготовлен local-only trace diagnostic. Opening API сейчас503 из-за upstream RPC rate limit, source review остается открытым. [Детали](../../../KT1_BUY_REHEARSAL.md).

Расследование PAIR30.09: новая wrapper хранит прежнюю legacyImplementation; одиночный диагностический launch eth_call со сборщиком прошел. Но появились2непроверенные зависимости, verified source недоступен (Explorer403/Sourcify404/IPFS timeout). Pins не меняли, КТ1 остается BLOCKED до source review. [Evidence и границы](../../../KT1_BUY_REHEARSAL.md).

КТ1 начата, но BLOCKED до fork/BUY: PAIR proxy implementation сменился с0x4AdC… на0x557cb0e797973ef01f0e7fe9de0b75f2b5b587b7 (2RPC подтвердили). Runner same-chain подготовлен, compile и5адресных tests passed; интеграционный путь еще не доказан. Следом review новой implementation, затем повтор КТ1 без обхода pins. [Отчет](../../../KT1_BUY_REHEARSAL.md).

Картинки владельца подготовлены локально: token logo256x256 и preview1080x800, оба PNG<1MiB; web/assets/qianqi-{logo,preview}.png. Metadata draft использует новый logo, старый TOKEN prediction требует пересчета. Не опубликовано; ближайший основной этап остается КТ1. [Детали](../../../LAUNCH_PREPARATION.md).

30.09: прочитан ответ GPT61663a8 (review8192d35), два pagination дефекта сверены с кодом. Подготовлены [КТ1–КТ7](../../../FINAL_CHECKPOINTS.md): same-chain BUY/indexer → funding → draws/payout → recovery/UI → full baseline → конкретный launch review. Ближайший пакет КТ1. Все точки TODO; текущий шаг docs-only, новые тесты/финансовые sends не выполнялись.

30.09: по решению владельца следующий этап — финальный review всей цепочки и воспроизводимый сквозной прогон до mainnet. Текущий пакет фиксируется в git; [обращение GPT](../../../GPT_REVIEW_REQUEST.md) обновлено, [проверки/пробелы](../../../FINAL_TESTING_HANDOFF.md) перечислены. Нового full baseline нет; GPT делает static review/матрицу, Codex выполняет финальные проверки. Public sends закрыты.

30.09: prepare-pair-launch создает draft calldata collector/PAIR и выполняет live read-only simulation: обе eth_call прошли, gas estimates получены (~0.00061634ETH с launch fee только за эти2операции). USDG109.622644 подтверждены. Metadata/настройки draft, public sends нет. Последовательный local fork collector→PAIR прошел; получатель комиссий проверен. Остальные Promo contracts не покрыты оценкой. [Детали](../../../LAUNCH_PREPARATION.md).

30.09: владелец назначил creator также governor/project, executor отдельный. Первая покупка101USDG запланирована прямым поддержанным маршрутом после deployment/indexer: встроенный Developer Buy не покрыт текущим decoder. USDG balance0, пополнение/обмен не выполнялись. Адресные plan5/5 и Infinity BUY4/4. [Детали](../../../LAUNCH_PREPARATION.md).

30.09: добавлен read-only PAIR launch preview (readiness/opening/source, без calldata). Live12 checks passed; пользовательский creator записан в launch plan, баланс0.00311832ETH прочитан, total deployment cost еще неизвестен. Следом metadata/роли/immutable settings и проверка token/collector prediction перед simulation. [Детали](../../../LAUNCH_PREPARATION.md).

30.09: прочитаны live PAIR docs и код формы Infinity. Creator Fees UI кодирует подключенный кошелек получателем; наш collector подключается через modeData того же PAIR launchInfinity (существующий fork путь). Следующий шаг — подготовить обозримую транзакцию запуска с collector и актуальными opening данными, без смены fee mode. [Подробности](../../../LAUNCH_PREPARATION.md). Sends не было.

30.09: шаг подготовки deployment: актуальный PAIR source preflight готов, план больше не скрывает launch opening/metadata/protection inputs. Архивный RPC и реальные роли не выбраны; нужен их выбор, затем точные args/estimate/локальная репетиция. [Конкретные результаты и следующие действия](../../../LAUNCH_PREPARATION.md).

30.09: overview/reserves/history/frozen UI реализован и опубликован; API service установлен в standby до настоящего deployment. Observer проверен на локальных EVM contracts, API/browser на synthetic fixtures. DNS/HTTPS закрыты. Следом проверка недостающих deployment/RPC/asset/route pins и подготовка реального запуска, затем activation индексатора. Buy/Claim/executor не объявлены готовыми. [Пакет](../../../PUBLIC_STATUS_API.md).

30.09: инфраструктурный шаг публикации фронта выполнен: HK в корне qianqi.site, HTTPS,404, адресные browser/live проверки. Исправлен silent restore чужого разрешённого адреса. Следующий пакет — подключение read-only API/indexer, draw/reserve/status и frozen/open UI; публичные финансовые sends не открывались.

30.09: новый Timeweb Amsterdam подготовлен со стороны доступа: SSH ключ работает, DNS qianqi.site/www указывает на201.51.22.244. Следующий инфраструктурный шаг — развернуть согласованный HK-фронт и HTTPS; API/indexer/executor на новый сервер ещё не установлены. Это не публичный запуск финансовой логики.

30.09: дизайн, тексты и browser-wallet UX согласованы, этап сайта закрыт в этих границах. Пакет передаётся на static review через [постоянное обращение](../../../GPT_REVIEW_REQUEST.md). Следующий ограниченный шаг после ревью — наблюдаемые draw/reserve данные, состояния и история результатов в текущем UI; полноценный live launch не объявлен.


30.09: локальный этап общего tone-of-voice HK завершён: короткие живые объяснения при сохранении всех продуктовых правил. Следом просмотр владельцем; публикация текущего локального пакета ещё не выполнялась.


30.09: согласованный владельцем живой текст hero вставлен локально в HK: «A speculative token with a little extra thrill…» / «Trading fees fuel the prizes…». Слоган и правила сохранены; публикации на сервер не было.


30.09: локальный этап управления browser-wallet подключением завершён и проверен. Выбор расширения/адреса, restore/disconnect и ошибки реализованы; реальная проверка нескольких расширений и WalletConnect QR остаются отдельными границами. Тестовый сервер пока на предыдущем release.


30.09: по просьбе владельца SVG-стрелки HK удалены полностью; кнопки и ссылки текстовые. connect-label сохранён, чтобы wallet updates не возвращали стрелки. Только локально; тексты владельца сохранены.


30.09: локальный шаг HK-иконок завершён: декоративные стрелки удалены, в действиях SVG; правки владельца продолжаются локально. Публикация этого шага не выполнялась.


29.09: HK выбран владельцем как предпочтительное направление. Этап прозрачных текстов завершён и опубликован: короткое описание проекта, видимое распределение денег и полные правила. Дальше — просмотр владельцем; draw/reserve API и проверяемые launch links остаются отдельным интеграционным шагом.


29.09: текущий дизайн-эксперимент — отдельный HK-вариант `/concepts/hk/`, опубликован рядом с исходным `/`. Этап создания и проверки варианта завершён; дальше визуальное сравнение с владельцем и выбор направления. Интеграционный backlog draw/reserve API остаётся отдельным шагом. [Варианты](../../../WEBSITE.md).


29.09: завершена визуальная правка hero по Figma (F/H и mascot overlap), опубликована
на preview. Следующий интеграционный шаг не изменился: draw/reserve API и результаты.

29.09: визуальная правка сайта опубликована на preview: крупная единая типографика,
короткие тексты без слоганов; правила и состояния данных сохранены. Backend scope
не расширялся; следующий интеграционный пакет остаётся draw/reserve API и результаты.

29.09: [Первая страница QIANQI](../../../WEBSITE.md) по пользовательскому макету: responsive, мышата, browser wallet connect и существующий wallet API. Pre-launch без выдуманных банков/claim/buy URL; общий draw API, проверенный asset profile и Claim ещё впереди.3 browser scenarios passed + visual desktop/mobile, не full/live. Локально npm run site →127.0.0.1:4173. Исходные images_for_site сохранены. Public sends закрыты.

29.09.2026. Это текущие релизные блокеры, а не журнал всех выполненных итераций.
История: [снимок прежнего плана](../../snapshots/ROADMAP_BEFORE_DEPLOYMENT_PROFILE_2026-09-28.md).
Текущий пакет и проверки: [CURRENT_CONTEXT](../../../CURRENT_CONTEXT.md).

## Что уже связано

PAIR Infinity creator fees → USDG reserves → BUY/entries → Short и Monthly → drand →
автоматическая выплата. Один signer, журнал неизвестных отправок, очередь старых долгов,
общий gas forecast, drain и проверяемый переход между runtime/campaign в одном deployment.
Short доказан на свежем Infinity fork; Monthly — на локальном fixture с исторической
BLS подписью. Это разные уровни доказательства, ни один не является публичным запуском.
[Общая автоматика и ограничения](../../../PROMO_AUTOMATION.md).

## Завершённый пакет 28.09: профиль допуска deployment и времени

[Deployment profile](../../../DEPLOYMENT_ADMISSION.md): pins, роли, активы, on-chain timing,
проверка перед новыми jobs/begin/freeze и повторная freshness-проверка перед отправкой.
Профиль не разрешает публичный запуск local-контроллеров и не выбирает production
параметры по тестовым значениям. Public deployment ещё отсутствует.

## Завершённый пакет: cutoff history

[Ранний checkpoint](../../../CUTOFF_HISTORY.md) сохраняет подлинный hash без proposal. Автоматика
ждёт finalized блока и самой записи, затем строит dataset; empty draining тоже поддержан.
Больше не требуется полный scan в256blocks. Это ядро и локальный исполнитель, не public launch.
[Public wrappers](../../../PUBLIC_CONTROLLERS.md) теперь подготовлены, частичный fork пройден.
[RPC qualification](../../../PUBLIC_RPC_QUALIFICATION.md) готов: оба публичных endpoints не прошли
полную историческую доступность; живой reference BUY ещё не квалифицирован.
[Общий runtime4663](../../../ROBINHOOD_RUNTIME.md) подготовлен и проверен в локальной репетиции;
public sends закрыты. [Recovery admission](../../../RECOVERY_ADMISSION.md) отделяет старые
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
   [PROJECT_NATIVE](../../../PROMO_NATIVE_REFILL.md) подключает стабильный slot1 к bounded ETH refill;
   USDG→ETH [первый fork proof](../../../OPS_MARKET_PROOF.md) прошёл. [Read-only quote/estimate](../../../OPS_MARKET_QUOTE.md) с pinned CLQuoter и точным router call
   реализованы и проверены на новом fork. [Journaled collect/approve/swap](../../../OPS_MARKET_EXECUTOR.md) реализован; credit→market→refill
   прошёл fork, coordinator/продвижение старых обязательств проверены отдельно. Funding пакет закрыт.
   Составная [релизная репетиция](../../../RELEASE_REHEARSAL.md) пройдена с явными fixture-границами.
   Отчёт release profile подготовлен: обязательные поля и конфликты решений видны.
   [Численные правила Short/Monthly](../../../MVP_ECONOMIC_PROFILE.md) приняты29.09;
   [пользовательское описание](../../../USER_RULES.md) подготовлено для будущего сайта.
   D без потолка принят: FREE_SHORT на cutoff реализован; профиль требует uint256.max.
   Funding wait на старом finalized cutoff исправлен и проверен: новый обеспеченный
   finalized блок разрешает обновить unused candidate, не существующий job.
   Monthly75/25 и вес e/(e+1) приняты и реализованы как новое поколениеV2:
   общий исход, обязательный один winner в выплатной ветке, independent worker replay.
   Short10мест/5USDG/q=0.8e/(e+1), Monthly Current>=100USDG приняты;
   planning profile обновлён, public minimum проверяется до RNG.
   [Operational launch profile V2](../../../OPERATIONAL_LAUNCH_PROFILE.md) реализован и адресно проверен:
   явные роли/notice/gas/BUY pins и принятый genesis, drift → только старые обязательства.
   Нужны реальные значения и qualified archive RPC; повтор29.09 оба endpoint не квалифицировал.
   Заполненный JSON не qualification. Следующий ограниченный пакет — постоянное
   накопление индексера/restart и основания пользовательских статусов (пункт4).
   Эксплуатационные параметры выбираются отдельно;
   для RPC нужен другой archive endpoint (official повторно не прошёл history).
   Same-chain automatic proof ещё открыт.
   GPT делает [review без запуска тестов](../../../REVIEW_TESTING.md); повторная диагностика
   его окружения не является условием продолжения.
   Дорогой gas/нехватка ETH → resumable wait/top-up; вечная самоокупаемость не gate.
   Призовые frozen/claimable не расходуются. Public sends закрыты.
3. **Постоянный сервис.** [Read-only supervisor/runbook](../../../INDEXER_SERVICE.md) реализован и локально проверен. Остались установка на сервер, ключи и один владелец signer, устойчивый несинхронизируемый
   runtime volume, резервные RPC, recovery/runbook и внешний канал уведомлений.
   [Статусы ожидания и события](../../../PROMO_OPERATIONAL_WAITS.md) уже подключены к CLI; delivery пока нет. Неизвестная отправка и stale
   lock требуют сверки; их нельзя удалять ради продолжения. Handoff не переносит deployment
   или BUY policy и не исправляет потерю журналов.
4. **Indexer и пользовательский слой.** [Read-only накопление](../../../PERSISTENT_INDEXER.md) реализовано; snapshot подключён к scheduler/lifecycle опционально с admitted/freshness/cutoff проверками. [API покупок/билетов](../../../USER_STATUS_API.md) реализован локально; API wallet rewards сверяет on-chain события/storage; reward checkpoint ограничивает обычные eth_call новыми изменениями, full audit/reorg сохранены; далее frontend/общий список розыгрышей; сервис реализован локально, реальная скорость проверяется перед выпуском. Alchemy прошёл sampled historical reads; admitted BUY/live proof остаются. Постоянное накопление/reorg/restart вместо повторного
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
