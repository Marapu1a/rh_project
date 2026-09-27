# Публичная сеть: timing и граница cutoff

28.09.2026. Read-only исследование, публичные транзакции не отправлялись.

## Измерения

[Сохранённые наблюдения](../research/public-deployment/timing-2026-09-28.json):
12 ответов двух RPC, 6 последовательных выборок за примерно 80 секунд.
RPC: https://rpc.mainnet.chain.robinhood.com и публичный Blockreq.
Сеть 4663. Finalized lag 919–1000 секунд; разница latest/finalized 9139–9923 блока.
Это короткая выборка, не верхняя граница задержек и не доказательство consensus finality.
HTTP beacon сохранён, но его BLS подпись в этом пакете не проверялась.

Повторить read-only сбор в новый файл:
`node scripts/rng-timing-survey.cjs .local/logs/new-survey.json https://rpc.mainnet.chain.robinhood.com https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public`

Рабочий timing-кандидат: lead1800s, clockLag30s, clockAhead5s,
finalizedLag1200s, beaconLag15s. Во всех наблюдениях диагностически проходит;
fork lead60s не проходит. Кандидат НЕ утверждён для deployment: наблюдения короткие,
будущая задержка может превышать порог, тогда worker должен ждать.
Short21600s и Monthly2592000s не меняются. Адреса нового deployment пока не выбраны.

## Подтверждённый блокер

`buy-policy-runtime.cjs` допускает cutoff только до finalized checkpoint.
`local-promo-scheduler.cjs` использует этот checkpoint для подготовки.
Но `ShortDatasetPreparation` и `MonthlySettlement` требуют подлинный completed cutoff
не старше256 L2 blocks через `ChainBlocks`/ArbSys. Измеренные finalized blocks слишком стары.
Увеличение RNG lead этого не исправляет. Нельзя просто снять local guard или hash check.

Контрактное окно относится к begin: уже закреплённый cutoff может состариться до seal.
Это подтверждено существующим Nitro тестом обоих контроллеров после mining >256 блоков.
Данный тест не доказывает корректность будущего публичного worker.

## Следующий ограниченный пакет

Спроектировать и реализовать отдельные стадии provisional begin → finalized validation → freeze:

1. Быстро закрепить свежий completed cutoff с существующей проверкой hash/возраста.
2. Сохранить неизменяемые cutoff и snapshot; до finality не замораживать призы и не запрашивать RNG.
3. Перед freeze проверить каноничность закреплённого блока, finalized покрытие,
   BUY policy/history и соответствие dataset независимо от предварительной подготовки.
4. Reorg/mismatch/unknown send должны давать явное ожидание/отказ; никаких reroll/reset
   и автоматического переноса cutoff. Отдельно проверить жизненный цикл невалидного proposal,
   чтобы provisional begin не создавал вечную блокировку.
5. Проверить скорость begin:256 блоков здесь примерно десятки секунд. Полный scan
   нельзя считать укладывающимся в это окно. Возможно, сначала понадобится incremental indexer
   или отдельная фиксация cutoff до построения dataset; это ещё не принятое API.

Нельзя молча ослаблять finalized admission BUY policy. Предварительная стадия должна
быть явно отделена от окончательного допуска. Публичное исполнение остаётся blocked.

## Проверки

28.09: `node --test test/rng-timing-survey.test.cjs` —4/4, offline evidence/диагностика/границы.
`node --test --test-name-pattern="freeze/terminal|authentic completed" test/nitro-blocks.test.cjs`
—2/2 с существующим SHA-проверенным RH_TEST_ARTIFACT, без изменения contracts.
Подтверждены authentic cutoff ages1–256 и поздний seal обоих controllers.
Адресные проверки, не полный набор и не публичный deployment/fork прогон.
