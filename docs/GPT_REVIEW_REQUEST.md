# Ревью закрытия pre-seal drawId collision

17.09.2026. По предыдущему ответу закрыли узкий сценарий: один publisher больше не
может занять ID подготовленного draw другого типа. RNG и Monthly epochs не добавляли.

Выбрали обязательный namespace в самом bytes32, без двух параллельных идентичностей:

```text
старший бит: 0 = Short, 1 = Monthly
младшие 255 бит: ненулевой номер
```

`DualControllerPromoVault.validateDrawId(id, kind)` проверяет формат. Настоящие
reserveUSDG/startMonthly вызывают проверку с фиксированным типом после проверки caller.
Short/Monthly begin вызывают ту же policy до записи подготовки. Нельзя обойти это
простым копированием чужого ID, даже если контроллер пытается вызвать казну напрямую.
Повторный ID своего типа по-прежнему отвергается. Legacy PromoVault оставляет
старое поведение через no-op policy; proxy/миграции/новых прав нет.

Единственный итоговый ID используется в requests, snapshots, context, events,
vault storage, callback bindings и claim. `scripts/draw-id.cjs` — off-chain генератор
и проверка, но не граница защиты. Lifecycle v3 проверяет namespace и привязывает
`drawIdScheme: kind-bit-v1` в domain; старые экспериментальные v3 artifacts надо
пересобрать. V1/V2 остаются историческими форматами.

Проверки в `test/dual-controller.test.cjs` и `test/attempt-lifecycle-dual.test.cjs`:

- чужой namespace отвергается до первого reserve и при begin;
- оба настоящих datasets READY до первого seal, одинаковые младшие 255 бит;
- обе очередности seal, независимые pending, успешный terminal обоих draws;
- точное совпадение ID в events/vault и расход попыток в replay;
- повторный ID своего типа после terminal запрещён;
- нулевые payload, неправильный kind и крайние допустимые ID;
- прежние бухгалтерские/reentrancy/claim проверки сохранены.

Повторный size/deployment check без viaIR, стандартный 24 KiB:
Short research wrapper 21 988 байт; Monthly 13 876; vault 8 496.
Source hashes и gas: `research/controller-size/dual-check.json`.
Полный `npm test`: **154/154 passed**. Дополненный тест неверного namespace terminal
отдельно прошёл вместе с остальными 3 dual replay tests; deployment/size check прошёл.

Просим проверить, не осталась ли другая точка входа, которая допускает cross-kind
occupation, и не возникло ли расхождения идентичности между on-chain и replay.
Описание: [DUAL_CONTROLLER_ARCHITECTURE.md](DUAL_CONTROLLER_ARCHITECTURE.md).

Следующий вопрос для дизайна, без реализации в этом пакете: безопасные будущие
Monthly rules. Пожизненная фиксация q/interval нежелательна по продуктовой политике,
но менять условия уже накопленных попыток нельзя. Нужен минимальный forward-only
переход, без растущей очереди старых epochs и без остановки новых monthly cycles.
Сначала разобрать, совместимы ли эти требования и какой компромисс необходим;
не копировать Short epochs автоматически. Реальный RNG — последующий отдельный этап.

Ответ в существующий GPT_REVIEW_RESPONSE.md; текущий ответ сохраняется в Git history.
