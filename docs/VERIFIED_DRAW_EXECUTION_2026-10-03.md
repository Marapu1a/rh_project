# Проверенный набор участников в памяти исполнителя

03.10.2026, тестовый контур поверх `7c42ee3`. Исправление повторной работы из
[нагрузочного исследования](DRAW_CAPACITY_FOLLOWUP_2026-10-03.md).
Контракты, математика, RNG, лимиты отправок и production не менялись.
[Машинные результаты и hashes](evidence/VERIFIED_DRAW_EXECUTION_2026-10-03.json).

## Повторный замер на10000 разных кошельков

| Шаг | До изменения, секунды | После, секунды | getTransaction до → после |
|---|---:|---:|---:|
|Short холодный|18.431|9.574|315→158|
|Short следующий|18.855|0.740|315→1|
|Monthly холодный|9.919|9.277|159→158|
|Monthly следующий|9.976|0.652|159→1|

Единица getTransaction на тёплом шаге — новая отправленная транзакция, а не старый
dataset. Это **не** один RPC-запрос вообще: сохраняются проверки контракта,
блока, bindings, nonce и receipt. Проверка anchor идёт через raw provider.send,
поэтому не входит в счётчик provider.getBlock данного benchmark.

Это единичные cold/warm наблюдения двух исполнителей на local EVM, не p95 и не
скорость всего coordinator/публичной сети. Каждый шаг обработал64 участника,
nextChunk вырос ровно на1. Полный цикл на10k этим замером не запускался;
сквозной результат/бухгалтерия проверены отдельными адресными сценариями ниже.
Финальный сырой отчёт: `.local/logs/draw-worker/10000-734SAr/report.json`.
Предварительный замер до правки удержания active proof сохранён отдельно:
`.local/logs/draw-worker/10000-6KqGxU/report.json`; в таблице именно финальный.
После замера добавлено сохранение proof при обычной pre-broadcast budget-паузе;
успешный путь benchmark не менялся, эта ветка отдельно проверена. Evidence
разделяет hashes файлов на момент замера и окончательного пакета.

## Что изменилось

`verified-draw-cache.cjs` хранит максимум один job Short и один Monthly на объект
provider в памяти процесса. Новый job заменяет старый; закрытие процесса теряет
все доказательства. В state-файлах нет нового признака «verified».

Каждый вход сравнивается по SHA-256 канонического содержимого **всего** job,
включая заявленный commitment. Изменённые bytes требуют обычной полной валидации.
Внутренняя копия глубоко заморожена, входной объект вызывающего кода не используется
как изменяемый источник проверенных участников. Проверка старых terminal jobs
при обходе scheduler не вытесняет доказательство активного draw.

Холодная проверка публикации:

1. Выбирает блок через raw RPC, сверяет привязку proposal/month на этой высоте.
2. Читает полный список публичных публикаций до этого блока, проверяет calldata,
   порядок, commitments, root/count/attempts и соответствие snapshot. Проверки
   publication state/chunk hashes выполняются с blockTag. Tx.blockHash/number
   обязаны соответствовать log.
3. Повторно проверяет канонический hash блока; при изменении ничего не кеширует.

Тёплый шаг продолжает проверять runtime/reverse bindings, chain/instance/policy,
cutoff, каноничность блока доказательства, актуальный proposal/month и progress.
Число chunks и hash конкретной следующей порции читаются из контракта. Порция
берётся из неизменяемого набора по фактическим границам проверенных публикаций.
Смена ветки, ошибка RPC или отказ проверки очищают соответствующий slot.
После ошибки нельзя продолжить по старому флагу; следующий вход холодный.
Исключение — штатный `LOCAL_BUDGET_WAIT` на стадии `estimate`, до broadcast:
пауза по лимиту/газу сохраняет proof, но следующий вход всё равно проверяет anchor.
Неопределённая отправка под это исключение не попадает.

