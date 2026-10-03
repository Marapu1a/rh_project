# Публичный запуск: четыре подписи завершены

03.10.2026. Владелец подписал launch/policy/bindPromo/bindVenue в MetaMask.
Повторный `/refresh` локальной signing queue вернул200, completed4/pending=null:
точные транзакции, canonical receipts, runtime и результаты вызовов прошли проверку.
Новых отправок агентом в этом шаге0.

[Фактический manifest и receipts](evidence/PONS_PUBLIC_LAUNCH_2026-10-03.json).

- TOKEN: `0x6EA39A23AA46E51CA6CD2d1cbc0B5bfb29ECB216`.
- Curve: `0x12ba58B5455fDBc15165e0E8B2096498D2c684f1`.
- BuyPolicySource: `0x4C6fCD1645f15E6eCFc02E74A68ac81e3eD02738`.
- Launch block79377860; anchor правила — реальный block79377859.
- Collector90/5/5 и Pons bindings проверены; governor nonce24.

На снимке finalized79370453, поэтому эти receipts ещё не считаются finalized.
Кошелёк автоматики0ETH. Финансовые сервисы не включались, контролируемая покупка
101USDG не выполнялась. Сторонние покупки этим утверждением не исключаются.

Первый GoPlus запрос уже возвращает QIANQI, но `is_open_source=0`, `is_in_dex=0`,
buy/sell tax неизвестны; это не завершённый положительный security report.
Проверенный на fork executable source match сам по себе не публикует исходники
реального адреса в обозревателе. Следующий пакет должен закрыть source publication/
verification и повторить запрос; неопределённые поля не считать зелёными.
Raw ответ локально: `.local/logs/qianqi-goplus-first.json`.

Следующий рабочий пакет: фактический runtime config/profile (не fork config),
verification токена, finalized admission, оценка/пополнение gas executor,
включение подготовленного индексатора/API и затем отдельный контролируемый BUY.
Расписание backup/monitor и финансовые workers включать согласно ops runbook;
результат этих будущих действий здесь не заявляется.
