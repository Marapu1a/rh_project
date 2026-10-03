# Coordinator и сохранение dataset: ограниченная проверка

03.10.2026, пакет поверх `4094adf`. Только локальные стенды; production не менялся.

## Что измеряем

Две отдельные проверки, результаты которых нельзя складывать в общий TPS:

- `benchmark-pons-coordinator.cjs`: настоящий `runPonsAutomation`, два уже
  замороженных BUY-derived draw из Pons fork rehearsal, реальные drand proofs.
  Лимиты отправок 2/8/32, одинаковый снимок цепочки перед каждым вариантом.
  Это небольшой набор участников, не нагрузка на 10k/100k адресов.
- `benchmark-scheduler-storage.cjs`: два синтетических job по 1k/10k участников,
  реальные checksum/load/save и проверка совпадения с private cache. Без RPC,
  BUY admission или исполнения этих jobs. Пять повторов на размер.

Первый стенд копирует журналы в отдельные каталоги `.local/logs`. Только в копии
main journal меняет configHash вслед за maxTransactions; scheduler/RNG identity
не меняются. После варианта откатывает **локальную** цепочку к исходному snapshot;
исходные журналы остаются нетронутыми. Это лабораторное сравнение конфигураций,
не инструкция менять configHash работающего сервиса или откатывать реальные draws.

Каждый вариант останавливается после одной подтверждённой транзакции. Повторный
вызов с отменённым signal не должен отправлять ничего или менять баланс. После
очистки private publication cache выполнение продолжается с файла и цепочки.
Сравниваются resultHash обоих draws, полный invariant vault и nonce. Все hashes
отправок уникальны; число отправок равно приросту nonce. Завершающий idle не платит
повторно. Это graceful stop/resume, не новый process-kill тест.

## Найденная лишняя работа и исправление

Scheduler сохранял весь state, повторно устанавливая `started=true`: до шага
исполнителя и после каждого `progress`. Даже ожидание seed переписывало два
неизменившихся dataset. Для двух наборов по 10k участников файл занимает
4 387 237 bytes; медиана checksum/serialize/write/fsync/rename одного сохранения
в изолированном замере — около 218 ms. Чтение с checksum — около 158 ms,
проверка двух совпавших cached job — около 24 ms. На 1k файл 445 233 bytes,
медиана сохранения около 41 ms. Это Windows/local storage, не оценка сервера.

Расчёт по измеренному размеру: 2 × ceil(10000/64) processing-транзакций ×
2 прежние записи state × 4 387 237 bytes = 2 755 184 836 bytes. Эти примерно
2,75 GB сериализации для одного цикла двух draws теперь не нужны. Это модель
объёма JSON, не измеренный disk/network traffic и не сокращение on-chain calldata.

Теперь сохраняются переходы: первое наблюдение начатой задачи, первый успешный
шаг, удаление устаревшего terminal anchor и новая terminal-проверка. Если
`started` уже true и job не изменился, запись не нужна: прогресс chunks хранится
в контракте, journal транзакций координатора остаётся прежним. Создание job до
первой отправки, locks, checksum, fsync и защиту от reorg не ослабляли.

Новый regression test сначала упал на старом коде: 2 записи вместо 0 при ожидании
seed. После исправления проверяет 0 записей и byte-identical файл при seed wait
и первом processing tick обоих видов, затем обязательное сохранение terminal anchors.

## Результат сравнения лимитов

Fork78980252, по одному BUY-derived участнику в Short и Monthly. Каждый вариант
выполнил 9 оставшихся транзакций, включая первую перед остановкой. После отменённого
вызова повторное продолжение заняло:

| maxTransactions | Проходов продолжения | Всего вызовов с stop/paused/idle | Активное время всех вызовов |
|---|---:|---:|---:|
| 2 | 4 | 7 | 20,19 s |
| 8 | 1 | 4 | 15,30 s |
| 32 | 1 | 4 | 13,36 s |

По одному запуску, без sleep из watch-loop: разница 8/32 не доказывает преимущество
32, оба выполнили оставшиеся 8 транзакций за один проход. При лимите2 обычный
watch добавил бы между четырьмя проходами ещё 3 × pollSeconds; это расчёт,
не измеренные паузы данного стенда. Настройки runtime не менялись.

Оба resultHash, nonce83 и все части vault совпали между вариантами. Остаток
239.088812 тестовых USDG; reserved/claimable0. У каждой копии scheduler state
за весь drain было ровно **2 записи terminal anchors**. Main/RNG transaction
journals продолжали сохраняться до/после отправок. Отмена не отправляла ничего,
idle не дублировал выплату. Счётчики provider methods — вызовы JS API, не биллинг RPC.

