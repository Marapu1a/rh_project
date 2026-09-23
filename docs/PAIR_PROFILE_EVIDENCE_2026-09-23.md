# PAIR / Robinhood: read-only compatibility dossier

23.09.2026. Не deployment approval, не fork-тест, не выбранная production конфигурация.
Никаких send/sign/deploy/claim транзакций; eth_call использовался только для getters.
Runtime contracts и chainId=31337 guards не менялись.

## Снимки и источники

Основной RPC snapshot: chain 4663, block 70628480,
0x275932857e23e218c7beff9dd259e223ca237d35278d9d6b03ae7892943ce75b,
2026-09-23T15:41:46Z. Повторный: block 70629156,
0x0570a38141ab16ee86625b508858236639fa478cc1093730f55654e1e2e9622a.
Pinned block hash в обоих снимках повторно проверен. API имеет собственный timestamp/
block attestation, не считается атомарным RPC-снимком. RPC gasPrice — отдельное latest
чтение, не историческая цена pinned block.

- [Сеть/RPC](https://docs.robinhood.com/chain/connecting/): chainId 4663, ETH gas,
  публичный RPC ограничен по частоте, production требует подходящего провайдера.
- [Fees](https://docs.robinhood.com/chain/gas-and-fees/): execution + L1 data cost;
  стандартный estimate учитывает оба. Одной цены gas недостаточно для draw quote.
- [Finality](https://docs.robinhood.com/chain/transaction-finality/): receipt/soft,
  posting на L1 и Ethereum finality — разные гарантии, не фиксированное число L2 блоков.
- [PAIR docs](https://pair.fund/docs) web extractor не вернул текст; свежая policy
  НЕ объявляется прочитанной. Использованы публичные API ниже и сохранённые исходники.

Raw evidence в research (JSON сохраняет запросы, ответы, ошибки):
- pair-profile-2026-09-23.json и pair-profile-2026-09-23-followup.json;
- pair-buy-public-2026-09-23.json и pair-buy-public-sample-2026-09-23.json;
- pair-launch-coordinator-2026-09-23.json (Sourcify HTTP response);
- pair-public-vault-2026-09-23.json (getters исторического vault).

Повторяемые collectors: scripts/pair-profile-readonly.cjs и pair-buy-readonly.cjs;
передать новый JSON path. Overwrite запрещён, RPC method allowlist не содержит send.
Проверять error/response.error в evidence: наличие файла не означает успешную интеграцию.
Исторические evidence не перезаписывались.

## Совместимость

| Область | Статус | Что доказано / что остаётся |
|---|---|---|
| Сеть | supported для чтения | chainId 4663, RPC/getCode/getters/receipts/logs работают |
| Старый native-fee graph | частично supported | 7 runtime hashes совпадают с manifest 15.09; registry modes 1/2/3 enabled, versions 5/6/2 |
| Release для нашего нового launch | unknown | разные маршруты/coordinators; нужен конкретный согласованный профиль TOKEN/USDG |
| Standard-route consumer | unavailable в API на снимке | HTTP503, standard_route_consumer_attestation_unavailable; не доказательство остановки всех PAIR launches |
| Custom quote readiness | API enabled | endpoint заявляет launchAuthorized=true; не on-chain доказательство реализации/прав нашего проекта |
| Native-fee readiness | API ready + часть on-chain bindings | актуальный mode1 handler совпал; не доказан полный graph будущего project vault/position |
| FeeRouter ABI | условно совместим | signatures согласуются с изученным V2 source; реальные source/position/recipient/epoch для нашего проекта ещё отсутствуют |
| Публичный vault учёт | getters supported | epoch1, один recipient10000bps; due TOKEN/USDG=0; collect/claim не исполнялись |
| Direct BUY | unknown для целевого пути | router/manager/quote/hook hashes совпали; нет проверенного public TOKEN/USDG BUY выбранного релиза |
| Gas | sample only | наблюдался gasPrice 51124000 wei = 0.051124 gwei; не цена Short или гарантия стоимости |
| RNG delivery/quote | unknown | provider/adapter не выбран; наличие price feeds не подтверждает VRF/RNG availability |
| Finality policy | unknown для production | safe/finalized tags ответили, это не проверка нашей cutoff/commitment политики |

## Release/binding детали

Launchpad: 0x8660a7f019c7943b0b0a91b8e39aff3b6db6ae62.
Implementation slot остался 0x8000b64b62837a1511e302c62354e1bc39b5641a.
launchV2Coordinator getter сейчас 0xdbc3e71f6db961e5f68b32b55939fc779eeced4d,
а native-fee consumer API указывает 0xddc69cbfb38f3f24d23b980c9e156c62a431687b.
Это разные маршруты, не автоматически ошибка PAIR. Active registry:
0x34b34d3f409c562ff2d16f211f516e30695b3809; fallback registry другой.
Mode1 currentHandler: 0x8db10025017a30ab83a2a1a25e8871560357864f, v5 enabled.
Factory: 0x788ad4a211ceb310da07e8ef972fc1ef419c6cb7. Старые factory/handler getters
по-прежнему связываются с native-fee coordinator и выбранным active registry.

Новый getter coordinator имеет Sourcify exact_match:
[verified source](https://sourcify.dev/server/v2/contract/4663/0xdbc3e71f6db961e5f68b32b55939fc779eeced4d?fields=all),
PairV5LaunchV2Coordinator; RPC hash совпал с runtime в ответе:
0xda1f27a4511317948197485e355088bddfa1336c8de9fbdeb706e6c81e43356f.
Это binding опубликованных исходников, не независимая solc-пересборка/аудит.
Первый HTTP запрос к Sourcify с неверным fields получил400; повтор fields=all успешен,
оба результата сохранены. Explorer transactions API дал403 challenge; вместо обхода
использованы обычные разрешённые RPC logs/receipts.

API:
https://pair.fund/api/launches/native-fee-v2-readiness
https://pair.fund/api/v5-v2/native-fee/consumer-live
https://pair.fund/api/v5-v2/standard-route/consumer-live
https://pair.fund/api/quote-assets/launch-readiness

## Доход / collect / claim

Сохранённый PairV5LaunchV2NativeFeeVaultV2 source имеет collectFees(positionId),
claimable(epoch,recipient,asset), claim(asset,epoch). Collect получает фактические
projectToken/position quote комиссии, claim платит msg.sender — назначенному recipient.
В этом конкретном source MODE_SHARE_BPS=7000, остаток protocol treasury; только
fee-sharing ветка распределяет mode share в recipient credits. Это НЕ универсальное
«70% нам», не 70% всех trading fees и не доказанная настройка будущего vault.
FeeRouter требует свой address как единственного recipient и закрепляет epoch.

Исторический публичный vault 0xd1adef92714bfa5e0f59dd48479bcf9a5ee77c01:
projectToken 0xffbd891398a53d88880089afadf336693b075555, epoch1,
recipient 0x9dfa34bf39e7ce41390c0ef2ce928e4090e49d48 с10000bps.
Claimable TOKEN и USDG на снимке нулевые. Не идентифицировать этот vault как тот же
V2 по совпадению getters; source/runtime соответствие здесь не доказано. Нельзя
оценить доступный revenue как ноль: возможны ещё не collected LP fees.
Позиция, действительные поступления collect и наша доля остаются unknown.

## Реальный BUY: результат ограниченной выборки

Старый research/direct-buy/evidence.json явно local-fork-only. Его TOKEN
0xa927cb8a225e2fa3300e9ff5f60921c2d9065555 имеет пустой public runtime;
поэтому старые fork tx/pool нельзя выдавать за существующую public интеграцию.
Router/manager/USDG/hook runtime hashes совпали с сохранёнными.

В последних 500 блоках найдено1385 manager Swap logs; исследованы последние12
уникальных tx, не статистически репрезентативная выборка. Восемь не являются direct
router calls, одна содержит commands0x100404, три — actions0x060c0f/0x060c0e вместо
нашего0x060b0e. Эти три direct action-варианта относятся к другим валютным парам,
не TOKEN/USDG. Их нельзя использовать как обоснование обязательного расширения
нашего decoder. Ни одного eligible BUY целевого профиля этим шагом не доказано.
Никаких реальных entries или registration eligibility не начислялось.

## Следующий ограниченный шаг

Не менять decoder на основании нерелевантных пар и не объявлять весь PAIR совместимым.
Выбрать фактический native-fee/custom TOKEN/USDG route и найти его публичный pool,
vault/position и BUY receipt; сверить bindings/source, затем узкий fixture/fork adapter
только если этот путь отличается от текущего. Без этого target-specific интеграция
остаётся исследованием. Real RNG quote и стоимость полного Short потребуют выбора
RNG и формы calldata; цена обычной транзакции их не заменяет. Production guards сохранены.
