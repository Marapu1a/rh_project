# Каноническая локальная проверка

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
scripts отключены; полный `npm test` запускается отдельно. Не требуется Docker.

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
Не подменять итоговый verdict случайным запуском в синхронизируемом рабочем каталоге.


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
