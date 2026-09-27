# Review: Infinity → Short → USDG fork

27.09.2026. После `03eb41e` выполнили общий денежный путь, а не отдельные fixtures.
[Результаты и ограничения](INFINITY_PAYOUT_PROOF.md).

Один новый Infinity TOKEN/USDG, creator fee3%, один collector и один draw vault.
Реальные fork BUY/SELL fees11.934252USDG поступили в резервы; внешнего prize top-up нет.
Две покупки после genesis дали2entries+6.60carry без регистрации. Scheduler выполнил
saveJob/begin/publish/seal. После freeze дождались реальной подписи закреплённого
round20996227; обычный drand worker сделал prove/deliver. Scheduler process/finish,
затем harness claim:2.333331USDG победителю,9.600921 осталось в vault. Current/Next
не изменились, Short attempts погашены, Monthly2open. Повторный claim отклонён,
funding/delivery rerun0tx. Final replay из сохранённых полных блоков совпадает.

## Найденный дефект

Publication verification Short/Monthly и Short recovery запрашивали events с блока0.
Fork уходил за логами всей сети в upstream, который отказал. Исправлено на cutoff+1:
публикации по контракту возможны только после cutoff. Root/calldata/order/count checks
сохранены. Две регрессии запрещают старую историю; обе прошли на обычном bytecode.
Соседний local-buy-cycle1/1 прошёл оба контроллера, win/no-win, replay и claims.
Saved evidence4/4 (2новых+2старых). Full suite не запускался.

## Не скрываем допущения

Исторические headers доступны, но полноценный fork state за8часов — нет на проверенных
public RPC. Поэтому быстрый harness компилирует in-memory override только двух
начальных constructor timestamps ShortRulesEpochs (−21601s). Solidity-файлы не менялись,
но Short runtime теста отличается от standard runtime; это НЕ доказательство ожидания
6часов на production bytecode. Независимый replay не ослабляли.

Buyer USDG storage-funded, sandbox ETH, 100% fees→Promo, почти гарантированные test odds,
бюджет5USDG. Timing=[60,30,5,20,15] test-only, не согласованная production policy.
Pre-freeze freshness не обходилась: clockLag5s первоначально корректно дал wait,
после расширения test bounds новый fork прошёл с живыми часами и HTTP.
Нет mock подписи, reroll или подбора seed. Доставка ждала будущую подпись около минуты.
Все sends только31337. Claim сделан harness, общий continuous payout coordinator пока нет.

## Вопросы

1. Нет ли ошибки в cutoff+1 для допустимого begin/publish transport текущих контрактов?
2. Достаточно ли evidence для утверждения именно денежной цепочки с указанными
   ограничениями? Где нужны дополнительные assertions, а не новый большой subsystem?
3. Следующий bounded пакет: объединить последовательное выполнение существующих
   funding/scheduler/drand workers под общим nonce/budget admission либо сначала
   аналогичный Monthly e2e. Что действительно блокирует безопасную интеграцию?

Не переутверждать economics/timing и не добавлять proxy/admin/reset. Сначала реальные
дефекты и необходимый следующий шаг, без попытки закрыть все редкие случаи сразу.
