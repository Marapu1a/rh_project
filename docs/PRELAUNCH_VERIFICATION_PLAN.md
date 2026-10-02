# Полная проверка перед запуском QIANQI

> Порядок уточнён пользователем02.10: сначала тестовый контур (R1–R8 с тестовыми конфигами/стендом), затем отдельный боевой перенос (R9, реальные manifest/custody/services). Это каталог критериев, не команда deployment. Начальная инвентаризация ниже датирована01.10; G02 и часть G10 уже закрыты локально, см. [контекст](CURRENT_CONTEXT.md) и [roadmap](ROADMAP.md).

[G10 — охват торговых маршрутов Pons](PONS_CHANNEL_COVERAGE.md): текущий тестовый пакет; 0x и wallet/unknown-route границы ещё открыты.

Создан01.10, обновлён02.10.2026. Статус: каталог проверок, не выполненный единый release gate.
Исходная инвентаризация относилась к HEAD3b36e0a/пакету12e64bb; это исторические ревизии, не текущий baseline.
Цель: получить воспроизводимое решение о готовности конкретного release commit,
а не накопить число зелёных тестов. План не разрешает публичные транзакции.

## Где мы сейчас

Актуальное состояние — [CURRENT_CONTEXT](CURRENT_CONTEXT.md). Локальная Pons-цепочка
BUY → policy/index → билеты → Short/Monthly → drand → claims проверена отдельными
прогонами; funding идёт через доступный USDG и collector. G02 shared config реализован.
Новый genesis v2 включает подтверждённые pool self-batches до API. Подробные команды,
ревизии и ограничения — [аудит02.10](PONS_AUDIT_2026-10-02.md).

Открытые тестовые границы:0x execution/attribution и unknown routes, реальный wallet
Buy/Claim UX, длительная нагрузка/backup/recovery, timing/finality и внешние permissions.
Расширенный scoped прогон239/239 не является полным baseline release candidate.

Боевые manifest/roles/custody/signer/services и публичная активация относятся к этапу B.
Их нельзя подменять fixture-значениями или снятием Hardhat guards. Начальная R0-карта
с исходными G01–G09 сохранена как [история](RELEASE_INVENTORY.md), а не текущий backlog.

## Учёт результатов и порядок

Один ограниченный пакет за раз. Codex выполняет проверки; GPT делает статическое
review кода/evidence по [REVIEW_TESTING.md](REVIEW_TESTING.md). Для критических
денежных контрактов рекомендована отдельная проверка профильным человеком-аудитором;
AI review и инструменты не именовать независимым профессиональным аудитом.

Каждая проверка получает ID, область/файлы, риск, сценарий, ожидаемый результат,
команду, commit+dirty diff hash, окружение/версии, seed/fork anchor при применимости,
артефакт и статус PASS/FAIL/BLOCKED/NOT_RUN/NOT_APPLICABLE с причиной. Findings:
серьёзность, воспроизведение, владелец исправления, regression test и повторное review.
Не объединять результаты разных HEAD в один full baseline. Сырые логи — .local/logs/;
компактные воспроизводимые evidence без секретов — docs/evidence/.

Последовательность: R0 → R1/R2/R3 → R4/R5 → R6/R7 → R8 → R9.
R0 сначала устанавливает, что ещё нужно реализовать; проверки не маскируют missing code.
Время внешнего аудита/ожидания сети оценить после R0, не обещать дату запуска заранее.

