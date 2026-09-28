# Проверка сообщения о funding lock

28.09.2026. GPT сообщил о трёх падениях составной репетиции на `33266ed`:
после сверки успешного claim worker встретил `runtime.json.funding.lock` с собственным
PID. В репозитории есть текст review, но нет исходных failed JSON и полной трассы
этих запусков. Поэтому точная причина пока **не установлена**.

## Что проверено в коде

`runPromoAutomation` последовательно ожидает reconciliation дочерних workers.
`runInfinityWorker` возвращает promise `withState`; внутри `withState` используется
`return await action(...)`, а освобождение идёт синхронно в `finally` до завершения
этого promise. По этому пути не найден пропущенный await или намеренный параллельный
захват funding journal. Это анализ конкретного пути, а не доказательство отсутствия гонок.

Одинаковый PID сам по себе не доказывает ни причину конфликта, ни право удалить lock.
`EEXIST` продолжает блокировать выполнение. Lock/recovery код не менялся, retries с
удалением файла, обход проверки и повторный send не добавлены.

## Изменения runner

- Сверяет успешный receipt искусственно прерванного claim.
- Записывает каждую попытку `(drawId, winner)` и отклоняет повторную отправку.
- Сверяет Short reward с terminal `shortResult`, Monthly reward — с бюджетом и
  победителем завершённого месяца; проверяет два `RewardPaid` и точный прирост баланса.
- Сохраняет ответ повторного worker **до** проверки конечных резервов. `status:error`
  теперь виден непосредственно, а не только как оставшийся ненулевой reserve.
- В failed JSON сохраняет содержимое и метаданные собственных runtime-файлов
  до обычного test cleanup, включая оставшиеся lock-файлы. Это снимок, не разблокировка.
- Записывает Node, OS, PID, runtime directory и тип файловой системы.
- Создаёт `.local` до setup: в чистой копии с output вне проекта ранее возникал ENOENT.
  Это отдельный воспроизведённый дефект runner, не объяснение EEXIST из review.

## Как получить недостающие доказательства

В среде, где падение возникает, запустить обновлённый runner один раз с новым именем:

```bash
LOCAL_STATE_LOCK_TRACE=1 npm run rehearsal:release -- .local/logs/gpt-lock-diagnostic.json > .local/logs/gpt-lock-diagnostic.log 2>&1
```

Нужны **оба полных файла**, точный HEAD и локальный diff, если запуск был изменён.
Не достаточно пересказа ошибки. Сопоставляем acquire/acquired/release/released/conflict
по `runId`, имени lock и PID, затем `resume-observation` и `failureFiles`.
Если это Linux, полезны также `node --version`, `uname -sr` и `findmnt -T .local`.

Без этих данных не называем причиной ОС, sandbox, stale lock или ошибку finally.
Повторяемость на проверенных локальных средах не опровергает сообщённый сбой в другой.

## Полученные результаты

[Полные события lock и результаты](../research/release-rehearsal/lock-investigation-2026-09-28.json).
Node24.21.0 во всех запусках; Linux — WSL2/Ubuntu24.04, kernel6.6.87.2.

| Запуск | Среда runtime | Результат | Захваты / освобождения | Конфликты |
|---|---|---|---|---|
| Исходный runner | Windows | complete | 23 / 23 | 0 |
| Усиленный runner | Windows | complete | 23 / 23 | 0 |
| Усиленный runner | Linux, Windows disk через9p | complete | 23 / 23 | 0 |
| Усиленный runner + mkdir fix | Linux, отдельная копия в/tmp наext4 | complete | 23 / 23 | 0 |

Анализ всех trace событий проверил: нет перекрытия владельцев одного пути,
каждому acquired соответствует released с тем же runId, remaining.exists=false;
после каждого прогона активных владельцев нет. Unit `local-state-lock` —9/9,
включая child-process handoff и сохранение чужого lock. Полный suite не запускался.
Промежуточный запуск чистой Linux копии воспроизвёл ENOENT до setup; после mkdir fix
успешен. Ошибки вспомогательной shell-команды не являются failures продукта.

Linux использовал отдельный переносимый Node из официального архива в.local/tools;
системная установка не менялась. В/tmp проверена копия tracked HEAD с обновлённым
runner и Linux native dependency из текущего node_modules. Это не полный install
с нуля и не тождественная GPT sandbox среда.

Суммы Short могут различаться между независимыми fresh chains из-за draw context;
каждая сверена со своим terminal result. В усиленных прогонах ровно две попытки
claim для разных draw, обе успешные. Причина EEXIST у GPT остаётся открытой —
зелёные локальные запуски не превращают неизвестную причину в «исправлено».
