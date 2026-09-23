# Постоянный ответ GPT

Обновлено: 23.09.2026.

Это независимое review-мнение, не задание на автоматическое исполнение. При следующем
обращении файл следует полностью перезаписать.

Просмотрен HEAD `74d882b1dfcc3dec33247f07b8afe6e47a9e15a3`; runtime-пакет runner-а —
`e0407e15efb2281d955dd5c83df2c02df395a709`.

## Вердикт

Canonical review runner принимаю. Он закрывает именно процессную проблему, ради которой
был сделан, и не лезет в product runtime, recovery или конфигурационную identity.

GPT запустил ровно документированную команду `npm run test:review`, без дополнительного
archive, ручного temp checkout, reuse `node_modules` или работы в основном `.local`.
Результат на `74d882b`:

- dependency install: exit 0, 242 packages, 12 s;
- полный suite: **334/334**, fail/skipped/cancelled 0, 620.0 s;
- final exit: 0;
- cleanupError: null;
- disposable checkout физически удалён;
- запись worktree в Git отсутствует после завершения;
- evidence/result.json сохранены вне удалённого checkout;
- основной `docs/INDEPENDENT_AUDIT_2026-09-19.md` не изменён и не попал в tested HEAD.

Среда GPT отличалась от записанного Codex baseline по minor toolchain
(Node 24.19/npm 11.9 против Node 24.21/npm 11.19), но pinned project dependencies совпали:
Hardhat 2.29.1, ethers 6.17.0, solc 0.8.37. Оба канонических запуска зелёные. Runner честно
печатает эту границу и не изображает container/reproducible OS, поэтому расхождение не скрыто.

## Что проверено в runner-е

- тестируется committed HEAD, dirty/untracked файлы только отмечаются и не копируются;
- temp root создаётся вне source checkout, `.local` начинается пустой;
- manifest exporter получает настоящую git metadata из detached worktree;
- зависимости ставятся через `npm ci --ignore-scripts --no-audit --no-fund`;
- из дочерней среды удаляются влияющие `GIT_*`, `NODE_OPTIONS`, `NODE_PATH`,
  `HARDHAT_CONFIG`, `INIT_CWD`;
- test exit сохраняется при cleanup failure; cleanup failure после зелёных тестов делает
  общий exit ненулевым;
- перед удалением проверяются temp ancestry, owner token, точный checkout path и отсутствие
  symlink/redirect;
- locked worktree не разблокируется и не удаляется вторым `force` автоматически;
- self-tests действительно моделируют test exit 0/7 и cleanup refusal, но не выдаются за
  продуктовый baseline;
- forced process/OS termination честно оставлен за пределами finally guarantee.

Подтверждённых дефектов runner-а, требующих ещё одного инфраструктурного раунда, не нашёл.
Оставшиеся npm warnings по indirect `uuid/glob` не относятся к этой задаче и не должны
раздувать следующий пакет.

## Единое правило дальнейших review

- Итоговый локальный baseline — только `npm run test:review` на указанном commit.
- Ad-hoc запуск в основном checkout может использоваться для быстрой диагностики, но не
  для финального вердикта.
- Install/test/cleanup phases различаются; registry outage не называется code failure.
- Fork/live/RPC проверки остаются отдельными профилями с явными prerequisites.
- Новый способ «чистого запуска» больше не изобретается на каждом review.

## Следующий bounded step: role-address casing

Теперь можно отдельно закрыть оставшийся настоящий identity finding. Lowercase и checksum
формы одного Ethereum address проходят `ethers.isAddress`, но сейчас дают разные budget
`configHash`, потому что `roles` сохраняются в исходном регистре.

Минимальная безопасная схема:

1. Канонизировать `prizeExecutor/executor/publisher` внутри общего identity builder одним
   способом (`ethers.getAddress`) до построения нового budget/refill config.
2. Сохранить точную pre-fix raw-role config как explicit legacy identity candidate, а не
   разрешать произвольный старый hash.
3. Для resolved journal разрешить штатную identity migration raw-case → canonical без
   сброса jobs, history, spend, cooldown, nonce и gas observations.
4. Любой coordinator pending по-прежнему должен запрещать migration до reconciliation.
5. При native refill migration повторно проверить тот же funding domain/history guard до
   записи canonical configHash.
6. Manifest, построенный из lowercase deployment roles, должен совпасть с runtime signer
   roles в checksum form.

Нужные regressions:

- lowercase deployment ↔ checksum runtime дают один новый configHash;
- уже canonical state не переписывается;
- resolved pre-fix raw-case budget state мигрирует, сохраняя остальные поля;
- resolved pre-fix refill state мигрирует только при совместимом history domain;
- pending raw-case state остаётся byte-identical и отклоняется;
- произвольная смена реального role address не проходит как case migration.

Не добавлять сюда venue/RNG/swap, manifest redesign, reset/repair или release profile.

## Выполненные проверки

- `npm run test:review` — **334/334**, exit 0;
- независимая проверка `result.json`, удаления checkout и отсутствия worktree registration;
- `git diff --check 83f3812..74d882b` — чисто;
- fork/live не запускались.

Итог: процесс теперь настроен. Следующий красный canonical run можно разбирать как нормальный
сигнал, а не начинать очередной спиритический сеанс с `.local` и отсутствующим `.git`.
