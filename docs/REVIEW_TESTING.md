# Каноническая локальная проверка

## Как выбирать объём (решение пользователя 23.09.2026)

Небольшой шаг проверяем адресно вместе со значимыми соседними сценариями; docs-only —
ссылки и diff. Полный набор запускаем для широких изменений, накопленного пакета,
контрольной точки или риска, который не закрывают адресные тесты. Перед full run
коротко называем причину. Каждый commit/push или передача GPT не требуют нового full run.
После успешной проверки не повторяем её без нового основания.

Изоляция сохраняется, но не означает обязательного запуска всех тестов. Runner поддерживает группы и фильтр сценариев, описанные ниже. Частичная проверка
достаточна для ограниченного шага, но не объявляется полным baseline.

## Полный профиль

```powershell
npm run test:review
```

Команда проверяет полный `npm test` закоммиченного HEAD. Dirty/untracked изменения
отмечаются в выводе, но не копируются. Перед оценкой своего изменения сделайте commit.
Runner создаёт detached git worktree в системном temp вне checkout, проверяет HEAD
и отсутствие `.local`, затем создаёт runtime каталоги. Git metadata остаётся доступной
manifest exporter. Основной `.local`, locks и untracked файлы не читаются и не копируются.

Зависимости устанавливаются заново через `npm ci --ignore-scripts --no-audit --no-fund`
по package-lock. Нужны Git, установленный Node/npm и доступ к npm registry либо достаточный
npm cache. Имеющийся node_modules основного checkout не используется. Lifecycle install
scripts отключены; выбранный профиль `npm test` запускается отдельно. Не требуется Docker.

Печатаются HEAD/dirty, Node/npm/Hardhat/ethers/solc, путь worktree и точные команды.
Полный stdout/stderr и result.json сохраняются в `<temp>/rh-review-*/.local/logs/`.
После завершения удаляется только созданный worktree; небольшой каталог с evidence
остаётся. Main checkout и его runtime state не очищаются.

При test failure сохраняется исходный exit code. Ошибка cleanup сообщается отдельно;
если тесты зелёные, cleanup failure делает итоговый код ненулевым. Перед `git worktree
remove --force` проверяются абсолютный путь, случайный owner token и отсутствие
перенаправления каталога. Чужой/заблокированный worktree не разблокируется автоматически.
После принудительного убийства runner/ОС cleanup не гарантируется: оставшийся путь
диагностируют отдельно, а не удаляют чужие locks. SIGKILL и падение ОС не являются finally.

## Короткая проверка самого runner

```powershell
npm run test:review -- --self-test
node --test test/review-runner.test.cjs
```

Self-test создаёт настоящий worktree с git provenance и пустым runtime, но НЕ
устанавливает зависимости и НЕ запускает продуктовые тесты. Его зелёный результат
не является baseline. Unit tests дополнительно проверяют сохранение source lock,
отказ cleanup и сохранение test exit через отдельный fixture npm, не настоящий install.

## Как читать результат

Зелёный full profile — локальный baseline только указанного HEAD и напечатанного
окружения. Красный требует разбора phase: install/toolchain, test или cleanup.
Сам runner не превращает сетевую ошибку npm registry в дефект контракта.
Git metadata и отдельный runtime устраняют прежние самодельные различия review;
это изоляция checkout, не контейнер и не доказательство независимости от ОС/toolchain.
Fork/live сети, реальные RPC/RNG/venue и production readiness сюда не входят.
Полный baseline подтверждается каноническим runner; адресные результаты описываются
отдельно с точной командой и окружением. Окружение не должно искажать verdict.


## Подтверждённый baseline 22.09.2026

`npm run test:review`, чистый HEAD `e0407e15efb2281d955dd5c83df2c02df395a709`:
334/334, fail/skipped/cancelled 0, 1462.0 s тестов; install/test/final exit 0,
cleanupError null. Node v24.21.0, npm 11.19.0, Hardhat 2.29.1, ethers 6.17.0,
solc 0.8.37. npm ci установил 242 пакета за 33 s; worktree удалён.
Evidence: `C:\Temp\rh-review-8uIG7f\.local\logs\review.log` и `result.json`.
Копия вывода вызова: `.local/logs/review-canonical.log` (перенаправлена вызывающей
командой; сам runner пишет только свой temp evidence).

`npm run test:review -- --self-test` — exit 0, cleanup OK на том же HEAD.
`node --test test/review-runner.test.cjs` — 4/4; они также включены в 334 полного набора.
После этого baseline менялись только документы. Fork/live профили не запускались.


## Группы, фильтры и однократная компиляция (23.09.2026)

```powershell
# Быстрая проверка текущего рабочего дерева
npm run test:group -- --profile infrastructure
npm run test:group -- --profile coordinator --match "role casing|inspection manifest"
# Та же выборка закоммиченного HEAD в изолированном worktree
npm run test:review -- --profile coordinator --match "role casing|inspection manifest"
# Полный контрольный прогон
npm run test:review
```

