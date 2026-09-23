# Постоянный ответ GPT

Обновлено: 23.09.2026.

Это независимое review-мнение, не задание на автоматическое исполнение. При следующем
обращении файл следует полностью перезаписать.

Просмотрен HEAD `50599bcef669da14523134d37b273650c7702db2`; runtime-пакет role casing —
`0e5d8ea235328d7f06eade70bd32450a3856996b`, после него менялись только документы.

## Вердикт

Пакет принимаю. Подтверждённых дефектов в канонизации role addresses или admission старых
journals не нашёл. Он закрывает зафиксированный hash drift между lowercase deployment и
checksummed runtime, не расширяя migration до произвольного stored hash и не меняя
продуктовые контракты.

GPT запустил ровно `npm run test:review` на HEAD `50599bc`:

- dependency install: exit 0, 242 packages;
- полный suite: **336/336**, fail/skipped/cancelled 0, 606.4 s;
- final exit: 0;
- cleanupError: null;
- disposable checkout `/tmp/rh-review-nqz8hT/checkout` удалён;
- его worktree registration после завершения отсутствует;
- `git diff --check a0a5fb0..50599bc` — чисто;
- пользовательский `docs/INDEPENDENT_AUDIT_2026-09-19.md` не изменён и не входил в
  tested HEAD.

Среда GPT: Node 24.19.0, npm 11.9.0, Hardhat 2.29.1, ethers 6.17.0, solc 0.8.37.
Fork/live не запускались.

## Что проверено по коду

- Новая identity нормализует только `prizeExecutor`, `executor`, `publisher` через
  `ethers.getAddress`; `publisher: null` остаётся `null`.
- Legacy unbudgeted config не меняется. Для уже checksummed budget/refill callers новый
  hash совпадает с прежним.
- Старые кандидаты строятся из точного прежнего budget object и checksum/lowercase/
  uppercase представлений **тех же** role addresses. При трёх ролях это максимум 27
  комбинаций плюс отдельно исходный raw candidate; hash из journal не используется для
  восстановления или расширения конфигурации.
- Любое другое поле остаётся частью прежнего config object. Изменение настоящего адреса,
  policy, domain или другой конфигурации не маскируется как casing migration.
- Admission выполняется под существующим lock после checksum/schema проверки. Coordinator
  pending отклоняется до migration write. Для refill domain/history и `history.pending`
  проверяются до записи нового `configHash`.
- Resolved migration меняет только identity/checksum; jobs, history, spend, cooldown,
  nonce, lastResolved и gas observations сохраняются. Повторный canonical admission не
  переписывает файл.
- Lowercase deployment manifest проходит полный export/verify/inspect CLI путь и совпадает
  с checksummed signer runtime identity. Raw deployment provenance при этом закономерно
  остаётся побайтно отличимой от другого входного файла.

Новая регрессия с другим role address проверяет именно pre-fix budget/refill migration.
Старый unbudgeted→budget переход по-прежнему вводит роли впервые, потому что в старой
схеме их вообще не было. Это прежняя явно сохранённая граница совместимости, а не новый
casing bypass.

## Что дальше

Identity/manifest ветку считаю закрытой; ещё один технический пакет вокруг неё сейчас будет
полировкой уже зелёного места.

Следующий действительно необходимый шаг перед внешними интеграциями — **зафиксировать один
MVP release profile как продуктовое решение**, без немедленного написания кода:

- доля проекта в creator revenue;
- формула Short budget `D`;
- `K`, веса и минимальный приз `m`;
- численные параметры допуска Short и Monthly;
- минимальная готовность и execution budgets;
- finality и поддерживаемый participant envelope.

После утверждения одного профиля нужен ограниченный economic/farming sweep: conservation,
ожидаемый расход, вероятность выигрыша, доминирование одного и нескольких кошельков,
поведение при малом/большом числе участников и достаточность операционного бюджета. Только
после этого имеет смысл выбирать конкретный venue/BUY decoder, real swap и RNG. Иначе можно
очень качественно интегрировать продукт, численные правила которого всё ещё не выбраны.

Это рекомендация для выбора следующего шага, не автоматическое поручение Кодексу менять
`PRODUCT_SPEC` или реализацию без решения владельца.
