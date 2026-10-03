# Эксплуатационная обвязка: подготовка и границы

03.10.2026. Код, шаблоны и offline restore проверены локально. Боевой сервер,
ключи и публичные транзакции не затронуты. Это НЕ завершение публичного Pons executor.

## Что работает

- run-pons-automation.cjs держит `<state>.service.lock` весь процесс, включая idle.
  Прежний per-pass transaction lock остаётся. Два штатных CLI не могут чередоваться
  между проходами. Прямые библиотечные вызовы должны сами использовать обвязку;
  исходный per-pass lock остаётся последней защитой общего state.
- `<state>.status.json` атомарно хранит время/проход/статус и безопасные reason codes.
  `<state>.events.jsonl` записывает только изменение состояния/причин внутри сессии.
  В них нет raw RPC errors, URL, ключей и полных tx. Ошибка/unknownHash остаётся
  attention после выхода, не маскируется stopped. При обычной остановке — stopped.
  Это файловые события, НЕ доставленные Telegram/email уведомления.
- `node scripts/ops-session.cjs STATUS_FILE MAX_AGE_MS` читает статус; устаревший,
  будущий timestamp или отсутствующий файл даёт unavailable. Возраст подобрать под
  максимальный проход + poll. Это не проверка балансa/цепи и не гарантия живого PID.
- `verify-runtime-release.cjs RELEASE_DIR` сверяет269 файлов текущей поставки;
  нет файла/изменённые bytes/выход пути из каталога → отказ, exit78. Manifest должен
  приходить из доверенного build; самоподписанным аудитом/защитой от root это не является.
- ops-backup.cjs копирует только остановленное состояние, отказывает при .lock/.tmp,
  symlink, изменении исходника и несовпадении hashes. Restore создаёт НОВЫЙ каталог,
  не активирует его и не перезаписывает текущие журналы. Нет автоматического reset.

## Файлы установки (пока не установлены)

- `/opt/qianqi/releases/REV` и `current`: проверенная read-only поставка, пользователь
  сервиса не должен иметь права менять её или release.json.
- `/etc/qianqi/indexer.json`: общий indexConfig из согласованного deployment;
  `/etc/qianqi/indexer.env`: приватный RPC URL, root:qianqi0640, не в git.
- `/var/lib/qianqi`: отдельный каталог durable state, qianqi0700. Единственный writer.
  Конфиги/журналы привязаны к путям: не менять configHash или statePath в уже
  действующем экземпляре ради установки. Новый deployment готовится с конечными путями.
- `ops/qianqi-indexer.service`: indexer+API, loopback8787, без signer. Ограниченные
  restarts, exit78 не перезапускается, KillMode control-group, stop timeout150s.
  При needsAttention процесс может оставаться живым: наблюдать health, а не только PID.
- `ops/qianqi-rehearsal-automation.service`: только локальный fork18545, НЕ публичный
  unit. Restart=no: неизвестная отправка/сбой требуют разбора; обычные ожидания
  продолжаются внутри watch. Не подставлять публичный RPC вместо локального.
- systemd journal и events требуют ограниченного retention/ротации при установке;
  events можно архивировать после остановки, transaction journals — нельзя обрезать.

Проверка systemd-analyze verify в Ubuntu24.04/WSL прочла unit files, но exit1:
/usr/bin/node отсутствует; NTFS даёт предупреждения executable/world-writable.
Linux start/stop и sandbox ещё не квалифицированы. При установке нужны Node из
проверенного профиля, service user, правильные права0644 units, доступные каталоги,
повтор verify и отдельный smoke. Шаблоны не являются отчётом об установленном сервисе.

## Остановка, архив и восстановление

1. Остановить автоматику, затем indexer service; убедиться, что дочерние процессы
   завершились. Не удалять lock по одному лишь возрасту: PID может быть переиспользован.
   При crash проверить все процессы/хосты, сохранить lock как evidence и лишь после
   подтверждения отсутствия writer разбирать конкретную оставшуюся блокировку.
2. Нельзя запустить writer во время backup. Отсутствие lock само по себе не доказывает
   остановку; это обязательное операторское условие. Скопировать конфиги с hash и
   весь state (automation, scheduler, RNG, indexer и вложенные артефакты). Ключи и RPC
   секреты хранить отдельно с ограниченными правами; не включать их в публичный отчёт.
