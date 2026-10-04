# QuickNode: серверный read-only cutover 04.10.2026

Разрешён владельцем после локальной проверки Build. Выполнен03.10 23:37–23:39 UTC.
Runtime/release и indexer config не менялись. Финансовая автоматика disabled/inactive,
activation-approved отсутствует. Публичный API/сайт не переключались.

## Переключение и проверка

- Остановлен qianqi-public-indexer.service. Anchor79377859 и сохранённый head79469069
  совпали по hash между QuickNode и Alchemy; anchor сверён с manifest.
- Снимок261281148 bytes сохранён как
  /var/lib/qianqi-public/index.pre-quicknode-20261004.json.
  SHA256:1b9a8b86a594351725ea48ab1391666c4e931924424dc0da25fdc005104206ca.
- Новый секрет /etc/qianqi/public-secrets/indexer-quicknode-rpc-url, root600.
  Прежний /etc/qianqi/public-secrets/rpc-url сохранён без изменений.
- Только indexer получил override
  /etc/systemd/system/qianqi-public-indexer.service.d/20-quicknode.conf:
  сброс LoadCredential и rpc-url из нового файла. daemon-reload/start выполнены.
  Содержимое загруженного systemd credential совпало с новым файлом (cmp, без вывода).
- Первый серверный проход:1000 блоков, head79470069, policy admitted,
  replayMode checkpoint, successes1/failures0,58.7s, state262676159 bytes.
  До target79473118 осталось3049 блоков; второй проход уже запущен.
- Состояние catchingUp, не ready. Прогресс сохранён, с genesis не начинали.
  Краткая проверка не заменяет длительное наблюдение и не закрывает рост хранения.

## Откат RPC

Остановить только indexer; переместить20-quicknode.conf за пределы service.d;
выполнить systemctl daemon-reload и start qianqi-public-indexer.service.
Использовать текущий index.json: смена провайдера не требует отката данных.
Сохранённый снимок — аварийная копия, автоматически поверх нового не писать.
Не включать финансовую автоматику. Финансовый сервис всё ещё использует прежний
credential; его миграция требует отдельного проверенного шага.

Команды проверки: curl http://127.0.0.1:8789/healthz, systemctl is-active/is-enabled,
node /root/quicknode-server-preflight.cjs (только на остановленном состоянии),
node /root/quicknode-cutover-verify.cjs. Ошибочный первоначальный /health дал404;
фактический endpoint /healthz. Секреты в отчёт не включены.
