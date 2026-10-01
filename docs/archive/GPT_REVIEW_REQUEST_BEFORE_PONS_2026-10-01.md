> Historical request; superseded by [current request](../GPT_REVIEW_REQUEST.md). Retained for context, not instructions.

# Постоянное обращение к GPT: финальная проверка QIANQI

30.09.2026. Проверь актуальный main; укажи точный HEAD в ответе. Новый пакет идет
после50f925c: опубликованный read-only frontend/API и подготовка запуска через PAIR.
Пользователь просит проверить кодовую базу и логику, воспроизвести полный процесс
и провести финальное тестирование до реальных финансовых операций.

## Задача и способ работы

Начни с CURRENT_CONTEXT, текущего ROADMAP и PRODUCT_SPEC. Затем прочитай
PUBLIC_STATUS_API, LAUNCH_PREPARATION и нужные модули по README.
Твоя задача сейчас — static review и конкретный план финальной проверки;
Codex выполняет тесты/сборки/fork здесь по REVIEW_TESTING. Не устанавливай зависимости,
не запускай тесты в своем окружении и не заменяй review отладкой окружения.
Не делегировать реальное mainnet исполнение, не отправлять транзакции.

Не ограничивайся последним diff: пройди связи PAIR → collector → vault → indexer →
entries → Short/Monthly → drand → settlement/claim → API → browser. Не меняй
принятые экономические правила ради удобства теста. Не обещай production readiness
на основании отдельных зеленых fixtures. Покажи реальный пользовательский сценарий
для каждого дефекта, место в коде, последствия и минимальное исправление.

## Что есть сейчас

- qianqi.site: HK frontend в корне, HTTPS,404; исходный дизайн сохранен в репозитории.
- qianqi-api на сервере работает в standby awaitingDeployment: это НЕ запущенный
  индексатор/автоматика. Buy/Claim/public sends не включены.
- public-observation/public-status: snapshot reserves/draws/history, asset decimals,
  wallet frozen/open, stale/unavailable; браузер не подписывает финансовые операции.
- prepare-pair-launch: unsigned DRAFT collector+PAIR requests, live eth_call/estimate;
  metadata URI пока НЕ опубликован, protection/salt/identity не финальны.
- Локальная последовательная репетиция collector→PAIR успешна, creator fee3%,
  получатель collector проверен. Это не сквозной Promo proof и не mainnet deployment.
- Creator/governor/project5%:0x098afA6731239a00CE0aff669aaefD16b7C72114.
  Executor отдельный, custody/operations еще не настроены.
- Первая покупка: лимит101USDG включая торговые комиссии, gas отдельно. Прямой
  поддержанный USDG route после admission/indexer. Встроенный Developer Buy и
  произвольный PAIR UI router НЕ считаются поддержанными текущим decoder.
- PAIR UI можно обойти через те же контракты; регистрация receipt/indexing в PAIR
  и отображение токена еще требуют проверки. Не путать Launch V2 и Infinity.

## Приоритеты review и тестового плана

1. Deployment: nonce/predicted TOKEN/collector, metadata commitment, source/proxy
   pins, актуальные opening цены и orientation, fee recipient, fresh simulation,
   подпись правильного calldata, восстановление после каждой из нескольких tx.
   Проверить что draft нельзя случайно представить финальной кнопкой отправки.
2. BUY: payer=recipient, реальный net USDG debit с refunds/fees,100USDG threshold,
  101USDG →1Short+1Monthly+carry1 при точном расходе; перенос carry, несколько
   кошельков, sell/plain transfer/unsupported router не добавляют билеты.
   Проверить admission anchor: первая покупка не должна оказаться раньше сканирования.
3. Funding:90/5/5 от фактических комиссий, округление, source drift, repeat pull/pay,
   спонсорское funding, разделение native ops и frozen/claimable денег.
4. Оба цикла: настоящие public wrappers и принятая математика;6h/30days, минимумы,
   Short weights7:4:2:1x7/minimumUnit5, Monthly75/25/Current>=100/Next100,
   frozen dataset, drand exact round/proof, win/no-win, выплаты и delayed claim,
   расход попыток, отсутствие дублей, повторного random/reset и утечки reserves.
5. Restart/recovery: после отправки до receipt, unknown send/nonce reconciliation,
   reorg/finality, RPC unavailable/stale, нехватка газа→ожидание/пополнение,
   one-writer locks, остановка/перезапуск indexer и исполнителей без двойных выплат.
6. UI/API: chain/account/provider switches, поздние ответы, frozen против open,
   суммы/decimals/links, history paging, stale/null vs zero,503,404 и mobile.
7. Production boundaries: public execution сейчас закрыт; archive RPC не выбран,
   immutable timing/notice/gas/native настройки не утверждены. Не снимать guards
   механически. Назвать конкретную недостающую реализацию, если она требуется.

## Проверки и доказательства

Сводка с командами и ограничениями: FINAL_TESTING_HANDOFF.md. Нового полного
baseline еще нет. На этой финальной контрольной точке полный test:review оправдан
накопленным сквозным пакетом, но не заменяет сценарий реального запуска.
Предложи последовательность: исправления→адресные regressions→полный baseline
на commit→воспроизводимый последовательный launch/BUY/двойной draw/recovery прогон.
Где нужны time travel, ArbSys shim, test funds или иные допущения — указать явно;
не переносить их в public config. Старые fixtures с100%Promo/иной вероятностью/
backdated constructors не доказывают соответствие текущему продукту.

## Формат ответа

Обнови GPT_REVIEW_RESPONSE.md с проверенным HEAD:
- Подтвержденные дефекты: severity, file:line, trigger, effect, minimal fix.
- Непроверенные риски отдельно, без выдачи гипотезы за дефект.
- Матрица сценарий → существующий test/command → пробел → ожидаемый результат.
- Один ближайший ограниченный пакет для Codex, затем очередность остальных.
- Явные критерии допуска к публичному запуску и остаточные ограничения.
Если дефектов не найдено — сказать прямо; это не означает, что тесты уже выполнены.
