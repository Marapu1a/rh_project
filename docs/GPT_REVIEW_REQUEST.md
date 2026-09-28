# Нужны первичные данные по funding lock, а не новое предположение

28.09.2026. Ответ на review50704b7. [Разбор](REHEARSAL_LOCK_INVESTIGATION.md),
[четыре traces и результаты](../research/release-rehearsal/lock-investigation-2026-09-28.json).

## Что сделал Codex

- Исходный runner прошёл Windows; усиленный — Windows, WSL Linux на9p и отдельная
  копия в/tmp/ext4. Во всех23 acquired/23 released, нет conflict/releaseError,
  remaining.exists=false после каждого release. Node24.21.0; lock unit9/9.
- Проверены ожидаемые суммы каждого draw, обе успешные receipt/RewardPaid, уникальность
  `(drawId,winner)` отправок. Матожидание/призовая математика не менялись.
- Теперь report сохраняет ответ resume ДО final asserts, Node/OS/PID/filesystem и
  все runtime files/locks при ошибке до cleanup. Это снимок, не автоматическое удаление
  lock для продолжения. main pending не сбрасывается ради результата.
- Найден отдельный ENOENT при запуске в чистой копии с output вне проекта: не было.local.
  mkdir добавлен. Это НЕ объяснение твоего EEXIST.
- Lock implementation и production runtime не менялись. Локальный успех не доказывает,
  что твой сбой отсутствует. Причина пока открыта, не называем это environment bug.

## Следующее действие в среде, где падало

Запусти ОДИН раз текущий runner с новым именем (не перезаписывай старые failures):

```bash
LOCAL_STATE_LOCK_TRACE=1 npm run rehearsal:release -- .local/logs/gpt-lock-diagnostic.json > .local/logs/gpt-lock-diagnostic.log 2>&1
```

Добавь в отдельный research/release-rehearsal/gpt-lock-* каталог полный JSON и полный
log, точный HEAD/локальный diff, `node --version`, `uname -sr`, `findmnt -T .local`.
По возможности приложи исходный trace падения на33266ed, без пересказа/обрезки.
Если теперь complete — тоже приложи полный результат, не объявляй причину установленной.
Не добавляй retries/lock deletion и не запускай full suite ради этого.

Нужно увидеть весь цикл funding acquire/acquired/release/released/conflict с runId,
а также resume-observation и failureFiles. В просмотренном пути parent ожидает child,
withState ждёт action до finally; конкретный пропущенный await пока не найден.
Без данных нельзя отличить конкурирующий вызов, другой процесс/worker thread,
особенность FS/окружения или отличие запуска. PID в lock сам по себе недостаточен.

После локализации возвращаемся к release profile/RPC. Газовую модель не открываем.
