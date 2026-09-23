# Постоянный ответ GPT

Обновлено: 23.09.2026.

Это независимое review-мнение, не автоматическое задание. При следующем обращении файл
полностью перезаписывается.

Просмотрен HEAD `4f09fcc45d92816e9ebd6d9ff8d4bb03442f930e`; code-пакет scoped profiles /
compile-once — `4efca7d`.

## Вердикт

Пакет принимаю. Подтверждённых дефектов в launcher, artifact contract, профилях,
timing evidence или передаче scoped-параметров через review-runner не нашёл.

Решение попало в правильную границу:

- одна свежая project compilation на contract invocation;
- persistent cache между запусками/коммитами отсутствует;
- унаследованный artifact contract очищается;
- workers получают уникальный artifact с абсолютным path и SHA-256;
- missing/corrupt/mismatched artifact падает без скрытого fallback;
- `sourceOverrides` по-прежнему запускает настоящий solc;
- старые product cases не удалены и не объединены;
- concurrency остался 1;
- filtered run не называется full, а нулевая фактическая выборка не может быть зелёной;
- review-runner сохраняет structured evidence до удаления worktree и не маскирует
  test/cleanup failure.

Catalog сохраняет прежний основной набор и добавляет только infrastructure regressions.
Группы достаточно осмысленны как карта выбора; это не доказательство, что одного профиля
всегда достаточно, поэтому правило о затронутых consumers/соседях оставлено правильно.

## Независимые адресные проверки GPT

Полный suite повторно не запускался: Codex уже выполнил обоснованную контрольную точку на
code HEAD `4efca7d`, а последующий commit только записал результат в документы.

1. `npm run test:group -- --profile infrastructure`
   - 9/9;
   - exit 0;
   - 1.81 s launcher total;
   - deliberate failure/cleanup fixtures внутри набора отработали как отрицательные тесты;
   - project compilation 0, как и требует профиль.

2. Accounting filter по пяти реальным сценариям из пяти файлов
   - executedCases 5, pass 5, exit 0;
   - compile 16.95 s, tests 5.97 s, total 22.93 s;
   - ordinary compilation **1**, artifact reuse **5**.

3. `npm run test:review -- --profile math --match "two draws"`
   - committed HEAD `4f09fcc` в fresh detached worktree;
   - actual executedCases 2, exit 0;
   - install 3.37 s, scoped tests 0.55 s, review total 4.21 s;
   - structured evidence скопирован;
   - cleanupError null, checkout удалён и снят с регистрации.

`git diff --check 2a8b57f..4f09fcc` чист. Пользовательский
`docs/INDEPENDENT_AUDIT_2026-09-19.md` не менялся и в tested HEAD не входил.

## Полный прогон и дальнейшее правило

Записанный Codex full baseline `4efca7d`: 341/341, одна project compilation и 22 reuse;
compile+tests 1129.3 s против прежних 1466.8 s — примерно на 23% быстрее. Остаток времени
теперь в основном реальная integration workload: coordinator, scheduler, BUY cycle,
prize-flow и USDG funding, а не повторный solc.

Этого достаточно. Не предлагаю сейчас уходить в snapshots, shared deployments, fixture
rewrite или concurrency: ежедневная проблема уже решена scoped-проверками, а дальнейшая
оптимизация общего full будет отдельной дорогой задачей с новым риском тестовой изоляции.

Дальнейший рабочий режим:

- свежий небольшой шаг → его профиль/`--match` плюс важные затронутые соседи;
- docs-only → diff/ссылки;
- full → только широкий общий primitive, накопленный пакет, контрольная точка или связь,
  которую адресно доказать нельзя; причина называется до запуска;
- успешный scoped run не продолжается full автоматически из-за commit/push/review.

Тестовую инфраструктурную ветку считаю закрытой. Следующая работа должна снова двигать
сам продукт, а не бесконечно ускорять редкий полный прогон.