Во время публикации корень prefix считается инкрементально. При уменьшении
on-chain count он пересчитывается заново; сравнение с контрактом сохранено.
Перед finish полностью вычисляется независимый результат и сверяется с контрактом.
Его повторное использование привязано к context/seed и параметрам результата.
Standalone `short-settlement.recover` остаётся полным независимым recovery-путём.

Отправки по-прежнему идут через существующие receipt/journal/nonce guards.
Кеш не даёт права начать draw без независимого BUY replay и не заменяет lock
координатора. Неизвестный исход отправки не разрешает повторную отправку.

## Проверки

15 уникальных адресных сценариев PASS; финальная правка удержания active proof
дополнительно проверена3 повторными сценариями, pre-broadcast budget pause — ещё1
повторным расширенным сценарием (не19 уникальных).

- `verified-draw-cache.test.cjs`: оба вида draw до finish и сохранение бухгалтерии;
  тёплый шаг без чтения старых tx; потеря кеша с полным перечитыванием и сохранением
  nextChunk; изменённый job/пересчитанный commitment; immutable copy; неверный
  live chunk hash; реальные evm_revert/replacement block; изменённый runtime;
  смена anchor прямо во время полной проверки; binding/seed identity и обход
  старого job без вытеснения active proof; две pre-broadcast budget-паузы без
  повторного чтения публикаций и без отправки для каждого вида draw.
- `local-buy-cycle.test.cjs` и `local-executor-stability.test.cjs`: BUY→оба draw,
  win/no-win/claims, cutoff и abort/receipt timeout.
- Адресные соседние сценарии: missing index при frozen draws, policy publication
  reorg, независимый pre-begin replay против поддельного job, calldata recovery.

Потеря кеша моделируется clear в том же процессе: это **не** новый тест аварийного
завершения ОС. Реальная ветка меняется через local evm_revert; смена anchor во
время построения доказательства отдельно моделируется fake provider.

Команды (использован один свежий compile artifact с проверкой SHA-256):

```text
node --test --test-concurrency=1 test/verified-draw-cache.test.cjs test/local-executor-stability.test.cjs test/local-buy-cycle.test.cjs
node --test --test-concurrency=1 --test-name-pattern="persistent indexer feeds|policy publication reorg|independent pre-begin replay|complete data is recoverable|anchor changing during cold" test/cutoff-scheduler.test.cjs test/local-scheduler.test.cjs test/short-dataset.test.cjs test/verified-draw-cache.test.cjs
node --test --test-concurrency=1 --test-name-pattern="anchor changing during cold|edited job|independent pre-begin replay" test/verified-draw-cache.test.cjs test/local-scheduler.test.cjs
node --test --test-name-pattern="edited job" test/verified-draw-cache.test.cjs
node scripts/benchmark-draw-worker.cjs 10000
```

Логи: `.local/logs/verified-draw-targeted.log`, `verified-draw-neighbors.log`,
`verified-draw-final-binding.log`, `verified-draw-worker-final-10000.log`.
Отдельная проверка пауз — `.local/logs/verified-draw-budget-yield.log`.
Первый targeted запуск предшествовал добавлению пятого cache unit-сценария;
он выполнен в neighbors и final-binding. Полного RC baseline этим пакетом нет.

## Что остаётся

Полная холодная проверка и финальный независимый расчёт по-прежнему O(N).
Fingerprint bytes всего job — тоже O(N), хотя не требует EVM ABI/root/replay.
Обход старых jobs и полная запись scheduler JSON пока не оптимизированы.
CLI, создающий новый процесс на каждую порцию, всегда будет холодным; ускорение
предназначено для продолжительно работающего процесса/watch с тем же provider.

Суммарный on-chain gas/число транзакций не уменьшились. Далее — совместный
coordinator throughput при разных лимитах, остановка/возобновление под нагрузкой
и публичные статусы/уведомления задержек. Сайт и боевой сервер не затронуты.
