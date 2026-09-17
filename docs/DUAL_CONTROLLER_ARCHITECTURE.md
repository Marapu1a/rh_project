# Два фиксированных контроллера — 17.09.2026

Принято после локальных проверок: Short и Monthly исполняются отдельными контроллерами,
а деньги и обязательства хранятся в одной казне. Это новый deployment, без proxy,
замены контроллеров, миграции старых выигрышей или административного вывода.

## Граница полномочий

Новая казна — `contracts/DualControllerPromoVault.sol`. Она наследует бухгалтерию
`PromoVault`, сужая три внутренние проверки. Старый `PromoVault` сохраняет прежний
single-controller API и поведение для совместимости исследований и тестов.

| Операция | Short | Monthly | Любой caller |
|---|---|---|---|
| reserveUSDG из freeShort | Да | Нет | Нет |
| finalize Short | Да | Нет | Нет |
| startMonthly / settleMonthly | Нет | Да | Нет |
| reserveUSDG из Current, generic reserve, TOKEN prizes | Нет | Нет | Нет |
| fundUSDG / syncUSDG / claim фиксированному winner | Да | Да | Да |

`drawController()` в новой казне — совместимый alias **только Short**, не общий root.
`shortController` и `monthlyController` immutable и различны. При deployment казна
проверяет наличие кода и обратные ссылки `datasetVault()` / `monthlyVault()` на себя.
Это проверка идентичности, не доказательство добросовестности произвольного кода.
В тестах намеренно использованы вредоносные контроллеры для проверки ограничений.

Один global namespace drawId запрещает повторное использование и коллизии между
типами. Short finalize дополнительно запрещает MONTHLY draw. Ни один controller
не получает доступ к reserved/claimable другого через свободный резерв.
ReentrancyGuard, fund rounding, overflow Next → Current и старые долги сохранены.

**Все призы нового deployment — USDG.** Generic TOKEN reserve запрещён. Прямой
TOKEN transfer в новую казну не имеет пути выплаты/вывода: TOKEN нужно конвертировать
до funding. Нынешний FeeRouter нельзя просто направить обоими активами сюда;
адаптер конвертации остаётся отдельным незавершённым этапом. Прямой USDG transfer,
как и раньше, распознаётся как GENERAL; назначение отправителя не угадывается.

## Исполнение

Short использует существующий `ShortSettlement` без изменения отбора или призовой
математики. Новый внутренний `MonthlySettlement` хранит отдельные публикации,
root/count/attempts, seed, прогресс и terminal resultHash.

Monthly: Publishing → Ready → WaitingSeed → Processing → Terminal. До freeze
publisher может supersede публикацию; после freeze сброса/перевыбора нет.
При публикации проверяются строгий порядок кошельков, диапазоны attempts и точное
совпадение root/count/attempts. Chunk ≤64 — технический размер транзакции, не cap N.
Seal вызывает настоящий startMonthly: Next уже заполнен, весь Current резервируется.
Seed принимается один раз, включая нулевой; обрабатываются только опубликованные
chunks по порядку. Из допущенных кошельков выбирается один по минимальному hash rank.
Если допущенных нет — no-win. Параметры допуска и интервал immutable, задаются при
deployment; числа из тестов **не утверждены как production-настройки**.

Finish одной транзакцией выполняет settlement, сохраняет canonical resultHash,
потребляет monthly attempts событием и обновляет monthly clock. При ошибке откатывается
всё. Process/finish разрешены любому исполнителю; данные восстанавливаются из
публичного calldata, результат не зависит от границ chunks и исполнителя.

Одновременно допускается по одному pending draw каждого типа. Monthly win переносит
Next → Current и обнуляет Next; no-win возвращает бюджет в Current. Short и Monthly
не ждут выплаты старых claimable rewards. Задержка RNG одного типа сама по себе не
блокирует другой; общий USDG balance deficit или неисправность сети затрагивает оба.
Нет обещания, что любой внешний сбой можно устранить перезапуском.

