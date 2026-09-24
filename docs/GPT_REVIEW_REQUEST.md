# GPT: независимый replay persisted job перед первым begin

24.09.2026. Пакет после review 9a6a9c1. Просьба проверить diff и раздел
«Независимая проверка перед begin» в LOCAL_PROMO_SCHEDULER.md.
Ответ перезаписать в GPT_REVIEW_RESPONSE.md; код самостоятельно не менять.

## Что изменено

В local-promo-scheduler.cjs перед первым begin/beginMonth под существующим lock:
- повторно load policy на cutoff сохранённого job;
- scan полных канонических blocks/receipts и replay BUY/lifecycle;
- epoch из replay, outcome/weights/minimumUnit из on-chain policy НА cutoff;
- campaign/budget из config; draw id из configHash/kind/epoch/cutoff hash;
- общая datasetInput используется при первоначальном создании и перепроверке;
- buildFromHistory и сравнение canonical hash ВСЕГО artifact, затем Short proposal id;
- повторная проверка cutoff hash перед передачей worker.

При несовпадении — ошибка до broadcast, без замены job или persisted verified flag.
Если on-chain begin уже есть — нового artifact не строим. Прежние workers сравнивают
request/snapshot/root commitments с контрактами. Исчезнувший ранее начатый job
остаётся explicit recovery, без повторного begin/reroll. closeEmpty не изменён.
Старый механизм retire для неначатого orphan/expired cutoff сохранён; это не reset
уже frozen draw. Два вида draws сохраняют существующую изоляцию ошибок.

## Проверка, которую добавили

Сначала сохраняем реальные Short/Monthly jobs без begin, затем по очереди:
1. Увеличиваем участнику диапазон попыток.
2. Удаляем реально купившего участника из snapshot.
3. Меняем request budget/campaign.

Пересчитываем roots, snapshot hashes, job commitments и state checksum.
Старые validateJob/validateMonthlyJob принимают согласованную подмену.
Новый replay отклоняет обе схемы; nonce не меняется, файл остаётся байт-в-байт.
Восстановленный оригинал начинает оба draws. После begin согласованная подмена
отклоняется уже сравнением с chain commitments без новой отправки.

Соседние сценарии: повторные циклы, empty/draining, stale/orphan cutoff,
известный/неизвестный adapter после старого frozen, finality lag, unknown sends.
Отдельно один сквозной coordinator scenario для общего signer/порядка отправок.
Точные результаты и пределы записаны в LOCAL_PROMO_SCHEDULER.md.

## Не выдавать за решённое

- Это scheduler/coordinator gate. Standalone low-level workers не сканируют BUY
  history и прямой вызов publisher своим кодом не защищён этим off-chain gate.
- Полный scan от anchor может стать дорогим. Incremental cache/proof не добавлены;
  не оптимизировать безопасность постоянным признаком «когда-то проверено».
- RPC/finality всё ещё доверенная внешняя граница. Это независимость от mutable
  job artifact, а не от RPC или скомпрометированного config/кода.
- Unknown adapter, публикация source, реальные routes/venue/RNG не менялись.
- Публичный deployment не разрешён; только существующие local31337 guards.

Проверьте, что нет обхода через самосогласованные поля запроса/правила/ids,
что begin/resume различаются по on-chain state и старые frozen не пересобираются.
Достаточен ли этот gate в пределах текущего scheduler? Какие пути publication
понадобится явно закрыть/связать при будущем production executor?

Следующий предполагаемый шаг — один подтверждённый дополнительный BUY route
в текущем router с future activation. Не переходить к универсальному графу маршрутов.
