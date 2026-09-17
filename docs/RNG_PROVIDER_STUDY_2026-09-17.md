# RNG: выбор следующего проверяемого шага

17.09.2026. Исследование, **не утверждённый production provider**. Контракты проекта
не менялись. Рекомендация: небольшой локальный эксперимент с **drand evmnet**:
проверить настоящую подпись, цену её on-chain проверки и привязку будущего round
к замороженному draw. После измерения выбрать интеграцию. Не строить сейчас свой RNG.

## Сначала закрытый тестовый пробел

Добавлены две регрессии M1 → M2 → M3: настоящий MonthlySettlement с казной и отдельный
replay BUY history. Обе проходят пустую и непустую ветки M2; проверяются сохранение
старых policies, запрет следующего объявления при draining, normal M3 и clock.
Replay дополнительно проверяет покупку после cutoff M2, cumulative attempt ranges,
сохранение новых M3 attempts и независимость Short.

`npm run test:monthly:epochs`: **13/13 passed**, включая обе новые проверки.
Контрактная fixture использует синтетические опубликованные datasets; честность BUY
истории проверяется отдельным replay, контракт её сам не доказывает.
Полный npm test в этом пакете не запускался; прежний полный результат — 164/164,
последующий набор 165, теперь добавлено 2 теста, всего 167.

## Что действительно найдено

Адреса из документации проверены read-only на mainnet 4663 и testnet 46630.
[Снимок RPC/HTTP](../research/rng-provider-study/observations.json) содержит block number,
hash, размеры и hashes runtime. Повтор: `node scripts/rng-provider-probe.cjs`.
Скрипт не имеет signer и не отправляет транзакции; перезаписывает снимок.
Code existence **не доказывает** работающего keeper, соответствия документации коду,
аудита, независимости операторов или гарантированной доставки.

| Вариант | Наличие / стоимость | Решение на этом этапе |
|---|---|---|
| Chainlink VRF v2.5 | Robinhood отсутствует в проверенном официальном списке сетей | Не считать доступным готовым вариантом на 4663 |
| Pyth Entropy | Chainlist загружает таблицу динамически; официальный deployment на 4663 в этом проходе не подтверждён | Не утверждать ни наличие, ни отсутствие; не путать Pyth-derived код с услугой Pyth |
| Quiver | Код по опубликованным mainnet/testnet адресам есть. `getFee(provider)` вернул 0 на обоих pinned blocks | Нулевая котировка не подтверждает регистрацию/готовность provider и не означает бесплатную эксплуатацию |
| RH-VRF | Код mainnet coordinator есть; ETH account, цена зависит от words и callback gas по документации | Описанный публичный refund после timeout несовместим с нашим бессрочным pending без отдельного решения |
| Dice Protocol | Код mainnet/testnet по адресам README есть. Документированная fee 0.000025 ETH, **live fee не измерялась** | Commit/reveal и refundable requests требуют отдельного разбора; не выбран |
| drand evmnet | Публичный beacon отвечает; BN254 scheme, период 3 секунды. Это не готовый Robinhood callback service | Лучший кандидат для локальной проверки переносимой доставки одного заранее закреплённого round |

