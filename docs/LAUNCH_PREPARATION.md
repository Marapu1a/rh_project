# Подготовка публичного запуска

## Проверка документации и формы PAIR 30.09.2026

Источник: https://pair.fund/docs#infinity, отрендеренная документация сохранена
в `.local/logs/pair-docs-20260930.txt`. Проверен текущий публичный bundle
`https://pair.fund/assets/index-D6c-cNzh.js` (локально `.local/logs/pair-live-bundle.js`).
Документация различает Infinity и Launch V2: отдельный creatorFeeRecipient
в разделе Fees & Policy Epochs описывает Launch V2, не доказательство поля Infinity UI.

В текущей Infinity форме Creator Fees код берет подключенный account (`xt=n`)
и кодирует `qw(Y,{creator:xt})` в modeData. Отдельного получателя этот путь
не подставляет. Это наблюдение текущей версии frontend, не ограничение протокола.
Наш `scripts/infinity-launch-fork.cjs` кодирует receiver/collector в modeData,
вызывает тот же PAIR launchInfinity и проверяет получателя созданного vault.
Существующий fork proof не повторялся и не является разрешением mainnet sends.

Следующий ограниченный шаг: подготовить запуск через PAIR-контракт с collector
получателем и актуальными opening данными, с предварительным просмотром и подписью
владельца. Обычное нажатие Launch в текущем Creator Fees UI направит комиссии
подключенному аккаунту, а не автоматически нашей системе. Не заменять режим на
Fee Sharing без отдельной проверки совместимости: текущий collector ожидает CREATOR_QUOTE.
PAIR API дает историю для отображения, но сама документация требует on-chain
проверок для финансовых действий; это не доказанная замена нашему RPC/indexer.
Новых платных услуг не заказано, транзакций/подписей не было.
Проверка: чтение документации через Playwright, статический разбор live bundle
и существующей fork-интеграции; только docs изменены, продуктовые тесты не запускались.


30.09.2026. Ограниченный шаг: актуальная проверка источника PAIR и явный список
параметров. Никаких публичных транзакций, новых signing keys или переводов не было.
Настройка сайта/API завершена отдельно в [PUBLIC_STATUS_API](PUBLIC_STATUS_API.md).

## Подтверждено сейчас

`node scripts/launch-source-preflight.cjs NEW_OUTPUT.json` читает сеть без signer.
RPC берётся из RH_RPC_URL, по умолчанию официальный публичный endpoint. Вывод не
содержит URL с API-key или исходные ошибки провайдера. Runtime source hashes взяты
из ранее проверенных `research/infinity-source-audit/{launch,engine,hook,adapter}.json`.
Каждый state read привязан к одному номеру блока, hash блока проверяется повторно.

30.09,11:13:30UTC, block0x48ed9dc:
`0x91640418bc7d22662cb725b3b6e7f4f783bfee0053407525b284e6f4de5e1af1`.
Совпали4 runtime, USDG runtime/decimals6, implementation slot launchpad,
engine.launchpad и validateLaunchpad. Launch fee500000000000000wei =0.0005ETH;
gasPrice22016000wei на момент чтения. TOTAL_SUPPLY raw1e27, protectionBlocks5
прочитаны как свойства PAIR, не выбраны как настройки нашего запуска.
Отчёт `.local/logs/launch-source-20260930.json`. Это не аудит всей PAIR, не бюджет
наших контрактов и не authorizationToSend. Fee/gas перечитать перед транзакциями.

