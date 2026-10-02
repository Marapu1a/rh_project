# G10 — охват торговых маршрутов Pons

02.10: [Post-graduation terminal execution](PONS_POOL_TERMINAL.md) —4 ветки PASS (USDG3/ETH6 calls, sequential/self-batch). Прямые v4 учитываются, batch пока UNSUPPORTED_ROUTE.0x price+quote API доступны на проверенных публичных парах, execution не проверен. Далее — versioned v4 batch adapter→index/API, затем отдельная0x квалификация.

02.10: добавлен [единый genesis profile](PONS_LAUNCH_PROFILE.md) для curve direct/self-batch и прямого v4 BUY. Это не подтверждение пакетных v4/aggregator маршрутов терминала; G10 целиком остаётся открытым.

Решение пользователя 02.10.2026: учитывать обычные каналы покупки, предоставляемые Pons, и предусмотреть расширение. Наш direct BUY не заменяет проверку терминала Pons. Пакет идёт после локального G02, перед окончательным G04 deploy/config manifest. Публичная покупка остаётся закрыта.

## Последовательность и критерии завершения

1. Инвентаризация текущего frontend и сопоставление с декодерами — выполнена статически 02.10, матрица ниже. Это не доказательство реальной покупки.
2. Следующий ограниченный шаг: получить unsigned wallet requests и локальные receipts для V2 USDG-пары: покупка за USDG и ETH, сначала curve, затем v4; отдельно последовательные вызовы и wallet batch. Зафиксировать фактические to/input/value, владельца средств, получателя и settlement. Наличие 0x quote и прочих веток проверять отдельно; недоступную ветку не объявлять пройденной. Без публичной покупки.
3. На реальных форматах добавить необходимые versioned adapters, сохранив прежние прямые маршруты. Доказать attribution и USDG basis без двойного учёта промежуточных обменов; проверить refund, revert, несколько swaps, другого получателя, повторный replay, restart/reorg и границу graduation.
4. Наблюдаемость неизвестных маршрутов: инвентаризировать, какие кандидаты сохраняются сейчас и что scanner вообще пропускает. Добавить сохранение evidence/причины и сигнал оператору для покупок нашего рынка. Одного статуса UNSUPPORTED_ROUTE недостаточно для доказательства полного обнаружения. Не обещать автоматическое доначисление задним числом: правила для уже закрытых draws отдельно не утверждены.
5. Совместный прогон terminal payload → receipt → index → билеты/API. Для каждого доступного штатного маршрута: подтверждённый результат либо конкретный незакрытый blocker. Одно предупреждение на сайте не заменяет требуемый охват. Проверить добавление новой версии адаптера без изменения старых результатов/frozen commitments.
6. После закрытия матрицы — G04 manifest/config, далее публичный executor и Buy/Claim UI, затем оставшиеся проверки по PRELAUNCH_VERIFICATION_PLAN. Резерв PAIR, timing и прочие release gates сохраняются.

## Матрица исходного состояния

| Ветка | Наблюдение frontend | Реализация/что остаётся |
|---|---|---|
| USDG → curve, прямой EOA | buy(quoteIn,minTokensOut,account) | pons-curve-buy.cjs поддерживает прямой вызов; локальные исторические fork-проверки есть; свежий terminal payload ещё не захвачен |
| USDG → v4, прямой router | execute 0x10 / 0x060c0f | pons-v4-buy.cjs поддерживает; UI → receipt доказательство отдельно |
| ETH/другой актив → USDG → токен | quotePonsV2Funding/buildPonsV2FundingCalls перед trade | Последовательный прямой последний BUY может совпасть с адаптером, но полная цепочка и фактическая сумма требуют проверки |
| Автовыбор 0x | pickPonsBestRoute, requestZeroExQuote | Прямые декодеры отвергают неизвестный top-level target; нужны реальные quote/payload/receipts |
| Wallet sendCalls | sendWalletCallBundle, fallback отдельных calls | Итоговый envelope зависит от кошелька; нельзя считать любую пачку ни поддержанной, ни обязательно wrapper |
| Другие рынки/режимы terminal | Общий chunk также содержит equity-route и старые торговые ветки | Не переносить автоматически на нашу V2 USDG-пару; проверить достижимость ветки для неё |
| Новые сторонние маршруты | Заранее неизвестны | Versioned admission, evidence и detection; никакого универсального допуска только по Transfer |

Прямая curve сейчас требует payer=recipient=tx.from; v4 требует прямой router и разрешённую последовательность действий/settlement. См. [UI routing](PONS_UI_ROUTING.md), [direct BUY](PONS_DIRECT_PURCHASE.md), [BUY admission](BUY_POLICY_ADMISSION.md).
Порог 100 USDG, перенос остатка, призовая математика и существующие frozen обязательства не меняются.

