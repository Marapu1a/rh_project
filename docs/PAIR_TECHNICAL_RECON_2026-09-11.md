# PAIR / Robinhood Chain: техническая разведка

Проверено 11 сентября 2026 года. Область: пункт 37 `PAIR_PROMO_TOKEN_MVP.md`. Прочитаны первичные документы, выполнены публичные GET и чтения RPC. Реализация, подключение кошелька, подписи и отправка транзакций не выполнялись. Исходная спецификация сохранена без изменений.

**Вывод:** рынок и инфраструктура для исследования доступны. Прямой TOKEN/USDG подтверждён существующим запуском. Для production ещё не подтверждены экономика текущего релиза, полный путь получения комиссий нашим контрактом и подходящий механизм случайности. Найдено конкретное расхождение классификации BUY/SELL в API PAIR.

Обозначения: «документы» — заявленное поведение; «наблюдение» — конкретный ответ API/RPC или запись Blockscout; «предложение» — наш вывод для дальнейшей работы. Наблюдение отдельного запуска не доказывает свойства всех поколений PAIR.

| Вопрос из MVP | Результат |
| --- | --- |
| 1. Как запускается токен | Документы: Launch V2, фиксированный миллиард ERC-20, создание 1–5 рынков за одну транзакцию, ETH-funded developer buy. Наблюдение: успешный `launchV2Token` найден. См. A, C. |
| 2. Quote assets | USDG и WETH присутствуют в живом реестре; оба рынка подтверждены событиями Initialize. Stock Tokens/custom ERC-20 описаны в документации. См. A, B, C. |
| 3. Creator fee split | 70/30 описано в legacy V5. В исследованных пулах fee=10000, то есть 1%, но это не подтверждает долю creator текущего релиза. См. A, C, E. |
| 4. Маршрутизация комиссий | Документы V2 описывают policy epochs и отдельных получателей. Сбор и claim — отдельные стадии. Наш путь PAIR → FeeRouter → PromoVault пока не проверен. См. A. |
| 5. Контракт-получатель | В исследованном launch calldata получатель задан отдельно от creator; возможность работы именно нашего контракта, права вызова claim и ограничения требуют проверки ABI/кода. См. C. |
| 6. Устройство V4 | Singleton PoolManager, идентификация рынка через PoolId/PoolKey. На примере подтверждены currencies, fee, tickSpacing, hook. См. C, E. |
| 7. События | Initialize, Swap, ModifyLiquidity и ERC-20 Transfer пригодны для изучения торговли. События fee policy/collection/claim нужно извлечь из ABI выбранного действующего релиза. См. C, D, E. |
| 8. BUY/SELL и кошелёк | Направление устанавливается по currencies и движениям активов; sender может быть роутером. Найдено расхождение API с конкретным Swap. См. D. |
| 9. USD-оценка | USDG упрощает учёт номинала. Для других quote assets необходим исторический курс с проверкой свежести. Правило USDG/USD и обработка отклонений курса ещё не выбраны. См. B, F. |
| 10. RPC/indexing | Mainnet 4663 и testnet 46630 ответили на chainId/blockNumber. Публичный RPC позднее вернул Cloudflare challenge на расширенный запрос. Для эксплуатации нужен провайдер. См. G. |
| 11. Randomness | Найдены RH-VRF и Quiver; окончательный выбор не сделан. Chainlink VRF не перечисляет Robinhood в проверенном списке. См. H. |
| 12. Testnet-эквиваленты | Сеть и faucet документированы. Полный тестовый стек PAIR + quote assets + fees + randomness не подтверждён. См. G, H. |

**A. Что следует из документации PAIR**

Текущий путь — Launch V2; legacy-разделы нельзя считать его контрактом интеграции. V2 использует эпохи политики; получатель creator fees может отличаться от создателя. Для custom markets описан Creator Fee mode. PAIR API заявлен как вспомогательный источник; публичного HTTP swap-quote API документация не обещает. Есть короткое окно launch protection: его ограничения нужно проверить на совместимость с нашим TOKEN.

