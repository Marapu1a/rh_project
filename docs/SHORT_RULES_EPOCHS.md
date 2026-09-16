# Версии правил Short: граница mint и завершение старого набора

16.09.2026. Реализован внутренний `ShortRulesEpochs`, расширяющий dataset-компонент, и lifecycle replay v2. **Это ещё не production controller**: нет authenticated RNG, economic readiness, финального выбора D, полноценного keeper и окончательной permission policy. Test-only fixture имеет произвольный тестовый terminal, с реальными деньгами не развёртывать.

## Принятое решение этого пакета

Один draw — одна версия. Genesis payload существует с deployment. Payload версии содержит только глобальные outcome rules, веса корзины и minimumUnit; порог BUY=$100 не меняется. Нет адресов особых победителей, arbitrary modules или смены кода.

Версия объявляется заранее, payload уже нельзя переписать. Notice — положительная immutable настройка instance, конкретное production значение пока не выбрано. В fixture 3600 секунд только для тестов, не рекомендация. В этом пакете нет отмены объявленной версии: будущий интерфейс объявления должен проверять параметры до отправки.

```text
genesis/current V1
→ announce V2 → notice elapsed
→ activate в блоке B
→ V1: все mint до B включительно; V2: mint начиная с B+1
→ обслуживаем оставшийся V1, новые билеты копятся в V2
→ V1 terminal ИЛИ подтверждение пустого V1
→ обслуживаем V2; теперь можно объявлять V3
```

Активация — permissionless шаг в fixture, когда notice истёк, нет pending Short/активной подготовки и прошло 6 часов после предыдущего terminal. Начальный schedule anchor — deployment timestamp. Она не выбирает cutoff задним числом. Все BUY блока B остаются V1 независимо от порядка транзакций внутри блока. Если BUY после границы довёл carry до $100, новая попытка принадлежит V2; сам carry не теряется и отдельной версии не имеет.

Следующую версию нельзя объявлять, пока предыдущая объявленная версия не активирована либо старый набор не завершён. История версий сохраняется; одновременно обслуживаются не более двух соседних версий, а pending draw остаётся один.

## Граница правил НЕ равна cutoff снимка

Фиксировать обязательный cutoff ровно B опасно: спустя 256 блоков нынешний dataset BEGIN уже не смог бы проверить blockhash(B). Нам не нужен такой вечный дедлайн.

Вместо этого activation закрепляет **номер начала новой версии** в canonical state. Подготовка старого набора использует свежий завершённый блок C, где C >= B+1. Replay до C сам ограничивает старые attempts блоками <= B. Новые попытки из B+1..C в старый snapshot не входят. Таким образом:

- eligibility определяется epoch и моментом mint;
- cutoff C задаёт проверяемую границу истории, доступной для построения snapshot;
- при долгой паузе выбирается новый свежий C, а старый набор от этого не меняется;
- после BEGIN его C/root/context уже фиксированы; публикация может идти дольше 256 блоков;
- supersede до freeze сохраняет историю и не тратит attempts; новый C может изменить context до seed, что не разрешает замену уже frozen draw.

Это осознанное уточнение прежней формулировки «все OPEN до cutoff»: теперь **все OPEN целевой обслуживаемой Short epoch до cutoff**. Monthly не фильтруется по Short epoch. Не FIFO по числу кошельков и не product MAX_N.

## API и гарантии

`_announceShortRules(rules, weights, minimumUnit)` хранит неизменяемый payload/hash и deadline notice. Право объявления должен ограничить будущий controller; в fixture это publisher.

`_activateShortRules()` переводит current в draining, новый epoch начинает mint с block.number+1. Активную подготовку сначала заканчивают либо закрывают до reserve.

`_beginEpochDataset(id, request)` требует правильную целевую epoch, schedule и cutoff не раньше предыдущего terminal. Payload выбирается из сохранённой версии, caller не передаёт новые правила для старого набора. Старый dataset API отдельно остаётся историческим внутренним компонентом; production должен использовать только epoch-aware путь.

`_sealEpochDataset(id)` выполняет существующий atomic reserve/freeze и связывает draw с epoch/snapshot. Повторный seal и supersede frozen запрещены базовым компонентом.

