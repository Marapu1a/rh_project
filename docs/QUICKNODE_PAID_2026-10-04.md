# QuickNode Build: проверка после оплаты 04.10.2026

Локальная read-only проверка 03.10 23:33–23:35 UTC. Build/80M credits/50 RPS
видны на скриншотах владельца. Сумма и условия платежа не проверялись.
[Evidence](evidence/QUICKNODE_PAID_2026-10-04.json).

- Chain4663; архив USDG code/call/storage на finalized, -10000, -864000 PASS.
- Launch header/runtime совпадают; bulk receipts доступны.
- getLogs1/10/500/501/1000/10000 PASS. Выборка10000 дала235 логов,
  точно совпала с двумя последовательными выборками5000.
- В3 непустых блоках полные receipts19 транзакций сверены с getLogs:
  все события и provenance совпали, canonical hash перепроверен.
- indexOnce10+10, затем новый процесс ещё10: checkpoint, policy admitted;
  первый ledgerHash совпал с прежним Alchemy prefix. Всего30 блоков.
- Finalized QuickNode/Alchemy совпал8/8 по number/hash; lag969–980s <1200s.
- В этих последовательных пробах ошибок не было. Нагрузку50 RPS не тестировали;
  short sample не гарантирует долгосрочную доступность или полный архив.

Команды: node .local/logs/quicknode-paid-{probe,index-probe,log-proof,limits-finality,restart}.cjs
(пять отдельных последовательных запусков). Последний использует checkpoint index-probe.
Runtime не менялся; продуктовые тесты не нужны. Проверены ссылки/diff/исключение ключа.

Сервер остаётся на прежнем RPC; финансовая автоматика не включалась.
Следующий самостоятельный шаг: перенос RPC в read-only сервис с сохранением
anchor/checkpoint, проверкой прогресса и возможностью вернуть прежний endpoint.
Оставшиеся readers должны учитывать конечный диапазон10000; paid не означает
неограниченный getLogs. Рост state и полный финансовый запуск этим тестом не закрыты.
