# Операционный профиль первого запуска

29.09.2026. Реализована проверка явных ожиданий перед новыми действиями worker.
Контракты и призовая математика не менялись. Public sends остаются закрыты;
ни заполненный файл, ни совпадение чтений не разрешают deployment/запуск.

## Что проверяет V2

`scripts/operational-profile.cjs` формирует ожидания офлайн, а
`promo-deployment-profile-v2` включает их в существующий deployment profile.
Инспектор читает один blockTag и затем перепроверяет hash блока:

- Genesis Short:10мест, веса7:4:2:1:1:1:1:1:1:1, minimumUnit5USDG,
  q(e)=0.8e/(e+1); genesis Monthly V2:75/25, вес e/(e+1).
- Short maxBudget=uint256.max, scheduler FREE_SHORT, entry100USDG/6decimals,
  vault nextStartTarget100USDG. Public Monthly минимум100USDG проверяется базовым admission.
- Owner Short/Monthly/collector, отсутствие незавершённой передачи owner,
  ops/project recipients и BUY policy publisher.
- Notice обоих controllers, их maxGasPrice/nativeFloor, код/адрес BUY policy,
  publisher/noticeBlocks/genesisHash. Pins и активная campaign90/5/5 сверяются
  существующим admission; profile не заменяет отдельный BUY policy replay.
- Операционный maxGasPrice worker не выше обоих controller ceilings;
  reserveGasPrice не ниже операционного cap. Это проверка согласованности настроек,
  а не доказательство достаточности ETH на всё время жизни проекта.

Ожидания не копируются с проверяемой сети: совпадение с неверным deployment не
становится одобрением. Числа продукта закреплены кодом; роли/notice/gas нужно задать
явно. Genesis проверяется отдельно от последующих объявленных epochs: механизм
разрешённой смены правил не превращается в постоянный запрет новых версий.

V1 оставлен для прежних локальных репетиций, в отчёте `legacy-incomplete`.
V2 даёт `v2-explicit`, что означает покрытие проверками, а не успешный результат.
Профиль входит в runtime identity. Handoff не может удалить профиль или понизить V2
до V1. Публичный handoff, как и public execution, ещё не квалифицирован: обычная
проверка сохраняет `publicExecutionNotImplemented`. Будущая активация должна требовать V2.

Drift owner/policy/gas блокирует новые jobs/freeze, но не отменяет уже frozen draws.
Recovery проверяет необходимые старым обязательствам pins и продолжает RNG/settlement/
claims без соответствия новым mutable настройкам. Неизвестная отправка и повреждённые
критические pins по-прежнему требуют reconciliation, не слепого продолжения.

## Как подготовить файл

1. Скопировать [шаблон настроек](../config/operational-settings.template.json) в локальный
   файл. Все `null` заполнить явно. Только публичные адреса, никаких приватных ключей.
2. `node scripts/operational-profile.cjs SETTINGS.json OPERATIONAL.json`
   создаёт новый файл без RPC и не перезаписывает существующий. Пустой шаблон отклоняется.
3. Добавить полученный объект в поле `operational` существующего SETTINGS для
   `node scripts/inspect-deployment.cjs export --config CONFIG.json --settings SETTINGS.json --out PROFILE.json`.
   Прочие обязательные executor/timing/sourceCodeHash/scope задаются как раньше.
4. Включить профиль в CONFIG.deploymentProfile. CONFIG содержит также ops.
   `node scripts/inspect-deployment.cjs inspect --config CONFIG.json --rpc RPC_URL`
   только читает сеть; ожидаемый public blocker не обходить.

Суммы газа задаются десятичными строками в wei; notice controllers — секунды,
BUY notice — блоки. Значения fixture3600/1e12/0 не являются launch-рекомендацией.

## Что ещё нужно выбрать

| Параметр | Предложение / ограничение |
|---|---|
| Governor | Отдельный управленческий кошелёк; hot executor не должен быть единственным местом хранения управляющего ключа. Новая governance-система не добавляется |
| Executor | Один рабочий signer для автоматических действий; controller publisher проверяется против него |
| Operations / project | Отдельные адреса получения5%/5%; ops используется существующим bounded refill. Конкретные адреса ещё не заданы |
| BUY publisher | Явный адрес для объявлений поддержанных маршрутов; не путать с executor. Можно разделить роли без нового контракта |
| Notice Short/Monthly | Кандидат24часа для пользовательского предупреждения, пока не утверждён. BUY noticeBlocks выбрать отдельно по модели блоков, не механически назвать24часами |
| Controller gas caps | Неизменяемые верхние пределы deployment; выбрать по реальным котировкам/измерениям перед запуском. Нельзя позже повысить редактированием worker |
| Worker gas cap | Более консервативный рабочий предел внутри обоих caps; изменение требует проверяемой конфигурации/runtime handoff, не правки живого журнала |
| Native floors | Различать проверяемые controller floors и остаток ETH signer/refill. Нехватка означает ожидание/пополнение, призовые USDG не трогаем |
| Timing |1800s lead /1200s maxFinalizedLag — всё ещё кандидат; свежая выборка ниже не даёт основания автоматически его принять |

Никаких обещаний вечной окупаемости газа. Перед действием работают существующие
estimate/caps/balance checks; слишком дорогой gas или мало ETH → возобновляемое ожидание.
Конкретные адреса, RPC и сервер понадобятся для эксплуатационного подключения;
для этого пакета новые секреты/инфраструктура не требовались.

## Свежие read-only наблюдения

[Исходные отчёты](../research/operational-profile/README.md),29.09.2026:

- Official:37requests за проход,3 historical-state отказа. Blocks/receipts/logs на
  трёх выбранных высотах повторились, но code history не прошёл ни на одной.
- Blockreq:38requests за проход,2ошибки; ближайшие две высоты доступны,
  глубина864000blocks не прошла. Оба endpoint проверены повторным отдельным процессом.
- Replay BUY не запускался: пригодный admitted project/reference manifest не задан.
  Эти endpoints не квалифицированы как полноценный archive для нашего запуска.
- Timing:12 валидных наблюдений двух endpoints за примерно81секунду,
  finalizedLag824–1209секунд. Кандидат1800/1200 дал бы ожидание в1из12.
  Fixture3600/1800 укладывается в эту выборку, но не принят автоматически.
  Это короткое наблюдение, не SLA, не контрактная финальность и не BLS proof survey.

Нужен endpoint, который отдаёт historical code/state/eth_call от project anchor,
полные блоки/receipts/logs, finalized и повторяемую историю; пригодность проверяется
этим же bounded probe и затем реальным BUY replay. Название тарифа «archive» не доказательство.
Далее — постоянный индексер/сервис и статусы, затем единый same-chain automatic proof
на реальных pins. Публичный токен/deployment пока отсутствует.

## Проверки

29.09: `node --test test/operational-profile.test.cjs test/deployment-admission.test.cjs`
—11/11 passed за85.4s. Использован existing compiled artifact через RH_TEST_ARTIFACT
и SHA256; Solidity не менялась. Покрыты mismatch roles/notice/gas/genesis/entry mode,
новые freezes без отправок при drift, завершение обоих frozen draws/claims и повтор без send.
После добавления downgrade guard/CLI проверки повторён только изменённый сценарий
и catalog: `node --test --test-name-pattern="legacy fixture economics|profile catalog" test/operational-profile.test.cjs test/test-launcher.test.cjs`.
Повтор2/2 passed за3.9s (один продуктовый сценарий и catalog).
Это адресный результат, не full suite/live/fork. RPC survey — отдельные чтения реальной сети.
