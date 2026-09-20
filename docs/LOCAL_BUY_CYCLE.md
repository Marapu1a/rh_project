# Покупка → билеты → Short → следующий цикл

19.09.2026. Локальная интеграция существующего scanner/replay/builder с
`LocalShortController`, асинхронным тестовым RNG и общей USDG-казной.

Последнее расширение 19.09: [общий Short/Monthly контур](LOCAL_MONTHLY_EXECUTOR.md)
добавляет два Monthly draw (win/no-win). Описанная ниже арифметика только Short-этапа
сохранена как объяснение его изоляции: полный новый тест затем расходует Monthly
отдельными terminal-событиями.

Обновление того же дня: begin/publish/seal/process/finish теперь выполняет
[локальный Short executor](LOCAL_SHORT_EXECUTOR.md), с restart, readiness и CLI-проверкой.
Новый результат соседнего набора — 18/18 (~94 s); прежний замер ниже относится к ручной оркестрации теста.

Запуск: `npm run test:local:buy-cycle`. Сценарий также включён в `npm test`.
Не требует внешнего RPC, ключей или настоящих токенов.

Проверка 19.09: совместный прогон `local-buy-cycle`, `local-controllers`,
`direct-buy` и `attempt-lifecycle-dual` — **18/18 passed** (~55 s).
Основной список `npm test` теперь содержит 176 тестов; полный объединённый набор
в этом шаге не повторялся (предыдущий полный результат — 175/175).

## Как проходит сценарий

1. Разворачиваются registry, два локальных контроллера, vault, тестовый RNG,
   шестизначный quote ERC20 и торговый стенд.
2. Выполняются реальные локальные EVM-транзакции регистрации и покупки.
   События Swap/Transfer появляются из исполнения контрактов; история не дописывается
   вручную и готовые числа билетов в builder не передаются.
3. Существующий `scan` читает полные блоки и каждую receipt через HTTP RPC,
   проверяет цепь, anchor и runtime hashes. HTTP-сервер доступен только на loopback
   и пересылает запросы встроенной локальной Hardhat-сети.
4. `replayAttempts` повторно декодирует BUY, регистрацию, carry и оба вида attempts.
   Конфигурация lifecycle v4 получена из фактически развёрнутых контроллеров/vault,
   включая genesis, instances, runtime hashes и независимые Monthly правила.
5. `buildFromHistory` формирует snapshot, диапазоны, root/count/attempts. Его request
   передаётся в begin, участники — в publish. `verifyPublication` проверяет опубликованные
   chunks, snapshot, reverse bindings, правила и после seal — итоговый context.
6. Контроллер резервирует деньги и запрашивает тестовую случайность. Обработка
   начинается одним исполнителем; другой восстанавливает calldata/progress через
   существующий `recover`, сверяет результат с независимым расчётом и завершает draw.
7. Новый scan читает настоящие `AttemptsFrozen`/`AttemptsConsumed`. Их не подменяют
   синтетическими terminal-событиями. Из обновлённого ledger строится второй draw.
8. Второй draw завершается; старый unpaid reward выплачивается получателю через vault.

## Проверенная арифметика билетов

Порог существующего direct-BUY replay — 100 номинальных USDG на билет.

| Этап | Кошелёк A | Кошелёк B |
|---|---|---|
| До регистрации | BUY 100 не даёт билетов | — |
| До первого cutoff | BUY 150: билет 1, carry 50 | BUY 250: билеты 1–2, carry 50 |
| После freeze первого draw | BUY 50: билет 2 остаётся OPEN | — |
| Первый terminal | Short 1 израсходован; 2 открыт | Short 1–2 израсходованы |
| Перед вторым draw | BUY 100: открыт диапазон 2–3 | BUY 50: открыт билет 3 |
| Второй terminal | Short: consumed 3, open 0; Monthly: open 3 | Short: consumed 3, open 0; Monthly: open 3 |

Оба carry становятся нулевыми. Monthly не расходуется при Short terminal.
Новый пустой snapshot отвергается builder до открытия предложения/резервирования.

Дополнительно проверено:

- Подмена участника в artifact обнаруживается публичным verifier.
- Откат только первого terminal возвращает replay в FROZEN; повторное завершение
  использует уже сохранённый seed и не удваивает consumed attempts.
- Результат контроллера совпадает с независимым JS-расчётом.
- Старый долг сохраняется при втором draw; claim переводит ровно назначенную сумму.
- Баланс vault равен free Short + free Current + free Next + reserved + claimable
  + unrecognized USDG.

## Границы результата

`LocalBuyFixture` — простой торговый стенд, **не PAIR/Universal Router и не AMM**.
Он принимает узкий формат calldata decoder, выдаёт TOKEN 2:1 к quote и выполняет
настоящие переводы ERC20. Router/manager/hook здесь совмещены в одном адресе.
Это проверка стыка компонентов, не повторная проверка настоящего PAIR route на fork.

Quote имеет 6 decimals. Суммы призов/резервов в тесте малы и задаются в raw units;
это технические величины для conservation, не утверждённые продуктовые минимумы.
Казна пополняется отдельно: creator revenue allocation и TOKEN → USDG не подключены.

Тестовый RNG управляемый: сценарий подбирает seed с победителем, чтобы проверить claim.
Это не допустимый production-процесс и не доказательство честности random/finality.
Контроллер по-прежнему доверяет publisher насчёт полноты списка; независимый replay
выявляет подлог, но контракт не получил fraud proof.

Есть локальный single-job Short executor и автоматизированный тест. Постоянный indexer/keeper, durable checkpoints,
расчёт бюджета исполнения и real drand binding остаются отдельными задачами.
Порядок следующей работы теперь ведётся в [ROADMAP](ROADMAP.md).

20.09: дополнительное пополнение 2002 raw USDG теперь проходит через FeeRouter/worker;
в MockPairVault вносится 4004, тестовая доля проекта получает 2002. Это не измерение
комиссий venue: они внесены отдельно. [Граница модели](LOCAL_USDG_FUNDING.md).

20.09, следующий шаг: collect/harvest в этом сценарии вызывает сам [revenue worker](LOCAL_USDG_REVENUE.md); ручные вызовы удалены из пути пополнения.