| ID | Пакет | Проверяемый выход | Статус (не единый gate) |
|---|---|---|---|
| R0 | Состав релиза и угрозы | [Карта runtime, ролей, доверия, незавершённых частей](RELEASE_INVENTORY.md) | DONE01.10: статическая инвентаризация |
| R1 | Код и зависимости | Findings по чистоте, логике, статическому анализу | PARTIAL02.10: Pons audit, не весь RC |
| R2 | Учёт и правила | Проверенные инварианты и тесты границ | PARTIAL: старые адресные |
| R3 | Внешняя сеть и интеграции | Pons/USDG/RPC/drand квалификация | PARTIAL: fork |
| R4 | Полные и сквозные тесты | Baseline точного RC + отдельные browser/model suites | NOT_RUN для RC |
| R5 | Сбои и восстановление | Матрица fault injection, сохранность обязательств | PARTIAL: crash/reorg |
| R6 | Нагрузка и тестовый стенд | Soak, пределы, alerts, backup restore | NOT_RUN для полного Pons стенда |
| R7 | Кошелёк и пользовательский путь | Полный browser flow + честные статусы/правила | PARTIAL: local bridge |
| R8 | Замороженный RC и review | Отчёт go/no-go и повторное review исправлений | NOT_RUN |
| R9 | Deployment и наблюдение | Проверенный manifest и запуск по отдельному решению | BLOCKED предыдущими |

## R0. Состав релиза, модель угроз и незавершённый код

Составить фактическую карту contracts → workers → state/journals → API → frontend
→ ops. Для каждой части отметить active production candidate / research / PAIR reserve.
Сверить PRODUCT_SPEC, код и тексты сайта, включая актуальную интеграцию Pons.
Отдельная таблица ролей: кто может менять условия, публиковать, собирать/распределять,
пополнять gas, подписывать; что произойдёт при утрате/компрометации каждого ключа.

Активы: USDG призов, ops/project credits, native gas, попытки и результаты, ключи,
доверие к сайту. Противники/сбои: трейдер, получатель с враждебным контрактом,
ошибающийся оператор, скомпрометированный executor/RPC/фронт, недоступный Pons operator.
Для каждого риска указать защиту, тест и остаточное доверие.

Выход: список реальных недоделок (не заменять тестовыми fixtures), выбранный
пользовательский BUY route, точные production entrypoints и границы внешних зависимостей.
PAIR не удалять; проверить, что резерв случайно не выбирается production конфигом.

## R1. Чистота кода и ручное security review

- Найти дубли расчётов, ABI, адресов/chainId, receipt checks, journal recovery,
  eligibility и decimal conversion; проверить, не расходятся ли версии.
  Отдельно проверить намеренную независимость reference model от реализации.
- Найти dead/unreachable ветви, TODO/FIXME, заглушки, magic values, catch без отчёта,
  неконтролируемые retries, implicit defaults, опасные conversions Number/BigInt,
  неограниченные циклы/очереди, разрешения по умолчанию и test-only bypass.
- Trace денежных и state-changing путей: ACL, reentrancy, порядок state/external call,
  необработанный return/revert, rounding/overflow/unchecked, signature/domain/replay
  где применимо; DoS одним получателем; gas limits/chunking; immutable bindings.
- Static analyzer Solidity (Slither в закреплённой совместимой версии), compiler
  warnings и size check; lint/syntax/duplicate scan JS. Сначала совместимость с нашим
  solc/EVM, без смены компилятора ради инструмента. Каждое предупреждение разобрать;
  отсутствие предупреждений не означает безопасность. Не устанавливать инструменты
  на боевой сервер ради аудита.
- Lockfile/toolchain, прямые и транзитивные зависимости, install scripts, известные
  уязвимости с оценкой достижимости, secrets scan, лицензии/vendored crypto provenance.
  Проверить воспроизводимость artifacts и отсутствие test overrides в release build.

Выход: реестр findings. Исправлять расхождения/опасную сложность малыми пакетами.
Косметическое переименование/массовое форматирование/объединение всех похожих модулей
не условие запуска; большой рефакторинг после зелёного RC требует новой квалификации.

## R2. Логика, деньги и инварианты

Для каждого свойства — обычный тест, граничные значения и воспроизводимая случайная
последовательность действий с сохранением seed и минимального failing trace.
Начать с нашего Hardhat/Node стека; Foundry/Echidna вводить только при полезном
покрытии недоступных сценариев. Property testing не равно набору повторных happy paths.

