# Постоянный ответ GPT

Обновлено: 23.09.2026.

Это независимое инженерное мнение по просьбе пользователя. Файл при следующем обращении
полностью перезаписывается.

## Обращение к Codex: убрать повторную Solidity-компиляцию из test loop

Пользователь справедливо недоволен циклом «пять минут кода — до 25 минут тестов».
Сокращать покрытие вслепую не нужно: основной расход сейчас находится не в самих сценариях.

Замер GPT на полном run HEAD `50599bc`:

- `npm run test:review`: 336/336, общий test duration **606.4 s**;
- сумма duration всех 336 test cases из лога: примерно **222.0 s**;
- неатрибутированный межфайловый overhead: примерно **384.4 s**;
- одна `compile({writeArtifacts:false})`: **16.843 s**;
- в полном списке 35 test files, из них **22 вызывают `compile()` при загрузке модуля**.

`22 × 16.8 s ≈ 370 s`, что почти полностью объясняет 384 s overhead. Каждый test file
исполняется отдельным Node process, а `--test-concurrency=1` последовательно компилирует весь
набор `contracts/` + `test/contracts/` заново. В среде Codex тот же эффект раздувает baseline
до 1466.8 s. `npm ci` занимал 4–12 s и причиной не является. Новые role-casing tests занимают
около двух секунд, то есть продуктовая проверка не выросла на пятнадцать минут.

## Предлагаемый bounded package

Сделать **ровно одну свежую Solidity-компиляцию на один test invocation**, без persistent
cache между коммитами и без изменения самих 336 сценариев.

Предпочтительная схема:

1. Добавить небольшой Node test launcher, который перед `node --test` один раз вызывает
   обычный `compile()` и получает `artifacts/compiled.json`.
2. Launcher передаёт дочерним test processes абсолютный путь к этому artifact и SHA-256 его
   байтов через отдельные test-only env variables.
3. `compile.cjs`, когда такой env contract присутствует и `sourceOverrides` пуст,
   проверяет path/file/digest, читает artifact и возвращает его вместо нового `solc.compile`.
4. Если env contract заявлен, но artifact отсутствует, повреждён или digest не совпадает —
   fail closed. Не делать тихий fallback к 22 повторным компиляциям.
5. Без test-only env поведение `compile()` остаётся прежним. Research paths с
   `sourceOverrides` всегда компилируются самостоятельно и не используют общий artifact.
6. `npm test` переводится на launcher; `npm run test:review` автоматически получает ускорение,
   потому что вызывает `npm test`. CLI, которым нужен `artifacts/compiled.json`, продолжают
   видеть созданный artifact.

Это намеренно cache **внутри одного запуска**, а не долгоживущий content cache. Поэтому не
нужно в первом пакете проектировать invalidation по source/import/package-lock/solc и рисковать
тем, что тесты незаметно проверят старый bytecode.

## Границы

- Не удалять, не объединять и не переписывать продуктовые тесты ради скорости.
- Не включать `--test-concurrency=2/4` в тот же пакет. Сначала убрать повторный solc и получить
  чистый замер; параллелизм — отдельный следующий эксперимент после проверки изоляции Hardhat,
  temp state и child-process сценариев.
- Не добавлять persistent cache между checkout/commit.
- Не смешивать с named review profiles, venue/RNG/recovery или продуктовыми изменениями.
- Сохранить stdout/stderr, signal/exit code и поведение review-runner без маскировки failure.

## Регрессии и критерий приёмки

Сначала достаточно адресных проверок launcher/loader:

- два compile-heavy test files проходят, а ordinary `solc.compile` вызывается один раз;
- missing/corrupt/digest-mismatched artifact отклоняется ненулевым exit;
- `sourceOverrides` не читает общий artifact;
- прямой запуск без env сохраняет прежнюю семантику;
- child CLI видит тот же `artifacts/compiled.json`.

После этого оправдан **один** canonical `npm run test:review`: изменение затрагивает test harness
всего suite, поэтому это контрольная точка, а не возврат к full после каждого commit. Записать:

- pass/fail и cleanup;
- число ordinary Solidity compilations;
- install/test/total duration до и после на той же машине.

Критерий успеха — 336 тестов остаются зелёными, ordinary compilation выполняется один раз,
а время заметно падает. На машине GPT последовательный теоретический минимум после этого
около 4 минут вместо 10; на более медленной среде точную цифру надо получить замером, а не
обещать заранее.

Если compile-once даст ожидаемый эффект, только затем отдельно рассматривать concurrency=2.
Сейчас переписывать suite — дорогой способ лечить проблему, которая почти целиком состоит из
21 лишнего запуска solc.
