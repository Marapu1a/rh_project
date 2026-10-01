# КТ1: PAIR → BUY → постоянный индексатор

30.09.2026. Статус **BLOCKED до fork/BUY**, не PASS. Основной
[план](FINAL_CHECKPOINTS.md). Runner `scripts/kt1-buy-rehearsal.cjs` подготовлен,
но его путь после preflight еще не прошел интеграционную проверку.

## Команда

`node scripts/kt1-buy-rehearsal.cjs .local/logs/NEW_REPORT.json`

Нужен новый output path. Компилирует обычные public contracts, получает свежий
PAIR draft, использует in-process Hardhat4663 и read-only upstream proxy.
RH_RPC_URL — read-only источник draft, RH_FORK_RPC_URL — upstream fork;
по умолчанию official и Blockreq соответственно. Никаких удаленных sends.
Local HTTP bridge для дочернего indexer допускает только чтения.

Реализованный сценарий (пока не подтвержден прогоном): collector→PAIR→public
controllers с реальным TOKEN и принятыми rules→collector bind90/5/5→BUY policy
anchor до покупок→101 с refund7/60+40→SELL/plain transfer/unsupported forwarding
BUY→два отдельных процесса indexer с одним state. Проверки net debit, carry,
Short/Monthly entries, policy admission и ledger hash после restart.
UnsupportedBuyForwarder — только test contract, не предлагаемый production router.
Текущий helper рассчитывает floor creator300bps+protocol30bps; реальный расход
проверяется по балансам и receipts. Подтверждение этих assumptions ожидает fork.

Допущения: owner impersonation только локально, test native/USDG balance,
ArbSys fixture; local finalized не доказывает L2 finality. Нет time travel,
подмены odds/constructor clock и helper mint участников. Config/raw receipts/state
сохраняются в .local/logs/kt1-*; нет mainnet покупки за деньги владельца.
Фабрика fixtures расширена необязательным tokenAddress; прежний default не изменен.

## Обнаруженное внешнее изменение

В Ethereum EIP1967 implementation slot PAIR proxy
0xB0D389250c61c69EcCD5d986fC8482CBfA5418C4 теперь:
`0x557cb0e797973ef01f0e7fe9de0b75f2b5b587b7`,
codeHash `0xb39ab1d84969d02423784a8f0c4dd0279bea00a35686ef593953a4b909005c1e`.
Ожидали проверенную `0x4AdC88c7724c72f9B37dADF94dF01154eC49B62d`.
Official RPC block0x48ff5d9 и независимый Blockreq block0x48ff745 показали новый
адрес. Остальные проверяемые old runtime/source bindings совпали; это не аудит
новой implementation. Source preflight теперь сохраняет expected/observed в отчете.

На момент чтения live docs https://pair.fund/docs#infinity все еще показывали старую
implementation. Blockscout v1/v2 API вернул403/Cloudflare; Sourcify full/partial
metadata4663 для нового адреса404. Исходник/семантика новой реализации не подтверждены.
Ни pins, ни ABI не обновлялись вслепую. Это конкретный BLOCKED текущего запуска,
не обнаруженная потеря средств и не опровержение исторической старой репетиции.

Первый прогон остановился на временной ошибке PAIR opening API, повтор — на
implementation mismatch. Никаких fork транзакций в этих попытках не было.
Последний отчет .local/logs/kt1-blocked-diagnostic.json содержит preflight;
[короткое evidence](../research/public-deployment/kt1-blocked-20260930.json).

## Проверки и продолжение

Компиляция solc прошла. `node --test test/kt1-buy-rehearsal.test.cjs
 test/launch-source-preflight.test.cjs test/prepare-pair-launch.test.cjs`:5/5.
Это адресные tests расчета сумм/кодирования/preflight, не КТ1 PASS.
Full suite и новые mainnet операции не запускались.

Чтобы продолжить: получить verified source новой implementation, сравнить
launchInfinity/delegation/identity/recipient/opening/protection/storage bindings
с ранее проверенными, проверить runtime и текущий release graph. Затем осознанно
обновить source admission и заново прогнать КТ1. Старую implementation не
подставлять в fork через setCode и не обходить gate ради зеленого результата.

