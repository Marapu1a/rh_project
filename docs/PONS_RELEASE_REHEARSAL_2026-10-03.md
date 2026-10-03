# Репетиция публичного Pons CLI из release

Дата03.10.2026. **PASS** на рабочем дереве поверх4fd47ee; runtime-файлы совпадают с проверенной release-сборкой.
Боевой сервер и реальные средства не используются.

## Что проверяется

`pons-collector-fork.cjs --public-release` готовит настоящий Pons graph на локальном
Hardhat fork через read-only upstream. Подготовка запускает тестовый токен,
покупки до/после graduation, collector, vault/controllers/adapter и BUY policy.
Далее `pons-public-release-rehearsal.cjs` запускает неизменённый публичный CLI
дочерними процессами из отдельной runtime-сборки вне checkout.

- `npm ci --omit=dev --ignore-scripts`: только9 runtime-пакетов, без solc.
- Проверка digest всех release-файлов и загрузка immutable compiled artifact.
- Зашифрованный JSON keystore с известным **только тестовым** Hardhat кошельком.
- Локальный HTTPS gateway; отдельный сертификат доверен через NODE_EXTRA_CA_CERTS
  лишь дочерним процессам. Проверка TLS включена. Gateway разрешает подписанные
  отправки только этого кошелька, chain4663, value0 и пяти контрактов теста.
- Полный read-only admission настоящего Pons graph перед началом.
- Сбор/распределение новых комиссий → checkpoint → публикация новых Short/Monthly
  → freeze → live drand proof → settlement → выплаты.
- Поздние60+40 USDG остаются OPEN; перезапуск после выплат не увеличивает nonce.
- Неверный пароль и недоверенный TLS-сертификат дают отказ без отправок.

Каждый проход — новый процесс CLI с тем же config/state/keystore и лимитом2 tx.
Это проверка cold restart; SIGKILL нового HTTPS CLI не входит в этот прогон.
Индекс обновляет родительский стенд общим indexOnce, не отдельный release-сервис.

## Допущения

Синтетические ETH/USDG и локальная роль Pons conversion operator; настоящий
внешний оператор этим не проверяется. Существующий cycle harness сдвигает назад
начальные часы конструкторов для первого Short/Monthly, использует local ArbSys,
управляемую finality и тестовый drand lead60s. RNG/BLS и призовые правила не заменены.
ABI загружаются из обычного release artifact, hashes тестовых deployments берутся
из fork. Это не подтверждение production deployment или рабочих production timing.

Подготовка форка и индекс работают из checkout; **финансовый исполнитель** — из
изолированной сборки. Публичный transport mode внутри CLI означает выбор кода;
все подписанные транзакции принимаются только локальным fork. Upstream запрещает запись.

## Найденное и исправленное

Первые три прогона сохранены как неуспешные. Второй установил конкретную
причину: после двух разрешённых tx shared sender начинал ещё одну полную проверку
public admission до проверки transactionLimit. На короткой тестовой finality
получался `finalityLag` вместо штатного завершения прохода.

`local-receipt.cjs` теперь вызывает budget preflight перед public admission.
Повторный полный допуск после estimate, **до записи intent**, сохранён. Проверка
сети и журнал также сохранены. Специальный тест подтверждает0 admission reads,
0 estimate и0 отправок после исчерпания лимита.

Кроме того, CLI терял причину закрытого допуска за общим `operationFailed`.
Теперь коды проверок доходят через receipt/scheduler/funding до очищенного CLI
отчёта. Сырые provider errors/URL не выводятся. Тестовый HTTPS relay больше
не дублирует очередь BrowserProvider перед in-process RPC.

Третий прогон прошёл прежний сбой и заморозил Short, но публикация Monthly
корректно остановилась: стенд держал finality неизменной весь проход, хотя после
начала proposals прежний cycle harness уже переключался на latest. Восстановлена
та же тестовая модель: initial snapshot pinned, затем local finality следует за
latest. Порог20s не увеличен, проверка finality не отключена. Это ограничение
модели стенда; не обещание мгновенной finality в настоящей сети.

## Воспроизведение

Сначала собрать **новый** каталог вне checkout через `build-runtime.cjs` и записать
его `base`, `release`, `artifactSha256` в локальный файл
`.local/logs/public-release-build.json`. Каждый прогон создаёт отдельный `work-*`.
Нужен OpenSSL; на Windows default — Git/usr/bin/openssl.exe,
можно задать путь через `QIANQI_TEST_OPENSSL`.

```powershell
$env:RH_FORK_RPC_URL=(Get-Content -LiteralPath .local/rpc-url.txt -Raw).Trim()
node scripts/pons-collector-fork.cjs .local/logs/NEW-REPORT.json --public-release
```

URL с ключом не копировать в evidence/git. Логи, TLS key и зашифрованный тестовый
keystore находятся в локальном work-каталоге, а не в репозитории.

## Адресные проверки

`node --test --test-concurrency=1 test/pons-public-runtime.test.cjs
test/pons-public-execution.test.cjs test/pons-gas-budget.test.cjs
test/pons-automation.test.cjs` —20/20 PASS с проверенным неизменённым compiled
artifact. Лог `.local/logs/pons-public-release-regression.log`.
Дополнительно профиль инспектора5/5 прошёл в
`.local/logs/pons-public-release-diagnostics-tests.log` (остальные11 тестов этого
запуска пересекаются с20 выше). Всего25 уникальных адресных tests, не full baseline.

## Подтверждённый результат

Четвёртый прогон завершён: **12 отдельных запусков CLI,22 подписанные транзакции**,
два новых draw и две выплаты на **107.337115 тестовых USDG**. На каждом проходе
не более2 отправок. Последний cold restart/drain:0 отправок, nonce1844 неизменен.
В обоих видах билетов consumed86, OPEN1 после поздних60+40 USDG.
Reserved/claimable после завершения равны0; уменьшение баланса vault точно равно выплатам.

[Очищенная evidence](evidence/PONS_RELEASE_REHEARSAL_2026-10-03.json) содержит
суммы, draw/transaction hashes, счётчики и SHA256 исходного локального отчёта.
Полный отчёт: .local/logs/pons-public-release-fourth.json; лог рядом с тем же именем.
Неуспешные first/second/third отчёты сохранены в том же каталоге.

Следующий отдельный пакет — production deployment manifest, роли/pins/custody
и параметры запуска; затем серверная связка indexer/operator и контролируемый запуск.
Эта репетиция не включает production deployment, серверный signer или публичные отправки.
