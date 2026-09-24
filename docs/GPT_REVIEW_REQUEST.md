# GPT: сквозной Permit2 BUY → admission → dataset на fork

24.09.2026. Review ffad0e0 принят. Следующий пакет — harness/evidence/regression,
product modules/contracts не менялись. Ответ перезапиши в GPT_REVIEW_RESPONSE.md;
код самостоятельно не меняй.

## Результат и границы

[PERMIT_BUY_INTEGRATION](PERMIT_BUY_INTEGRATION.md) — точные шаги, команда и ограничения.
Реально исполнен scripts/permit-buy-fork.cjs NEW_OUTPUT.json --integration.
Helper scripts/permit-buy-integration.cjs использует существующие publishBuyPolicy,
resolveBuyPolicy, scan, replay, buildFromHistory и runScheduler.

На свежем fork настоящего reference TOKEN/USDG pool развернули наши registry,
policy source и локальный dual controller/vault stack. USDG balance только тестового
wallet искусственный. Router/Permit2/pool не подменялись. Random — LocalRandomFixture.

Две реальные покупки по 100 USDG: до future activation 0 attempts, на activation 1.
Admission читает реальный локальный BuyPolicySource. После 6-часового time advance
scheduler сохраняет один dataset. В нём меняем budget и пересчитываем job/state hashes:
pre-begin replay отклоняет подмену без изменения nonce и bytes файла. Возвращаем оригинал:
штатные begin и publish проходят. Повторный scan старого cutoff даёт тот же artifact.

Evidence: research/permit-buy-integration-2026-09-24.json. Есть raw BUY tx/receipts,
полная branch до cutoff, config/policy history, artifact, публикационный журнал и
scheduler results. Post-cutoff begin/publish отражены в results с tx hashes; полный
RPC dump их receipts отдельно не сохраняли. Не путай software assertions и RPC attestation.

Прогон stage=complete/exit0; proxy 283 requests, retries/errors=0.
Офлайн-regression 1/1, 0.56 s; проверяет saved raw branch, activation, единичное
начисление, повторную доставку блока и воспроизводимость artifact. Full suite не запускали.

## Что не проверено

Seal/random/selection/awards/claims и Monthly draw не исполнялись. Monthly ждёт schedule.
Local Cancun не доказывает Nitro-specific execution. notice=2, LOCAL_HEAD, outcome,
weights/budget — test settings, не параметры публичного релиза. Публичных sends нет.
Это чужой reference TOKEN: нашего deployment пока нет.

## Вопросы для review

1. Не выдаём ли мы более сильный результат, чем подтверждают harness и evidence?
2. Не обходит ли wiring штатные admission/scan/pre-begin проверки? Есть ли слепое место
   в проверке двух покупок относительно activation или повторного replay?
3. Достаточно ли этого ограниченного integration slice, чтобы закрыть текущую BUY-ветку
   и перейти к reference creator revenue collect/claim → FeeRouter?
4. Если есть дефект, укажи конкретный assertion/сценарий. Не расширяй задачу на все routes
   или полноценный публичный launch без отдельного обоснования.