Источники: [Chainlink networks](https://docs.chain.link/vrf/v2-5/supported-networks),
[Pyth chainlist](https://docs.pyth.network/entropy/chainlist),
[Quiver addresses](https://github.com/camdengrieh/quiver-kit),
[RH-VRF docs](https://rh-vrf.com/docs),
[Dice source/addresses](https://github.com/diceprotocol/dice-entropy),
[drand developer guide](https://docs.drand.love/developer/).
Robinhood [Data Streams](https://docs.robinhood.com/chain/data-streams/) не являются VRF.

### Различия, которые влияют на наш pending draw

**Quiver:** по [security model](https://www.quiver.foundation/docs/security) provider
может знать результат и не раскрыть его. Callback failure сохраняет значение для
retry; независимого стороннего аудита авторы не заявляют. Рекомендованный ими новый
request к другому provider после timeout нам не подходит: это новый исход для уже
замороженного набора. Документация также описывает предел hash-chain traversal.
Публичный kit не заменяет проверку coordinator. Его исходники из Blockscout API
в этом проходе получить не удалось: endpoint вернул HTML вместо JSON.

**RH-VRF:** [сайт](https://rh-vrf.com/) описывает threshold 5/9 и повторную доставку
той же подписи, но после 7 200 L1 blocks разрешает любому вызвать refund, после
которого fulfillment невозможен. Возврат сервисной платы не завершает наш draw.
Это уже достаточно для отказа от прямой интеграции по описанным правилам; соответствие
этому поведению deployed bytecode не установлено (explorer API также вернул HTML).
Утверждение сайта, что withholding невозможен вообще, мы не принимаем: пороговая
схема всё равно зависит от доступности и поведения достаточного числа подписантов.
Отсутствие blockhash в seed не отменяет finality нашего dataset.

**drand:** [официальный API](https://docs.drand.love/developer/API-v2/drand-http-api/)
публикует evmnet с BN254. Получены info и latest, но их подпись пока **не проверена**.
Пустой вызов BN254 pairing precompile 0x08 на обеих сетях вернул 1; это лишь smoke
probe, не проверка настоящей подписи и не измерение verifier gas.

Наш вывод: публичную подпись одного round можно доставлять повторно независимо от
одного платного callback keeper. Это убирает часть зависимости от сервиса, но не
гарантирует выпуск beacon при отказе кворума. Известный round нельзя выбирать после
того, как его значение стало доступно. Новый round взамен неудобного запрещён.

## Стоимость и задержки: пока без выдуманных цифр

У нас один seed на draw, не отдельный provider request на победителя. Стоимость:
request/commit transaction + service fee (если есть) + proof/callback delivery +
наши process/finish. Callback gas и стоимость settlement — разные расходы.
Оплата из operational ETH buffer, не из уже обещанных призов.

Внешние paid requests не отправлялись. Поэтому собственной статистики latency,
успешности callback и полной ETH стоимости здесь нет. Период drand 3 секунды —
не SLA завершения draw: нужны запас до будущего round, finality и доставка транзакции.
USD-пересчёт текущей нулевой котировки Quiver или рекламных fees не имеет смысла
до проверки действительного provider state и полной gas-модели.

## Минимальная граница интеграции (ещё не ABI production)

1. При freeze закрепить domain, drawId, dataset context и единственный RNG target.
   Для paid provider это request ID с immutable coordinator, для beacon — pinned
   chain hash/public key и детерминированный будущий round. Нельзя позволить executor
   перебирать targets для одного frozen draw.
2. Reserve/freeze/request должны быть атомарны для callback-модели. Для beacon
   необходим доказуемо будущий round после finality dataset: отдельно определить,
   что происходит при задержке inclusion и reorg, а не использовать «latest».
3. Доставка проверяет origin/proof и target, сохраняет seed ровно один раз.
   Seed=0 допустим. Callback не обходит участников и не распределяет деньги.
4. Повторная доставка того же результата безопасна; другой target/seed отвергается.
   Processing/finish остаются permissionless, повторяемыми после transient failure.
5. Readiness проверяет operational budget и локальные prerequisites до freeze.
   Она не обещает будущую доступность внешней сети. Empty closure не требует RNG
   оплаты и не должна зависеть от готовности сервиса, который ей вообще не нужен.

Никаких reset/reroll, proxy, новых admin withdrawals или изменения prize accounting.
Production integration пока отсутствует; наш research mock RNG остаётся mock.

## Следующий ограниченный кусок

Локальный drand feasibility study, без изменения Short/Monthly:

- Найти и зафиксировать существующий проверяемый verifier с совместимой лицензией;
  не изобретать hash-to-curve/BLS. Проверить pinning исходников и происхождение.
- Один настоящий evmnet vector: корректная подпись проходит; другой round/key,
  испорченная подпись и malformed input отклоняются.
- Измерить verification gas, runtime size и overhead хранения seed; сверить
  доступность необходимых precompiles на Robinhood. Empty pairing этого не заменяет.
- На локальном макете проверить future-round binding, позднюю доставку, duplicate,
  restart/replay и отсутствие выбора нового round при повторе. Отдельно разобрать
  finality и невозможность freeze с уже известным исходом.
- По результатам принять go/no-go. Если проверка слишком дорога или нет подходящего
  проверенного verifier, вернуться к service shortlist с конкретной причиной.

Это ограниченная проверка кандидата, не обещание внедрять drand и не полный аудит
трёх сторонних сервисов. Платные запросы, деплой, keeper и production adapter — далее.
