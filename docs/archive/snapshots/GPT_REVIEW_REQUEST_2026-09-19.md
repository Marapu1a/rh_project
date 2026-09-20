# Ревью: drand binding — проверенные контрпримеры

> Архив на 19.09.2026: исторический отчёт/обсуждение, не текущий план и не самостоятельная спецификация.
> Начало работы: [CURRENT_CONTEXT](../../CURRENT_CONTEXT.md). Условия и выводы ниже относятся к указанному этапу.

18.09.2026. Сделали ограниченную JS-модель двух кандидатов: seal-time+lead
и fixed schedule+lead. Основные Solidity contracts не менялись.

[Отчёт](../../DRAND_BINDING_MODEL.md), scripts/drand-binding-model.cjs,
test/drand-binding-model.test.cjs, research/drand-binding/model-result.json.
Запуск: npm run test:drand:binding — 7/7 passed, 40 timing combinations.
Это синтетическая модель с deterministic verifier stub, не новая BLS/EVM проверка.
Полный набор основных contracts не повторяли: их код в этом пакете не менялся.

Подтвердили:

- внутри сохранившейся истории один target, повтор/late proof не меняет seed;
- zero seed допустим; wrong round/forged proof отвергается;
- proof reorg/restart не меняет сохранённый target;
- Short/Monthly могут легально использовать один beacon через разные contexts.

Воспроизвели три ограничения:

1. Stale chain clock на 2 часа + lead 1 час выбирает уже известный round.
   Этим может пользоваться publisher без контроля над sequencer.
2. Freeze reorged после раскрытия R: replacement history получает другой target.
   Задержка proof delivery не скрывает уже публичную randomness.
3. Fixed schedule: при опоздании target уже наступил; нужен определённый переход
   ДО freeze, а не молчаливое зависание или reroll существующего обязательства.

Числа — тестовые входы, не рекомендованные параметры и не статистика атак.
7/7 означает, что воспроизведены в том числе небезопасные случаи; production не готов.

Нужен теперь конкретный узкий ответ, а не ещё один обзор RNG:

1. Какая минимальная модель часов/свежести предотвращает known-result binding
   против publisher? Если только operational monitor — явно DETECT, не ENFORCE.
2. Как обеспечить автоматическое продвижение до freeze при пропущенном расписании,
   сохранив attempts и не позволяя выбрать результат для уже frozen context?
3. Что именно принимаем как допущение о сети, и можно ли сделать его независимо
   проверяемым по публичной истории? Не путать RPC safe/finalized с on-chain proof.
4. Если предлагается anchor, кто определяет единственный canonical anchor, как
   исключаются выбор из нескольких anchors и late delivery уже известного round?

Не вводим emergency seed, provider switching, reset frozen draw, fallback round,
новую казну или AA recovery в этот пакет. Не объявляем fixed delay гарантией.
Следующий Solidity prototype пишем после компактного решения этой trust boundary.
Ответ — в прежний GPT_REVIEW_RESPONSE.md.