Источники: [PAIR docs](https://pair.fund/docs), [публичный профиль разработчика](https://github.com/pairdotfund). В профиле на момент проверки нет публичных репозиториев; ABI и реализации следует получать из подтверждённого релиза и explorer.

**B. Активы и оценка объёма**

Официальные адреса mainnet:

| Актив | Адрес | Decimals в ответе PAIR |
| --- | --- | --- |
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | 6 |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | 18 |

Адреса совпали между [документацией Robinhood](https://docs.robinhood.com/chain/contracts/) и [реестром PAIR](https://pair.fund/api/stock-tokens). Decimals перед интеграцией также читать из контрактов.

Предложение: сначала исследовать один TOKEN/USDG рынок. Это уменьшает число маршрутов и зависимостей оценки, но пока не является решением о запуске. Считать 100 USDG равными $100 можно только как явно выбранное правило кампании, а не как неявную гарантию курса.

**C. Реальный запуск и различие поколений**

Исследованный токен: `0xffbd891398a53d88880089afadf336693b075555`. Это технический пример, не рекомендация.

[Успешная транзакция запуска](https://robinhoodchain.blockscout.com/tx/0xa0e94e585afa21743c69e41b374043ece7c6ea0c76422e9657e8e38c43b63556), блок `59910202`, вызов `launchV2Token` через `0x8660A7F019C7943b0b0A91B8E39AFf3b6DB6Ae62`.

В [логах запуска](https://robinhoodchain.blockscout.com/api/v2/transactions/0xa0e94e585afa21743c69e41b374043ece7c6ea0c76422e9657e8e38c43b63556/logs) PoolManager `0x8366a39CC670B4001A1121B8F6A443A643e40951` создаёт два рынка:

| Quote | PoolId | Initialize log index |
| --- | --- | --- |
| USDG | `0x4838bcfc2f5c43c783926ef973cd284b4b68f86f108b8c2410b3715f75608171` | 19 |
| WETH | `0xaaa4adac9a8cb4c90e7e01f210bac375913a99ca1e1ad1a50082b6ab9db523ee` | 29 |

У обоих fee=`10000`, tickSpacing=`200`, hook=`0x544A394b1553b016c0Cb19aD68BFf7B712f3C0c0`. Это отличается от hook, возвращённого текущим custom launch-readiness.

[Карточка API](https://pair.fund/api/tokens/0xffbd891398a53d88880089afadf336693b075555) помечает пары canonical=true и launchVersion=v2, но [policy endpoint](https://pair.fund/api/v5-v2/policy/0xffbd891398a53d88880089afadf336693b075555) возвращает releaseKind=legacy, canonical=false. Эти поля относятся к разным уровням идентификации; по одному названию V2 нельзя выбирать ABI и расчёт дохода.

На момент чтения [native readiness](https://pair.fund/api/launches/native-fee-v2-readiness) возвращал ready=true. [Custom readiness](https://pair.fund/api/quote-assets/launch-readiness) возвращал launchAuthorized=true, coordinator=`0xacdaeb4c9de24299b27027cbb3b47195c2ef67a9`. Это состояние сервиса, а не успешная симуляция нашего будущего запуска.

**D. Конкретное расхождение BUY/SELL**

[Транзакция](https://robinhoodchain.blockscout.com/tx/0xc0b6bf05ed142a7a094368b89866b2d18f68dfcdf460c34382f3dfa22c9b81d6), блок `59910371`:

- Swap 56: тратится `27.304322 USDG`, получается `8184121.031746115639537210 TOKEN`.
- Swap 57: это же количество TOKEN обменивается на `0.011647780320194179 WETH`.
- Transfer 58 подтверждает выдачу WETH из PoolManager вызывающему адресу.

Таким образом, TOKEN здесь является промежуточным активом: в одной транзакции есть и BUY, и SELL. Однако [PAIR trades API](https://pair.fund/api/tokens/0xffbd891398a53d88880089afadf336693b075555/trades?limit=2) для logIndex=57 возвращает isBuy=true и называет полученный WETH amountIn. Это противоречит направлению данного leg, подтверждаемому [логами](https://robinhoodchain.blockscout.com/api/v2/transactions/0xc0b6bf05ed142a7a094368b89866b2d18f68dfcdf460c34382f3dfa22c9b81d6/logs). Причина ошибки API не установлена, обобщать на все сделки нельзя.

В логах developer buy другой транзакции sender равен Universal Router `0x8876789976dEcBfCbBbe364623C63652db8C0904`. Следовательно, правило wallet=Swap.sender не универсально.

Предложение: сохранять все legs, устанавливать плательщика/получателя по поддерживаемому маршруту, исключить двойной учёт. Политику eligibility для атомарного BUY+SELL нужно согласовать отдельно: автоматически заменять cumulative BUY на net BUY нельзя, это изменило бы продукт. Неизвестные маршруты не должны молча получать билеты.

**E. События и комиссии**

[Исходный интерфейс Uniswap IPoolManager](https://raw.githubusercontent.com/Uniswap/v4-core/main/src/interfaces/IPoolManager.sol) определяет Initialize и Swap; единица fee — сотая basis point. Поэтому наблюдаемое значение 10000 соответствует 1% комиссии пула. [Описание PoolManager](https://developers.uniswap.org/docs/protocols/v4/concepts/poolmanager) объясняет singleton и расчёты через flash accounting.

1% пула не равен суммарной цене маршрута и не определяет долю проекта. Для расчёта $0.70 на билет нужны фактические ставки, hook accounting, доля комиссий принадлежащих проекту позиций, сбор, распределение и актив выплаты действующего релиза. Эти параметры пока не подтверждены.

Предложение: резервировать призы только из уже полученных активов. Если доход приходит только в quote asset, для TOKEN-призов понадобится покупка TOKEN либо заранее выделенный запас; если quote не USDG, для jackpot потребуется конвертация. Это условные последствия, не установленное поведение V2.

**F. Исторические цены**

[Robinhood oracle docs](https://docs.robinhood.com/chain/oracles-and-price-feeds/) описывают Chainlink feeds, decimals, freshness, sequencer uptime и особенности Stock Tokens. Stock feed учитывает multiplier, обновления следуют режиму 24/5, возможны паузы corporate actions. Поэтому цена базовой акции не всегда равна цене одного stock token.

Предложение: оценивать объём по состоянию на блок сделки, фиксируя feed/round/updatedAt и версию правила. Текущий UI price или произвольный курс при replay не дают воспроизводимости. Нужные адреса feeds и историческая доступность ещё требуют проверки для выбранного quote.

**G. Сеть, RPC и finality**

| Окружение | Chain ID | Публичный RPC |
| --- | --- | --- |
| Mainnet | 4663 | `https://rpc.mainnet.chain.robinhood.com` |
| Testnet | 46630 | `https://rpc.testnet.chain.robinhood.com` |

Оба ответили на eth_chainId/eth_blockNumber. Газ — ETH. [Документация подключения](https://docs.robinhood.com/chain/connecting/) рекомендует provider endpoints; есть HTTP/WebSocket и провайдеры Alchemy, QuickNode и другие. Для исторического состояния потребуется подходящий archive-доступ. Позднее публичный mainnet RPC вернул Cloudflare challenge на пакет eth_getCode/eth_getTransactionReceipt; эти чтения не были подтверждены через RPC. Логи и декодированные транзакции выше получены через Blockscout.

[Finality](https://docs.robinhood.com/chain/transaction-finality/) различает подтверждение sequencer, публикацию в Ethereum и финальность L1. Семидневный вывод через bridge — отдельный процесс. Предложение: показывать предварительный прогресс быстро, но закрывать список участников по явно выбранному уровню finality, с обработкой reorg. Возможность использования safe/finalized tags конкретного RPC ещё не проверена.

[Robinhood](https://robinhood.com/us/en/support/articles/robinhood-chain-testnet/) указывает действующий testnet и faucet. Тестовые адреса всего необходимого PAIR-стека в исследованных источниках не подтверждены; локальные mocks не будут доказательством его совместимости.

**H. Проверяемая случайность**

| Вариант | Подтверждение и ограничение |
| --- | --- |
| Chainlink VRF v2.5 | Robinhood отсутствует в прочитанном [списке поддерживаемых сетей](https://docs.chain.link/vrf/v2-5/supported-networks). Наличие price feeds не доказывает поддержку VRF. |
| Pyth Entropy | [Chainlist](https://docs.pyth.network/entropy/chainlist) в доступном представлении оставляет таблицы Loading. Адрес Robinhood и работающий provider не подтверждены; нельзя делать вывод, что сервиса точно нет. |
| RH-VRF | [Документы](https://rh-vrf.com/docs) публикуют mainnet coordinator `0x1637195a674630E475ACD18B3D27b13C0EefDac1`, threshold BLS 5/9, оплату ETH и retryCallback. [Blockscout](https://robinhoodchain.blockscout.com/address/0x1637195a674630E475ACD18B3D27b13C0EefDac1?tab=contract) вернул name=VRFCoordinator, is_verified=true, is_fully_verified=false. Это подтверждает наличие записи/ABI, не аудит и не независимость операторов. Реальные цена, fulfillment, управление ключами и testnet-эквивалент ещё не проверены. |
| Quiver | [Сайт](https://quiver.foundation/) заявляет testnet и commit–reveal. [Security model](https://quiver.foundation/docs/security) прямо отмечает отсутствие независимого аудита и возможность удержания reveal провайдером. Готовый независимый mainnet-сервис не подтверждён. |

Предложение: RH-VRF исследовать первым как кандидата с опубликованным mainnet-адресом. До выбора проверить код verifier/coordinator, историю исполнения, операторов, смену ключей, стоимость и поведение при таймауте. Заявление сайта «результат нельзя удержать» не снимает необходимость анализа порогового сговора/отказа узлов.

Независимо от провайдера нужно заранее фиксировать entries, бюджет и правила. Повторный callback не должен повторно платить, а таймаут не должен позволять организатору перезапрашивать случайность до выгодного результата. Нулевая задержка у RNG не заменяет finality торговых событий.

**Что делать следующим**

Продолжить узкую техническую проверку, прежде чем моделировать окончательные награды:

1. Выбрать конкретный действующий релиз PAIR для одного TOKEN/USDG рынка; зафиксировать factory/coordinator/vault/hook, ABI и административные права.
2. Проследить комиссию от BUY и SELL до получателя; установить ставки, активы, minimum developer buy/launch cost и возможность claim нашим контрактом.
3. Проверить несколько реальных маршрутов: обычную покупку, продажу, агрегатор, атомарный обмен через TOKEN, покупку с отдельным recipient. Получить детерминированные правила attribution.
4. Подтвердить один randomness provider и доступную среду полного тестового цикла.

Это не добавление функций к MVP: проверки закрывают исходные неизвестные раздела 37. Финансовая модель, контракты и запуск ещё не начаты.

Ответы API и Blockscout сохранены с URL и временем чтения в [снимке наблюдений](../research/2026-09-11-live-evidence.json). Снимок содержит данные стороннего проекта только как техническое свидетельство.