| Свойство | Сценарии |
|---|---|
| Деньги сохраняются | USDG balance = disjoint free/reserved/claimable/unrecognized buckets; deposits, payouts и collector credits считаются в своём контуре без двойного учёта |
| Бюджет реальный | Pending TOKEN/неполученные комиссии не бюджет;90/5/5 только от received USDG; rounding dust имеет явное назначение; donations не облагаются creator split повторно |
| Попытки сохраняются | minted = open + frozen + consumed по кошельку/виду; один receipt один раз;100USDG threshold/carry;99.999999+0.000001,60+40,101; refund/net debit, разные кошельки и decimals |
| Заморозка необратима по желанию оператора | Cutoff/участники/бюджет/правила фиксируются до random; поздние BUY не попадают; нет reroll/reset/подмены seed или изъятия frozen на gas |
| Выплата ограничена обязательством | Нет double claim, чужого получателя/суммы; один revert не блокирует остальных; partial settlement/повтор chunk не дублирует приз |
| Admission не обходится | Другой chain/code/source/publisher/instance/policy/cutoff/config отвергается; stale/behind не превращается в scan или фиктивный ноль |
| Остановка безопасна | Новые задания ждут; существующие frozen/claimable сохраняются и обслуживаются при доступных chain/RNG |

Матрица: ноль/один/много участников, одинаковые веса, предельные веса/бюджеты,
пустая эпоха, смена объявленных rules, переход месяца, нехватка призов/gas, dust,
одновременные Short/Monthly, несколько циклов. Сверить Solidity, off-chain dataset,
reference model и UI. Статистические проверки odds дополняют формальную математику,
а не заменяют её. Экономические сценарии: buy/sell loops, Sybil splitting, крупный
участник, сговор, сэндвич/MEV/изменение цены, низкая ликвидность и нестабильный funding.
Результат не разрешает менять порог100USDG или математику без нового решения.

## R3. Реальные внешние условия

- Read-only серия latest/finalized/wall timestamps минимум24ч как начальная цель;
  по возможности два независимых RPC, latency/error/retention/reorg/clock statistics.
  Измерить drand availability и readiness по всему timing candidate. Наблюдённый
  максимум — не обещание будущего максимума; при плохой видимости статус BLOCKED.
- indexOnce: время, обработанные блоки, lag, memory/state size. Возраст snapshot
  должен укладываться в maxAge с запасом на poll/сбой; подобрать границы по замеру,
  не ослаблять freshness ради прохождения.
- Наблюдение финализации блока — proxy для checkpoint delay. Реальную нашу
  транзакцию не заявлять измеренной без её отправки. Продолжить [timing-пакет](PONS_INDEXED_REVIEW_TRIAGE.md).
- Pons factory/curve/hook/escrow/operator/router/Permit2: exact addresses, runtime/
  implementation и bindings на одном anchor; кто способен менять код/настройки;
  actual fee/net amounts до/после graduation; direct BUY и неподдержанные route.
- USDG: code/decimals, transfer/approval behavior, возможные pause/blacklist/upgrade
  как предмет проверки, не утверждение об их наличии. Нет произвольной поддержки
  fee-on-transfer/rebase tokens без явного adapter.
- Внешняя конвертация отсутствует/зависла: available escrow credit собирается
  независимо, pending отображается честно. Исполнимость ручного пути проверить
  реальным правом вызова, не impersonation чужого operator.

## R4. Полный набор и успешные сквозные прогоны

После исправления существенных findings зафиксировать commit RC. Полный
`npm run test:review` обоснован накопленным межмодульным пакетом, один раз на этом RC
в изолированном worktree. Проверить состав scripts/test-profiles.json: full сейчас
содержит100 файлов, но это не все browser/Python/fork проверки проекта.

