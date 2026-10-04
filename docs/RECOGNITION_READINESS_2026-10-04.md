# Готовность контура подтверждений

04.10.2026. По поручению владельца выполнена подготовка к включению. Публичных
финансовых отправок0; recognitionPublishing.enabled=false, financial service
inactive, activation-approved отсутствует. Первый confirm не раньше05.10 11:30UTC
(14:30МСК), после пополнения executor и свежих проверок.

## Что работает

- Полный диапазон79377860–79880747 перечитан через QuickNode:102 запроса,
  370 уникальных событий проекта совпали с сохранённой историей. Проверялся также
  новый source; пропусков не найдено. Это сверка с тем же RPC, не независимый аудит.
- Миграция в новый файл recognition-index.json сверяет старый checksum/config,
  привязанный полный аудит, wallets/transitions/pending/draws. Призовая математика
  не меняется. Настоящих frozen draws в этой истории0; отдельный синтетический
  regression test сохраняет непустой frozen snapshot.
- Read-only runtime recognition-ready-20261004 установлен отдельно,326 файлов
  проверены по release manifest. Старый runtime/индекс сохранены. Серверный индекс
  догнал finalized, lag0, затем restart и повторный lag0 без ошибок. Файл2.3МБ;
  bundle store948КБ. Полная старая история сети не возвращалась.
- API сайта переключён с8787 на8789 после health-ready. Кабинет получил текущий
  app.js и показывает реальные WAITING_RECOGNITION. Боевой Chromium с подставленным
  read-only wallet provider показал3 pending покупки реального адреса,0 билетов,
  ни одного send/sign вызова, ошибок страницы0. Это не ручной тест MetaMask.
- Подготовлены stage пакеты1 и28; request=null, availableAt/public notice не обходятся
  ради отправки. Их [публичные файлы](https://qianqi.site/evidence/purchases/) проверены
  по digest; большая выборка включает первую. После первой транзакции остаток
  обязательно готовится заново. Срок и hash опубликованного объявления сохранены.
- Перенесены одинаковые recognition trust/index path в index/API/coordinator.
  Старый automation config ссылался на прежний bloom index; новый использует
  recognition-index. Profile/config binding пересчитан, live admission matched.

## Регулярное подтверждение

`recognition-worker.cjs` встроен в существующий Pons coordinator. Второго signer
процесса нет: общий journal, pending nonce, gas budget, fail-closed recovery.
После обслуживания имеющихся обязательств и до новых freezes worker выбирает
ожидающие покупки только узкого65050 adapter. Полная trace/runtime/receipt/replay
проверка остаётся обязательной. Новые маршруты не допускаются автоматически.

Публичный send guard требует enabled, конкретный source/selector/count, свежий
индекс и полный replay, выдержанный срок, неизменный SHA256 объявления и доступный
публичный bundle по hash. Сохраняет файл до отправки; ошибка публикации не отправляет
confirm. После confirm новые freezes ждут включения события в finalized index.
Сбои идут в существующий operator status/Telegram monitor; тестовых сообщений
пользователю в этом пакете не отправляли. Unknown outcome сохраняется для разбора.

Настройки на сервере: recognition-automation.json / recognition-profile.json;
unit override70-recognition.conf подготовлен, но службу не включали.
BatchSize1 — первый контролируемый запуск. Факт наличия worker не означает,
что регулярные публичные подтверждения уже проверены реальной транзакцией.
Сначала один pass, сверка результата и restart, затем регулярное включение.

## Что осталось

- Executor `0x7170c2d8Abd99C471B89ffcAaC765d5aD94D1Bf3` имеет0ETH.
  Без отдельного пополнения газ не оплачивается. Призовые деньги для этого не тратим.
- Vault0USDG. В escrow300.285210USDG для collector; дополнительно sweep2.303615USDG.
  Read-only pull/sweep симуляции успешны. Это ещё не распределённый призовой бюджет;
  readiness Short/Monthly перепроверяется после штатного funding90/5/5.
- У24 других BUY изучены callTracer:11 внешних targets, ошибок исполнения0,
  router65050 в этих трассах не исполняется. Это другой охват, а не просто
  пропущенные вызовы уже проверенного adapter. Нужны отдельные проверки маршрутов;
  покупки сохранены pending, без обещания автоматического допуска.
- Срок объявления, первое реальное начисление и регулярные отправки ещё впереди.
  Включение одной службы не является доказательством готовности обоих draws.

## Проверки и восстановление

42 уникальных адресных tests PASS: purchase-recognition16, audit1, migration1,
worker2 и21 существующий соседний сценарий +1 новый public disabled guard.
Команды: `node --test test/purchase-recognition.test.cjs test/recognition-worker.test.cjs test/migrate-recognition-index.test.cjs test/audit-project-logs.test.cjs test/pons-public-execution.test.cjs test/pons-automation.test.cjs test/pons-delay-status.test.cjs` и адресные повторы изменённых файлов.
Первый запуск39/40: ошибка тестовой fixture с несовпадающими tx.to/receipt.to;
fixture исправлена, worker2/2 и public guard8/8 затем PASS. Browser wallet14/14,
catalog1/1. Полный suite не запускался. Новая orchestration ветка проверена моделями;
общий контракт/журнал уже имеют отдельные EVM/recovery tests. Боевых confirm0.

Backup `/opt/qianqi/backups/recognition-ready-20261004/`: старые configs/index,
app.js/index.html/nginx. Новые config/state и оба bundles также скопированы локально
в .local/logs. Штатный backup охватывает весь /var/lib/qianqi-public и /etc/qianqi/public,
включая новый индекс и private bundles; публичные копии восстанавливаются из них.
Для read-only rollback: вернуть nginx/app.js/index.html из backup, убрать только
новый unit override после проверки путей, вернуться к старому service/config.
После будущих confirm нельзя просто возвращать старый неподдерживающий reader:
потребуется версия, умеющая воспроизвести уже опубликованные commitments.

[Сводка](evidence/RECOGNITION_READINESS_2026-10-04.json),
[аудит диапазона](evidence/RECOGNITION_HISTORY_AUDIT_2026-10-04.json),
[инвентарь24 маршрутов](evidence/RECOGNITION_OTHER_ROUTES_2026-10-04.json).