`public-rpc-qualification.cjs`, depths0/10000/864000, до150requests:
официальный endpoint42requests/3failures, sampledDataAvailable=false;
Blockreq7requests/4failures, завершился RPC -32601. Отчёты
`.local/logs/launch-rpc-20260930-{0,1}.json`. Ни один не квалифицирован как archive.
Чтение текущих pins прошло, это не заменяет доступ к историческому состоянию.
BUY replay не выполнялся: реальный admitted project manifest ещё не задан.
[Документация сети](https://docs.robinhood.com/chain/connecting/) рекомендует archive
для indexing и отдельного провайдера для production; тариф надо проверить, платная
подписка не объявлена обязательной без сравнения подходящих предложений.

## Что ещё требуется

В launch plan добавлен раздел launch: creator/name/symbol/metadataURI/metadataHash,
openingProfile, sniperProtection/protectionBlocks, userSalt/vanityNonce,
developerBuy и launchFeeBudgetWei. Название/символ QIANQI — черновик по бренду,
не уже выпущенный токен. Остальное оставлено null. Стандартный путь PAIR и реальные
параметры открытия должны быть проверены; тестовые ticks±400000/±380000 и
protection=false из fork автоматически не переносятся в production.
`public-launch-plan.cjs` теперь перечисляет эти пропуски; заполнение не даёт допуска.

Привязка сервера в durableRuntime заполнена фактически: Amsterdam201.51.22.244,
qianqi.site, qianqi-api, state/var/lib/qianqi. signerCustody=null и executionEnabled=false.

Для пользователя:

1. Управляющий адрес — публичный0x-адрес кошелька организатора. Ключ остаётся у него;
   нужен для запуска и предусмотренного управления. Предпочтителен отдельный аккаунт.
2. Project recipient получает5% **дохода проекта от комиссий**, не5% оборота.
   Может совпадать с управляющим. Адрес кошелька не означает необходимость
   пересылать seed/private key в чат или сразу пополнять баланс.
3. Executor — отдельный рабочий signer автоматики, не SSH-ключ. Его создание,
   custody и резервное хранение пока не выполнены. Operations5% — отдельная роль.
4. RPC — доступ сервера к данным сети, не ещё один VPS. Сначала выбирается и
   проверяется endpoint с historical state; платный тариф сам по себе не qualification.

После адресов и RPC: согласовать роли/notice/gas/native/timing, opening/metadata,
собрать точные constructor args и порядок deployment, получить estimate на этих args,
прогнать локальную репетицию. Затем предъявить конкретные транзакции/бюджет перед
публичным запуском. Существующие public sends blockers и local guards не обходятся.

Текущая комиссия PAIR0.0005ETH — лишь одна часть расходов. До opening/constructor
параметров итоговую стоимость не обещаем. Первичное ETH для газа и100USDG стартера —
разные назначения; frozen/claimable не используются на эксплуатацию.

## Проверки

`node --test test/launch-source-preflight.test.cjs`:3/3; same-block reads,
отказы/смена hash/неразглашение ошибок, явные missing launch inputs, отсутствие sends.
`node --test --test-name-pattern='planning|plan|filled|allocation|rules|accepted' test/public-launch-checks.test.cjs`:
5/5 выбранных плановых сценариев. Это частичный запуск; контрактные wrappers не
менялись, полный suite не нужен. Команды/JSON отчёты — read-only, не launch proof.

## Read-only preview и кошелек запуска

30.09.2026: `scripts/pair-launch-preview.cjs` получает PAIR readiness, POST opening-quotes
(расчет котировки, без регистрации/подписи) и same-block source preflight.
Проверяет chain/asset/decimals/evidence/ticks/price, свежесть API/source и принятые
экономические параметры. Порог 300 секунд — фильтр preview, не правило PAIR.
Не кодирует транзакции; API verified не заменяет on-chain simulation. Непроверенный
кандидат не возвращается как usable. Неизвестные расходы и total остаются null.

Команда: `node scripts/pair-launch-preview.cjs NEW_OUTPUT.json`.
Live evidence: `.local/logs/pair-launch-preview-20260930.json`, 11:28:45UTC:
12 checks passed, PAIR ready, USDG opening candidate получен. Это краткоживущий
снимок; перед simulation надо получить новый. Launch fee 0.0005ETH, итог не оценен.

Пользователь сообщил creator `0x098afA6731239a00CE0aff669aaefD16b7C72114`;
checksum принят ethers, адрес записан только в launch.creator. Governor/operations/
project/executor не назначены этим сообщением. Read-only block0x48efdf0: баланс
0.003118319966247261ETH, nonce13, code пуст. Не доказательство контроля ключа,
nonce не зарезервирован, достаточность на весь запуск не подтверждена.
Evidence `.local/logs/launch-owner-20260930.json`.

Следом: metadata, подтверждение остальных ролей/настроек, проверка зависимости
token prediction от modeData и адреса collector, затем точные args и simulation.
Никаких public sends. Preview tests и source preflight проверяются адресно.

## Решение владельца: роли и первая покупка

30.09: creator 0x098afA6731239a00CE0aff669aaefD16b7C72114 также назначен
roles.governor и roles.project (5% команды). Publisher/executor отдельный,
адрес пока не задан; operations recipient не выбран автоматически.
Пользователь выбрал101USDG на первую покупку. В plan.initialPurchase записан
максимальный расход101000000raw USDG, газ отдельно, minOut пока не вычислен.
Точная сумма к пулу должна учитывать комиссии внутри этого лимита, а не101USDG
плюс комиссии. Нельзя заменять minOut на1 из тестовых сценариев.

Обнаруженная граница: infinity-buy.cjs допускает только tx.to=adapter и прямой
executeExactInput с payer=recipient=tx.from. Покупка через launch coordinator
дает NOT_DIRECT_ADAPTER_CALL и не подтверждена как подходящая для билетов.
Поэтому встроенный Developer Buy оставлен выключенным, первая покупка готовится
отдельно после deployment/admission/включения индексатора. Это технический путь
проверки принятого бюджета, не расширение продуктовых правил.
При net debit101USDG с нулевого накопления ожидаются1Short+1Monthly и carry1USDG;
при возврате считаем фактический расход. Это проверяет покупку/комиссии/entries,
но не гарантирует готовность розыгрыша: нужны фонд и временные условия.

Read-only баланс USDG=0 на block0x48f0e0b. Перед покупкой потребуется101USDG
в Robinhood Chain; ETH для gas отдельно. Обмен/bridge/покупка не выполнены.
Evidence `.local/logs/launch-owner-usdg-20260930.json`.
Проверки: public-launch-checks с фильтром planning|plan|filled|allocation|rules|accepted
5/5; test/infinity-buy.test.cjs4/4 (saved fork evidence, не новая mainnet покупка).

## Конкретный draft calldata и live simulation 30.09

Добавлен `scripts/prepare-pair-launch.cjs`: read-only RPC, без signer/send.
Вход — launch plan и `config/qianqi-metadata-draft.json`. Metadata URI
https://qianqi.site/metadata/qianqi.json пока НЕ опубликован, это draft.
Получает свежий PAIR opening/source, проверяет nonce/pending, читает factory,
подбирает стандартный salt для token0 через predictStandard, вычисляет CREATE
collector от реального nonce. Не выбирает vanity suffix и не инвертирует тестовую цену.
Draft protection=false/0 повторяет текущую форму PAIR, не означает финальный выбор.
Коллектор компилируется отдельно обычным solc/optimizer200/Cancun без overrides.
Выход включает unsigned requests, но status=draft-not-signable, authorization=false.
Нельзя отправлять эти requests: metadata/настройки не финальны, nonce/quote истекают.

Live `.local/logs/qianqi-launch-draft-20260930-v3.json`: независимые eth_call
collector и PAIR launchInfinity прошли; возвращенный TOKEN совпал с prediction.
Gas estimates2407408 и2832762. При наблюдаемом gasPrice costs0.000053449272416ETH
и0.000062892981924ETH; плюс launch fee0.0005ETH =0.00061634225434ETH для этих
двух операций. Это оценка снимка, не лимит/итог всего deployment и не кошельковая
котировка; остальные Promo contracts не включены. Баланс ETH0.003145306038277261,
USDG109.622644: пополнение подтверждено. Ни native, ни USDG не расходовали.

Первый запрос launch отклонялся RPC из-за padded quantity; исправлен toQuantity,
повторный запрос проходит. Первые local sequential попытки: завышенный default
upfront gas local EDR, затем public Blockreq history last1024blocks. Это не
on-chain revert PAIR. Последовательная репетиция учитывается отдельно от eth_call.
Тесты prepare-pair-launch + pair-launch-preview3/3; проверки кодирования collector,
3%/USDG и отказов preview. Полный suite не запускался.

Sequential повтор на свежем block0x48f26b6 PASSED:
`.local/logs/qianqi-sequential-20260930.json`, воспроизведение текущего draft через
`.local/logs/qianqi-sequential.cjs` и read-only upstream proxy. Local chain31337,
owner impersonated только локально, баланс не подменен. Collector затем PAIR launch
успешны; hook mode1/fee300bps и source.currentPolicy.recipient=predicted collector
проверены чтением. Обе tx существуют ТОЛЬКО в local fork; не mainnet deployment.
Metadata и публичный запуск не опубликованы, prize/BUY/end-to-end не проверены.
Следующий пакет — реальные роли executor/operations и immutable настройки Promo,
затем подготовка остальных contracts, metadata freeze и wallet review/signing UI.
