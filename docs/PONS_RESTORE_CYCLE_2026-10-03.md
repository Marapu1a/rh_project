# Pons: смешанный цикл и восстановление локальных файлов

03.10.2026. Тестовый пакет поверх `12a7dbf`; боевой сервер, ключи и контракты не менялись.
Добавлен флаг `--restore-drill` к существующему fork harness. Реализация runtime
координатора/индексатора/платежей не меняется этим флагом.

## Сценарий

Curve → graduation → pool, сбор комиссий, persistent index, Short и Monthly.
При обоих незавершённых draws снимается копия всей директории стенда, включая config,
индекс и существующие журналы. Writer в этот момент закончил проход, lock/tmp недопустимы.
После freeze покупаем60+40 USDG; обычный перевод TOKEN не должен начислять билеты.
Остановка после drand prove и продолжение сохранены из прежнего цикла.

После завершения обоих draws и выплат проверяется idle без транзакций. Затем вся
актуальная директория переносится в архив, на прежнее место копируется ранний backup.
**Цепочка не откатывается.** Два прохода координатора должны догнать историю и свериться
с контрактами без новых транзакций. Nonce, все части баланса vault, wallets и draws
сравниваются с состоянием до restore. Настоящий HTTP API/worker проверяется после
восстановления двумя новыми запусками; snapshot не изменяется от чтения API.

`scripts/rehearsal-backup.cjs` — только инструмент quiescent test restore внутри
`.local/logs`. Проверяет SHA256 каждого файла, запрещает symlink/lock/tmp, сохраняет
более новые файлы в отдельном архиве. Не удаляет старые обязательства или историю.
Это не готовая production-команда: нет crash-atomic восстановления дерева,
координации активных writers, смены RPC/машины/абсолютных путей, восстановления ключей
или service manager. При ошибке копирования исходная новая директория остаётся в архиве.

## Дополнительные проверки

- `test/rehearsal-backup.test.cjs`: отказ при lock, испорченная копия не заменяет source,
  полное восстановление файлов и архив более новых журналов, ограничение workspace.
- `test/pons-crash-recovery.test.cjs`: отдельный реальный child-process kill для
  main/drand journal, варианты unknown/known/reverted. Unknown hash остаётся
  заблокированным; это безопасная остановка, не автоматическое восстановление.
  Стенд сохраняет ненулевые reserved/claimable; nonce не растёт от повторной сверки.
- Batch/0x/EntryPoint integration и pool batch проверены адресно на текущем коде.
  Они используют сохранённое execution evidence и synthetic RPC; это не один
  fork-cycle со всеми оболочками и не повторная квалификация терминала Pons.

## Воспроизведение

Обычный compiled artifact передаётся через RH_TEST_ARTIFACT и RH_TEST_ARTIFACT_SHA256.
Сам harness отдельно компилирует прежние test-only constructor clocks.

```powershell
node scripts/pons-collector-fork.cjs .local/logs/NEW_REPORT.json --restore-drill
node --test test/rehearsal-backup.test.cjs test/pons-batch-integration.test.cjs
node --test test/pons-crash-recovery.test.cjs
node --test test/pons-zeroex-integration.test.cjs test/pons-entrypoint-integration.test.cjs test/pons-pool-batch.test.cjs
```

Fork RPC используется только для чтения; отправки идут в in-process Hardhat.
Прежние допущения: synthetic funding, impersonation Pons operator, локальный ArbSys,
managed finalized, сокращённый lead и backdated constructor clocks. Live drand proof
не подменяется. Restore-drill использует существующий wallet-cycle Hardhat config с
одинаковыми timestamps для блоков в одну секунду; guards RNG не отключаются.
Публичная finality, внешний conversion service, длительный soak, конкурентная нагрузка
и полноценный disaster recovery инфраструктуры этим пакетом не подтверждаются.

## Поправка стенда перед успешной проверкой

Первый запуск `pons-restore-cycle-20261003-a` остановлен до freeze: guard RNG
возвращал finalityLag (в отдельных проходах также staleChainClock). Read-only запрос
к локальному RPC показал, что latest и finalized совпадают, но оба примерно на30s
позади wall clock. Это не подтверждение проблемы финальности mainnet.

Для restore-drill добавлена однократная установка timestamp локального блока по
wall clock перед draws (если блок уже впереди, время не уменьшается). Guard, таймауты
и lead RNG сохранены. Процесс первого стенда остановлен; его report/log и файлы
сохранены, запуск не считается PASS. Повтор — отдельный report `...-b.json`.

## Результат03.10

Повторный прогон `pons-restore-cycle-20261003-b` — **PONS_INDEXED_AUTOMATION_PASSED**,
fork78900097,15 проходов координатора. [Evidence](evidence/PONS_RESTORE_CYCLE_2026-10-03.json).

- При backup reserved246.425927 тестовых USDG, claimable0; сохранены четыре файла:
  config, indexer, main journal и scheduler journal. RNG journal ещё отсутствовал;
  после restore завершённые requests определены по цепочке, без новой отправки.
- Выплачено129.298504 USDG, остаток217.127423 USDG совпал с free reserves.
  Reserved/claimable в конце0. Два draw завершены; по86 consumed и1 OPEN обоих видов.
- 60+40 после freeze дали новую пару билетов; обычный transfer не стал ELIGIBLE.
  API видит8 покупок. Это текущий direct curve/pool профиль `direct-buy-pons-v2`,
  не запуск всех self-batch/0x/EntryPoint в едином genesis launch-v4 цикле.
- Старая копия восстановлена поверх прежнего пути (новые файлы сохранены отдельно).
  Оба последующих прохода сделали0 отправок, nonce83 не изменился, wallets/draws
  и весь баланс vault совпали. API/worker дважды заново прочитал восстановленный индекс.
- 18 уникальных адресных tests PASS:7 boundary/batch,1 crash-test с6 окнами принудительного
  завершения процесса,10 route neighbours. После mkdir-уточнения test setup backup-тест
  повторён1/1. Это не19 уникальных тестов и не полный RC baseline.

Логи: `.local/logs/recovery-boundaries-20261003.log`, `pons-crash-current-20261003.log`,
`recovery-route-neighbors-20261003.log`, `recovery-backup-final-20261003.log`,
`pons-restore-cycle-20261003-b.log`. Полная директория: `.local/logs/pons-cycle-2dnO0F`,
backup и архив рядом. Первый неуспешный прогон сохранён отдельно.

Следующий контрольный пакет — собрать итоговую матрицу оставшихся границ и общий
baseline выбранной ревизии. Реальная finality/permissions/conversion, нагрузка всех
маршрутов с draws, UI ручной смены аккаунта и перенос на другой узел не объявляются
закрытыми данным результатом. Исследование масштабного хранения не возобновляем.
