# Pons: порционное обнаружение выплат — 04.10.2026

## Исправлено локально

`pons-automation.cjs` передаёт обнаружение AttemptsConsumed в
`pons-payout-scan.cjs`. RPC получает окна максимум10 блоков, оба контроллера
читаются до фиксации каждого окна. В одном вызове сохраняется прежний предел1000
блоков. Курсор проверяется и в idle, и по обе стороны каждого завершённого окна.
Результат розыгрыша читается на высоте конца окна. При ошибке события/результата,
reorg или неполном чтении окно не записывается. Повтор запуска использует последний
сохранённый курсор, а не начинает историю заново. Платежи и их журнал не менялись.

Это изменение **ещё не установлено на сервер**. Финансовая автоматика выключена.
Новая схема хранения, сброс курсора и изменения правил не нужны.

## Проверки

- `node --test test/pons-automation.test.cjs test/pons-cadence.test.cjs test/pons-cadence-orchestration.test.cjs`:
  19/19 PASS (модель RPC, настоящий coordinator/journal). Отдельно проверены
  две страницы и остаток, оба источника, дубли, сбой второго источника,
  восстановление из сохранённой копии, reorg начала/конца, removed/out-of-range,
  неверный resultHash, ограничение1000, отмена и idle с повреждённым курсором.
- В mock orchestration добавлен hash anchor, ранее отсутствовавший в тестовом
  manifest. Это корректировка фикстуры под проверку настоящего deployment anchor.
- `npm run test:group -- --profile pons-public-execution`: 47/47 PASS, exitCode0; соседние guards/gas/journal/crash и EVM выплаты.

- Дополнительно профиль `pons-public-execution --match "public guard rehearsal"`:
  1 продуктовый EVM-сценарий PASS (не8: остальные строки launcher — пустые файлы
  после фильтра). Реальные локальные Short/Monthly, публикация, drand и выплаты;
  getLogs для AttemptsConsumed принудительно ограничен10 блоками; backlog25
  дополнительных блоков, low-gas ожидание и restart без повторной оплаты.
  Это Hardhat rehearsal, не mainnet отправка. Лог `.local/logs/payout-pages-evm-cap.log`.

Логи: `.local/logs/payout-pages-tests.log`, `.local/logs/payout-pages-neighbors.log`.
Полный набор проекта этим пакетом не проверялся. Модель ограничения10 блоков
не является live-проверкой оплаченного/бесплатного тарифа RPC.

## Оставшиеся RPC-пути (не закрыты этим изменением)

| Путь | Состояние |
|---|---|
| drand-delivery-worker | getLogs нет: получает текущие pending IDs из контроллеров |
| buy-policy-admission | count0 не читает logs; при count>0 ещё широкий запрос notices |
| short-dataset, monthly-dataset | cold verification публикаций ещё использует широкий запрос |
| short-settlement.recover | восстановление DatasetChunk ещё использует широкий запрос |
| promo-automation | прежний альтернативный исполнитель, не Pons production путь |

Следующий шаг: закрыть широкие запросы в действующих путях восстановления с учётом
уже проверенных publication caches и счётчиков. Не возвращать пустой ответ при
ошибке и не превращать каждый проход в повторный обход всей истории.

## Мониторинг

После legacy-fix сервис прошёл5 последовательных порций без ошибок; сохранено18100
блоков, head79395959, snapshot60.27MB. Последняя порция1000 блоков47.02s.
Это снимок2026-10-03T22:13:45Z, не доказанный steady state. Индекс ещё catchingUp.
Рост полного файла и cold replay остаются открытой эксплуатационной задачей.

## Уточнение тарифа по вопросу владельца

Проверено04.10 по официальной таблице Alchemy: Robinhood Mainnet Free10 блоков,
PAYG unlimited range, общий response cap150MB. Цена PAYG$0.525/1M CU; usage limit
настраивается, его достижение ограничивает дальнейший доступ. Покупка тарифа
не производилась и владельцем ещё не подтверждена.

- https://www.alchemy.com/docs/chains/ethereum/ethereum-api-endpoints/eth-get-logs
- https://www.alchemy.com/pricing
- https://www.alchemy.com/docs/reference/pay-as-you-go-pricing-faq

Перед переделкой всех исторических reader под Free10 рационально определить
рабочий тариф и проверить фактические лимиты. Если PAYG выбран, увеличить bounded
окна после RPC-пробы; сохранение прогресса/проверки ветки оставить. PAYG не решает
рост полного JSON на диске. Месячная стоимость без замера CU пока неизвестна.