## Продолжение расследования implementation

[Evidence30.09](../research/public-deployment/pair-wrapper-investigation-20260930.json):
на block0x4900a95 новая implementation остается0x557cb0…;
legacyImplementation() через proxy возвращает прежнюю0x4AdC88… .
Размер нового runtime4648bytes, старого24323. Дизассемблирование dispatcher
показывает собственные launchInfinity(bytes)/launchInfinityAndBuy(bytes),
а не только неизмененный код прежней реализации. Найдены две immutable address
зависимости, также возвращаемые getter selectors0xec243732 и0xf7ad2c74:
0xbfda480dcc889c445224ef21437b6075bb7d0562 и
0xf1b1e40074bc1ff0bc3d2804b21a91bf761310f1. Их имена/семантика не установлены;
не назначать им роли по предположению. Адреса и code hashes записаны в evidence.

Одиночный read-only eth_call на proxy с прежней draft identity и обновленными
PAIR opening/deadline прошел на block0x490095c и вернул ожидаемый TOKEN.
Это исследовательский вызов без signer/send, не обход production preflight:
ожидаемые source pins не изменены, KT1 runner продолжает останавливаться.
Проверены только acceptance/return данного calldata. Не проверены новые ветки,
storage layout, взаимосвязи новых зависимостей и актуальный metadata deployment.

Получить verified source пока не удалось: Blockscout API403 (также с сервера),
страница браузера загружается, но source данные отсутствуют; показанный StubContract
был placeholder страницы, не подтвержденный исходник этого адреса. Sourcify404.
CBOR runtime дает solc0.8.26 и IPFS metadata CID
Qmbh9dpc1DgPHBsTYBYHKsgp3Qn35e5XcAHoHMR8XmQUJw. IPFS gateways ответили429
(service-worker migration) либо timeout; содержимое metadata не получено.
Официальный PAIR frontend bundle по-прежнему index-D6c-cNzh.js и docs указывают
старую implementation. Это несогласованность доступной документации и сети,
не доказательство вредоносного изменения.

Продолжение требует verified source/compiler settings новой wrapper и двух
зависимостей либо официальной опубликованной ревизии, которую можно сопоставить
с runtime. После source review — явное обновление release pins, затем КТ1.
Новых продуктовых тестов в этом исследовании не запускали: изменения docs/evidence,
вызовы только read-only; прежние5/5 не объявляются проверкой нового PAIR release.

## Продолжение: первый релиз остается на PAIR

Решение владельца30.09: первый запуск через PAIR, альтернативные сети/самостоятельный
запуск рассматриваются позднее. Текущую архитектуру не мигрируем.

Добавлен исследовательский `scripts/pair-wrapper-diagnostic.cjs DRAFT NEW_OUTPUT`.
Он использует только in-process fork за read-only proxy, не обновляет pins,
сохраняет local receipt, CALL/DELEGATECALL graph и проверяет policy3%/recipient.
Исторический draft нужен только для диагностической identity; collector в этом
сценарии не деплоится, проверяется назначенный адрес. Это НЕ КТ1 и не public launch.
Первые попытки остановились до fork: opening endpoint503. Ответ PAIR прямо
указывает upstream eth_getBlockByNumber/latest Rate Limit Hit/reset60s.
API readiness и одиночный eth_call не гарантируют доступность quote service.

Для review обновления нужны source + compiler settings + immutable args:
- wrapper0x557cb0e797973ef01f0e7fe9de0b75f2b5b587b7;
- dependency0xbfda480dcc889c445224ef21437b6075bb7d0562;
- dependency0xf1b1e40074bc1ff0bc3d2804b21a91bf761310f1.
Имена неизвестных getter selectors нельзя считать ABI из signature directory:
поиск5selectors не вернул сигнатур. Нужен официальный source/verified build.
Сообщений поддержке/разработчикам не отправляли.