## Проверка 02.10

Read-only скачаны HTML существующего V2 токена и 47 связанных JS chunks. Четыре chunks из evidence 01.10 всё ещё связаны страницей и имеют прежние SHA-256. Просмотрены участки выбора маршрута, funding calls и отправки bundle; локальные decoder guards сверены с ними.
[Машиночитаемый снимок](evidence/PONS_CHANNEL_DISCOVERY_2026-10-02.json) содержит URL, hashes и ограничения. Сырые загрузки и скрипт: .local/logs/pons-routes-20261002-*, .local/logs/pons-channel-discovery.cjs.
Статическая проверка не перечисляет гарантированно все динамические chunks, не подтверждает доступность quotes и не является тестом кошелька. Новые транзакции, подписи, изменения runtime и продуктовые tests в этом шаге не выполнялись. Проверены JSON, новые локальные ссылки и diff.

## G10.2 — реальные receipt-примеры, 02.10

Выбран RDH со скрина: token 0xa84d0Caa63d1A92FD0c5B237EE9Bc322E38d1DDf, USDG, curve 0x50c6c92b55bffe2c345bf60011410061daf74889. Из публичного trades API взяты первые восемь BUY; полные транзакции и receipts получены read-only RPC. [Сохранённые данные](evidence/PONS_CHANNEL_RECEIPTS_2026-10-02.json).

Прогон существующего pure decoder: 1 ELIGIBLE (102723285 raw USDG, payer=recipient=sender), 7 UNSUPPORTED_ROUTE / NOT_DIRECT_CURVE_CALL. В выборке есть native value и посредники, а также расхождение tx.from и получателя CurveBuy. Это не доля поддерживаемых покупок во всём рынке и не доказательство, что все восемь отправлены UI Pons: источник интерфейса из receipt не устанавливается.

Scanner replay-direct-buy.cjs читает все receipts блока, без фильтра tx.to; decoder распознаёт CurveBuy по адресу нашей кривой даже при неизвестном top-level target. Следовательно, эти примеры не должны отсеиваться именно фильтром адресата scanner. Полный admitted indexer/API на RDH не прогонялся: данный fixture не является deployment manifest, registry — явно отмеченный sentinel; runtime admission отсутствует. Доступность этих ошибок на сайте/сигнал оператору ещё отдельно.

Новый test/pons-channel-receipts.test.cjs закрепляет прямой реальный receipt, отсутствие случайного допуска семи indirect receipts и отказ при подмене sender/удалении оплаты. Команда: node --test test/pons-channel-receipts.test.cjs test/pons-curve-buy.test.cjs — 9/9 PASS; лог .local/logs/pons-channel-receipts-tests.txt. Добавлен профиль pons-channels и включение fixture-теста в full. Полный набор не запускался.

Browser capture не завершён: тестовый EIP-1193 provider без ключа возвращал публичный адрес и отклонял неподдержанные запросы; после gate Review and accept терминал не дошёл до торгового wallet request. Capture содержит только accounts/chainId. Изолированная повторная попытка блокировала все HTTP writes кроме явно разрешённых read-only RPC; контур подписи/отправки не предоставлялся. На странице также отображалось сообщение Pons о degraded backend. Эти наблюдения не доказывают причину сбоя и не являются успешным payload capture.

Следующий ограниченный шаг: изолированный harness текущего Pons terminal с фиктивной identity, mock состояния UI-gate и перехватом calls, без внешнего acceptance/sign/send. Сначала получить USDG и ETH → USDG → curve requests, связать конкретные обёртки с receipts; затем локальное исполнение и v4/0x/batch. Ни один indirect маршрут этим пакетом не разрешён, публичное включение по-прежнему закрыто.

## G10.3 — исполнение исходных функций терминала

Для обхода зависимости от UI-сессии использован отдельный исследовательский harness: браузер загружает зафиксированные JS chunks Pons; инструментирована только регистрация exports, сами функции построения и отправки calls не переписаны. Их вызываем программно с фиктивным account 0x1111…1111, без кошелька/ключа/внешнего acceptance. Это не полный click-through тест и не проверка расширения кошелька.

Получен реальный выход buildPonsV2TradePlan для 101 USDG: approve USDG на curve и buy(101000000,minTokensOut,account). Allowance намеренно смоделирован нулевым; состояние curve прочитано на фиксированном RPC block. Для ETH использованы исходные quotePonsV2Funding/buildPonsV2FundingCalls и live read-only API pons-asset-route: deposit WETH → approve WETH → funding router multicall → approve USDG → direct curve BUY. Последний BUY расходует minOut funding quote; излишек обмена не включён в сумму этого BUY. API quote не привязан к anchor блока и требует отдельной симуляции исполнения.

