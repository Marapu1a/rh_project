# Pons: готовность ближайшего действия

02.10.2026. Реализовано в тестовом контуре, рабочее дерево поверх `b166d91`.
Это не production admission, не новый сквозной fork-cycle и не полный RC baseline.
Основание: [разбор review](PONS_REVIEW_TRIAGE_2026-10-02.md) и решение пользователя
не блокировать работу прогнозным запасом ETH на будущий цикл.

## Газ и ожидание

`scripts/pons-gas-budget.cjs` подключён к Pons coordinator и его drand worker.
Перед отправкой сохраняется обычная симуляция `estimateGas`; лимит равен оценке
с округлённым вверх запасом **20% gas units**. Проверяется баланс на этот лимит,
текущий `maxFeePerGas`/`gasPrice` и `value`. Это потолок допуска одной tx, не её
фактический расход. Если лимит выше настроенного `gasLimit`, остаётся `gasBound`;
ограничения цены, числа отправок, pending nonce и journal также сохраняются.

Расчёт `будущие calls × максимальный gasLimit × максимальная цена` удалён из Pons.
`nativeFloor` оставлен в config/journal identity для совместимости, но не участвует
в Pons gate. Standalone drand без переданной Pons policy сохраняет прежний бюджет.

При нехватке ETH:

- До broadcast intent дело не доходит; билеты, frozen и claimable не меняются.
- Результат содержит `nativeFunding`, `balanceWei`, `requiredWei`, `shortfallWei`.
  Если RPC отказал в самой оценке с `INSUFFICIENT_FUNDS`, сумма/недостача равны `null`,
  `estimateAvailable=false`: неизвестная оценка не заменяется прогнозом.
- Известные claims/RNG и доступные funding actions проверяются независимо: дорогое
  действие не скрывает более дешёвое. Новые задания не стартуют при сохраняющемся
  ожидании газа на уже проверенных действиях. Прежний порядок обязательств сохранён.
- `--watch` повторяет проходы; после пополнения работа продолжается. Неизвестный
  результат broadcast по-прежнему блокирует новые отправки до сверки journal.

В `results.notifications` появляются `nativeFundingRequired` и
`nativeFundingAvailable`. Дедупликация ожидания записывается в state и переживает
restart: первый сигнал, затем не чаще раза в час **для конкретного target/action/calldata**.
Разные выплаты не гасят ожидание друг друга; успешная доступность удаляет свой alert.
`Available` означает достаточность баланса перед отправкой, а не подтверждение выплаты.
Это структурированный вывод CLI для журнала/будущего транспорта: Telegram/email
не настроены, доставка оператору вне журнала этим пакетом не обеспечивается.
Призовая казна не используется для газа; автоматическая конвертация/пополнение ETH
не добавлялись.

## Остальные исправления review

- Scanner сохраняет все receipts и прежние проверки venue/runtime, но читает
  историческую delegation self-account только при целевом CurveBuy или Swap
  целевого pool. Это фильтр кандидатов, не ослабление доказательства покупки.
  Отсутствие parent evidence настоящего кандидата по-прежнему останавливает проверку.
- Scheduler проверяет срок **нового** задания до admission. Сохранённые задания
  обслуживаются прежним ранним путём; при наступлении срока admission обязателен.
- Standalone `verify-pons-wallet-api.cjs` получает indexConfig через общий builder,
  как writer/API. Старый несовместимый snapshot отклоняется; hash не переписывается.

## Проверки 02.10.2026

Первый адресный запуск 11 файлов: **54/56**, две ошибки ожиданий тестов.
Первый тест пытался читать journal, который правильно не создаётся до отправки;
второй ожидал проверки policy до наступления срока. После уточнения ожиданий оба
повторно прошли. Исходный результат не переобъявляется полным успешным запуском.

```powershell
node --test test/local-scheduler.test.cjs test/drand-delivery-worker.test.cjs test/pons-automation.test.cjs test/pons-crash-recovery.test.cjs test/pons-wallet-verifier.test.cjs test/pons-gas-budget.test.cjs test/pons-funding-pass.test.cjs test/pons-batch-integration.test.cjs test/pons-pool-batch.test.cjs test/pons-persistent-indexer.test.cjs test/shared-index-config.test.cjs
node --test --test-name-pattern="Pons estimated|unknown activated" test/drand-delivery-worker.test.cjs test/local-scheduler.test.cjs
node --test test/pons-gas-budget.test.cjs test/local-transaction.test.cjs
node --test test/pons-batch-integration.test.cjs test/pons-persistent-indexer.test.cjs
```

Повтор выбранных сценариев **2/2 PASS**; final gas/shared-sender **15/15 PASS**.
Логи соответственно `.local/logs/pons-next-package-tests.log`,
`pons-readiness-corrections.log`, `pons-gas-final.log`.
После выноса event topics из цикла scanner его соседи повторно прошли **9/9 PASS**,
лог `.local/logs/pons-scanner-final.log`. Локальные ссылки изменённых документов
и состав 38 test profiles проверены; `git diff --check` без ошибок.

Подтверждены shortage → top-up → resume, часовой reminder и restart dedup,
неизвестная отправка без повторения, независимые claims, более дешёвый funding,
drand prove/deliver с прежним огромным floor, отсутствие повторных sends,
завершение frozen jobs независимо от нового неподдерживаемого adapter.
Соседи включают process-crash recovery, reorg/index/API и прежние batch rejection cases.

RPC-счётчики регрессий: **100 чужих self-calls → 0 parent account code reads**,
при этом два настоящих кандидата требуют две проверки parent account code.
До срока Short/Monthly — **0 policy code/call reads**; при наступлении срока
неверный policy runtime действительно читается и блокирует создание обоих jobs.
Это счётчики синтетического сценария, не замер времени/стоимости публичного RPC.

Gas unit tests используют заданные баланс/цену; drand integration использует реальные
локальные контракты и исторический BLS vector, но нехватка моделируется чтением
нулевого баланса, чтобы отдельно проверить gate после успешной оценки. CLI verifier
запускается новым процессом с синтетическим saved snapshot и проверкой его неизменности.
Новый публичный маршрут, фактический MetaMask UX и новый полный fork-cycle не проверялись.
Измерение O(history) CPU/write/size остаётся в A4; архитектура хранения не менялась.

Следующий пакет — [A2/G10: исполнение маршрута 0x](ROADMAP.md). Боевой перенос отдельно.
