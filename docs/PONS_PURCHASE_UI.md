# Локальный интерфейс покупки

Продолжение01.10: [browser → local planner/fork](PONS_BROWSER_BRIDGE.md) прошёл
отдельный автоматизированный Chromium-прогон. Обычный URL4174 ниже остаётся
simulated demo; реальный local-fork adapter подключён только в test harness.

01.10.2026: отдельный browser rehearsal, **не подключён к реальному кошельку/RPC**.
Форма, котировки, разрешения и receipts симулируются; результат предыдущего
[fork planner](PONS_DIRECT_PURCHASE.md) не является тестом этой связки.

## Просмотр

PowerShell:

```powershell
$env:PORT='4174'
$env:RH_PURCHASE_DEMO='1'
node scripts/serve-site.cjs
```

Открыть http://127.0.0.1:4174/purchase-demo/ . Server привязан к loopback.
Без opt-in route и её assets возвращают404. Основная кнопка BUY остаётся
заглушкой; demo не добавлено в навигацию сайта и не выложено на сервер.

В controls можно моделировать подтверждение, отказ, pending, unknown и revert,
смену адреса/сети. Reset стирает исключительно учебное состояние.
Такая кнопка НЕ предназначена для production recovery неизвестной отправки.

## Реализация и поведение

- `web/purchase-demo/review.js`: state machine; точный ввод USDG до6 знаков,
  проверка аккаунта/сети/срока перед подтверждением, блокировка двойного клика.
- `demo.js`: только локальный simulated adapter, без window.ethereum/fetch/signing.
  Учебные approvals ограничены суммой; отдельные USDG → router → buy шаги.
- HTML/CSS: форма, следующий шаг, кошелёк, оценка/минимум токенов, статус/hash.
  Комиссия сети обозначена как не рассчитанная. Котировки явно вымышленные.
- Перед отправкой сохраняется submitting. После reload неизвестная отправка
  остаётся unknown, известный hash — pending. Повторная отправка блокируется.
- При timeout поздний hash сохраняется, если исходная страница ещё открыта.
  Отказ позволяет новый review; receipt outage сохраняет pending/hash;
  revert не становится подтверждённой покупкой.
- Подтверждение approval не отправляет BUY само: нужен следующий явный review.
- Смена account/chain сбрасывает неподписанный review, но сохраняет pending.
- sessionStorage относится только к demo tab. Production journal, межвкладочная
  блокировка, проверка canonical receipt/calldata и восстановление после закрытия
  вкладки сюда ещё НЕ подключены.

## Проверки

`node --test test/purchase-review.test.cjs web/purchase-demo.test.cjs`:
первый запуск12/13 PASS, единственный failure — overflow длинного адреса320px.
После CSS fix повторён только этот browser test:1/1 PASS. Итого13 адресных
сценариев закрыты (8 state machine +5 browser), не full suite.

`node --test web/site.test.cjs web/wallet.test.cjs`:16/16 PASS.
Существующий frontend и wallet helpers не менялись; соседние tests нужны
из-за изменения opt-in routing в serve-site.

Browser проверяет1440/390/320px, отсутствие вызовов injected wallet и JS errors
в полном demo cycle. Mobile screenshot просмотрен:
`.local/logs/purchase-demo-mobile.png`. Логи:
`purchase-review-tests.txt`, `purchase-review-mobile-final.txt`,
`purchase-review-site-neighbors.txt` в `.local/logs/`.

Следующий ограниченный шаг: соединить browser flow с настоящим local-only
planner/fork, не снимая public gate; доказать exact payload, account/network
изменения и canonical receipt recovery на этой связке. Затем решать public
admission/indexer. Нынешний demo сам по себе не готов для реальной торговли.