Исходный sendWalletCallBundle с заглушкой wallet подтвердил:
- Два USDG calls и пять ETH calls сначала передаются sendCalls целиком.
- Простой fixture-отказ 4001 не запускает последовательную отправку. Но дополнительный 4001 с текстом User rejected wallet_sendCalls запускает fallback: Pons проверяет также текст ошибки. Это подтверждённое поведение stub-сценария, не проверка реального расширения. Такую fallback-политику не следует переносить в наш sender; отмену/unknown outcome нужно обрабатывать отдельно.
- При имитации 4200 (метод не поддержан) начинается sendTransaction fallback. Заглушка останавливает его на первом запросе; завершение всей fallback-последовательности этим тестом не доказано.
- Одиночный BUY при уже выданном approval идёт в sendTransaction.

[Сохранённые calldata, RPC reads и dispatch](evidence/PONS_TERMINAL_CAPTURE_2026-10-02.json). Первоначальные три regression-теста PASS: node --test test/pons-terminal-capture.test.cjs, лог .local/logs/pons-terminal-capture-tests.txt. Они проверяют сохранённый capture; live extension/batch receipt этим не проверен.

Повторяемые исследовательские команды (новые output paths обязательны):

~~~powershell
node scripts/pons-terminal-capture.cjs .local/logs/NEW-capture.json
node scripts/pons-terminal-dispatch-capture.cjs .local/logs/NEW-capture.json .local/logs/NEW-dispatch.json
node scripts/pons-terminal-capture-fork.cjs .local/logs/NEW-capture.json .local/logs/NEW-fork.json
~~~

Capture скачивает sources из зафиксированного discovery и проверяет SHA-256 всех 47 chunks, сохраняет их в .local/logs/pons-terminal-sources. При drift — остановка, требуется новый review. Запуски capture-tool и dispatch-tool 02.10 успешно завершены. Fork использует in-process Hardhat и upstream proxy только для чтения, синтетические ETH/USDG, два отдельных сценария из одного snapshot. Скрипты предназначены для данной исследовательской RDH curve, не public sender и не deploy admission.

### Результат локального исполнения

02.10: CAPTURED_CALLS_LOCAL_FORK_PASSED, anchor 77985023 (0x4a5f4ff), hash 0x57f0a6cc7c68809b22b5a63635225a3434aa1d06690c198a46b7f59ec915551e. [Capture и полные локальные receipts](evidence/PONS_TERMINAL_FORK_2026-10-02.json).

- USDG: 2 успешные транзакции (approve + buy), один ELIGIBLE BUY на 101000000 raw USDG.
- ETH: 5 успешных транзакций (wrap + approve + conversion + approve + buy), один ELIGIBLE BUY на 2697638 raw USDG. Промежуточный обмен не породил второй BUY нашего токена.
- Сценарии из независимых восстановлений одного snapshot; это не общий cumulative ledger. Admitted indexer, API, draws и кошелёк-расширение в этом прогоне не запускались.

Финальный fixture-набор 4/4 PASS: node --test test/pons-terminal-capture.test.cjs, лог .local/logs/pons-terminal-capture-tests-final.txt. Добавлены сверка каждого calldata/to/value с исполненной транзакцией и повторный pure decode всех receipts. Full suite не запускался.

Предварительные попытки не являются PASS: первоначальный долгий запуск остановлен для добавления диагностики; -b остановился при исследовательском подборе storage-slot (исправлен catch+rollback); -c завершился native EDR panic из-за недоступного исторического состояния upstream. Финальный запуск использует новый capture и свежий anchor, без ослабления slippage или подмены calldata. Полные логи: .local/logs/pons-terminal-fork-fresh.txt/.json, capture-fresh.json. Это дополнительное подтверждение необходимости достаточной глубины RPC для постоянного индекса, не решение этого операционного gate.

Ближайший шаг G10: конкретный wallet batch/envelope и attribution аккаунта, затем v4/0x; если удобнее получить batch на curve первым, используем уже доказанный набор calls. Не считать семь indirect RDH receipts автоматически маршрутами UI Pons. Нужны связь с конкретным wallet/route и проверенные bindings. Публичный запуск закрыт; G04 пока после G10.

## G10.4 — разграничение ролей

[Диагностика batch/indirect attribution](PONS_BATCH_ATTRIBUTION.md): реальные flow-примеры, provenance guards, контртест funding/refund и критерии wallet-specific допуска. Расширение активных adapters ещё не выполнено.

02.10: curve self-batch подключён к versioned local index/ledger/API. Standard USDG и ETH funding covered в synthetic integrated RPC scenario; real signed fork receipts и live bindings проверены отдельно. Единый curve+post-graduation batch profile и public admission остаются открытыми. [Details](PONS_BATCH_ATTRIBUTION.md).