`--match` — regex имён сценариев, не файлов. Неверная группа/regex или отсутствие
выполненных сценариев дают ненулевой exit. Фильтр всегда означает частичную проверку,
даже с profile=full. `executedCases` учитывает именно сценарии: Node может отдельно
считать пустой файл с несовпавшим фильтром как успешный wrapper; это не покрытие.
`--self-test` review-runner проверяет лишь инфраструктуру worktree и несовместим с фильтром.

Источник состава — `scripts/test-profiles.json`. Все прежние 336 сценариев сохранены;
добавлены инфраструктурные регрессии. Research drand suites, ранее не входившие в
npm test, не добавлены в full автоматически.

| Группа | Основная область | Когда расширять проверку |
|---|---|---|
| accounting | FeeRouter, vault, funding, converter, prize-flow | Изменение общего vault: добавить Short/Monthly; изменение последовательности worker: coordinator |
| short | dataset, epochs, outcomes, settlement, dual/lifecycle | Общая settlement/custody или shared policy: monthly и accounting |
| monthly | epochs, replay, dual/lifecycle, controllers | Общая settlement/custody или shared policy: short и accounting |
| replay | registry, BUY decoder, lifecycle, monthly replay, Nitro fixtures | Формат jobs/cutoff и handoff: coordinator и smoke |
| coordinator | coordinator, scheduler, budget, transaction, state-lock | Identity/refill admission: добавить refill; RPC/state recovery: recovery |
| recovery | executor stability, refill state/executor/process/inspector, transaction/lock | Общие receipt/state primitive: coordinator; полный профиль при неясных связях |
| refill | planner/state/executor/process/inspector, budget, lock | Автоматический funding в worker: coordinator |
| math | чистые budget/refill расчёты | Изменение используемой runtime политики: refill/coordinator |
| smoke | один сквозной BUY → Short/Monthly → claims/next cycle | Не заменяет негативные тесты модулей |
| infrastructure | launcher/loader/reporter и review runner | Общий harness влияет на весь suite: один full после адресных проверок |
| full | весь основной набор | Широкие изменения, контрольная точка или непокрытый межмодульный риск |

Это карта зависимостей для выбора, не автоматическое разрешение всегда ограничиваться
одной группой. Для маленького изменения сначала конкретные сценарии и значимые соседи;
для изменения общего API проверяем всех затронутых потребителей. Старые прямые node --test
команды остаются рабочими, но вне launcher не получают compile-once и общий отчёт.

### Artifact contract

Контрактные профили делают одну свежую полную компиляцию проекта перед Node test runner.
Launcher игнорирует унаследованные RH_TEST_ARTIFACT/RH_TEST_ARTIFACT_SHA256 и audit env,
создаёт уникальную копию artifact внутри своего .local/logs/test-run-*, передаёт дочерним
процессам абсолютный путь и SHA-256 байтов. compile.cjs проверяет файл/digest/структуру;
заявленный, но неверный контракт даёт ошибку без fallback к новой компиляции.
artifacts/compiled.json остаётся доступен существующим CLI.

Без этого env compile() работает по-прежнему. Непустой sourceOverrides всегда идёт
через настоящий solc независимо от artifact env; writeArtifacts:false не перезаписывает
обычный artifact. Постоянного cache между invocation/commit нет. Сохранённый файл отчёта
не является основанием повторно использовать bytecode в следующем запуске.
math/refill/infrastructure не требуют предварительной компиляции проекта.
Компиляторные fixture-тесты отдельно компилируют маленький Probe в своих временных папках;
они не входят в счётчик общей компиляции проекта.

Параллелизм остался 1. Один launcher на checkout: fixed artifacts/compiled.json и некоторые
старые CLI fixture paths общие. Для независимых параллельных запусков нужны разные worktrees.
Snapshots/повторное использование deployment и изменение продуктовых тестов не реализованы.

### Отчёты и границы

Launcher пишет result.json, timings.json и compilation audit в уникальный
.local/logs/test-run-*. В result: выбранные файлы/regex/fullSuite, actual executedCases
в timings, compile/test/total ms, число обычных компиляций/повторных чтений, per-file wall
(включая старт процесса) и case duration, counts и exit/signal. Нулевой exit требует
полного per-file evidence и ожидаемого числа компиляций проекта (1 либо 0).

Review-runner копирует result.json с вложенными timings в свой внешний evidence-каталог
до удаления worktree. Внешний result.json содержит testReports, install/test/total ms.
Внутренние artifact/dir пути в скопированном отчёте исторические; сами artifacts после
cleanup не сохраняются. stdout/stderr, исходный ненулевой test exit и cleanup failure
не скрываются. Launcher пересылает SIGINT/SIGTERM тестовому процессу; принудительное
завершение ОС не обещает cleanup, как и раньше. Reporter проверен на текущем Node 24;
изменение формата событий в другой версии потребует отдельной валидации.
