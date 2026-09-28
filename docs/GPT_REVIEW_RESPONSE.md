# Постоянный ответ GPT — публичные controllers и границы fork

28.09.2026. Независимое ревью `61ef6e3`: сравнил вынесенную логику с прежними Local wrappers, новые контракты, admission, план, RPC/fork evidence. Лично запустил `node --test test/public-controllers.test.cjs test/public-launch-checks.test.cjs test/local-controllers.test.cjs test/cutoff-history.test.cjs`: **16/16**, exit 0, ~31 с. Полный suite, новый live/fork запуск и публичные транзакции в этом ревью не выполнялись.

## Вывод

Содержательного обхода ролей, reentrancy, seed/request binding или защиты старых выплат в переносе в `ShortControllerBase` / `MonthlyControllerBase` я не нашёл. Код Local wrappers перенесён практически дословно; добавлен virtual hook для обязательного cached cutoff у публичного поколения. Его вызывают и begin, и closeEmpty; дальнейшие epoch/schedule/last-terminal проверки остаются в settlement cores. Local wrappers сохраняют `31337` и прежний `minimumUnit=1`; публичный Short получает единицу явно, проходит старую валидацию корзины. Размеры публичных runtime ниже EIP-170, но запас Short всего **1838 bytes** — новые функции там придётся считать, а не предполагать, что влезут.

Constructor checks требуют `4663`, ожидаемые drand profile/chain hash, fee=0 и собственного consumer address. У другого consumer на момент первого deployment достаточно ненулевого отличного адреса: взаимную идентичность и bytecode удостоверяет последующий pinned deployment admission. Это корректная граница для заранее рассчитанных адресов, но **constructor сам по себе не доказывает подлинность adapter**. Публичный inspector проверяет runtime pins/bindings/profile/FINALIZED_CHECKPOINT и всегда возвращает `publicExecutionNotImplemented`; это хороший жёсткий запрет на преждевременный запуск.

Launch plan действительно остаётся неисполняемым: ключевые адреса, роли, экономика, gas, timing approval и archive RPC пусты, `publicExecutionEnabled=false`. Даже при заполнении полей его CLI не выдаёт разрешения. Случайно скормить локальные fixture адреса как готовый deployment через этот файл нельзя.

## Чего результаты пока не доказывают

- Тест обоих draw/claim использует historical fixture time, синтетические participants и сохранённую BLS signature. Проверка `minimumUnit` отдельно подтверждает передачу значения, но пример полного payout запускается с `1 raw`, **не с утверждённой публичной корзиной**.
- Fork `partial-complete` честно подтверждает deployment байткода и aging обоих checkpoint на форке с настоящим USDG. ArbSys там заменён EDR shim, сроки Short/Monthly не истекли, reserve=0; full draw, реальные BUY, finality и drand на Nitro им не проверены. Его ~49k gas на checkpoint также не цена исполнения на Nitro.
- RPC evidence показывает ограничение инфраструктуры уже сейчас: официальный endpoint отказал в historical state на sampled finalized; публичный Blockreq прочитал finalized и −10000, но отказал на −864000 (лимит 32768). Это наблюдения конкретных endpoints, а не доказательство возможностей всех провайдеров. Официальная [документация Robinhood](https://docs.robinhood.com/chain/connecting/) рекомендует archive endpoint для исторических чтений и отдельный provider для production. Остаётся проверить **реальный `cutoffHashes` на finalized blockTag** после deployment, а также историю с первого BUY, не только storage существующего USDG.

## Ближайший шаг

Сначала зафиксировать **доступный archive RPC и критерий допуска**: finalized и старые blockTag для code/call/storage, диапазоны логов BUY от genesis проекта, повторяемость после restart и rate/cost при двух draw. Затем подключать отдельный public runtime/admission с явным chain4663/Nitro профилем, единым signer и существующим durable unknown-send журналом. Существующие `31337`/loopback guards оставить локальному поколению. Реальные deployment pins, timing и бюджет газа принимать только после этих проверок; `1800s` пока кандидат. Перед релизом нужен сквозной Short + Monthly + empty/recovery на реальной интеграции.

Кодовый пакет выглядит аккуратным и делает следующий шаг возможным; **публичная отправка всё ещё закрыта намеренно и по делу**.
