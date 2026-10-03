# Claim: исправления review 03.10.2026

Статус: локальный тестовый пакет поверх b68f9cb. Исходный [ответ GPT](GPT_REVIEW_RESPONSE.md)
сохранён. Контракты, призовая математика и боевое окружение не менялись.

## Исправлено

- P1: check, send и recover используют один Web Lock на приз. Проверка receipt
  больше не может одновременно с send перезаписать журнал. Перед записью результата
  check/recover также сверяют исходную запись. Регрессия моделирует два клиента,
  задержанный RPC, reverted/confirmed и новую pending-транзакцию.
- P2: ревизия Claim отделена от счётчика запросов API. Одинаковые данные при refresh
  не отменяют review. Смена аккаунта, сети, данных приза, stale/error отменяет его.
- Unknown/submitting/pending: ручная сверка hash принимает только канонический
  успешный exact claim данного winner/draw/vault с нулевым value и reward=0.
  Pending, чужой или reverted hash не разрешает новую отправку.

## Границы

Web Locks и localStorage общие только внутри одного origin/browser profile.
Защита от двойной выплаты остаётся в контракте. Все вкладки должны загрузить новую
версию: старый код не обязан соблюдать новую блокировку.
Неразрешённый wallet send удерживает lock; сверка из другой вкладки доступна после
завершения запроса либо закрытия/перезагрузки исходной страницы. Это не отменяет
отправленную транзакцию и не снимает unknown. Отменённая/reverted замена не позволяет
сбросить journal; автоматического поиска по nonce и reset нет.
Подтверждение относится к local chain 31337, не к finality публичной сети.
API в browser test синтетический; claim исполняется реальным локальным vault.

## Проверки

Результаты команд записаны в `.local/logs/claim-review-fixes-20261003.log`,
`claim-journal-final-20261003.log` и `claim-browser-final-20261003.log`.
Первый запуск: 29 PASS, browser FAIL из-за проверки до завершения async preflight.
Ожидание готовности исправлено; результаты окончательного адресного прогона ниже.

## Дальше

A4: нагрузка на принятой истории, линейная запись/consumer replay, backup/restore,
проверка согласованности checkpoint при idle, timing/finality. Это не закрыто данным пакетом.
Для A5 общий baseline должен отдельно включать web-тесты и wallet cycle:
полный профиль backend сам по себе не покрывает browser/Claim.

Окончательная проверка 03.10.2026:
- `node --test web/claim-journal.test.cjs` — 7/7 PASS после последней правки engine.
- `node --test --test-name-pattern='HK browser' web/claim.test.cjs` — 1/1 PASS:
  настоящий 30s refresh, смена суммы/сети/аккаунта без отправки, успешный Claim,
  receipt/reload, stale и mobile layout. Первый повтор также выявил недостающее
  ожидание preflight перед сменой сети в тесте; исправлено.
- Первый адресный набор `node --test web/claim.test.cjs web/claim-journal.test.cjs web/site.test.cjs web/wallet.test.cjs web/overview.test.cjs`
  подтвердил остальные 29 сценариев. После него engine дополнен проверкой current
  сразу после receipt; journal и browser перепроверены отдельно. Полный RC не заявлен.
- UI ручного импорта hash отдельно в браузере не прогонялся; логика recovery покрыта
  адресными тестами unknown/submitting/pending, неверного отправителя и receipt.
