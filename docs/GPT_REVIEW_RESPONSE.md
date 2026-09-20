# Постоянный ответ GPT

Обновлено: 21.09.2026.

Это независимое review-мнение, не задание на автоматическое исполнение. При следующем
обращении файл следует полностью перезаписать.

Просмотрен commit `ce81e84c163ce0677e360aeb5313ee3a87a2dd88` —
`Trace state lock lifecycle and verify CLI handoff boundaries`.

## Короткий вердикт

Новая диагностика сделана по правильной границе и не ослабляет fail-closed lock. На текущем
commit прежнее наблюдение не воспроизвелось ни с трассой, ни без неё. В той же среде
(Node 24.19.0, Linux overlayfs) точные handoff/helper сценарии прошли у меня **20/20**:
один trace run 5/5 и три последовательных no-trace run по 5/5.

Все traced acquisitions получили парный release; после каждого `unlinkSync`
`inspectLock` видел `ENOENT`. Assertions после awaited scheduler и до/после child CLI
не нашли lock. Conflict test сохранил чужой lock. Action rejection снял свой lock.

Поэтому прошлое заключение надо сузить: оставшиеся lock-файлы и EEXIST в моих предыдущих
запусках были реальным наблюдением, но данных оказалось недостаточно, чтобы приписать его
реализации `withState`. Сейчас утверждение «успешный await возвращается с parent lock»
не подтверждено. До новой трассы это не project finding и не причина задерживать
калибровку gas model.

При review обнаружен другой, детерминированный lock lifecycle defect: после успешного
`openSync(lock,'wx')` запись PID и закрытие fd находятся до основного `try/finally`.
Ошибка записи/закрытия отвергает promise, но оставляет принадлежащий этому процессу lock.
Это не объясняет прежний успешный await, однако является настоящим узким fail-closed
liveness дефектом.

## Что проверено в диагностике

`runId/PID/path/time` достаточно, чтобы сопоставлять parent и child независимо от порядка
строк stderr. События разделяют:

- попытку acquire;
- успешное владение;
- conflict с bounded snapshot;
- начало release;
- подтверждённое отсутствие файла после unlink;
- ошибку release.

`inspectLock` читает не больше 128 байт через собственный fd и возвращает
`path/exists/owner/mtimeMs/size`. Если diagnostic read не удался или lock исчез в гонке,
основной acquire всё равно не продолжается. Это правильное fail-closed поведение.

Pre/post assertions поставлены в полезных местах:

- сразу после `await runScheduler` в coordinator fixture;
- после каждого scheduler helper run;
- перед child CLI;
- после завершения child CLI.

Новый integration `async save → resolved promise → child process` проверяет именно
handoff, которого не было в прежнем 500-cycle probe. Conflict metadata и release после
action rejection также покрыты отдельно.

## Результат повторения

Точная команда из обращения с `LOCAL_STATE_LOCK_TRACE=1`:

```powershell
$env:LOCAL_STATE_LOCK_TRACE='1'
node --test --test-concurrency=1 --test-name-pattern='CLI runs both workers|scheduler persists before sending|async state save|occupied lock|action rejection' test/local-coordinator.test.cjs test/local-scheduler.test.cjs test/local-state-lock.test.cjs
```

Результат: **5/5**, fail 0, 56 s.

В трассе:

- coordinator parent PID 11 освободил scheduler lock, snapshot после unlink — `ENOENT`;
- child PID 33 затем независимо получил и освободил scheduler/coordinator locks;
- scheduler parent PID 42 выполнил все проходы с парными acquire/release;
- scheduler child PID 65 получил lock только после parent release и также снял его;
- helper parent/children PID 73/81/89/97/105/113 завершили все handoff;
- intentional conflict с owner `987654` был только прочитан и не удалён;
- `releaseError` и оставшихся файлов после release нет.

Затем та же выборка без trace была запущена три раза подряд: **15/15**, fail 0,
примерно 171 s суммарно. Трассировка не является единственной причиной зелёного результата.

## Подтверждённый defect: acquire initialization вне cleanup

Сейчас код выполняет:

```js
fd=fs.openSync(lock,'wx');
fs.writeFileSync(fd,String(process.pid));
fs.closeSync(fd);
// основной try/finally начинается только здесь
```

Я инъектировал `EIO` в `writeFileSync(fd,...)`. `withState` ожидаемо отклонился, но
`inspectLock` сразу после rejection показал:

```json
{"exists":true,"owner":"","size":0}
```

То есть новый lock уже создан, fd не закрыт штатно, а cleanup ещё не действует.

Последствия ограничены:

- action/state sends не начались;
- это не unknown transaction и не continuation;
- следующий запуск корректно остановится на EEXIST;
- но оператор получит stale zero-byte lock после storage error.

Минимальная правка: считать lock owned сразу после успешного `openSync`, а закрытие fd и
unlink поместить в cleanup, который действует и на ошибку записи PID. Conflict path не
должен удалять чужой lock. Нужен один fault test: injected PID-write failure → rejection,
fd cleanup и `inspectLock(...).exists === false`.

Автоматическое удаление lock по PID/возрасту по-прежнему не требуется и небезопасно.

## Итог

Данные действительно не бились, и прежнее lock finding было сформулировано слишком
уверенно. На `ce81e84` успешный scheduler/CLI handoff подтверждён трассой и повторными
no-trace запусками. Старое наблюдение оставляем как необъяснённый артефакт до появления
нового trace evidence, но не как дефект проекта.

Диагностический commit можно оставить: он bounded, opt-in и полезен для следующего
совпадения. Перед калибровкой есть только маленький самостоятельный cleanup fix для ошибки
инициализации lock; он не должен разрастаться в lease/recovery framework.

## Выполненные проверки

- trace handoff/helper run — **5/5**;
- три no-trace повтора — **15/15**;
- injected PID-write failure — stale zero-byte lock воспроизведён;
- `git diff --check 78dcf28..ce81e84` — ошибок нет;
- полный `npm test` не запускался;
- пользовательский `docs/INDEPENDENT_AUDIT_2026-09-19.md` не изменялся.
