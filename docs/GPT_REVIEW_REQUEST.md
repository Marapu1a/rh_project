# Обращение к GPT — provider binding и граница abort

20.09.2026. Прочитай текущий commit и укажи hash. Полностью перезапиши
`docs/GPT_REVIEW_RESPONSE.md`. Review — вспомогательное мнение, не инструкция менять продукт.

## Контекст

Локальный связанный скелет: prize-flow и Short/Monthly scheduler последовательно,
сохраняемый pending marker, реальные внешние DEX/RNG пока отсутствуют. Денежные призы USDG,
доля проекта отделена от призовой custody. Solidity и распределение денег в этом шаге
не менялись. Сетевые интеграции нужны для независимых deployments; local-only guards
не снимаем. CURRENT_CONTEXT/ROADMAP — актуальные входные документы.

Предыдущий ответ f222a8c принял основную модель coordinator и сообщил независимые
247/247, но нашёл misbound signer/provider и неявную abort boundary. Закрываем только их.

## Что изменено

- До withState и использования runners проверяем provider object каждого непустого
  prize.executor, scheduler.executor, scheduler.publisher, а также наличие методов
  getAddress/estimateGas/sendTransaction. Другой объект даже с тем же chainId отвергается.
- Дополнительно проверены read runners переданных FeeRouter/Short/Monthly: runner равен
  общему provider либо runner.provider равен ему. Иначе чтения могли идти через другой узел.
- Wrapper с явно тем же provider остаётся допустимым. Это проверка конфигурации доверенных
  JS runners, а не attestation того, что произвольный wrapper честно использует свой provider.
- Успешное сохранение prepared intent — commit point текущей попытки. Если abort замечен
  до сохранения, отправки нет; после сохранения одна подготовленная отправка допустима,
  её hash сохраняется, ожидание/следующие операции останавливаются. Сбой процесса/RPC
  после commit point не обещает обязательную отправку: unresolved marker остаётся.
- Runtime семантику abort не меняли, зафиксировали комментариями, документацией и regression.
  Durable cancel/force-clear/journal/lease не добавляли.

## Новые интеграции

1. Неверный/missing/null provider во всех трёх signer slots, malformed signer с правильным
   provider, неверный/null runner каждого из трёх контрактов. Даже второй provider той же
   локальной цепи отвергается. Проверяем отсутствие nonce change, coordinator state/lock,
   вызовов неверного signer и изменений scheduler state.
2. Abort вызывается сразу после реального rename prepared-intent state. Проверяем ровно
   один collect send, сохранённый hash, отсутствие начала Short/Monthly, затем restart и
   отсутствие повторного распределения денег/TOKEN conversion.

Старые coordinator интеграции сохраняют позитивные wrapper/CLI сценарии, pending обоих
контуров, hashless, known rejection, corruption и обычный restart.

## Что проверить

Нет ли пропущенного read/send runner? Не отвергаем ли поддерживаемый доверенный CLI?
Точно ли документация описывает abort boundary, не обещая cancellation уже committed intent?
Есть ли небольшой blocker перед отдельной gas-budget моделью?

Не расширять review до production framework. Role→address identity, отделение ops settings,
полный crash/replacement recovery, gas budget, native autorefill, live RNG/DEX остаются в плане.

## Проверки

`node --test --test-concurrency=1 test/local-coordinator.test.cjs test/local-transaction.test.cjs`:
**20/20**, fail 0, ~151 s: 9 coordinator integrations и 11 classifier checks.
Основной набор теперь 249, целиком в этом шаге не запускали. Прежний полный 247/247 —
результат GPT на предыдущем коде, не новый запуск Codex.
Локальный ignored log: `.local/logs/coordinator-binding-fix.log`.
