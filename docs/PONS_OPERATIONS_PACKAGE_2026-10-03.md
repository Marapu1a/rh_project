# Пакет 2: серверная подготовка Pons

03.10.2026. Подготовка установлена отдельно, публичных финансовых отправок нет.
Source limitations Pons приняты владельцем: «сохранять прежний курс».
Это принятие известных границ, не подтверждение отсутствующих исходников.

## Установка и запуск

- `/opt/qianqi/prepared` → `/opt/qianqi/releases/package2-20261003`.
  Свежая runtime-сборка, 287 файлов проверены, 9 runtime dependencies установлены.
  Поставку и units меняет root; qianqi не может менять код.
  Windows tar первоначально сохранил широкие modes; до завершения установки выполнены
  `chown -R root:root` и `chmod -R go-w` именно нового release. Повторная проверка:
  group/world-writable файлов нет, qianqi write denied, 287 hashes PASS.
- `qianqi-public-indexer.service`: будущий indexer/API на loopback8789,
  `/etc/qianqi/public/indexer.json`, state в `/var/lib/qianqi-public`.
- `qianqi-public-automation.service`: public sender, config `automation.json`,
  profile `profile.json` в том же `/etc/qianqi/public`; журнал
  `/var/lib/qianqi-public/automation.json`. Restart=no: crash/unknown outcome требует
  проверки журнала; обычные ожидания продолжаются внутри watch.
- Оба unit установлены, disabled, не работают. Помимо отсутствующих deployment
  configs требуют `/etc/qianqi/public/activation-approved`. Маркер не создан.
  Попытка start проверена: ConditionResult=no, MainPID=0. Это блокировка установки,
  не замена on-chain admission перед каждой финансовой отправкой.
- Память: indexer2G, operator1G, monitor128M. OOM не повод очищать lock/journal.
  Установлены stop timeout150s, ограничение journal rate, sandbox и закрытые state dirs.
- Старые public API8787 и stage API8788/site4175 не переключались, active после работ.

## Секреты

RPC перенесён из `.local/rpc-url.txt` в root0700 `/etc/qianqi/public-secrets/rpc-url`
(файл0600). `LoadCredential` передаёт его сервисам без секретов в argv/unit.
Executor password/keystore остаются в root-only `executor-custody`; только worker
получает их через credentials. Indexer не получает signer. В дочернем index worker
RPC по-прежнему передаётся приватным environment процесса — это не защита от root.
Шифрование keystore при наличии password на том же VPS также не защищает от root.

Linux transient unit под qianqi успешно прочёл credentials, расшифровал executor
`0x7170c2d8Abd99C471B89ffcAaC765d5aD94D1Bf3` и прочёл chainId4663 через Alchemy.
Подписей/отправок не было. Локальные recovery-копии и SSH-ключ сохранены.

## Telegram и резервные копии

Владелец выбрал личный Telegram, затем попросил добавить бота позже.
`ops-notify.cjs` и `qianqi-public-monitor.service/.timer` готовы, но disabled:
ожидаются root0600 `telegram-token` и `telegram-chat` в public-secrets.
Chat должен быть личным (положительный id); id нужно подтвердить с владельцем,
не выбирать произвольного отправителя из getUpdates. Реальных уведомлений не отправляли.
Используется [Telegram sendMessage](https://core.telegram.org/bots/api#sendmessage).

Monitor раз в минуту проверяет API health и операторский status (возраст до15мин).
Сообщает operational ETH/gas/pending/errors, недоступность служб; нормальное ожидание
призового фонда не тревожит. Повторы подавляются сохранённым состоянием, напоминание
через6ч; смена причины/восстановление отправляются сразу. Сбой Telegram не меняет
финансовый journal. Неуспешная доставка повторяется; timeout после принятия Telegram
может дать дубликат — exactly-once доставка не обещается. VPS полностью выключен →
этот monitor тоже не работает; внешний uptime-monitor пока не подключён.

`backup-public.sh` / backup service/timer подготовлены, disabled. При активации:
ежедневно04:00 UTC + jitter до5мин, краткая остановка обоих writers, полный offline
snapshot state, копии public configs/release manifest, затем возврат только ранее
активных служб. Скрипт не удаляет locks. При ошибке оставляет writers остановленными
для разбора; monitor покажет недоступность. Не запускать writer вручную во время backup.
Секреты отдельно, в backup не включены. Retention/удаление архивов автоматически
не настроены; контролировать диск. Таймер не обеспечивает off-server доставку.

Проверен реальный перенос **тестового fork-индекса**, не production state:
`/var/backups/qianqi-package2-drill/{source,snapshot,restored}`; SHA256 индекса
`782d0ad09ee9d96fbbfd33a2a29e8986ea96b81379b5382d4c8a20884a2fb321`.
Архив скачан в `.local/logs/package2-offserver-backup.tar.gz`, восстановлен через
`ops-backup.cjs restore` в новый `.local/logs/package2-offserver-restored`.
Байты совпали. Это проверка Linux/Windows транспорта и целостности, не новый chain replay.
Реальное восстановление требует сверки pending/receipts/nonce и обязательств, без reset.

## Metadata и frontend config

Опубликованы без переключения homepage:
- https://qianqi.site/assets/qianqi-logo.png
- https://qianqi.site/assets/qianqi-preview.png

HTTP200/image/png и SHA256 совпали с `pons-deployment-candidate.json`.
В candidate обновлены только acceptance/publication flags; старый settingsHash в
evidence пакета1 сохранён как исторический, не переписан задним числом.

`pons-deployment-config.cjs.derive(config,{publicProfile})` теперь позволяет
подготовить согласованные index/scheduler configs публичного режима, проверяя profile
binding. Без profile public config отвергается. `site.actions=null`, preview и
publicExecution=false сохраняются: реальные адреса появятся только после deployment,
а пользовательские Buy/Claim включаются после проверки адресов/сети/URL отдельным шагом.
Визуальный стиль и тексты сайта не менялись.

## Проверки и границы

Адресные проверки: credentials1, indexer-service4, backup1, notify2,
public-execution7, runtime-artifact4, ops-session3, catalog1 — **23 сценария PASS**.
Команды: `node --test test/{service-credentials,indexer-service,ops-backup,ops-notify,
pons-public-execution,runtime-artifact,ops-session}.test.cjs` (файлы передавались явно),
`node --test --test-name-pattern='profile catalog' test/test-launcher.test.cjs`.
Catalog сначала выявил отсутствие новых tests в scoped profile — исправлено.
Новый export test сначала использовал rehearsal fixture без смены schema — исправлено.
Полного baseline и нового финансового fork-cycle не запускали.

Linux: systemd-analyze verify новых units PASS (лишь предупреждения чужих xfs units),
credential/RPC probe PASS, inactive gates PASS, backup/restore/hash PASS, bash -n PASS,
HTTP assets PASS. Сам scheduled backup с действующими production writers ещё не
проверен: таких writers нет. Автоматический off-server backup и реальная Telegram
доставка остаются эксплуатационными задачами до включения публичной автоматики.

Следующий пакет: свежие nonce/anchors/fee checks → точные deployment транзакции →
контракты/launch → manifest из receipts → profile/index/API проверка → осознанное
включение worker/таймеров/сайта. До этого marker/config адреса не выдумывать.