`_completeEpochDraw(...)` — только внутренний hook после authenticated результата и успешного vault.finalize **в той же транзакции**. Проверяет pending draw, Finalized status и соответствие win/no-win реально назначенной сумме, очищает pending, закрывает draining, начинает следующие 6 часов. Сам hook не доказывает корректность RNG/winners. Fixture завершает draw с caller-supplied winners только для проверки integration/accounting.

ReentrancyGuard: begin/seal/preparation защищены базовым компонентом; announce/activate/empty защищены здесь. Внешний authenticated terminal должен держать guard вокруг finalize+completion; fixture так и делает. Не навешивать один guard повторно на вложенные вызовы.

## Пустой старый набор

Пустой набор не создаёт draw, не резервирует деньги, не emits AttemptsConsumed и не сбрасывает 6h clock. Авторизованный publisher публикует `ShortEpochEmpty(epoch, freshCutoff, cutoffHash, snapshotHash)`; переход закрывается.

**Trust boundary:** контракт НЕ доказывает отсутствие старых билетов. Как и список участников, это assertion индексера. Replay восстанавливает все mint/consumption и отвергает ложное empty. Это не permissionless право любого пользователя заявить «билетов нет». В production нужно сохранить узкую authorization и публичный artifact; on-chain proof/challenge в пакет не добавлен. Нельзя обещать невозможность злонамеренного empty на уровне контракта.

Empty hash: canonical JSON `{schema:'short-epoch-empty-v1', domain, epoch: decimalString, cutoff, rulesHash, participants:[]}`. CLI сам возвращает empty artifact и `nextAction: closeEmpty(...)`, когда independent replay действительно обнаружил пустой draining epoch. Новый пустой current без перехода просто не готов к draw.

## Replay и проверка публикации

Новый deployment manifest выбирает `lifecycle.schema = attempt-lifecycle-v2` и `shortRules = {rulesHash, noticeSeconds, startedAt, firstBlock}` genesis; числа предпочтительно десятичные строки. Domain связывает нормализованный genesis config hash. CLI в RPC mode сверяет genesis с on-chain getters; выбранный deployment/manifest по-прежнему должен быть доверенным начальным ориентиром.

`replayAttempts` понимает Announced/Activated/Empty, проверяет notice/schedule/монотонность границы, назначает epoch каждому mint, строит `SHORT.byEpoch` и сохраняет conservation. Mint ranges остаются глобальными непрерывными номерами кошелька. Старый набор обслуживается первым; месячные попытки остаются независимыми.

Short snapshot v2 добавляет `rulesEpoch` в JSON hash. Солидити Request/context уже связывают epoch, менять rolling root format не потребовалось. Для Monthly сохраняется snapshot v1 с domain нового instance. Исторический lifecycle v1 работает для прежних evidence; epoch events под v1 отвергаются, не игнорируются молча.

`buildFromHistory` выбирает все OPEN нужной epoch, сверяет rules payload с её hash и строит обычный dataset artifact либо empty artifact. `verifyPublication` дополнительно проверяет snapshot epoch, on-chain policy и genesis. Декодер публикаций остаётся привязан к direct fixture `publish` transport; future controller transport ещё предстоит закрепить.

Команды: `npm run test:short:epochs`, обычный `npm test`, `npm run verify:short:dataset -- --input input.json --rpc URL --output artifact.json`. Для публикации дополнительно `--proposal ID`; empty artifact не имеет proposal. Утилита только читает/строит данные, транзакции не отправляет.

## Проверки и оставшаяся работа

Проверяются notice/права/двойной переход, active proposal и pending, задержка 300 блоков, реальный reserve/finalize и rollback ошибочного получателя, 6h после terminal, empty без денежных событий, реорганизация activation, carry 99+1, mint в том же блоке и следующем, диапазоны старой/новой epoch, Monthly isolation, ложный empty, неправильные правила и genesis.

Осталось связать activation с economic/finality readiness, определить notice и production роли, обеспечить keeper continuation/истечение незарезервированной подготовки, подключить единственный authenticated seed и production streaming terminal. Активация не означает, что деньги на старый draw уже гарантированно есть. Недостаток средств не разрешает отменять старый непустой набор; он ждёт funding. Аварийная изоляция, gas treasury и Monthly epochs здесь не реализованы.
