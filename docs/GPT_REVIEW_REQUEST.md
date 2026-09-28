# Текущее обращение к GPT — recovery admission и автоматическое завершение frozen draw

28.09.2026. Закрыли найденную startup boundary целым пакетом, не простым снятием gate.
Сначала прочитай `docs/RECOVERY_ADMISSION.md`, затем изменённые scripts/tests.

## Решение

- Robinhood rehearsal сначала выполняет структурную prepareRuntime с отложенными
  contract checks и под прежними locks сверяет main/funding/RNG journals. Scheduler
  sends покрыты main marker. Неизвестный hash блокирует всё; known receipt проверяется
  по исходным данным и canonical block. Никакого нового формата журнала/reset.
- Отдельный obligation admission проверяет критические token/quote/registry/vault/
  controllers/adapter pins, обратные bindings, instances, generation/RNG profile,
  anchors/stable observation. Current publisher и revenue/BUY source не требуются.
- Full admission управляет только новыми операциями. Добавлена simulated collector.sync
  health check: stored sourceFingerprint не обнаруживает актуальный policy drift сам.
- При failed full admission или Robinhood drain: только prove/deliver, frozen
  process/finish, terminal claims. Даже сохранённые Ready jobs не freeze; funding
  pull/pay, publish/begin/checkpoint/closeEmpty запрещены на финальном action guard.
- Frozen jobs проходят старые checksum/publication/root/context/result checks без
  повторного чтения внешнего BUY policy. Переписанный artifact не проходит on-chain
  сверку. Исчезнувшая started-заявка не скрывается frozen-only фильтром.
- Новый pass автоматически возвращается к normal при восстановлении исходного профиля.
  Новые pins/policy не принимаются автоматически; старые creator credits остаются в
  collector до нормального режима. Прежний local31337 drain/handoff не переопределён.

## Проверено

33 разных продуктовых адресных сценария +1catalog прошли отдельными запусками.
11 новых recovery,22 соседних (203.3s). Не full suite; команды и corrections в модуле.
Solidity не менялся, проверяемая compilation artifact повторно использована.

Новый сквозной кейс4663: synthetic prepared/frozen Short+Monthly → сломаны source и
BuyPolicySource → worker автоматически prove/deliver/process/finish/claim обоих →
повторный pass0tx → восстановлен source/policy → normal/funding. Раньше process/finish
в public fixture делались вручную; теперь этот recovery путь полностью выполняет worker.

Дополнительно: source policy drift без bytecode change; drift в estimate до send;
Ready jobs при recovery/drain; publisher rotation; known/unknown funding send;
RNG receipt при broken adapter и последующее продолжение без двойного prove;
wrong critical bytecode, изменённый frozen artifact, disappeared started job.

Initial participants/dataset/begin/publish/seal подготовлены fixture. USDG/source
синтетические, clock исторический, ArbSys shim. Normal Ready-resume test подменяет
operational preflight. Не называем это real BUY→freeze/mainnet/Nitro finality proof.
Public inspect/no-send gate сохранён, live/fork/pубличных tx не было.

## Вопросы для независимого review

1. Нет ли пути к новому обязательству через recovery/Ready job/drain или окна после estimate?
2. Достаточна ли on-chain сверка frozen artifacts при отказе от повторного BUY-policy read?
3. Правильно ли reconciliation отделён от contract checks, не теряет ли неизвестный send?
4. Остались ли обязательные ошибки в этой границе? Не расширяй до универсального
   аварийного спасателя: damaged critical contracts/missing jobs/unknown hash остаются halt.
5. Если здесь всё нормально, следующий результат должен быть релизным: archive RPC и
   реальные deployment/BUY pins либо эксплуатационный fee/refill профиль. Что сейчас
   действительно блокирует продвижение, без очередной серии вспомогательных аудитов?

Дополнительные reads перед действиями осознанны, но provider throughput/cost ещё требуют
реального измерения. Review не утверждает production timing, экономику или release.
