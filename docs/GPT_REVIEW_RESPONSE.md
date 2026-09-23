# Постоянный ответ GPT

Обновлено: 23.09.2026.

Это независимое review-мнение, не автоматическое задание. При следующем обращении файл
полностью перезаписывается.

Просмотрен HEAD `fccc916c590cd94af5945fa74c228b9b01bf5205`; пакет — bounded recovery
координаторского `--watch` после временных RPC read failures.

## Вердикт

Пакет принимаю. Подтверждённых дефектов в границах retry, переносе error metadata,
reconciliation известного hash, startup recovery или stopped-state не нашёл.

Разрешение на повтор получилось достаточно узким:

- retry возможен только для классифицированной временной transport/read-ошибки;
- broadcast без известного hash, cleanup/storage failure, changed network,
  semantic JSON-RPC error и неизвестная ошибка остаются fatal;
- известный hash не отправляется повторно: новый проход сначала попадает в существующую
  reconciliation/receipt-ветку;
- `pendingReceipt` опрашивается с обычным `pollSeconds`, а не ускоренным backoff;
- backoff ограничен 1/2/4/8/16/30 секундами и сбрасывается после успешного прохода;
- single-shot API не превратился в скрытый retry loop;
- SIGINT/SIGTERM прерывают ожидание между проходами, не создавая ложного обещания
  отменить уже выполняющийся RPC scan;
- временные признаки retry не дают полномочий менять journal, lock или identity.

Отдельно проверил путь startup HTTP outage: ленивое создание coordinator options позволяет
пережить недоступность RPC до первого успешного прохода, а не только сбой после запуска.
Structured HTTP status в replay scanner согласован с общей allowlist.

## Независимые адресные проверки GPT

Полный suite не запускался: для этого локального пакета он не нужен.

1. `npm run test:group -- --profile watch`
   - 6/6, exit 0;
   - 0 project compilations;
   - около 0.33 s total.

2. Coordinator neighbor filter: `watch CLI|hashless broadcast failure|native refill pending|scheduler isolates known rejection|cleanup`
   - 10 фактически выбранных cases, pass 10, exit 0;
   - одна project compilation, два reuse;
   - compile 17.16 s, tests 23.11 s, total 40.28 s.

3. `npm run test:group -- --profile infrastructure`
   - 9/9, exit 0;
   - 0 project compilations;
   - около 1.90 s total.

`git diff --check 130a029..fccc916` чист. Пользовательский untracked-файл
`docs/INDEPENDENT_AUDIT_2026-09-19.md` не менялся и в проверяемый HEAD не входил.

Старый результат 341/341 относится к предыдущей контрольной точке и не объявляется
валидацией этого пакета. Для текущего изменения evidence — только перечисленные scoped runs.

## Дальнейший ход

Runtime watch теперь достаточно устойчив для нынешнего локального контура. Следующий
наиболее полезный шаг, на мой взгляд, — **не ещё один инфраструктурный recovery package**,
а фиксация владельцем одного численного MVP-профиля экономики в product spec:

- creator share;
- Short D;
- K / веса / `m`;
- численные admission limits для Short и Monthly;
- минимальные readiness/execution budgets;
- finality policy и допустимый participant envelope.

До решения владельца это не просьба кодить или самостоятельно выбирать цифры. После
фиксации профиля разумен ограниченный economic/farming sweep на выбранных значениях и
краях диапазонов; только затем — выбор первого реального внешнего integration slice
(venue/BUY, swap/RNG/finality в согласованной последовательности).

Process-death/stale-lock ownership остаётся настоящим pre-production вопросом, но сейчас
его лучше не проектировать в отрыве от будущей модели запуска и supervisor. Иначе есть риск
закрепить локальную схему, которую придётся переделывать при выборе deployment runtime.

Итого: этот пакет закрыть, scoped testing сохранить как норму, а следующий разговор
начать с численного MVP-профиля и границ экономической проверки, не с нового кода.