Отдельно включить применимые `test:site`, `test:site:wallet`, purchase-demo,
Python математические suites и research suites, если их свойства не покрыты full.
Инвентаризировать все test files относительно профилей; skip/N/A только с причиной.
Coverage branches критических денежных/state путей и targeted mutation checks:
намеренное нарушение ACL/rounding/dedup обязано обнаруживаться тестами.100% строк
не самоцель. Test assertions должны проверять результат, не повторять тот же алгоритм.

Сквозной прогон на актуальном fork: несколько покупателей, curve→graduation→v4,
eligible и rejected BUY, накопление carry, funding→оба draws→live drand→claims,
следующие циклы, empty/low-funded cases, одинаковое состояние после независимого replay.
Затем прогон с записанной finality/outage последовательностью из R3 и кандидатными
боевыми timing. Сокращённый lead и backdated constructors в отчёте обозначить отдельно;
в deployment rehearsal проверить неизменённый production bytecode/constructor args.

## R5. Негладкие прогоны и recovery

| Сбой | Обязательный результат |
|---|---|
| RPC timeout/429/500, обрыв, stale head/несогласованные endpoints | Bounded retries/backoff; нет частичного коммита; status waiting с причиной; нет тихой смены chain/anchor |
| Индекс отстал, файл отсутствует/повреждён/не той конфигурации | Новые задания не создаются; frozen path не зависит от BUY snapshot; восстановление проверяется replay |
| Reorg до cutoff, после checkpoint, около begin/freeze/receipt | Автооткат только допустимой незакреплённой истории; начатая исчезнувшая операция требует явного recovery, не reroll |
| SIGKILL до send/после send/до hash/после hash/receipt | Известный hash сверяется, неизвестный исход не повторяется вслепую; существующие crash tests дополнить реальным CLI coordinator |
| Два workers, stale lock, restart, nonce collision/replacement | Один writer/signer path; сверка pending/replaced tx; ручная инструкция для неоднозначности |
| Disk full/permissions/write/fsync/rename failure, старый backup | Ошибка не выдаётся за saved; сверка журнала с цепочкой до новых sends; отдельно Linux directory fsync/power-loss threat |
| drand недоступен/старый/неверный proof/context/повтор | Нет альтернативного seed/известного random; obligation остаётся; после восстановления доставка/settlement продолжаются |
| Не хватает gas, gas spike, fee conversion недоступна | Призы не идут на эксплуатацию; waiting, независимые claims и доступный funding не теряются |
| Получатель revert, claim повторён, часть chunk исполнена | Нет двойных выплат; остальные обязательства исполнимы |
| Wallet reject, chain/account changed, page reload, late receipt | Ни отправки от чужого account, ни повторной покупки при unknown outcome |

Каждый fault ставить до и после финансово значимого перехода, затем делать restart
и сравнивать on-chain balance/reserves/attempts/nonces. Наличие intent перед send
не доказывает сохранность при power loss: проверять потерю последних записей, не
ограничиваться checksum. Не проводить power-loss эксперимент на боевой машине.

## R6. Нагрузка, сервер и эксплуатация

Проверить на целевом Linux окружении staging без публичных денежных sends:
service restart/reboot, порядок старта, права state directory, отдельный сервисный
пользователь, key custody, отсутствие секретов в git/логах/API, log rotation,
free disk/RAM, HTTPS/DNS/сертификат и минимальные сетевые права.

Начальная цель soak24–48ч и ступени данных1x/10x ожидаемого запуска. До прогона
объявить ожидаемые wallets/blocks/trades, latency и ресурсный бюджет. Мерить
индекс+координатор+API одновременно, включая конфликт чтения/rename и catch-up после
простоя. Нет монотонного роста backlog/RAM/диска без установленного лимита; свежесть
и время обработки укладываются в выбранные окна. Симулированный месяц не равно
месяцу uptime; для Monthly сочетать границы времени и короткий непрерывный soak.