3. `node scripts/ops-backup.cjs backup STATE_DIRECTORY NEW_BACKUP_DIRECTORY`.
   Проверяется inventory до/после; незавершённая копия без manifest не пригодна.
   Сохранить архив на отдельном носителе/хранилище — локальная копия не защита от потери VPS.
4. `node scripts/ops-backup.cjs restore BACKUP_DIRECTORY NEW_STAGING_DIRECTORY`.
   Это только byte-for-byte staging. Исходные пути в config не переписываются.
5. Перед активацией сверить config/deployment, цепь, pending intent/receipt/nonce,
   уже назначенные и выплаченные награды. Вначале обслуживание старых обязательств,
   затем новый funding/freeze. Unknown hash НЕ разрешает слепую повторную отправку.
   Настоящая активация public recovery ещё требует публичного executor/profile.
6. Откат кода: вернуть совместимый release, сохранив текущие журналы. Не откатывать
   журнал вслед за кодом: chain уже могла принять транзакции. При несовместимости
   формата остановиться и подготовить явную миграцию, а не очищать историю.

## Что делать при отказе

| Сигнал | Действие |
|---|---|
| nativeFunding | Пополнить только operational ETH; не трогать frozen/claimable |
| RPC/history unavailable | Восстановить доступ/историю; не менять identity на другой URL вслепую |
| catchingUp/stale | Дождаться индекса; не расширять freshness ради зелёного индикатора |
| pendingReceipt/unknownHash | Проверить сохранённую отправку и nonce; не повторять вручную наугад |
| lock/checksum/disk full | Остановить работу, сохранить evidence, восстановить диск/правильное состояние |
| Pons conversion waiting | Получить уже доступные USDG штатным путём; ждать недоступную конвертацию |

## Проверки и пределы

- `node scripts/test-launcher.cjs --profile ops-readiness`:33/33 PASS, без компиляции.
  `.local/logs/ops-readiness-tests.log`: сервис/RPC timeout/recovery, locks, state corruption,
  waiting/attention, transaction errors и ENOSPC до/после отправки с mock transport.
- После добавления process-crash scenario: `node --test test/ops-session.test.cjs`3/3 PASS
  (два повторных, один новый). Реальный Node process убит SIGKILL; journal сохранён,
  stale owner запрещает restart до явного разрешения в тесте. Linux SIGTERM этим не доказан.
- Финальная правка backup inventory: стабильный порядок и hash для имени __proto__;
  ops-backup1/1 повторно PASS (.local/logs/ops-backup-final-test.log). Изолированная
  сборка ниже предшествовала только этой правке backup, остальные runtime files те же.
- runtime-artifact3/3 и catalog1/1 PASS. В сумме38 уникальных сценариев, не full suite.
- Свежая изолированная поставка C:/Temp/qianqi-ops-20261003: npm ci --omit=dev,
 269 hashes PASS; check-runtime API worker/site smoke PASS по сохранённому snapshot
 (stale,1 награда), без RPC/новых транзакций. `.local/logs/ops-runtime-smoke.log`.
- Backup сохранённого quiescent `.local/logs/pons-cycle-MCI0et`:4 файла; staged restore
 совпал с manifest, original не перезаписан. Нового on-chain restore-cycle не выполняли.
  [Evidence](evidence/OPERATIONS_READINESS_2026-10-03.json).

## Чего ещё нет до боевой эксплуатации

Публичный Pons профиль/исполнитель — незакрытый пункт, не мелкая установка service.
Текущий `runPonsAutomation` требует schema rehearsal и hardhat_metadata; runtime-network
запрещает public sends. Старый deployment-admission/Robinhood inspector построен вокруг
Infinity fundingJob; его нельзя объявить готовым Pons admission. LocalPonsCollector
явно остаётся deployment-unadmitted prototype.

Следующий отдельный результат: согласованные public Pons manifest/pins/roles и
network timing/finality; публичный sender с custody и проверкой каждой отправки;
проверка collector bindings/permissions и старых обязательств; затем полная репетиция
этого режима и Linux services. Реальные адреса нельзя придумать из local config.
Внешний канал уведомлений также ещё не подключён — ожидается предпочтение владельца.
