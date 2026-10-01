# Финальные контрольные точки QIANQI

30.09.2026. Основание: [ответ GPT](GPT_REVIEW_RESPONSE.md), static review8192d35,
получен в61663a8. Замечания о пагинации сверены с текущим кодом. Это план проверок,
не отчет об их прохождении. [Предыдущие результаты](FINAL_TESTING_HANDOFF.md).

## Правила доказательства

Каждая точка: exact Git HEAD/dirty, команда, версии инструментов, config hash,
chain/fork anchor number+hash, receipts и машинный result с PASS/FAIL/BLOCKED.
Сырые логи в .local/logs; короткий санитизированный отчет с рабочими ссылками в repo.
PASS только если выполнены все условия точки. RPC/history/среда → BLOCKED,
нарушение ожидаемого результата → FAIL; не маскировать их ручным fixture.
Нельзя складывать несвязанные fixtures в утверждение о сквозном прохождении.
Повтор только затронутого доказательства и зависимых этапов после изменений.

Общая репетиция использует один deployment/chain/journal lineage. Разрешенные
допущения перечислять в отчете: local impersonation/test funds, time travel,
ArbSys shim. Никакой подмены принятой математики/constructor clock в production
bytecode, ручного списка участников, helper mint, reroll/reset и prize-funded ops.
Месяц можно промотать в локальной среде; это не квалификация реальной финальности.
Win/no-win проверять фиксированными воспроизводимыми сценариями в независимых
локальных экземплярах/последовательных законных циклах, без перезапуска frozen draw
ради нужного random. Не выбирать mainnet seed и не выдавать test RNG за drand proof.

## КТ1 — покупка действительно становится билетами

**Статус: BLOCKED30.09: изменился PAIR proxy implementation; runner подготовлен, до BUY не дошел. [Диагностика](KT1_BUY_REHEARSAL.md).**
Реализовать воспроизводимую команду same-chain rehearsal, а не одноразовый local script.

- Collector → PAIR launch с реальными opening и recipient collector; записать
  source/pool/TOKEN/quote/runtime/proxy pins и receipts.
- BUY policy/admission anchor находится до первой учитываемой покупки.
- Прямой USDG adapter, payer=recipient; реальные transfer/swap receipts проходят
  persistent indexer без ручного переноса участников и без synthetic ledger.
- На чистом кошельке exact net101USDG →1Short+1Monthly+carry1USDG;
  отдельный кошелек net60+40 →1+1/carry0. Учитывать комиссии ВНУТРИ заданного
  wallet debit, refunds уменьшают debit; inputMaximum не является объемом участия.
- Второй кошелек не получает чужие entries; sell/plain transfer/unsupported
  coordinator не начисляют. Unsupported имеет явную причину, не фиктивный success.
- Остановить и запустить настоящий процесс indexer с тем же state: ledger/hash/
  entries не меняются от повторного чтения, нет пропуска BUY после anchor.

Опоры: test/infinity-buy.test.cjs, test/persistent-buy-indexer.test.cjs,
scripts/infinity-launch-fork.cjs, docs/INFINITY_BUY.md, docs/PERSISTENT_INDEXER.md.
**Выход PASS:** один receipt trail и snapshot с ожидаемыми балансами/идентичностями;
отчет явно указывает что публичной покупки не было.

## КТ2 — деньги доходят до правильных резервов

**Статус: TODO; зависит от КТ1.**
На тех же контрактах pull/pay учитывают реально полученные fees3%, распределяют
90/5/5 с cumulative rounding; повторные вызовы не удваивают деньги. Проверить
rounding мелких платежей, donation напрямую vault, раздельный учет operations/team.
Source drift останавливает новые pulls, не присваивает уже учтенные призы.
Сверить conservation по balances/free/reserved/claimable/paid и unpaid credits,
а не только одно UI число. Для draws фонд дополнить явной тестовой donation:
покупка101USDG сама не обеспечивает необходимые минимумы.
Опоры: infinity-collector, infinity-worker, promo-vault tests.
**PASS:** нулевое необъясненное расхождение raw units; frozen/claimable не тратятся на gas.

## КТ3 — оба розыгрыша и выплата

