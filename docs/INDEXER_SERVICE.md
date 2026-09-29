# Постоянный read-only сервис indexer/API

29.09.2026. `scripts/run-indexer-service.cjs` запускает API на127.0.0.1 и последовательные
indexer passes в дочерних OS-процессах. Один owner на statePath. Не запускает signer,
collect, draws или claims и не открывает public sends. Это эксплуатационный пакет;
реальная admitted Infinity скорость и установка на сервер ещё не квалифицированы.

## Запуск

Нужен существующий CONFIG с manifest/buyPolicy/lifecycle и
`indexer: {statePath: ABSOLUTE_PATH, maxAgeSeconds: ACCEPTED_LIMIT}`. Для исследовательского
unadmitted config health честно остаётся unadmitted, а wallet API не выдаёт admission.
Не менять действующий config/state identity ради запуска. RPC URL хранить вне git.

```powershell
$env:RH_RPC_URL=(Get-Content -LiteralPath .local/rpc-url.txt -Raw).Trim()
npm run service:indexer -- C:\runtime\promo\indexer-config.json 8787
```

Путь выше — пример расположения существующего config, не готовый deployment профиль.
Остановка Ctrl+C/SIGTERM: прекратить новые passes, завершить дочерний процесс, закрыть
API, освободить собственные locks. Не запускать рядом прежний indexer watch над тем же
state. HTTP только loopback; внешний HTTPS/reverse proxy — задача установки сайта.

`RH_INDEXER_POLL_MS` по умолчанию10000, `RH_INDEXER_PASS_TIMEOUT_MS`120000.
Это эксплуатационные defaults, не обещание throughput. CatchingUp продолжает сразу;
обычный idle/RPC failure ждёт poll. Timeout ограничивает один проход; после него свой
child завершается и следующий проход повторяется с сохранённого state. Порция пока100
новых blocks, полный scan/JSON остаётся линейным. Каждая попытка стартует новый Node
process — небольшая плата за простое ограничение зависаний и изоляцию HTTP.
Не увеличивать freshness threshold только ради зелёного индикатора.

## Health и логи

`GET /healthz`:200 только ready, остальные состояния503; no-store, без RPC URL/ключей.
Wallet routes/schema не меняются. Это health последнего indexer pass, не проверка
готовности API worker для каждого кошелька и не гарантия chain finality.

- starting — ещё нет успешного прохода после старта сервиса;
- ready — admitted, свежий snapshot, догнали прочитанный finalized target;
- catchingUp — свежая публикация, но ещё есть backlog;
- unadmitted — исследовательская история, не разрешённая продуктовая;
- waiting — RPC/validation failure, exit или timeout; будет автоматический retry;
- stale — нет свежей успешной публикации;
- needsAttention — unknown lock, повреждённый state или storage failure: новые passes остановлены.

Поля snapshotFresh/ageSeconds отдельно от processedBlock/targetBlock/lagBlocks:
новый файл не доказывает, что догнали сеть. Target относится к последнему успешному
проходу, не live tip. processedTimestamp — timestamp обработанного блока в RPC hex;
metrics содержат scan/replay/reward/save/total/bytes. attempts/successes/failures и
indexerPid помогают диагностике, counters сбрасываются при restart. Health после restart
не объявляет saved snapshot заново проверенным до первого успешного pass.

JSON health пишется в stdout при старте/завершении прохода; ошибки содержат только
фиксированные reason codes. Возраст в HTTP вычисляется при запросе. Логи собирать с
ограничением хранения; внешний alert delivery ещё не подключён. Состояние waiting
может требовать проверки, если RPC восстановился, а validation продолжает отказывать.

## Блокировки и восстановление

`STATE.service.lock` — владелец сервиса, PID+random token; второй экземпляр получает
startup refusal/exit78. `STATE.lock` — существующая блокировка indexOnce, формат не менялся.
Supervisor убирает leftover pass lock ТОЛЬКО после exit своего child и при точном
совпадении owner с его PID. До запуска child lock должен отсутствовать. Чужой или
нечитаемый lock не удаляется. PID reuse не является основанием удалять неизвестный lock.
Это один хост/локальный несинхронизируемый диск, не distributed lease.

