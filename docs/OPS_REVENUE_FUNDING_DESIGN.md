# Creator revenue → эксплуатация → ETH: проект решения

28.09.2026. **90/5/5 принято пользователем; маршрут конверсии ещё квалифицируется.** Выбранная
creator fee Infinity — 3%; внутреннее распределение9000/500/500bps принято28.09.2026.
Действующие правила призов остаются в [PRODUCT_SPEC](PRODUCT_SPEC.md).

## Минимальная схема

Используем существующие три slots `InfinityCollector.Policy`, без нового контракта:

| Slot | Получатель | Назначение |
|---|---|---|
| 0 | Существующий PromoVault | USDG → GENERAL → прежние Short/Current/Next |
| 1 | Отдельный operations EOA | USDG на газ; после конверсии ETH для себя и executor |
| 2 | Отдельный project EOA | Свободная доля команды |

Collector уже допускает эти адреса и permissionless pay каждому получателю.
Slot0 фиксирован на PromoVault, сумма bps равна10000. В launch profile потребуем
разные адреса: контракт допускает совпадения, при которых credits объединяются.
EOA custody — явная граница доверия: ключ operations контролирует его деньги;
лимиты worker не становятся контрактным запретом вывода. Призы остаются в vault.

База распределения R — фактически учтённые USDG collector, не обещанный оборот.
Cumulative rounding внутри кампании не теряет деньги при дроблении; меньше3 raw
units остаются до rollover, при финализации остаток относится PromoVault.
Доли меняются только через существующий owner rollover после endsAt, с final pull
и accounting старой кампании; старые unpaid credits сохраняются. Это не вечная
неизменность процентов. Автоматический rollover с новыми долями здесь не добавляем.

Спонсорское пополнение идёт непосредственно в PromoVault, без project/ops fee.
Прямой перевод USDG на collector попадёт в его распределение: это НЕ адрес для
беспроцентного спонсорского funding. GENERAL/targeted и overflow Next → Current
не меняются. Неиспользованный operations остаток копится у operations; автоматического
перераспределения остатков пока нет. Команда может добровольно пополнить PromoVault
из своей свободной доли обычным funding-вызовом.

## Принятые доли и рассмотренные альтернативы

| Вариант | Призы | Эксплуатация | Свободная доля | Комментарий |
|---|---:|---:|---:|---|
| Принятый старт | 90% | 5% | 5% | Сохраняет прежний кандидат90% призам |
| Больший запас газа | 90% | 7% | 3% | Запас за счёт команды |
| При дорогой эксплуатации | 85% | 10% | 5% | Уже уменьшает призовой бюджет |

90/5/5 внесены в planning launch profile; реальные адреса и gas caps ещё не выбраны. Тестовые100%Promo также не релизная экономика.
Для90/5/5 и условного R=3%V получаем:

| V в сутки, условная база creator fee | R USDG | Призы | Operations | Команда |
|---:|---:|---:|---:|---:|
| 1 000 | 30 | 27 | 1.50 | 1.50 |
| 5 000 | 150 | 135 | 7.50 | 7.50 |
| 10 000 | 300 | 270 | 15 | 15 |
| 25 000 | 750 | 675 | 37.50 | 37.50 |
| 50 000 | 1 500 | 1 350 | 75 | 75 |

V — иллюстрация базы комиссии, не гарантия соответствия volume в интерфейсе:
BUY/SELL fee bases и дополнительные комиссии описаны в
[Infinity research](INFINITY_INTEGRATION_RESEARCH.md). Старое70/30 не применяем.

При расходе E USDG/сутки эксплуатационная доля5% покрывает его при R=20E:

| Условный расход E | Нужный R | Соответствующий V при3% |
|---:|---:|---:|
| 0.50 | 10 | 333.33 |
| 2 | 40 | 1 333.33 |
| 5 | 100 | 3 333.33 |

Это сценарии, не измеренные тарифы Robinhood. E должен включать approve/swap/unwrap,
refill и обслуживание draws/claims. Сервер/RPC подписки считаются отдельно.
Расходы неравномерны: средняя окупаемость не означает наличие ETH в нужный момент.
На пустом проекте остаётся стартовый ETH и добровольное пополнение.

## Конверсия: ограниченная операция, не торговый бот

