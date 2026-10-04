# Роутер65050…: локальные проверки исполнителей04.10.2026

Статус:19 сценариев завершены с ожидаемыми результатами на historical Hardhat fork.
Это следующий ограниченный шаг после [разбора28 receipts](PONS_ROUTER_RESEARCH_2026-10-04.md),
не production adapter, не полноценный аудит стороннего роутера.
[Evidence](evidence/PONS_ROUTER_FORK_2026-10-04.json).

## Исполнители и полномочия

В runtime561011… найдены литералы адресов двух фактически выполненных модулей:
1ab4…cada3 на byte offset11703 и d17b…0dbd на12985. Это наблюдение bytecode,
не доказательство, что других веток/модулей нет. В dispatcher есть owner/pause и
другие selectors. Полная ABI ещё не восстановлена; совпадение selector само по
себе не заменяет семантическую проверку.

На fork обеих исторических высот owner() роутера и ProxyAdmin вернули
0x0c628d6535b781f6c703ad319af8b1bcec63fbb4. Это прочитанные адреса, не установление
личности. Proxy admin0x75fc5cd1794921e617d97e4afa2ff93613413be3 из proxy bytecode
действительно смог вызвать upgradeToAndCall, а обычный sender — нет.
Admin impersonated только локально: тест не доказывает возможность захвата admin
обычным пользователем и не меняет реальный proxy.

Sourcify gaps из предыдущего шага остаются. Из CBOR извлечены IPFS CID metadata
трёх модулей (в evidence), ipfs.io ответил429. Это проблема получения metadata,
не доказательство её отсутствия. Поиск официальных источников не дал исходников
этих конкретных implementation. Имена tuple-полей не выдумывались: мутации
производились по словам captured calldata, с эмпирической проверкой результата.

## Что реально исполнено

`node scripts/pons-router-fork-research.cjs NEW_REPORT.json`, envRH_FORK_RPC_URL
задаётся локально из secret file. Upstream proxy разрешает только чтение.
Fork79378373 для USDG и79378062 для ETH — предыдущие блоки captured BUY.
Локально добавляется ETH и выставляется allowance исходного USDG-плательщика.
Это не точный replay порядка всех транзакций исходного блока. Контракты не
переустанавливаются; mutations/synthetic code/storage существуют только в Hardhat.
Каждый сценарий изолирован snapshot/revert; hash fork-блока записан в evidence.

| Сценарий | Результат |
|---|---|
| Исходные USDG и ETH покупки |Успех, QIANQI получил исходный sender|
| Недостижимый minimum return, оба пути |Revert, прирост токенов0|
| Deadline=1, оба пути |Revert Transaction too old|
| Другой sender без USDG |Revert insufficient balance; средства исходного sender не использованы|
| Другой sender с собственными200USDG и allowance |Успех, токены только новому sender|
| Другой sender с ETH |Успех, токены только новому sender|
| Отозванный USDG allowance |Revert|
| Неизвестный discriminator и другой curve address, USDG |Revert|
| Upgrade от обычного sender, оба пути |Revert|
| Upgrade от impersonated ProxyAdmin, оба пути |Успех; implementation slot изменился|
| Прямая локальная подмена implementation на пустой адрес, оба пути |Tx success, но токенов0|
| Поддельный funding callback от другого sender |Revert|

Всего19 сценариев,399 upstream reads,0 retries/errors,0 public sends.
Assertions проверяли ожидаемый статус, получателя и нулевой прирост при отказах.
Отдельный первый13-case прогон использовался для проверки harness; итог — второй19-case.
Это не новый полный npm baseline; fork-команда является проверкой данного developer script.

## Практический вывод и оставшиеся границы

В проверенных формах плательщик/получатель следуют внешнему sender; простая
подмена caller не присвоила чужой BUY. Proxy upgrade — реальная возможность
администратора, поэтому проверка одного адреса/codeHash proxy недостаточна.
Нельзя считать status=1 покупкой: обязательно нужны terminal event, оплата и выдача.
Наш research inspector уже требует эти evidence и никогда не возвращает eligibility.

До боевого adapter остаётся определить полную допустимую calldata-форму и
семантику исполнителей; проверить refunds/остатки, дополнительное финансирование,
несколько buys/mixed calls, pause/owner ветки и смену реализации внутри блока.
19 сценариев этого не заменяют. Нужен fail-closed профиль конкретных runtime и
фактически выполненных modules с проверкой per-BUY quote basis. Выбор между
получением исходников и расширенным bytecode review должен учитывать объём MVP;
не считать доказанным универсальный допуск всех CurveBuy.

Следующий практический шаг: получить metadata/ABI по сохранённым CID либо
проверяемые исходники именно этих hashes; затем узкий decoder в тестовом контуре.
Если это не удаётся в разумный объём, переключиться на маршрут с доступной
семантикой. Сервер, policy, билеты и финансовая автоматика этим шагом не менялись.