Проверить alerts end-to-end: stale index, RPC/finality/drand lag, низкий gas,
неоднозначная транзакция, отказ storage, долгое funding wait/settlement.
Backup → restore на другой машине → сверка chain/journals → безопасное продолжение.
Runbook: остановка новых jobs, сохранение claims, диагностика/возобновление,
компрометация ключа и реальные доступные действия. Не обещать pause/rollback
контрактов, если таких полномочий нет; redeploy не стирает старые обязательства.

## R7. Пользовательский путь и прозрачность

Проверить реальные extension wallets и mobile выбранным способом подключения:
несколько providers, неверная сеть, смена аккаунта, reject, pending/revert,
reload/двойной клик, allowances/reset/expiry/Permit2, quote/minOut и price change.
Вначале локальная сеть/безопасная среда; публичные approvals/покупки — только R9.

Проверить XSS/недоверенные metadata/API inputs, CSP, API validation/rate limits,
cache/freshness/ошибки, ссылку на explorer и корректность chain/address. Main buy
не должен незаметно вести на непроверенный route. UI показывает согласие на
конкретную операцию; receipt не называется билетом до admission/indexation.
Пусто/устарело/ожидание не маскируются как0. Desktop/mobile/404/недоступный API.
Сверить короткие тексты и подробные правила с100USDG/net/refunds/unsupported routes,
источником90/5/5, рисками, funding waits и доступностью self-claim/gas.

## R8–R9. Допуск, запуск и наблюдение

RC замораживается: commit, build/artifact hashes, toolchain, config/manifest,
ABI/runtime hashes, роли, notices, limits, approved timing и список supports.
Незакрытые Critical/High, необъяснённый monetary mismatch, дубль sends, обход
admission, неспособность выполнить claims/recovery, неподтверждённый production
entrypoint блокируют запуск. Medium влияющий на деньги/доступность также должен
быть устранён либо ограничен доказанным механизмом; нельзя просто назвать его
известным. Остальные остаточные риски записать с последствиями и решением владельца.

Полное evidence передать GPT на повторное статическое review; существенные fixes
проверить повторно по затронутому пути, новый full нужен при широком изменении или
непокрытом регрессионном риске. Не повторять весь набор только ради нового commit.

Перед публичной отправкой отдельно представить пользователю конкретные addresses,
roles, constructor args, необратимые настройки, launch/deploy/gas budgets и BUY101USDG
с quote/minOut. Dry run на fork с неизменёнными artifacts. Проверка supply/liquidity,
ownership/creator fee recipient и отсутствия test approvals/bypasses.
После явного решения на реальные отправки — последовательный deploy/verify bindings,
контрольная покупка в согласованном бюджете, фактический credit/index/attempts, monitoring.
Не отправлять повторно при unknown hash и не обещать on-chain rollback.

Запуск готов только когда обязательные строки PASS на RC, BLOCKED/NOT_RUN закрыты,
принятые ограничения опубликованы, а оператор способен восстановить обслуживание.
Первые сутки наблюдать фактические lag/funding/gas/errors; проверка первого настоящего
розыгрыша остаётся эксплуатационной контрольной точкой, не выдуманным prelaunch PASS.

## Внешние ориентиры

Проверены01.10.2026. Это источники методики, не сертификат безопасности проекта.

- [OWASP SCSVS](https://scs.owasp.org/SCSVS/): структура проверки архитектуры, прав, бизнес-логики, взаимодействий и gas/state границ; применена в R0–R7.
- [Solidity Security Considerations](https://docs.soliditylang.org/en/latest/security-considerations.html): reentrancy, внешние вызовы и газовые ограничения; R1/R2/R5. Latest docs не повод обновлять закреплённый solc.
- [Trail of Bits Token Integration Checklist](https://secure-contracts.com/development-guidelines/token_integration.html): особенности ERC20 и полномочия внешнего токена; R3. Исторические советы вроде обязательного SafeMath не переносить механически на Solidity0.8.
- [Slither](https://github.com/crytic/slither): статический анализ как дополнение к ручному review, R1; findings требуют triage, не автоматического verdict.