Предлагаемый путь: operations USDG → проверенный router → WETH → native ETH
на тот же operations EOA → существующая логика ограниченного refill executor.
Предпочтителен независимый от нашего TOKEN рынок USDG/WETH: его можно проверить
до выпуска токена. PancakeSwap официально перечисляет [WETH/USDG0.01%](https://blog.pancakeswap.finance/articles/rh-lp-fees)
на Robinhood; [первый локальный fork proof](OPS_MARKET_PROOF.md) подтвердил swap+unwrap10USDG→ETH; production quote/recovery ещё не готовы.

Worker конвертирует ограниченную exact-input порцию при потребности в ETH, а не
пытается поймать выгодный курс. После receipt читает фактический ETH и только затем
планирует refill. Дорогой газ, недостаточный USDG, плохая котировка или отсутствие
ликвидности дают ожидание/событие; prize reserves не используются.

Для первой локальной проверки можно обсудить batch10–25USDG, slippage50bps и
all-in стоимость операции не более2% batch. Это НЕ выбранные лимиты: маленькая
порция может оказаться невыгодной. Реальные caps устанавливаем после quote/estimate.
Свежая котировка того же пула не независимый oracle: minOut/deadline ограничивают
исполнение, но не доказывают справедливость курса и не исключают MEV. Сравнение
маленькой и полной котировки может показать price impact, но не заменяет oracle.

## Разделение bootstrap и project-funded refill

Первоначальный BOOTSTRAP_NATIVE запрещает source совпадать с любым funding recipient.
BOOTSTRAP_NATIVE по-прежнему не разрешает slot1; новый явный PROJECT_NATIVE допускает только pinned slot1, сохраняя custody exclusions.

Реализован PROJECT_NATIVE, равный pinned slot1: сохранены запреты для PromoVault,
custody, slot2 и executor; защиты не отключаются списком целиком. Operations swap и refill должны иметь общий владелец nonce,
lock и durable intent/hash/receipt recovery; unknown send запрещает повтор.
Текущий handoff требует идентичную nativeRefill policy и переносит refillHistory.
Поэтому slot1/source сохраняем между кампаниями, включая rollover с новыми bps.
Смена source существующим handoff НЕ поддерживается: ей понадобится отдельная
проверенная миграция. Старые unpaid recipients сохраняются в legacy witnesses.
Два отдельных EOA обходят текущий конфликт, но добавляют перевод/ключ/nonce и
проблему пополнения газа самого swap EOA; ради обхода validator это не предлагаем.

Operations должен сохранять seed ETH для approve/swap. Если ETH отсутствует и у
него, и у executor, USDG сам газ не оплатит: нужен внешний bootstrap, ожидание и
уведомление. Здесь нет paymaster или обещания бесконечной автономности.

Существующий funding worker платит даже маленькие положительные credits. Перед
релизом стоит проверить экономичность и добавить ограниченное batching для
НЕпризовых pay, если расходы это оправдают. Не задерживать frozen/claimable.
При source drift текущий obligations-only блокирует всю funding lane: contract pay
доступен, но worker не обещает автоматически получать новые ops USDG в этом режиме.

## Маршрут и доказательства

Официальный [список PancakeSwap router deployments](https://github.com/pancakeswap/pancake-developer/blob/master/docs/pages/contracts/universal-router/addresses.md)
указывает Robinhood Infinity UniversalRouter
`0x57fc55F719DF19B4b90A03F9D78E1177D002E504`.
Теперь его runtime hash и исполнение проверены на [локальном fork](OPS_MARKET_PROOF.md); полный source/immutable audit и production integration ещё не закрыты.
Он отличается от исследованного PAIR buy adapter
`0x6ace84c6d8d286e55933774bce9c97ab7a107df5`.

В upstream [Commands](https://github.com/pancakeswap/infinity-universal-router/blob/main/src/libraries/Commands.sol)
есть INFI_SWAP и UNWRAP_WETH; [Payments](https://github.com/pancakeswap/infinity-universal-router/blob/main/src/modules/Payments.sol)
поддерживает unwrap с minimum и recipient. Это возможность исходников, не доказательство
совпадения deployment. WETH/Permit2 — internal immutables в
[RouterImmutables](https://github.com/pancakeswap/infinity-universal-router/blob/main/src/base/RouterImmutables.sol):
нельзя предполагать наличие публичных getters.

Перед executor implementation нужны:

1. Chain4663, runtime hashes и подтверждённые constructor/immutable bindings router,
   WETH, USDG, Permit2 при его использовании; pool/manager и реальная ликвидность.
2. Exact calldata quote/eth_call и estimate на зафиксированном свежем block;
   проверка USDG debit, native recipient и всех комиссий. Старый TOKEN→USDG helper
   local31337 не является готовым маршрутом для этой операции.
3. На fork approve → bounded exact-input → unwrap → фактический ETH → refill.
   Swap+unwrap атомарны только после проверки конкретного router path; required
   legs без ALLOW_REVERT. Отдельный unwrap иначе требует своего recovery step.
4. Pinned spender, bounded allowance, deadline/minOut, запрет произвольного calldata;
   проверка дорогого gas, нулевой ликвидности, reboot/unknown receipt и нехватки ETH.
5. Отдельно qualifier публичного RPC, реальные ключи/профиль и public activation.

PROJECT_NATIVE реализован, адресные recovery tests прошли;
[Fork qualification](OPS_MARKET_PROOF.md) документируется отдельно. Swap
включать лишь после успешного доказательства маршрута; без него остаётся bootstrap.

## Решение пользователя: критерий готовности и следующий пакет

Не требуется доказать вечную самоокупаемость или предсказать будущую стоимость газа.
Дорогой gas → ждать; мало ETH → bounded refill либо ожидание внешнего пополнения;
после устранения причины продолжать сохранённую работу. Неизвестную отправку сначала
сверяем. Призы не расходуются на эксплуатацию, финансовых гарантий не обещаем.
Проверка estimate/balance/caps конкретной отправки остаётся обязательной; расчёт
экономики помогает выбрать параметры, но не блокирует разработку до доказательства
окупаемости.90/5/5 явно утверждены пользователем28.09.2026.

Текущий пакет: явный project-funded refill из стабильного
slot1 (ETH уже на source) и отдельный read-only/fork proof USDG→ETH рынка.
Проверки режима: разрешённый slot1, запреты custody/slot2/executor и подмены source,
rollover с прежним source, handoff с сохранением spent/cooldown, shortage→top-up→resume,
unknown send без повтора. BOOTSTRAP_NATIVE сохраняет прежние ограничения.
Market proof проверяет реальный output/fees и атомарность swap+unwrap; полноценный
swap executor с durable recovery — следующий пакет после доказательства маршрута.
Проценты не нужны для реализации параметризованного режима и не выбираются тестами.