**Статус: TODO; зависит от КТ1–2.**
Продолжить те же ledger/receipts: автоматический dataset → freeze → drand request/
exact round/проверка подписи → outcome → settlement → payment/claim → consumed.
Public Robinhood wrappers, принятые Short10slots/7:4:2:1x7/minimumUnit5/q0.8e/(e+1),
MonthlyV2 75/25/весe/(e+1), интервалы6h/30d, Current>=100/Next100.
Проверить wait перед временем/фондом, новые покупки после cutoff не попадают в
frozen dataset, at-most-one Short prize/address, Monthly rollover при no-win,
расход попыток только по lifecycle, повтор settlement/claim не платит дважды.
Задержанный/неверный beacon не создает новый random. Явно покрыть win и no-win
без изменения odds; не наследовать старые near-certain fixture rules.
**PASS:** результат независимой проверки совпадает с контрактами и same-chain ledger;
баланс сохраняется до raw unit. Список local timing/RNG допущений приложен.

## КТ4 — сбои и восстановление

**Статус: TODO; зависит от КТ3, использует его journals.**
Убить процесс до send, после send до записи receipt и после receipt до сохранения
state; затем запустить заново. Unknown send сначала reconcile nonce/hash/receipt,
никакого второго перечисления. Отдельно node restart с сохранением chain data;
hardhat_reset не засчитывается как восстановление того же blockchain.
RPC outage/stale/history missing, недостаток native gas → явное ожидание;
пополнение продолжает тот же job. Проверить reorg до finality и несовместимый
finalized hash, one-writer lock, source drift при старых обязательствах.
**PASS:** старые frozen obligations завершаются ровно один раз, либо остается
объяснимое ожидание; не потеряны journal/credits, нет вывода призов на эксплуатацию.

## КТ5 — пользователь видит результат

**Статус: TODO. Исправления двух дефектов можно выполнить до КТ3; сквозной PASS после КТ4.**
D1: overview offset меняет смысл при новом draw/reorg. Зафиксировать snapshot
identity (head/ledger hash) и сброс/refresh истории при смене, без дублей/пропусков.
D2: wallet показывает только первые25 наград в порядке накопления. Новые первыми
и доступ к остальным; пагинация также не смешивает snapshots. Regression:26+,
последняя assigned доступна; все предыдущие доступны; обновление/reorg корректны.
Из того же индексатора проверить open/frozen/consumed, reserves/win/no-win/rewards,
verified decimals/asset/txlinks, раздельную свежесть overview/wallet, stale/null/503,
404/mobile, account/provider/network и late replies. Browser mocking годится для
fault scenarios, но основной positive path читает настоящий API этой репетиции.
**PASS:** сайт показывает доказанные same-chain результаты; D1/D2 закрыты regression.

## КТ6 — полный baseline на зафиксированной ревизии

**Статус: TODO; после исправлений и КТ1–5.**
Commit → npm run test:review по REVIEW_TESTING. Причина full run — накопленный
сквозной пакет и финальная контрольная точка, не просто push. Сохранить exact HEAD,
result.json/stdout, разобрать каждый failure. Fixture tests не заменяют КТ1–5.
**PASS:** полный набор завершен успешно именно на указанном HEAD. Изменение
исполняемого кода после baseline требует оценки затронутых доказательств.

## КТ7 — готовность конкретного публичного запуска

**Статус: TODO; КТ6 не дает разрешения sends.**
- Утвердить final metadata, роли executor/operations/custody, notice/timing/gas/
  native limits, campaign, startup balance; archive RPC проверен на нужной глубине.
- Подготовить полный deployment graph и смету ВСЕХ contracts/approval/funding,
  не только collector+PAIR; nonce dependencies и recovery после каждой tx.
- Проверить PAIR receipt registration/indexing и страницу токена: без реального
  launch это отдельная последующая verification gate, не заранее пройденный PASS.
- Непосредственно до подписания: fresh source pins/nonce/pending/opening/deadline,
  exact calldata+value+chain+recipients, актуальный sequential simulation;
  review page не допускает expired/draft identity. Ключ остается в кошельке владельца.
- Поддержанный BUY link до покупки101USDG; обычный PAIR UI маршрут не считается
  подходящим без доказательства. Индексатор должен видеть первую покупку.
- Отдельное утверждение конкретного пакета транзакций владельцем. Затем staged
  deploy/post-deploy admission/PAIR discovery, только потом BUY/automation activation.

**PASS до подписи:** проверяемый финальный пакет и явное одобрение. **PASS после
запуска:** реальные receipts/pins/discovery/admission и live status, не fork отчеты.
Частичный deployment не дает автоматического разрешения на покупки/розыгрыши.

## Порядок работы

Сейчас только подготовлен план. Далее КТ1 отдельным пакетом; затем КТ2–3,
КТ4–5, baselineКТ6, readinessКТ7. Дефекты UI закрываем отдельной небольшой правкой,
не смешивая с призовой математикой. У каждого пакета свое доказательство и review.
