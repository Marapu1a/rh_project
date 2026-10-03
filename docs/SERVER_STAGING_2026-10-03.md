# Сервер: отдельная staging-поставка

03.10.2026. Владелец разрешил подготовку сервера через существующий SSH-ключ.
Сервер201.51.22.244 (Timeweb Amsterdam); доступ подтверждён с проверкой known_hosts.
Ключ сохранён вне git. Не включали public execution, RPC/indexing или signer.

## Исходное состояние и принятое решение

Ubuntu26.04.1,4GB RAM,35GB свободно, Node22.22.1/npm9.2.0 уже установлены.
Пользователь qianqi уже существует. qianqi-api.service работает в standby на127.0.0.1:8787;
сайт /var/www/qianqi/current → releases/data-20260930. Эти сервис/путь не переключались.
Не обновляли системный Node или ОС: совместимость текущего Node проверена для
staging API/site/strict loader. Полный draw-cycle на Linux/Node22 не заявляется.

## Что установлено

- `/opt/qianqi/releases/b900078-20261003`: runtime build по исходникам b900078.
  `/opt/qianqi/staged` указывает на него; текущий публичный frontend использует другой путь.
- `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` от пользователя qianqi:
  установлены9 packages. Затем release стал root-owned, без записи для service user.
  solc/Hardhat/Playwright не установлены; strict artifact loader работает.
- `/var/lib/qianqi-stage`: qianqi0700, отдельный state/cache каталог.
- `qianqi-stage-api.service`: standby на127.0.0.1:8788.
- `qianqi-stage-site.service`: новый HK frontend на127.0.0.1:4175, API proxy8788.
  Оба включены в автозапуск. NoNewPrivileges, ProtectSystem/ProtectHome, PrivateTmp,
  rate limits логов, memory limits512/256MB, проверка release перед каждым стартом.
- Staging units взяты из ops/qianqi-stage-*.service этого пакета; они установлены отдельно
  от build b900078 (в его release.json их ещё нет). Их хеши сверены отдельно.
- `/var/backups/qianqi-stage-prep-20261003`: копии прежнего nginx site config/API unit,
  путь и SHA256 старой главной страницы. Каталог root0700.

Нет новых публичных портов и nginx locations. RPC-ключ и кошелёк автоматики на сервер
не передавались. HTTPS/SSH/firewall конфигурация не менялась. Linux template indexer
и rehearsal automation не установлены/не включены: текущая проверка относится к stage API/site.

## Проверки на реальном Linux

- systemd-analyze verify stage units —exit0. Предупреждения CPUAccounting относятся
  к существующим системным xfs units, не к нашим файлам.
- Integrity269 файлов —PASS; SHA256 транспортного архива проверен до распаковки.
- HK200, transparency200, вложенный404, purchase-demo404; site-actions=null.
- API health: awaitingDeployment, ready=false (HTTP503) — ожидаемое standby,
  не «неисправный сервер». Проверены отсутствие dev toolchain и запрет service user
  менять compile.cjs в release.
- Stop/start API, отсутствие API → frontend proxy503, SIGKILL API → новый PID после
  RestartSec10, restart frontend —PASS. Старый qianqi-api PID не изменился.
- Offline backup/staging под service user: synthetic pending.json в отдельном
  probe-20261003; копия и восстановленный файл совпали, activation не было.
  Это проверка файлового пути/прав, не recovery реальной транзакции.
- Публичный https://qianqi.site/ →200 после работы; SHA256 старой главной совпал;
  публичный symlink прежний; nginx -t PASS, certbot.timer active.
  Сертификат действует30.09–29.12.2026. Новый renewal dry-run не выполнялся.
- Stage API потреблял около22MB, stage site15MB в момент проверки; не нагрузочный замер.

[Evidence](evidence/SERVER_STAGING_2026-10-03.json).
Логи `.local/logs/server-stage-install.log`, server-stage-smoke.log, server-stage-final.log.

## Использование и откат

Просмотр без публикации: SSH tunnel на локальный свободный порт к127.0.0.1:4175.
Внешнего URL у staging пока нет. Включение на qianqi.site — отдельный шаг после приёмки.

`systemctl status qianqi-stage-api qianqi-stage-site`
`journalctl -u qianqi-stage-api -u qianqi-stage-site`
Остановить подготовленную поставку: `systemctl disable --now qianqi-stage-site qianqi-stage-api`.
Это не затрагивает nginx/qianqi-api и не удаляет releases/state/ключи.

Следующий обязательный шаг: публичный Pons profile/sender, реальные pins/roles/finality
и согласованный deployment config. Затем signer custody, indexer/operator service,
внешние уведомления, off-server backup и сквозная репетиция публичного режима.
Staging standby не означает готовность финансовой автоматики или публичного Claim.
