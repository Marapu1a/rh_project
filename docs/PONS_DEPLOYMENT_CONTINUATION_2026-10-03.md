# Продолжение deployment после шести CREATE

03.10.2026. Первые шесть контрактов созданы в Robinhood Chain владельцем через
MetaMask. Этот пакет **не отправляет публичных транзакций**: проверяет их результаты
и репетирует продолжение на свежем fork. Финансовые сервисы остаются выключенными.

## Проверка факта

`scripts/deployment-prefix-evidence.cjs` сверяет planHash, полноту/порядок журнала,
отсутствие pending, chain/from/nonce/initcode/value, успешные canonical receipts,
CREATE addresses и runtime. Для контроллеров разрешены только отмеченные компилятором
timestamp immutables, равные времени блока создания. Текущий runtime сверяется с
кодом в receipt block. Это снимок каноничности, не обещание finality.

Публичное evidence: [шесть CREATE](evidence/PONS_PUBLIC_PREFIX_2026-10-03.json).
Старое evidence первого CREATE сохранено. Governor nonce20, pending20 на preflight;
fee0.0005ETH, source/runtime/quote pins совпали, finalized lag899s при лимите1200s.
Эти величины повторно проверяются перед реальной подписью.

## Четыре следующих вызова

| Nonce | Вызов | Назначение |
|---|---|---|
| 20 | Pons launchToken | Исходный salt, QIANQI/USDG, creator tax3%, получатель collector, без dev-buy |
| 21 | CREATE BuyPolicySource | Правила подтверждённых маршрутов, publisher личный кошелёк |
| 22 | collector.bindPromo | Vault90%, operations5%, project5% |
| 23 | collector.bindVenue | Привязка к проверенному Pons factory |

TOKEN `0x6EA39A23AA46E51CA6CD2d1cbc0B5bfb29ECB216` уже записан в collector/vault:
менять salt нельзя. Curve prediction также должна остаться прежней.
Посторонние транзакции governor до завершения графа требуют пересборки/проверки nonce.

## Репетиция и границы

Существующий `scripts/pons-exact-deployment-rehearsal.cjs --resume-prefix` использует
локальные `package3-signing-prefix-final.json` и `package3-signing-journal-final.json`.
Он сохраняет salt, проверяет settings/artifact hashes и подключается к реальным шести
контрактам на fork вместо повторного deployment. Проверяет четыре вызова,
раннюю покупку101USDG до policy/binds, admission, индекс/билеты и funding90/5/5.

Anchor BUY — блок **непосредственно перед фактическим launch receipt**.
Политика формируется после launch, до её CREATE. Старый блок создания vault остаётся
receipt evidence. Snapshot во время review тоже не годится: между ним и launch
может пройти пустой блок, а scanner требует существующие Pons bindings на каждом
сканируемом блоке. Весь launch block включается, включая покупки внутри него.
Реальный anchor/hash берётся заново после публичного launch; fork hash не отправляем.

Ограничения: impersonation, синтетические ETH/USDG, локальный ArbSys shim,
latest→finalized только для fork. Настоящие6ч/30д не ускоряются; розыгрыш целиком
этим пакетом не повторяется. Fork config содержит локальный delivery anchor и пути:
это **не готовый production config и не разрешение broadcast**.

Первый прогон подтвердил четыре tx/admission, но упал на чтении событий.
Повтор с коротким anchor показал ту же ошибку; диагностический прогон установил
точную причину первого отказа: read-only proxy запрещал `eth_getLogs`. Метод чтения добавлен;
запрет `eth_sendTransaction`/`eth_sendRawTransaction` проверен. Все неудачные
локальные отчёты сохранены, история/журналы не сбрасывались.
После исправления proxy выявлен `Pons factory binding mismatch` на пустом блоке
между review snapshot и launch. Исправлен порядок вычисления anchor: по launch
receipt, а не по времени подготовки. Scanner guards не ослаблялись.

Проверки: `node --test test/fork-empty-storage.test.cjs
test/deployment-signing-queue.test.cjs test/deployment-signing-plan.test.cjs` —11/11.
Полный suite не повторялся.

Финальный прогон `node scripts/pons-exact-deployment-rehearsal.cjs
.local/logs/package3b-resume-receipt-anchor.json --resume-prefix` —
**REMAINING_DEPLOYMENT_FORK_PASSED**. Сохранённый RPC передан через RH_FORK_RPC_URL,
проверенный artifact через RH_TEST_ARTIFACT/SHA256. [Краткое evidence](evidence/PONS_CONTINUATION_REHEARSAL_2026-10-03.json):
4tx,4601869gas, admission matched; ранний BUY101USDG → Short1/Monthly1.
Vault получил3.484197 тестовых USDG, две доли владельца вместе0.387132USDG.
Это результат fork sweep, не обещание точной суммы комиссии любой будущей покупки.
Реальные6 CREATE повторно не создавались. Публичных отправок в этом пакете0.

Следующий шаг: отдельная очередь ручных подписей оставшихся вызовов, live preflight
и проверка каждого фактического receipt/record. Существующая консоль рассчитана
только на шесть CREATE: повторно нажимать её завершённую очередь не нужно.
