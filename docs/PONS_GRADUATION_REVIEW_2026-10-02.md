# Pons graduation: маршруты, комиссии и билеты

Исследование 02.10.2026. Только чтение mainnet/API/текущего frontend и исходников;
публичных отправок и изменений допуска нет. [Сохранённые данные](evidence/PONS_GRADUATION_REVIEW_2026-10-02.json).

## Вывод

Graduation сам по себе не отключает creator fees и не делает покупки непригодными
для учёта. Меняется рынок: bonding curve → Uniswap v4 с Pons hook. Агрегатор может
использовать этот рынок или другой пул того же токена. Поэтому прежний
[PRIORS fork-пример](PONS_ZEROEX_EXECUTION.md) доказывает возможность обхода
целевого рынка, **а не обход всеми 0x-покупками**.

Найдены реальные 0x → Pons pool сделки с начислением hook fees. Основной следующий
шаг — точный допуск такого маршрута, затем оболочек кошельков; предупреждения о
неизвестных покупках дополняют поддержку, но не заменяют её.

## Что проверено и ограничения

- [Документация Pons V2](https://docs.ponsfamily.com/v2), текущая страница Harmonic,
  загруженные ею JS chunks и API creator-fees/trades.
- Состояние factory/hook/escrow на блоке **78256666**, hash
  `0xd2633422f7d3cc1cb9b754507c38d3a5b5f83c1a4eb6f0ac761a080c4452f5d4`.
- Исторические receipts graduation двух токенов и по 12 уникальных транзакций
  из последних 50 записей их торговой ленты Pons. Это **выборка ленты Pons**,
  не всех рынков: по ней нельзя оценивать долю оборота вне Pons.
- У hook и escrow текущий runtime hash совпал с on-chain bytecode из Sourcify,
  где runtimeMatch=`match`. Это не независимая повторная компиляция/аудит.
- Два readonly сравнения котировок; они не синхронизированы на один блок,
  не исполнялись и не доказывают следующий выбор маршрута реальным пользователем.

## Что происходит при graduation

В проверенных receipts финальная curve-покупка, LaunchSwept, инициализация v4,
PoolRegistered, выпуск позиции в locker и PoolGraduated находятся в одной успешной
транзакции. Адрес ERC20 сохраняется; новый токен пользователю менять не нужно.

| Параметр | Harmonic Agent | PRIORS |
|---|---|---|
| TOKEN | `0xdEe52F2ab639b6942B0d0F0565400b93b7a0fbe5` | `0xeDBf91223639800BCd5756815CAf908Df3b890bE` |
| Quote | native ETH | USDG |
| Порог curve | 4.2 ETH | 8090 USDG |
| Блок graduation | 48903343 | 67328481 |
| Позиция NFT в locker | 1101805 | 2974146 |
| Pool fee / tick spacing | 0 / 200 | 0 / 200 |
| Hook base fee / creator tax | 100 / 0 bps | 100 / 200 bps |

Receipts: [Harmonic graduation](https://robinhoodchain.blockscout.com/tx/0x13611dc63c346df1bb4552f0fc7c7be300d8d2cebe3515711664cf4d38fee193),
[PRIORS graduation](https://robinhoodchain.blockscout.com/tx/0x9e6283cfdd1ef3b94ace0acadd5baf69e4ab857ad15d337280c7705c849b5e0d).

По документации phase0 — curve; phase1 — средства swept, создание pool ещё ожидает;
phase2 — pool; phase3 — rescue. Если переход остановился на phase1, создание pool
можно вызвать отдельно. Последний BUY может заполниться частично с возвратом;
curve SELL закрывается при readyToGraduate. Индексатору нужны события и суммы
конкретной транзакции, а не только позднее чтение phase2. Нельзя задвоить последний
curve BUY при обнаружении в том же receipt pool initialization.

Проверенный deployment:

- factory: `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`;
- hook: `0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044`;
- escrow: `0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e`;
- locker: `0x267444D099b10fB5Ed7c3Cc7B7c767AdcA574952`;
- PoolManager: `0x8366a39CC670B4001A1121B8F6A443A643e40951`;
- Universal Router: `0x8876789976dEcBfCbBbe364623C63652db8C0904`.

Pons имеет несколько поколений deployments. Для будущего QIANQI привязки должны
читаться/проверяться для его запуска; эти адреса не вечная гарантия.

## Маршруты текущего терминала

В загруженном V2 frontend до graduation используется curve-путь. После graduation
сравниваются direct Pons quote и 0x: aggregator выбирается при улучшении выхода
минимум на 10 bps либо отсутствии direct quote. Для direct строится Pons trade plan;
для aggregator запрашивается 0x quote и исполняется возвращённая транзакция.
Хеши трёх просмотренных chunks и URL сохранены в evidence.frontend.

Readonly наблюдение: для 0.01 ETH → Harmonic direct давал ~4624.15 TOKEN против
~4617.22 у 0x; формула выбирала direct. Для 101 USDG → PRIORS: ~17314.67 против
~17873.44; формула выбирала aggregator (+322 bps с целочисленным округлением).
Это срез котировок, не постоянная настройка конкретного токена.

В выборке Harmonic все 12 receipts имеют целевой Swap и HookFeeCollected;
у PRIORS 12 имеют целевой Swap, 11 — fee event. В обоих наборах есть Settler
и ERC-4337 EntryPoint. Верхний tx.from может быть bundler, Swap.sender — router,
а API account — посредник: ни одно из этих полей само по себе не доказывает покупателя.

| Пример | Что доказывает |
|---|---|
| [Harmonic BUY через EntryPoint/Settler](https://robinhoodchain.blockscout.com/tx/0x764d4c88d4ec43fb0dcea2105b8fffecfedb1bfd773558dd20d92b7e5873aad8) | 0x может попасть в Pons pool и начислить TOKEN fee |
| [Harmonic AllowanceHolder SELL](https://robinhoodchain.blockscout.com/tx/0xd3f689546e2abe1ea4e100ef9d094796847a49a741ff72baa164a3df7e3da4c2) | Settler → целевой pool, ETH fee |
| [PRIORS Universal Router BUY](https://robinhoodchain.blockscout.com/tx/0xc9ec1f5e5179b4b1eadab54d049f7088c6b67b03bf925c3ed917b39cea3f7e65) | Обычный прямой pool-путь продолжает работать |
| [PRIORS служебный sweep](https://robinhoodchain.blockscout.com/tx/0x4393f648eda6729d3ed2dea10f1b6bcfad5e079d2e487d1296a6cc63c391d847) | Swap от hook без нового fee; это конвертация, не пользовательский BUY |

Служебный SELL тоже оказался в ленте Pons. Sweep распределил 167.786147 USDG
создателю и 18.642903 протоколу. Внутренние swap hook не облагаются его комиссией
повторно. Возможный внутренний buyback тоже нельзя принимать за пользовательский BUY.

## Почему Harmonic зарабатывает при 0% creator tax

On-chain политика Harmonic: base fee 100 bps, protocol share 3000 bps **от base fee**,
creator tax0; buybackEnabled=false. Создателю остаётся 70% базовой комиссии — примерно
0.7% в валюте её взимания. Это не обещание ровно 0.7% USD-оборота после конвертации.
Собственный агент Harmonic, который покупает/сжигает токены, — отдельная автоматика;
её описание не означает включённый протокольный buyback Pons.

API показал 40.030186498360034354 ETH earnedForToken за 5165 sweeps. Это накопительный
показатель индексатора Pons; все 5165 исторических начислений независимо не суммировались.
Зато [успешный claim](https://robinhoodchain.blockscout.com/tx/0x6ef2d93e88dee5932657815f53b0bbd7cb13869f1136682f163d134ea92b14b3)
подтверждён receipt: **0.284206919559006064 ETH**, получатель creator.
Сумма совпадает со скриншотом; позднейший нулевой claimable не означает отсутствия дохода.

Наши будущие 3% creator tax нельзя молча трактовать как единственный источник или
ровно 3% совокупного дохода: возможна ещё доля base fee. Фактическую политику нужно
закрепить отдельно перед запуском. Правила распределения QIANQI здесь не менялись.

## Где деньги могут ждать

Исходник [deployed hook в Sourcify](https://sourcify.dev/server/v2/contract/4663/0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044?fields=all)
начисляет afterSwap fee в unspecified currency. При обычном exact-input BUY это
TOKEN на выходе, при exact-input SELL — quote; exact-output требует отдельного разбора.

Три разных состояния нельзя объединять:

1. **Pending в hook:** TOKEN/quote ещё не распределены. TOKEN требует конвертации.
2. **Claimable в escrow:** сумма уже зачислена получателю, её можно забрать.
3. **Получено кошельком/призовой казной:** только поступившие средства финансируют призы.

В просмотренном source sweep с TOKEN inventory или внутренним buyback требует
доверенного feeSweepOperator. Creator не может обойти эту проверку своим вызовом;
ручной claim уже доступного escrow не решает зависшую конвертацию TOKEN.
На snapshot Harmonic имел pending ~7461.43 TOKEN и ~0.02438 ETH base fees;
PRIORS — 162021.637237 USDG claimable. Это временные балансы, не параметры проекта.

## Следствие для билетов и следующий пакет

Начисление билетов должно опираться на подтверждённую подходящую покупку, независимо
от даты sweep/claim. Фонд призов, напротив, ждёт фактически доступного финансирования.
Билет не обещает, что соответствующая комиссия уже поступила в казну.

Для post-graduation нужны: правильный poolId/hook; направление BUY; доказанный
плательщик и получатель; фактическая подходящая сумма с учётом возврата; отсутствие
повторного учёта funding leg, split legs и служебных операций. Transfer TOKEN либо
один HookFeeCollected недостаточен. Комиссия может округлиться до нуля, поэтому
само отсутствие fee event тоже не универсальный классификатор.

Предложенный порядок: зафиксировать реальный 0x → Pons pool BUY → воспроизвести
локально, проверить attribution/refund/fees и отрицательные случаи → versioned
adapter/policy/index/API. ERC-4337 разобрать отдельно с границами UserOperation;
наличие EntryPoint не даёт автоматического допуска всем внутренним вызовам.
Внешние pools и неизвестные оболочки получают точный неподдержанный статус.
Ретроначисление в закрытые draws не обещаем. Продакшен не трогаем.

## Воспроизведение и проверки

Исследовательский reader: `node scripts/inspect-pons-graduation.cjs .local/logs/NEW_REPORT.json`.
Только GET/RPC reads, по 12 уникальных tx двух токенов, без сканирования всей истории;
существующий output не перезаписывается. Итоговый reader самостоятельно получает API;
исходный прогон использовал предварительно сохранённый API capture. Эта перестановка
проверена синтаксически, повторным сетевым прогоном итоговая редакция не проверялась.

Evidence включает исходные receipts/transactions, decoded события, состояние,
API срез, graduation receipts, claim, hashes исходников и frontend. Дополнительные
локальные загрузки — `.local/logs/pons-graduation-*`. Проверки: `node --check`
reader, offline согласованность evidence, локальные Markdown links и `git diff --check`.
Это исследовательская проверка данных, не новый полный продуктовый baseline.
Результат 02.10.2026: 312 offline assertions, включая 223 локальные ссылки, PASS;
syntax/diff checks PASS. Лог: `.local/logs/pons-graduation-validation.log`.