## Deployment и проверка истории

1. Рассчитать будущий адрес казны из deployment sequence.
2. Развернуть оба контроллера с этим адресом, registry и собственными instanceId.
3. Развернуть казну с адресами обоих контроллеров; constructor проверит обратные ссылки.
4. До funding проверить runtime hashes, assets, target, policy, обе стороны bindings.

В локальных проверках используется CREATE nonce prediction. Это не готовый публичный
deployment script; реальный script должен проверять chain/nonce/config до отправки.

Replay формата `attempt-lifecycle-v3` связывает обе стороны с одним deployment domain.
К существующим полям `source` (Short), `sourceCodeHash`, `instanceId`, `shortRules`
добавлены `monthlySource`, `monthlySourceCodeHash`, `monthlyInstanceId`, `vault`,
`vaultCodeHash`, `monthlyPolicy: {rulesHash, interval, startedAt}`.
Assets берутся из BUY manifest. Snapshots используют `attempt-snapshot-v3`.
События каждого типа принимаются только от своего source, Short epoch events —
только от Short. Проверяются independent pending/clocks, global drawId и снимки
OPEN/FROZEN/CONSUMED. V1/V2 остаются прежними форматами, добавление monthlySource
в них отвергается, чтобы не потерять половину событий молча.

RPC verifier дополнительно проверяет оба runtime, vault runtime, reverse bindings,
registry, instanceId, assets и immutable monthly policy. Offline evidence не
доказывает подлинность цепи; RPC-проверка не сертифицирует finality или случайность.
Полноценный Monthly artifact/result CLI и автоматический publisher ещё предстоят.

## Измерения и проверки

`npm test`: **151/151 passed**; включает прежние unit tests, 10 новых contract/binding tests и 3 dual replay
tests. Проверены cross-capability calls, collision/reuse, constructor bindings,
atomic rollback, direct USDG sync order, сохранность старых unpaid credits, failed
claims, reentrancy, параллельные draws, Monthly win/no-win, chunks/reorg/retry и
совпадение результата с независимой JS-моделью.

`node scripts/dual-controller-check.cjs` отдельно компилирует и действительно
развёртывает исследовательские wrappers с roles/readiness/async mock RNG при
стандартном ограничении runtime **24 576 байт**, optimizer 200, Cancun, без viaIR:

| Контракт | Runtime | Запас |
|---|---:|---:|
| Short + исследовательский RNG/roles/readiness | 21 866 | 2 710 |
| Monthly + исследовательский RNG/roles/readiness | 13 753 | 10 823 |
| DualControllerPromoVault | 8 331 | 16 245 |

Источник: [dual-check.json](../research/controller-size/dual-check.json), включая
source hashes и gas по операциям (64 участника, 3 Short prizes). Это не цена в USD:
L2 data fees и стоимость настоящего provider в эксперимент не входят.
Отдельно проверено: недостаток native balance, неготовность provider, дорогой gas
не допускают freeze; ошибка request откатывает и резерв, и pending state. Доставка
seed чужим caller или повторно отвергается. Один draw завершается при pending другом.

24 KiB — **критерий переносимости**, не заявленный лимит Robinhood. В ответе GPT
приведён увеличенный лимит Robinhood; его актуальные параметры необходимо проверять
перед конкретным deployment. Исторический monolith size experiment не был доказательством
невозможности deployment именно в Robinhood.

## Что остаётся

Это законченный локальный архитектурный шаг, не production запуск. `MonthlySettlement`
и `ShortSettlement` — внутренние компоненты; fixtures разрешают ручной seed только
для тестов. Research wrappers также не одобрены для production. Следующий кусок —
реальная RNG/readiness интеграция с проверенной стоимостью, authenticated callback и
автоматическим исполнением; после него повторный size/gas gate. Запас Short 2.7 KiB
не безграничен. Conversion, deployment tooling, finality policy и keeper остаются
отдельными задачами. Новых emergency/reset полномочий в этом шаге нет.