Адресные проверки: **9/9 PASS**, без full suite. Включены новая регрессия записи,
исчезновение начатого job после reorg, два цикла и terminal reorg, corrupt/config/lock,
неоднозначные broadcast/timeout/estimate, неизвестный Monthly send и forged pre-begin.

Весь повтор `...-c` завершён exit0 / **PONS_INDEXED_AUTOMATION_PASSED**.
В обычной ветке после сравнения выплачено 107.337115 тестовых USDG. Поздние60+40
оставили по одному OPEN, по86 consumed обоих видов. Ранняя копия всех файлов
восстановлена после выплат: два прохода без отправок, nonce83, balances и ledger
не изменились; fresh API/worker replay прошёл. Ручной wallet-стенд не перезапускался.

[Evidence с SHA-256, счётчиками и командами](evidence/COORDINATOR_CAPACITY_2026-10-03.json).
Сырые отчёты: `.local/logs/pons-coordinator-20261003-c.json` и
`.local/logs/scheduler-storage-nDiCSu/report.json`. Отдельные файлы сравнения
сохранены restore-drill в `.local/logs/pons-cycle-Wf83rn-before-restore/`.
Неуспешные `...-a`/`...-b` и test-before log сохранены отдельно, не объединены с PASS.

## Ограничения и следующая работа

- Лимиты в обычном config не повышены. `runPonsAutomation` ограничивает scheduler
  16 итерациями; один проход drain выполняет не более 32 действий двух scheduler
  lanes, плюс отдельные RNG/claims в рамках общего transaction budget. Если один
  lane уже закончен, этот предел ниже. Нельзя считать maxTransactions=128
  гарантией 128 отправок за проход.
- `--watch` по-прежнему ждёт pollSeconds после прохода, в том числе при полезном
  прогрессе. Активное время функции не включает эти паузы. Удаление лишних
  сохранений не уменьшает gas и число контрактных транзакций.
- Полный load/checksum при запуске scheduler, fingerprint job, terminal history
  и независимая холодная проверка всё ещё растут с размером/историей.
- Следующий пакет: совместный большой набор через scheduler/coordinator и
  отдельный выбор cadence для занятого/ожидающего сервиса. До него не выбирать
  production throughput по маленькому fork-cycle. Новое хранилище пока не внедрено.

## Инфраструктура первого запуска

`pons-coordinator-20261003-a` завершился exit1 **до сравнения лимитов**:
EDR panic при `eth_getCode(0x...0002)` на fork block78971473. Публичный RPC вернул
`historical state ... is not available`; проверенный альтернативный public endpoint
также отказал, указав окно последних 1024 blocks. Запуск не считается PASS.

Для benchmark-флага добавлено раннее чтение реальных code/balance/nonce адресов
precompile 1–10 через локальный fork. Его read-only upstream cache сохраняет
эти ответы до длинного setup и ожидания drand. Ответы не синтезируются; EDR/BLS
и RNG guards не меняются. Это помощь тестовому fork, не архивный RPC для будущего
сервиса. Доступность исторических state-reads для долгого catch-up/restore остаётся
отдельным требованием к RPC; кеш стенда не доказывает её.

Попытка `...-b` также exit1: официальный endpoint не отдал empty-base proof уже
при подготовке свежего fork, до запуска benchmark. Для `...-c` используется
существующая настройка `RH_FORK_RPC_URL` с Blockreq public endpoint. Проверка
на фиксированном блоке подтвердила, что он отдаёт proof, от которого отказал
официальный endpoint. Публичное окно Blockreq ограничено; архивным он не объявляется.

## Воспроизведение

```text
node scripts/pons-collector-fork.cjs .local/logs/NEW.json --coordinator-benchmark
node scripts/benchmark-scheduler-storage.cjs .local/logs/pons-cycle-2dnO0F/automation.json.scheduler
node --test --test-concurrency=1 --test-name-pattern="started jobs do not rewrite|previously frozen job|scheduler persists before|corrupt/config|scheduler isolates|unknown Monthly send|independent pre-begin replay" test/local-scheduler.test.cjs
```

Первый флаг включает существующий restore-drill: indexed curve/pool cycle,
сбор комиссий, поздние покупки 60+40, восстановление старых файлов после выплат
и API replay. Унаследованные допущения: local impersonation/operator,
synthetic USDG, ArbSys shim, сокращённые часы constructor и managed finalized.
Upstream RPC только read-only; BLS/seed не подменяются. Для адресных tests использован
сохранённый compiled artifact через RH_TEST_ARTIFACT/RH_TEST_ARTIFACT_SHA256.
У запуска `...-c` задано
`RH_FORK_RPC_URL=https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public`.
