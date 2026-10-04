# Подготовка source позднего подтверждения

04.10.2026. Владелец подписал CREATE; inclusion проверен, finality ещё ожидается. QuickNode — принятый
источник данных. Финансовая автоматика этим пакетом не включается.

## Одна подпись

Governor `0x098afA6731239a00CE0aff669aaefD16b7C72114`, nonce26.
Publisher — executor `0x7170c2d8Abd99C471B89ffcAaC765d5aD94D1Bf3`.
Instance `0x8a6a507aae35a2981afdf8e3637d013b5736b70a6621355254d55ccdc0a3da12`.
Предсказанный source `0xD084329F25DE50afD68B154caFAC6A8d7046f97F`.
Это прогноз до receipt, не уже развёрнутый контракт.

QuickNode preflight: finalized79847060, governor latest=pending26, адрес свободен,
баланса достаточно. Лимит value+gas около0.00000723ETH на момент проверки,
не фиксированная цена. CREATE value0; контракт не хранит призовые средства.

`scripts/recognition-deployment.cjs` собирает отдельный solc artifact/input/layout,
план с hash и gas budget; проверяет receipt, chain/nonce/calldata и весь runtime
с подстановкой реальных constructor immutables, включая timestamp+86400.
Signing использует готовый artifact без компиляции. Локальная консоль4177
использует прежнюю очередь с сохранением unknown outcome и повторным preflight.
Старая консоль4176 не изменена/не остановлена. Секретный session URL только локально.

## Проверки

- `node --test test/recognition-deployment.test.cjs test/deployment-signing-queue.test.cjs test/deployment-console-ui.test.cjs`:13/13 PASS.
  Новый сценарий: реальное развёртывание на локальной EVM, точный runtime,
  issuer executor, запрет governor confirm, очередь/restart/no-resend, wrong chain,
  pending nonce и подмена плана. Chain4663/finalized в локальном wrapper синтетические.
- После изменения текста консоли browser-model3/3 PASS. Это модель UI, не MetaMask.
- Проверка каталога сначала выявила отсутствие нового теста в full profile;
  исправлено, `node --test --test-name-pattern="profile catalog" test/test-launcher.test.cjs`:1/1 PASS.
- Live localhost GET и authenticated /view,/prepare200, completed0/pending=null.
  /intent и публичная отправка не выполнялись. Full suite не запускался.

Артефакт/журнал/логи: `.local/logs/recognition-deployment-prepared.json`,
`recognition-deployment-journal.json`, `recognition-console.log`.
После подписи — receipt/finality/runtime, затем перенос readers и публикация
[объявления](RECOGNITION_NOTICE_DRAFT.md). Для первого confirm нужны обе задержки:
24ч от deployment и24ч от фактического объявления, плюс полнота истории и доступность
bundle. Сборщик подтверждений и автоматическая отправка — разные стадии;
назначение executor само по себе не запускает периодическую публикацию.

## Подпись владельца: inclusion подтверждён, finality ожидается

Транзакция `0xcc7a87bfcb5ea1a2c136f1f249d55956b2a72ae4c16f824e97cd91dd1f036198`,
успешный receipt в блоке79859732. Адрес совпал с прогнозом, полный runtime
с constructor immutables совпал; publisher — согласованный executor.
[Фактическая проверка](evidence/RECOGNITION_DEPLOYMENT_2026-10-04.json).
На момент проверки finalized79850498: окончательное подтверждение ещё не заявляем.
Хеш восстановлен по CREATE address/nonce и сохранён в pending журнала консоли;
повторная отправка запрещена. Ответ /submitted409 обозначает ожидание finality,
а не неуспех CREATE. После finality — /refresh и повторная проверка runtime/receipt.
Контрактный availableAt: 05.10.2026 10:19:59 UTC (13:19:59 МСК).
Публичное объявление пока не опубликовано; его24ч считаются отдельно.

Последующая проверка: finality/runtime подтверждены04.10 при finalized79876906.
[Публикация правила и актуальные сроки](RECOGNITION_PUBLICATION_2026-10-04.md).
