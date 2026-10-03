# Очередь ручного запуска Pons

03.10.2026. **Подготовлена и проверена, публичных отправок в этом пакете0.**
Продолжение [репетиции](PONS_DEPLOYMENT_CONTINUATION_2026-10-03.md).
Первые шесть CREATE уже подтверждены. Новая очередь — отдельный журнал; старый
не сбрасывается. Финансовые сервисы и покупка101USDG этой очередью не включаются.

## Что подписывается

1. Nonce20: factory.launchToken, QIANQI/USDG, creator tax3%, collector получает
   комиссии; launch fee0.0005ETH, dev-buy0. Исходные salt/TOKEN/curve сохранены.
2. Nonce21: BuyPolicySource. Anchor вычисляется из фактического launch receipt:
   блок непосредственно перед запуском. Manifest hash и CREATE calldata собираются
   заново; ни один fork anchor не используется для публичной подписи.
3. Nonce22: bindPromo,90/5/5; endsAt = timestamp фактического launch +31536000s.
4. Nonce23: bindVenue с проверенным factory.

Каждый шаг требует отдельной подписи владельца в MetaMask. Governor nonce нельзя
занимать посторонними отправками в середине этой очереди. Новая локальная ссылка
выводится в `.local/logs/package3c-console.log`; старую страницу закрыть.

## Проверки и сохранение состояния

- `deployment-continuation.cjs`: план связывает settings/artifact/prefix и успешную
  репетицию; live check сверяет шесть CREATE, owner, external pins/finality,
  economics/fee/prediction для launch, route runtime/bindings для следующих шагов.
- Общая signing queue поддерживает CREATE и CALL с value: оценивает газ и баланс
  **с учётом launch fee**, сохраняет intent до запроса в кошелёк, не сбрасывает
  unknown outcome. В receipt сверяет точные from/to/value/nonce/calldata/chain.
- Launch проверяется по record/event и TOKEN/curve runtime. Policy runtime
  восстанавливается из того же artifact и точных solc immutable offsets; все пять
  immutables известны из параметров, код сравнивается целиком. Начальные adapters
  и currentHash также проверяются. Bind receipts проверяются по состоянию contracts.
- Повторный prepare проверяет предыдущие canonical receipts. При reorg, ошибке
  чтения или несоответствии отправка следующего шага не допускается.
- UI отделяет последний хеш по planHash, показывает завершение очереди и
  отключает дальнейшую подготовку. Ошибка после исчерпания шагов больше не
  выглядит как неудавшееся развёртывание.

`deployment-policy-runtime.cjs` компилирует layout только при подготовке плана,
сверяя deployedBytecode template с проверенным artifact. Консоль использует
готовый artifact через RH_TEST_ARTIFACT/SHA256, не компилирует Solidity при подписи.
Контракты проекта не изменялись.

## Выполненные проверки

- `node --test test/deployment-signing-queue.test.cjs test/deployment-signing-plan.test.cjs`:
  11/11. Включены CALL с ETH value, неверный получатель/сумма, недостаток баланса,
  nonce/gas drift, неизвестная отправка, reorg и проверка шести CREATE.
- `node --test test/deployment-console-ui.test.cjs`:3/3, включая завершение очереди.
- `node scripts/deployment-continuation-rehearsal.cjs PLAN JOURNAL REPORT`:
  [fork evidence](evidence/PONS_CONTINUATION_QUEUE_2026-10-03.json),4tx PASS,
  4restart после intent и4restart после receipt. Проверяется та же динамическая
  очередь, а не отдельный набор вручную закодированных вызовов.
  Ограничения: impersonation, synthetic ETH, ArbSys shim, mocked preflight callback;
  настоящая подпись MetaMask и публичная finality этим тестом не подтверждаются.
- Отдельный live preflight snapshotMatched, nonce20/pending20; опубликованные
  logo/preview HTTP200 image/png и SHA256 совпали.
- Консоль с новой очередью запущена на127.0.0.1:4176 с --enable-signing.
  `/view` completed0/pending=null; реальный `/prepare` launch прошёл; без session403.
  Estimate3827393gas, показанный лимит value+gas0.000627746572688471ETH на момент
  проверки — не фиксированная цена. `/intent` и отправки в публичной сети не вызывались.

Локальные артефакты: `package3c-continuation-plan.json`, `package3c-queue-first.json`,
`package3c-console-review.json`, `package3c-live-preflight.json`, `package3c-assets.json`.
Журнал публичных подписей: `.local/logs/package3c-public-journal.json` создаётся
перед первой передачей запроса в кошелёк. Session key/RPC не публикуются в репозитории.

Дальше: подписи владельца, сверка четырёх реальных receipts, экспорт production
manifest/profile с реальными anchors и включение подготовленных сервисов отдельным
этапом. До этого успех fork не объявляется готовой публичной автоматикой.
