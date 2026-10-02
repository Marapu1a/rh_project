# G02: разбор ответа GPT

01.10.2026. Получен review b9b7e04 для558beb9. Сверены schedulerConfigFor,
indexOnce/readSnapshot, API prepare и observePublic. Только статическое чтение;
новые tests/RPC не запускались, реализация не менялась.

Подтверждается: полный config hash различается из-за publicStatus. Также ошибка
observePublic сейчас попадает в общий catch, переводит индекс в waiting и мешает
новым jobs. Старые данные сохраняются, но успешный BUY replay этого прохода не
публикуется. Это связность обработки отказов, а не доказанная потеря денег.

Принимаем как рекомендуемый следующий дизайн минимальный builder двух результатов:
старый schedulerConfig с прежним hash и indexConfig с publicStatus=true. Общий
источник параметров, один writer, один snapshot, два читателя; не один произвольный
объект для всех назначений. Новый indexConfig передаётся scheduler reader runtime
аргументом, не записывается в identity parent/jobs. Проверять равенство ожидаемых
конфигов полностью, с единственным разрешённым отличием publicStatus; не ограничиться
неполным whitelist критических полей. Возвраты изолировать от последующей мутации.

Отказ public projection требует отдельной классификации: только достоверно
распознанный временный transport/read outage допускает публикацию BUY snapshot
без overview. Code/binding/decimals mismatch, reserve deficit, ABI decode и неизвестная
ошибка не превращаются автоматически в optional timeout. Обязательные BUY/rewards
проверки остаются обязательными. У unavailable projection нет старых сумм, привязка
head/hash/manifest и API generation проверяются явно. Ошибка самого API reader
и ошибка writer observePublic — разные места, их нельзя смешивать в тесте.

Переход: остановить writer/readers; архивировать и пересобрать только производный
индекс по старому statePath с новым indexConfig. Не менять parent/scheduler/RNG
configHash, pending или job identity. Предварительно проверить доступность истории
и точную процедуру отката без запуска двух писателей. Unknown transaction outcome
разрешается сверкой с цепочкой, не повторной отправкой. В этом шаге никакой переход
реального состояния не выполнялся.

Следующий пакет: builder/validator + runtime reader wiring и тест неизменности старого
hash; затем typed projection status/errors; связанный тест writer+API+coordinator.
Проверить stale/behind, wrong identity, rename/reorg/restart, projection outage и
integrity failure, старые frozen/claimable и known/unknown pending. Full suite пока
не запускать автоматически; объём расширяется по фактическим правкам общей логики.

[Полный ответ](GPT_REVIEW_RESPONSE.md), [запрос](GPT_REVIEW_REQUEST.md).
