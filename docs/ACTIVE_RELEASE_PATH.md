# Активный путь Pons и резерв PAIR

> Этап сейчас — тестовый. Этот документ разделяет Pons и PAIR planning records, не разрешает боевой перенос. Новейший тестовый profile — launch-v2 из [матрицы](PONS_CHANNEL_COVERAGE.md); существующий launch config не обновляется автоматически вслед за adapter. Deployment — этап B [roadmap](ROADMAP.md).

01.10.2026. Первый выпуск — Pons V2 на Robinhood4663. Изменение отделяет планы
и пользовательские тексты; не включает public sends и не меняет правила продукта.

| Назначение | Файл / команда |
|---|---|
| Единственный активный launch planning record | `config/robinhood-launch-plan.json`, integration=pons-v2 |
| Read-only инспекция активного плана | `node scripts/public-launch-plan.cjs` |
| Сохранённый route planning record | rh-pons-curve-ur-v1; значение черновика не является новейшим тестовым охватом |
| Новейший тестовый genesis | direct-buy-pons-launch-v2 / rh-pons-curve-pool-self-batch-v1; scripts/pons-profiles.cjs и pons-pool-batch-buy.cjs |
| Pons локальный исполнитель | `scripts/run-pons-automation.cjs`; Hardhat/loopback ограничения сохранены |
| Резерв PAIR/Infinity | `config/reserve/pair-launch-plan.json`, integration=pair-infinity |
| Инспекция резервного плана | `node scripts/public-launch-plan.cjs config/reserve/pair-launch-plan.json` |
| PAIR preview/simulation/source checks | `pair-launch-preview.cjs`, `prepare-pair-launch.cjs`, `launch-source-preflight.cjs` читают только reserve plan |
| Старый composed release rehearsal | `scripts/release-rehearsal.cjs` теперь явно использует reserve plan; не Pons qualification |
| Исторический черновик миграции | `config/pons-migration-draft.json` помечен historical, supersededBy указывает активный plan |

Inspector требует явный integration. В Pons запрещены Infinity BUY route и
PAIR launch fields; PAIR preview/collect отвергают Pons до сетевых запросов.
Текущий public-launch-plan — только проверка полноты/принятых правил, не production
validator. Даже заполненный план никогда не получает executable/publicLaunchReady.

В активном плане перечислены factory/curve/hook/escrow/poolId/router/manager/Permit2,
creatorFeeRecipient и launchParameters. Адреса и необратимые настройки ещё null;
здесь не копируются устаревшие research pins как проверенные live значения.
LaunchParameters предстоит типизировать вместе с Pons deployment/preflight в G04.

Обе темы сайта называют Pons и только supported routes, не обещают любые покупки
через интерфейс Pons. Buy/Claim ещё не подключены — это следующий отдельный пакет,
не скрытый результат этой уборки. На сервер изменения не выкладывались.

13 адресных проверок01.10 PASS: launch integration, planning economics/missing fields,
PAIR preview/source neighbors. Команда и полный вывод в
`.local/logs/pons-separation-tests.txt`; фильтр исключал контрактный chain-wrapper test,
поэтому это не весь public-launch-checks и не полный suite.

PAIR adapters/contracts/research evidence не удалены. Общие правила product/unresolved
сохранены равными в active и reserve на момент разделения; последующие изменения
резерва не должны автоматически переопределять Pons. Operational-profile остаётся
общим инструментом проверки правил, не свидетельством готового Pons public sender.

Продолжение: G02 из [карты недоделок](RELEASE_INVENTORY.md) — согласованный snapshot
config для indexer, coordinator и public API. G01/G03/G04 и реальные timing остаются
незакрытыми. Разделение закрывает смешение активного плана с резервом, не весь deploy.

Browser checks: npm run test:site —3/3 PASS; SITE_TEST_PATH=/concepts/hk/ npm run test:site —3/3 PASS. Логи pons-separation-site.txt и pons-separation-hk.txt в .local/logs/.
