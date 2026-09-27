# Infinity → Short → USDG: сквозной fork

27.09.2026. Узкий интеграционный сценарий: один Short до claim, без Monthly draw.
Команда: `node scripts/infinity-launch-fork.cjs NEW_OUTPUT.json --payout`.
Публичный RPC используется только для чтения; все транзакции идут в local chain31337.

## Что связывается

Новый PAIR Infinity TOKEN/USDG с creator fee3% → InfinityCollector → тот же
DualControllerPromoVault → две прямые покупки → admitted automatic entries →
scheduler dataset/begin/publish/seal → drand delivery worker → scheduler settlement →
permissionless claim USDG на адрес победителя. Funding и delivery повторяются без
новых транзакций. Повторный claim должен отклоняться.

Начальная BUY/SELL проверка источника тоже приносит реальные комиссии в этот vault,
но предшествует genesis BUY manifest и не начисляет промо-билеты. После genesis две
покупки дают2entries и6.60USDG carry. Покупатель не вызывает register().
В призовой vault нет тестового внешнего пополнения: его баланс должен совпасть
с измеренными creator fees. Расходы покупателя и газ обеспечены sandbox funding.

## Явные тестовые допущения

- Buyer USDG внесены через storage fork; ETH принадлежит локальным тестовым accounts.
- 100% creator revenue идёт в Promo: внутренние bps релиза этим не утверждены.
- Один buyer, почти гарантированный тестовый шанс, корзина7/5/3, бюджет Short5USDG.
  Это упражнение выплаты, не экономический профиль. Seed не подбирается и не заменяется.
- Быстрая in-memory компиляция меняет только две начальные отметки времени в
  конструкторе ShortRulesEpochs на block.timestamp−21601. Solidity-файлы не меняются,
  но runtime Short отличается от стандартного. Правило6часов, проверки replay и
  последующие terminal timestamps не изменены. Шестичасовое ожидание не измеряется.
- Drand timing=[60,30,5,20,15] — только тест. Не одобренные production параметры и не
  защита от глубокой реорганизации. Pre-freeze работает без подмены часов/HTTP;
  запрос закрепляется до появления его реальной подписи. Worker читает exact round
  через обычный HTTP endpoint, контракт проверяет BLS.
- Local head/finalized не доказывают finality публичной сети. Нет публичных sends.
- Claim вызывается самим harness: отдельный непрерывный payout coordinator не доказан.

Попытка исторического fork за8часов не прошла: blockreq ограничил глубину headers,
официальный RPC отдал headers, но не historical state. Поэтому исторический успех
не заявляется. Недостаточно менять одну storage-отметку: независимый replay сверяет
расписание с immutable genesis. Именно поэтому ускорение явно изолировано в тестовой
компиляции, а production replay не ослаблен.

## Исправление, найденное прогоном

Проверка публикации Short/Monthly и восстановление Short запрашивали события
с блока0. На fork это требовало внешнего запроса всей истории и падало на read-only
proxy; обычный RPC также может ограничивать такую глубину. Поиск теперь начинается
с cutoff+1, поскольку публикация возможна только после cutoff. Проверки количества,
порядка, calldata и root сохранены. Два regression-сценария запрещают pre-cutoff logs.

## Проверка результата

Новый fork **complete**: [evidence](../research/infinity-source-audit/payout-fork-2026-09-27.json).

| USDG | До Short | После claim |
|---|---:|---:|
| Short | 5.967126 | 3.633795 |
| Current | 3.978084 | 3.978084 |
| Next | 1.989042 | 1.989042 |
| Всего в vault | 11.934252 | 9.600921 |

Выплачено2.333331USDG из бюджета5USDG, остаток невыданных мест остался свободным.
11.934252 = 2.333331 + 9.600921. Frozen/claimable после claim равны0.
Live drand round20996227 закреплён до получения подписи; prove/deliver выполнены
worker без mock beacon. Funding/drand rerun0tx; второй claim отклонён.
2Short attempts consumed,2Monthly open. Upstream484requests/6retries/0errors.

`node --test test/infinity-payout-evidence.test.cjs test/infinity-buy-evidence.test.cjs`:4/4,
два новых и два прежних saved-evidence сценария. Offline test заново
строит dataset и lifecycle из сохранённых блоков, суммирует ModeFeeAccrued четырёх
сделок и сверяет реальный ERC20 Transfer выплаты, сохранение Current/Next и остаток.
Это не full baseline и не проверка production deployment.

Адресные проверки исправления:2/2 за3.6s (`short-dataset`/`short-settlement`,
pattern `complete data is recoverable|public calldata recovery`). Соседний
`node --test test/local-buy-cycle.test.cjs`:1/1 за85s, оба контроллера, win/no-win,
replay, переход Next и claims. Оба запуска использовали SHA-проверенный стандартный
compiled artifact, без constructor override. Логи в `.local/logs/infinity-payout-*.log`.
Полный набор не запускался. Строгий первый timing fixture с clockLag5s корректно
остановил freeze после долгого прохода проверок; тестовый профиль расширен до
[60,30,5,20,15], production policy этим не утверждается.

Следующий пакет: объединение существующих отдельных workers в последовательное
исполнение с общим nonce/budget admission; затем отдельный Monthly e2e. Согласование
production timing, распределений и deployment admission остаётся обязательным.
