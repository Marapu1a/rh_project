# Постоянный ответ GPT — recovery admission

28.09.2026. Независимое ревью `06cc44b`: проверил разделение startup admission, журналов и frozen-only scheduler, новые tests/fixture. Лично запустил `node --test test/robinhood-recovery.test.cjs`: **10/11**, одна ошибка повторилась и при адресном запуске; ниже отдельно разбираю её происхождение. Другие наборы и live/fork в этом review не повторял.

## Вывод по логике

Замечание о старых обязательствах закрыто содержательно. Main pending сверяется первым, затем funding/RNG pending через их прежние locks и проверку исходного hash/receipt/tx/nonce; unknown hash не очищается. `inspectObligations` проверяет критические runtime pins, vault↔controllers, RNG↔consumers, instances и anchors без зависимости от revenue source или текущего publisher. Полный admission вместе с `collector.sync.staticCall()` нужен для новых действий; source policy drift без смены bytecode теперь выявляется. Перед estimate и перед intent проверка повторяется. Recovery/drain пропускает Ready/unfrozen jobs и запрещает pull/pay, checkpoint, begin/publish/seal/closeEmpty; допускает только доказательство seed, завершение уже frozen draw и claim.

Для frozen job отказ от нового чтения BUY policy оправдан: on-chain request/root/publications/context и локальный commitment всё равно сравниваются перед исполнением. Это не доказывает, что исторический publisher когда-то собрал честный dataset, но поздний source outage не должен переписывать зафиксированный розыгрыш. Изменённый frozen artifact и исчезнувшая started-заявка останавливаются в тестах. Повреждение критического контракта или потеря job по-прежнему требуют оператора; граница названа честно.

В сохранённом сценарии до восстановления источника обе frozen ветки действительно прошли process/finish/claim с резервом и claimable = 0; unknown/known send, drift между estimate и intent, запрет Ready и publisher rotation проверены отдельно. Утверждать полный **автоматический BUY→freeze на 4663** всё ещё нельзя: начальные dataset/begin/publish/seal создаёт fixture, сеть и clock смоделированы.

## Мой прогон: сбой файлового окружения

Сквозной тест после восстановления source/policy ожидал `resumed.results.funding.status`, но получил `status:error` в settlement lane: `runtime.json.scheduler.lock` уже существовал. При повторе с `LOCAL_STATE_LOCK_TRACE=1` предыдущий `withState` зафиксировал `released` и `exists:false/ENOENT` в 09:22:06.981 UTC; новый вход в 09:22:07.962 увидел **тот же lock с mtime 09:22:04.915 и тем же PID**, то есть файл появился вновь после подтверждённого удаления, без нового `acquire` для этого пути в trace. Это согласуется с прежними сбоями синхронизируемого workspace; наблюдение не доказывает баг продукта. Продуктовое свойство «после восстановления normal и funding» лично **не подтвердил**. Нельзя засчитывать мой запуск как 11/11 или автоматически удалять lock в рабочем runtime. Временно добавленную диагностику теста я откатил; отслеживаемый код не менял.

## Следующий шаг

Кодовый recovery пакет можно считать хорошо обоснованным с указанной границей теста. Следующий результат нужен уже релизный: квалифицировать archive RPC и закрепить настоящие deployment/BUY pins на рабочей сети, затем измерить оба draw, storage checkpoint на finalized и стоимость повторных admission reads. Отдельно принять fee allocation/native refill и timing; без них открыть public signer нельзя. Ещё один общий рефакторинг здесь сейчас не нужен.
