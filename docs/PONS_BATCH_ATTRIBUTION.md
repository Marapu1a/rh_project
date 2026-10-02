# Pons: роли в batch и непрямых покупках

> Актуализация02.10: это модуль с датированными этапами/evidence, а не текущая очередь работ. Подтверждённые curve/pool self-batches теперь подключены к index/API новым genesis v2; scanner читает новый suffix, idle replay устранён. [Текущая матрица](PONS_CHANNEL_COVERAGE.md), [аудит](PONS_AUDIT_2026-10-02.md), [план](ROADMAP.md).

02.10.2026. Исследовательская диагностика реализована; новые маршруты не допущены. [Общий пакет G10](PONS_CHANNEL_COVERAGE.md).

## Что подтверждено

wallet_sendCalls — интерфейс кошелька, а не единый формат on-chain транзакции. EIP-5792 допускает атомарное исполнение и последовательные транзакции в зависимости от запроса и возможностей кошелька. Возвращаемые wallet receipts могут содержать только относящиеся к операции logs; для независимого индекса нужны полные canonical receipts, а не доверие ответу пользовательского кошелька. Источник: [EIP-5792](https://eips.ethereum.org/EIPS/eip-5792). [ERC-7821](https://eips.ethereum.org/EIPS/eip-7821) задаёт отдельный интерфейс batch executor, но сам по себе не доказывает, что конкретная транзакция Pons использует его.

Выборка RDH не является доказанной выборкой wallet-batch. Для транзакции 0x35a4…ba5da USDG идёт от tx.from через посредника на curve; TOKEN возвращается через посредника к tx.from. CurveBuy.buyer/recipient при этом указывают на посредника, а не на конечного плательщика/получателя. Для 0x7f9f…c4376 tx.from вообще не имеет движения USDG/RDH в receipt, а деньги и токены проходят по другой цепочке. Подставлять отправителя или CurveBuy.recipient в качестве пользователя нельзя.

[Диагностический отчёт по восьми receipts](evidence/PONS_ATTRIBUTION_2026-10-02.json) сохраняет transactionSender/Target, curveCaller/Recipient, transfers и assetDeltas. Ни одна из этих полей не объявляется доказательством владения аккаунтом. Whole-transaction delta также не является суммой отдельного BUY.

[Наблюдение кода двух адресов](evidence/PONS_ACCOUNT_CODE_OBSERVATION_2026-10-02.json): в текущем блоке обычный runtime, не EF0100 delegation designator. Это не историческая аттестация и не классификация как wallet/router. Verified-source endpoint Blockscout вернул403; equivalence исходников и deployed bytecode не установлена. Названия селекторов не угадывались.

## Найденная граница ETH batch

Прямой curve decoder считает входящие USDG на payer потенциальным refund и требует соответствующий CurveBuyRefunded. Для атомарного ETH→USDG→BUY входящий USDG от funding swap — отдельный шаг, не возврат curve. Поэтому переназначить tx.from/to и вызвать существующий decoder на всём batch receipt недостаточно.

Контртест использует deliberately synthetic splice funding log и BUY receipt из прежнего успешного локального sequential прогона. Прямой pure decoder возвращает UNEXPECTED_REFUND; диагностический слой отклоняет подменённую provenance. Это НЕ добытый batch receipt и НЕ предложение смешивать logs разных транзакций.

## Реализация и проверки

scripts/pons-channel-attribution.cjs — read-only CLI и inspect(manifest,tx,receipt). Проверяет transaction/receipt/log identity, успешность, позиции, removed и дубликаты; сортирует transfers по logIndex и считает точные BigInt deltas. Отдаёт admitted=false, eligibility=null; статус старого direct decoder приведён только для сравнения. Модуль не подключён к начислению или public API.

~~~powershell
node scripts/pons-channel-attribution.cjs docs/evidence/PONS_CHANNEL_RECEIPTS_2026-10-02.json .local/logs/NEW-attribution.json
node --test test/pons-channel-attribution.test.cjs test/pons-channel-receipts.test.cjs
~~~

02.10: 7/7 адресных tests PASS; после усиления проверки identity повторены только4 изменённых tests, PASS. Логи .local/logs/pons-attribution-tests.txt и pons-attribution-tests-final.txt. Ссылки/JSON/diff проверены. Full suite, новый fork и реальный wallet extension не запускались. Продуктовые правила и активные BUY adapters не менялись.

## Следующий ограниченный шаг

Пользователь подтвердил MetaMask. Установленная версия и её capabilities на Robinhood Chain ещё не проверены. Следующий шаг — снять read-only wallet_getCapabilities для подключённого аккаунта и chainId 0x1237 (4663), затем получить соответствующий настоящий mined batch/envelope локально и проверить профиль. Пока нельзя связывать найденные indirect receipts с wallet_sendCalls Pons.

Для допуска нужны: chain/runtime/implementation и authorization context, проверяемое извлечение выполняющего account и конкретного BUY, принадлежность USDG-debit/TOKEN-credit этому account, изоляция funding/refund и соседних операций, canonical provenance/dedup/reorg. При delegation/upgrades нельзя подменять runtime во время исполнения кодом на конце блока. Неизвестный профиль остаётся unsupported; никакой автоатрибуции по одному Transfer/CurveBuy или caller.

Первый целевой proof — approve + USDG BUY от account при другом gas sender, затем ETH funding + BUY в одном receipt. Отрицательные случаи: чужой recipient, дополнительные debit/refund, несколько пользователей/BUY, revert отдельной операции, подмена runtime/envelope и повтор индексации. Затем включение versioned adapter в policy; старые результаты и frozen commitments не переписываются. V4/0x остаются в G10, G04 идёт после подтверждённого охвата.

## MetaMask: подтверждённый выбор и граница проверки (02.10.2026)

Пользователь использует MetaMask; desktop/mobile и версия не установлены. Проверен исходный код extension main на commit `a6765b12ed73e0c18eace82d1f0ead55226c64ec`, а не установленный кошелёк пользователя.

- [eip7702-support-utils.ts](https://github.com/MetaMask/metamask-extension/blob/a6765b12ed73e0c18eace82d1f0ead55226c64ec/shared/lib/eip7702-support-utils.ts): поддерживаемые сети и contracts берутся из remote feature flags; состояние делегации учитывается отдельно. Подключение EVM-сети само по себе не доказывает atomic batch support.
- [account-supports-7702.ts](https://github.com/MetaMask/metamask-extension/blob/a6765b12ed73e0c18eace82d1f0ead55226c64ec/app/scripts/lib/account-supports-7702.ts): поддержка зависит также от типа keyring аккаунта.
- [wallet_getCapabilities.spec.ts](https://github.com/MetaMask/metamask-extension/blob/a6765b12ed73e0c18eace82d1f0ead55226c64ec/test/e2e/json-rpc/wallet_getCapabilities.spec.ts): официальный пример запроса с params `[account, [chainId]]`. Эти тесты не подтверждают поддержку Robinhood Chain.

Для следующего прогона сохранить ответ `wallet_getCapabilities` выбранного MetaMask provider с params `[account, ["0x1237"]]`, версию/платформу и текущую сеть. Запрос только читает возможности: upgrade, authorization и отправка транзакций для диагностики не нужны. Ошибка метода или отсутствие atomic capability не превращаются в подтверждение atomic support. Даже положительный ответ не заменяет canonical receipt и проверку исполнения.

На этом этапе MetaMask batch profile НЕ admitted; старые indirect RDH receipts не объявлены транзакциями MetaMask. Изменены только документы; продуктовые тесты повторно не запускались.

## Локальная проверка установленного кошелька

`node scripts/wallet-capabilities-server.cjs` открывает http://127.0.0.1:4175 только на loopback. Выбор provider через EIP-6963 rdns io.metamask (самодекларация, не криптографическая аттестация). Кнопка вызывает только eth_requestAccounts, eth_chainId, wallet_getCapabilities и eth_accounts. Нет send/sign/upgrade/switch методов. Ответ сохраняется в .local/logs/metamask-capabilities-*.json как недоверенное наблюдение, admitted=false. Версию можно вписать вручную; автоматическое определение не заявлено.

02.10.2026: `node .local/logs/wallet-probe-check.cjs` — 4 browser/HTTP smoke проверки PASS: положительный ответ, unsupported, отказ подключения, чужой Origin. Provider подставной, POST перехвачен без сохранения фиктивного отчёта. Это проверка страницы, не MetaMask/Robinhood runtime. Ожидается действие пользователя в браузере с установленным расширением; после него проверяем настоящий отчёт.

## Ответ кошелька пользователя — 02.10.2026 09:18 МСК

[Evidence](evidence/METAMASK_CAPABILITIES_2026-10-02.json): chainBefore/After=0x1237, stable=true, capabilityError=null; atomic.status=ready, auxiliaryFunds.supported=true. Версия не указана. По [EIP-5792](https://eips.ethereum.org/EIPS/eip-5792#atomic-capability), ready означает возможность перейти в supported после одобрения upgrade пользователем. Это не unsupported и не уже действующая гарантия atomic execution. auxiliaryFunds не доказывает конкретный funding route Pons.

Ответ получен через пользовательский provider; on-chain runtime/envelope и receipts он не доказывает. Upgrade основного аккаунта не выполнялся; следующий технический шаг — определить executor и воспроизвести approve+BUY, затем funding+BUY локально на тестовом аккаунте. Admission не меняется. Проверены JSON и diff; код исполнения не менялся, продуктовые тесты не повторялись.

## Исполненный runtime model — 02.10.2026

[Fixture](evidence/PONS_METAMASK_MODEL_2026-10-02.json) содержит свежий Pons capture, anchor, canonical local receipts и inspector observations. Официальный deployment record MetaMask на commit bff4b08f8006ad94322a6e3da8d90f274e20325d указывает executor 0x63c0c19a282a1b52b07dd5a65b58948a07dae32b для4663. Код этого адреса прочитан на локальном fork; hash записан в evidence. Соответствие исходников runtime не доказано, использование этого адреса установленной версией MetaMask не подтверждено.

`scripts/pons-metamask-model-fork.cjs CAPTURE NEW_OUTPUT` использует Cancun, hardhat_setCode на фиктивном account1111, impersonation и synthetic balances. Выполнен self-call execute(bytes32,bytes), batch/default mode, с захваченными Pons calls. Это модель исполнения кода, а не type4 authorization/подпись/relay/MetaMask UI. Публичные sends исключены read-only proxy.

Результат METAMASK_RUNTIME_MODEL_PASSED: USDG — 101000000 raw quote, ETH — 2701245 raw quote в BUY, incoming funding2728530. Оба receipt успешны, curveCaller/recipient=fake account. Действующий direct decoder возвращает UNSUPPORTED_ROUTE/NOT_DIRECT_CURVE_CALL; admission и tickets не изменены. При будущей поддержке funding2728530 нельзя считать возвратом по BUY2701245.

Проверки: `node scripts/pons-terminal-capture.cjs .local/logs/pons-metamask-capture.json`; `node scripts/pons-metamask-model-fork.cjs .local/logs/pons-metamask-capture.json .local/logs/pons-metamask-model.json`; `node --test test/pons-metamask-model.test.cjs` — 2/2 PASS. Первое утверждение теста ошибочно сравнивало asset с меткой quote вместо адреса; исправлено и повторно проверено. Полный suite не запускался. Следующий шаг: изолированный decoder этого envelope с отрицательными сценариями; actual7702 и wallet implementation admission остаются отдельными gates.

## Research batch shape decoder — 02.10.2026

`scripts/pons-batch-buy.cjs` разбирает canonical execute(bytes32,bytes), только self-call с нулевым value, batch/default mode и ровно approve(quoteIn)→curve.buy с тем же recipient. Сначала проверяется provenance оригинального receipt. Внутренняя проекция BUY используется только для переиспользования проверок direct decoder; исходные tx/receipt не меняются и logs не отрезаются. Выход SHAPE_MATCH содержит observedBuyQuoteRaw, но eligibility=null, admitted=false: никакой интеграции с entry ledger нет.

ETH funding отклоняется UNSUPPORTED_CALL_SEQUENCE. Не поддержаны relay, дополнительные calls, unlimited approval, try mode. Поступление quote в простом USDG batch не отбрасывается и проверяется как возможный refund существующим decoder. Runtime/authorization и Pons deployment admission этим модулем не доказываются.

`node --test test/pons-batch-buy.test.cjs test/pons-metamask-model.test.cjs test/pons-channel-attribution.test.cjs` — 20/20 PASS, 02.10.2026. Включены чужой recipient, лишнее списание/поступление, изменённый receipt, duplicate/removed logs, revert и неканонический calldata. Повторного fork/full suite не было: использованы сохранённые local-runtime receipts. Следующий шаг — доказуемое выделение funding и BUY внутри ETH batch; не заменять его обрезкой неудобных logs.

## ETH funding shape — 02.10.2026

`scripts/pons-batch-funding.cjs` отдельно разбирает пять calls: WETH deposit, точный approve, router.multicall с единственным exactInput, USDG approve, curve BUY. Только наблюдавшийся single-hop path с fee100, self-call/default batch; профиль WETH/router/pool передаётся вызывающим кодом и НЕ admitted. Проверяются canonical ABI, суммы, recipient, Transfer mint/spend WETH, поступление USDG из заданного pool, оплата curve, получение TOKEN и CurveBuy, их порядок. Refund/CurveSell и дополнительные asset transfers отклоняются.

Сохранённый local-model receipt: funding2728530, BUY2701245, неистраченный остаток27285 raw USDG. Полный receipt сохранён неизменным; никакие logs не удаляются для обхода UNEXPECTED_REFUND. Результат SHAPE_MATCH, eligibility=null, admitted=false. Calldata и логи не доказывают call boundaries, доверенность runtime, pool token/fee binding или действительную реализацию MetaMask. Не проверяется deadline относительно блока: это ещё одна граница статического shape-анализа. Graduation/refund, multihop и relay не поддержаны.

`node --test test/pons-batch-funding.test.cjs test/pons-batch-buy.test.cjs test/pons-metamask-model.test.cjs` — 28/28 PASS. Проверены неправильные pool/router, лишнее/недостаточное поступление, отсутствие WETH payment, неверный порядок funding, refund, removed/foreign receipt, revert и trailing calldata. Новый fork/full suite не запускались. Следующий шаг — проверяемое execution evidence с runtime/bindings до production admission; начисления не включены.

## Подписанное локальное исполнение EIP-7702 — 02.10.2026

[Evidence](evidence/PONS_SIGNED_7702_2026-10-02.json): PONS_SIGNED_7702_LOCAL_PASSED. Существующий capture и fork runner расширены флагом --7702; отдельный test/fixtures/pons-7702-hardhat.config.cjs использует Prague. Capture вызывает те же pinned функции Pons для адреса публичного локального тестового ключа; USDG/ETH calls исполняются подписанными type4 self-transactions, authorization chain4663/nonce=tx.nonce+1. Проверены success receipt, type4, одна authorization и EF0100+executor account code после исполнения. В этой ветке нет impersonation аккаунта и hardhat_setCode. Synthetic ETH/USDG balances и local fork сохраняются. Тестовый ключ детерминирован из явной public-test строки, не является пользовательским ключом и не должен получать реальные средства. Публичный RPC только читался через read-only proxy.

Команды: `node scripts/pons-terminal-capture.cjs .local/logs/pons-signed7702-capture.json --7702`; `node scripts/pons-metamask-model-fork.cjs .local/logs/pons-signed7702-capture.json .local/logs/pons-signed7702-result.json --7702`. Оба BUY прошли. `node --test test/pons-signed-7702.test.cjs test/pons-terminal-capture.test.cjs test/pons-batch-buy.test.cjs test/pons-batch-funding.test.cjs` — 32/32 PASS; signer authorization восстановлен из подписи, подмена chain меняет восстановленный адрес, shape decoders всё ещё admitted=false.

Это существеннее runtime-copy модели, но НЕ admission. Версия MetaMask, выбранный ею executor и steady-state покупки уже делегированного аккаунта не доказаны этим прогоном. Транзакции типа4 с несколькими/чужими/недействительными authorization нельзя принимать только по наличию списка; state-at-execution для обычных type2 требует отдельного решения. Публичные policy IDs не расширены, replay/indexer начисление не изменено. Обещанный сквозной batch→ledger→API пакет остаётся незавершённым; не выдавать signed execution test за его завершение.

## Steady-state и rollback; MetaMask13.48.0 — 02.10.2026

Пользователь подтвердил13.48.0. [Source metadata](evidence/METAMASK_13_48_SOURCE_2026-10-02.json): extension package.json/yarn.lock, resolved transaction-controller69.8.1, eip-5792-middleware3.0.3. Generator использует execute(bytes32,bytes), batch/default при atomic=true (default); atomic=false выбирает try. Просмотренный middleware вызов addTransactionBatch не передаёт atomic. Source inspection не равен исполнению установленного extension; адрес upgrade получается из remote feature flags, а не только из версии.

[Fresh fork evidence](evidence/PONS_STEADY_7702_2026-10-02.json): USDG и ETH проверены через type4 upgrade+BUY и через отдельный upgrade с последующей подписанной type2 BUY. Market state восстанавливается из snapshot, чтобы использовать исходный captured minOut без ослабления slippage; это альтернативные ветки, не единый cumulative ledger. В каждом сценарии дополнительный batch с недостижимым minTokensOut mined со status0, logs=[], quote/TOKEN/WETH balances неизменны. Газ и nonce меняются; их rollback не заявлен. Upgrade authorization по EIP-7702 не обязан откатываться при revert исполнения.

Команды: `node scripts/pons-terminal-capture.cjs .local/logs/pons-steady7702-capture.json --7702`; `node scripts/pons-metamask-model-fork.cjs .local/logs/pons-steady7702-capture.json .local/logs/pons-steady7702-result.json --7702`. `node --test test/pons-signed-7702.test.cjs test/pons-batch-buy.test.cjs test/pons-batch-funding.test.cjs` — 30/30 PASS. Полный suite не запускался.

Конкретная граница следующего implementation package: scanner/cache должны сохранять и проверять state-at-execution delegation для type2, включая внутриблочные authorization изменения. Для type4 нельзя доверять наличию authorizationList: [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702#behavior) пропускает невалидные tuples; нужны recovered authority, chain, nonce и порядок применения. Проверки executor/router/pool/bindings и новые policy identity должны предшествовать ledger/API admission. На этом шаге scanner, policy IDs и ledger НЕ изменены; полный пакет пока не завершён.

## Подключение к индексатору и API — 02.10.2026

`scripts/pons-batch-route.cjs`: явный genesis profile `direct-buy-pons-batch-v1` / `rh-pons-curve-self-batch-v1`, включает обычный curve BUY и проверенные self-batches approve→BUY / WETH→single-hop USDG→BUY. Новая policy identity не применяется к старым manifests и frozen history; extension старой Pons policy по-прежнему не разрешён. Это curve-only профиль: он НЕ заменяет curve+v4 профиль на публичном запуске. Batch v4/агрегаторы остаются открытой частью G10.

Допуск исполнения: type4 — ровно одна chain-specific authorization к pinned executor, recovered authority=tx.from, nonce=tx.nonce+1; type2 — сохранённый parent delegation marker и отсутствие authorization к этому аккаунту во всём блоке. Любая такая активность отклоняется консервативно, даже если tuple мог быть невалидным. Relay и другие типы не допускаются. Receipt provenance проверяется до shape; для ETH исключается из BUY-local projection только единственный проверенный pool→payer funding log. Исходные canonical receipts и все evidence indexes сохраняются. Остаток funding не становится расходом на токен.

Scanner проверяет executor code в parent block и все pinned dependencies на каждом scanned block; pool token0/token1, fee100, router/pool factory и factory.getPool должны совпасть. [Live binding observation](evidence/PONS_BATCH_BINDINGS_2026-10-02.json) PASS. Это не аудит исходников и не доказательство формата установленного расширения. Bytecode fixtures используются тестами, не удалять как мусор.

`direct-buy.cjs` передаёт полный block context; persistent state хранит batchAccounts рядом с blocks. Исправлен cacheHeight для receipts: собственный blockNumber вместо высоты предыдущего RPC чтения (которое теперь может относиться к parent). Reorg должен эвиктить именно receipt изменённого блока.

Проверка `test/pons-batch-integration.test.cjs` использует сохранённые реально исполненные payload/receipts, переобозначенные в SYNTHETIC contiguous chain, mocked bindings и mocked policy source. Это НЕ свежий deployed-policy fork. Настоящие scanner, policy admission code, persistent writer, replay/lifecycle и HTTP worker API работают без подмены результатов. Проверены 1 Short +1 Monthly, carry=1USDG+ETH BUY, повторный проход без receipt RPC, reorg с тем же tx hash, удаление BUY, outage/recovery, missing delegation, неверные authorization/runtime, сохранность старого snapshot. API отвечает через реальный localhost HTTP server.

Команда: `node --test test/pons-batch-integration.test.cjs test/pons-batch-buy.test.cjs test/pons-batch-funding.test.cjs test/pons-persistent-indexer.test.cjs test/pons-policy-indexer.test.cjs test/pons-curve-buy.test.cjs test/pons-v4-buy.test.cjs test/direct-buy.test.cjs test/persistent-buy-indexer.test.cjs` —79/79 PASS, log `.local/logs/pons-batch-integrated-tests.txt`. После ужесточения funding pins повторены только3 integration tests —3/3 PASS. Full suite не запускался.

Следующий законченный пакет: объединить curve и post-graduation v4 coverage в одном будущем launch profile, квалифицировать реальные policy/deployment/runtime параметры и прогнать новый профиль на настоящем локальном fork до API. G10 целиком пока не закрыт; production policy не опубликована и начисления на сервере не включались.