При обычном child crash/timeout восстановление автоматическое. После SIGKILL всего
supervisor или отключения питания service lock может остаться: намеренно нет автоматического
удаления неизвестного owner. Ошибка старта78 предотвращает бесконечный restart.

Порядок ручного восстановления:

1. Остановить service manager и убедиться, что завершились supervisor, его дети и любые
   вручную запущенные indexer процессы, работающие с этим STATE. Не ориентироваться
   только на существование/отсутствие PID; исключить второй хост/shared volume.
2. Сохранить копию CONFIG, STATE и найденных lock/tmp файлов для разбора. Не публиковать env.
3. Только после подтверждения отсутствия writers переместить мешающие locks в архив
   рядом с backup. Не трогать основной STATE, не подменять его временным `.tmp`.
4. Запустить сервис: indexOnce проверит checksum/config/branch. При invalidState остановиться
   и восстановить проверенный backup; не править checksum вручную. Повреждённый read-only
   индекс можно пересобрать в отдельный state с исходного anchor при доступной истории.
5. Убедиться, что идут success passes, lag сокращается и admitted статус подлинный.

Это инструкция только для read-only indexer. Signer/funding journals, pending sends,
frozen datasets и призовые контракты не сбрасывать. При переносе пути CONFIG hash меняется:
нельзя просто отредактировать старый state; для индексера использовать отдельный проверенный
rebuild, а не применять эту процедуру к денежным журналам.

## Linux/systemd

Шаблон [unit](../ops/rh-promo-indexer.service) использует `/opt/rh_project`, пользователя
`rhpromo`, `/etc/rh-promo/indexer.json`, env `/etc/rh-promo/indexer.env` и state directory
`/var/lib/rh-promo`. Установить Node/dependencies (`npm ci`), создать отдельного пользователя,
разместить checkout/config, задать statePath внутри этого directory. Env содержит только
RH_RPC_URL и при необходимости poll/timeout; доступ0600 с чтением systemd, не репозиторий.
Сервисные файлы/checkout доступны rhpromo на чтение; runtime directory — на запись.
Секреты signer этому сервису не нужны.

После проверки путей администратором: скопировать unit в `/etc/systemd/system/`, выполнить
`systemctl daemon-reload`, `systemctl enable --now rh-promo-indexer`.
Проверка: `systemctl status rh-promo-indexer`, `journalctl -u rh-promo-indexer`,
`curl -i http://127.0.0.1:8787/healthz`.
Restart on failure ограничен; startup78 не повторяется. При needsAttention процесс и API
остаются живы с503, а passes остановлены. Unit подготовлен, на настоящем Linux сервере
в этом пакете не установлен/не проверен. Резервное копирование выполнять после остановки
writers; проверить восстановление при фактической установке сервера.

## Подтверждённая проверка

29.09: `node --test test/indexer-service.test.cjs test/persistent-buy-indexer.test.cjs test/user-status-cache.test.cjs`
—18passed; `node --test --test-name-pattern="profile catalog" test/test-launcher.test.cjs` —1passed.
Service tests используют настоящие дочерние Node processes и HTTP mock RPC над legacy
BUY evidence. Проверены startup/duplicate refusal, outage/resume, graceful restart,
SIGKILL дочернего индексера с owned lock, RPC hang/timeout/retry, unknown lock и corrupt
state без reset/restart storm. Остальные тесты — соседние indexer и API worker сценарии.
Не admitted Infinity/live/fork/full baseline. На сервер ничего не отправлено.

Пакет закрывает обычное исполнение сервиса. Следующий продуктовый шаг — пользовательский
сайт и недостающий общий список розыгрышей; реальный throughput измеряется перед публичным
выпуском, либо раньше при конкретном отставании. Не переписываем хранилище на предположениях.
