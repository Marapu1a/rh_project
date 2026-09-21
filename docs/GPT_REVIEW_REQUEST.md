# Review — local native refill planner

21.09.2026. Прочитай текущий commit, укажи hash и полностью перезапиши GPT_REVIEW_RESPONSE.md.
Текущий контекст/план — CURRENT_CONTEXT.md, ROADMAP.md; подробный API — LOCAL_NATIVE_REFILL.md.

## Scope

Чистый `planNativeRefill(input)` + `refillDomainHash`, scripts/local-native-refill.cjs.
Нет RPC, signing, transfers, reserve или mutation ledger. Не включённое автопополнение.
Данные anchor/history/authority пока доверенные inputs. Реальный bootstrap executor — следующий шаг.
Solidity, prize math, FeeRouter shares, RNG/swap не менялись.

Source — отдельный BOOTSTRAP_NATIVE / PROJECT_NATIVE account с уже имеющимся native.
Это не конверсия TOKEN/USDG и не доказательство provenance funds. Явные protectedAddresses
приходят из доверенного manifest; призовые addresses запрещены и источником, и получателем.
Self-funding/source as execution payer пока не поддерживается. Изменений permission model нет.

## Математика

Reuse evaluateBudget: counts/one payer/RNG fee/floor. По адресу low=max(required,lowWatermark),
target=max(required,target). Низкие observations не уменьшают BASE; persisted monotonic
observations между вызовами обеспечивает будущая integration с coordinator, не pure function.

Недофинансированные obligations имеют приоритет. Пока таких адресов несколько, первому
идёт только critical deficit. Последний critical можно довести до target, затем buffers.
Один transfer на план, после receipt — fresh plan. Lexicographic tie-breaking.
Caps включают value+conservative gasReserve, источник сохраняет minimumBalance.
Частичная сумма допускается, fundingReadyAfter=false до покрытия всех обязательств.
fundingReady — только native, не разрешение freeze/send; readiness остаётся отдельной проверкой.

Period фиксируется по anchor timestamp. Last refill cooldown не обнуляется на границе периода.
History/domain mismatch, pending, stale head не дают transfer; дорогой gas ждёт.
History/domainHash обязателен. Static config change не сбрасывает counters: до отдельной
миграции новая policy/source/network приводит к blocked. ops settings hash отдельный.
DecisionKey — fingerprint, не полноценная идемпотентность и не replacement nonce.
Optional refill blocked при fundingReady=true не должен сам остановить обеспеченный draw.

## Lock и окружение

Двойные failures возвращают AggregateError: primary cause + cleanupErrors, сохранены
code/stage/transactionHash/definiteRejection. Unlink пробуется даже при cleanup close error.
Одиночная ошибка сохраняет прежнее поведение. Добавлены fault tests write+close и action+unlink.
Документация требует постоянного локального runtime volume вне workspace sync для state/lock.
Calibration commit/dirty/full generator+tool versions provenance пока не улучшали;
это явно отмеченный открытый хвост, не переобъявленный stable baseline.

## Проверки

39/39 planner/budget/lock/transaction (2.4 s), 3/3 coordinator targeted (61 s).
Команды в LOCAL_NATIVE_REFILL.md. Полный npm test не запускался.

## Вопросы

1. Не пропускаем ли gas/caps/source floor/shared-address liability? Корректна ли очередность
   critical deficit перед buffers и поведение partial transfer?
2. Достаточно ли явно отделены pure trusted inputs от RPC/authority/durable ledger enforcement?
3. Не потерял ли AggregateError транзакционную классификацию, нужную существующему coordinator?
4. Ближайший bounded step: bootstrap-native executor, explicit source signer, повторные
   anchor/balance/receiver/estimate checks, durable intent/hash/nonce/receipt и period ledger.
   Как минимально соединить это с существующим coordinator, не писать второй несовместимый recovery?
5. Смена policy сейчас fail-closed. Для будущей гибкости нужна явная migration с сохранением
   spent/pending/cooldown, а не сброс file; видишь ли минимальную безопасную схему?

Не добавлять prize withdrawal, автоматический stale-lock reset, reroll, proxy или real swap
в этот review. Unsupported envelope и real network fees — отдельные границы; planner не
обещает универсальный completion bound.
