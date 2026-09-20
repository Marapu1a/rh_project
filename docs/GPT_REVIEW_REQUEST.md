# Обращение к GPT — локальный coordinator и безопасный restart

20.09.2026. Прочитай текущий commit и укажи hash. Полностью перезапиши
`docs/GPT_REVIEW_RESPONSE.md`. Это независимое ревью, не инструкция автоматически
менять код или продуктовые правила.

## Контекст и решение

После реализации выполнена собственная [самопроверка и оценка переносимости](LOCAL_REVIEW_AND_PORTABILITY.md).
Код coordinator с 571c068 не менялся; актуальные CURRENT_CONTEXT/ROADMAP очищены от
промежуточных противоречивых статусов. Отдельно отмечены ops budget, state/config identity
и сетевые зависимости. Учитывай эти ограничения, не принимай план за реализованные APIs.

Строим связанный локальный скелет, затем укрепляем production-границы. Призы USDG,
Short каждые 6 часов и Monthly, средства проекта отделены от призовой custody.
Тестовая экономика не утверждает реальные creator shares. Никаких новых proxy,
withdraw/reset/reroll или изменений Solidity в этом шаге.

Предыдущий commit e537b9c исправил stale error context и остановку всего scheduler
на unknown tx. В ответе fee7bd2 блокеров не было, следующим шагом предложен coordinator.
Мы согласились, но добавили важное требование: простой restart процесса не доказывает,
что неизвестная транзакция разрешилась. Поэтому нужен сохраняемый pending marker.

## Что реализовано

- `local-promo-coordinator.cjs` вызывает prize-flow, затем Short/Monthly scheduler
  последовательно, с общим provider и проверкой совпадения assets/vault.
- Config включает оба jobs/config, адреса signers и путь scheduler state. Используем
  существующий checksum/config-bound atomic state + lock helper; coordinator state
  отдельный. Exclusive ownership signers — явное локальное допущение.
- Общий `sendLocalTransaction` получил опциональную AsyncLocalStorage boundary.
  После estimate ДО broadcast сохраняем worker/action/target/data; после ответа RPC —
  hash/from/nonce. Confirmed receipt исходной tx снимает pending, хранит lastResolved.
  Standalone workers не включают эту boundary и сохраняют прежнее поведение.
- Unknown в любом контуре останавливает оба. При новом запуске известный hash проверяем
  через receipt и canonical blockHash. Pending/неизвестный hash запрещает sends.
  Hashless crash между broadcast и записью hash тоже остаётся заблокированным.
- Definite rejection сохраняет существующую изоляцию recipient/Short/Monthly.
  Повторный проход читает реальные credits/balances/controller state; новая порция
  TOKEN или новый collect разрешены, повтор уже оплаченного долга/того же begin — нет.
- CLI `run-local-coordinator.cjs`: one-shot или watch по job.pollSeconds, SIGINT,
  structured result, exit 1 при blocked/error. `complete` означает завершённый проход,
  а не завершённые розыгрыши: ожидание seed/schedule нормально.

## Честные ограничения

Это небольшой local pending marker, не полноценный production journal. Нет signed-raw
transaction WAL, replacement recovery, multi-process/distributed signer lease,
production finality или гарантии сохранности при потере диска/state.

State lock защищает только один path. Нельзя параллельно запускать standalone workers
или другой state path с теми же signers. Stale lock после SIGKILL и hashless unknown
требуют диагностики; force-clear/автоматического retry не добавляли. Проверка pending
nonce не считается доказательством отсутствия прежней отправки.

Project gas budget решили оставить следующим отдельным шагом. Live DEX/price guard,
реальные PAIR bindings и RNG также вне текущего пакета.

## Что проверить

1. Есть ли путь к новому send после unknown, включая restart/abort/storage failure?
2. Корректны ли границы before broadcast / hash persistence / confirmed receipt?
   Не теряем ли исходную неопределённость или не снимаем ли pending слишком рано?
3. Достаточны ли текущие локальные deployment/config/signer bindings для заявленного scope?
4. Не сломана ли изоляция definite rejection и поведение standalone workers?
5. Есть ли воспроизводимый double pay/swap/forward/freeze/begin после mining исходной tx?
   Отличать повтор прежних денег от обработки остатка или нового поступления.
6. Есть ли узкий блокер перед отдельной работой над project gas budget?

Не расширяй этот шаг до production framework. Если находишь дефект, укажи конкретный
сценарий, последствия и минимальную правку. Отдельно укажи выполненные тобой проверки.

## Проверки

Добавлено семь интеграций: общий signer; pending prize; pending draw; abort после send;
hashless unknown через restart; definite recipient failure + lock + pre-abort;
настоящий CLI + config mismatch/corrupt state.

`npm test`: **244/247**, ~1142 s. Все прежние **240/240** прошли. Три новых restart
сценария упали из-за undefined optional metadata: checksum учитывал отсутствующее в JSON
поле. Исправлено исключением undefined перед сохранением diagnostics. Это не ошибка
классификации транзакций и не поблажка timeout; timeout не меняли.

После исправления `node --test --test-concurrency=1 test/local-coordinator.test.cjs`:
**7/7**, fail 0, ~144 s. Полный набор после этого локального fix не повторяли.
Logs локально: `.local/logs/coordinator-full.log` и `coordinator-final.log`, в git не входят.
