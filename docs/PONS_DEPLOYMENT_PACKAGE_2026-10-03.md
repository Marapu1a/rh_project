# Первый пакет: конкретный deployment-кандидат Pons

03.10.2026. **Техническая сборка и точная fork-симуляция PASS.** Публичного deployment
нет, автоматического разрешения подписывать сохранённые tx нет. Это один пакет:
USDG guard, роли/параметры/metadata, порядок deployment, ранний BUY и funding.

[Параметры](../config/pons-deployment-candidate.json) ·
[Evidence](evidence/PONS_DEPLOYMENT_PACKAGE_2026-10-03.json) ·
[Границы внешних исходников](PONS_EXTERNAL_DEPENDENCIES.md).

## Что доведено

- Public profile требует явный EIP1967 implementation address/codeHash USDG.
  Storage и runtime читаются на одном blockTag. Отсутствие pin, drift или ошибка
  чтения закрывают admission. Та же проверка действует для drain: замена самого
  токена требует review, в отличие от смены owner/будущих получателей комиссий.
  Журналы/обязательства не стираются. Runtime test меняет slot после estimate:
  повторная проверка отклоняет tx до intent,0 отправок/записей.
- Governor/BUY policy publisher/ops/team — личный кошелёк. Dataset publisher и
  routine executor — отдельный0x7170…1Bf3. Проверено на настоящих локальных contracts,
  не подстановкой одного владельца во все роли.
- Приняты пользователем03.10: rules notice86400s, drand lead1800s, finalized lag1200s;
  неизменные6ч/30д. Clock lag30s/ahead5s, beacon lag15s, cutoff1 остаются техническими
  настройками кандидата. BUY route notice отдельно задан864000 **блоков**, около
  суток при наблюдаемом шаге0.1s; это не гарантия24ч wall clock. Genesis routes
  действуют сразу; расширение Pons routes требует отдельного доказанного пакета.
- Immutable gas ceiling10gwei, nativeFloor0; исполнитель оценивает текущую tx.
  Годовая campaign endsAt не останавливает сбор: это нижняя граница разрешённого
  owner rollover, а не срок работы проекта. Денежные правила90/5/5 не менялись.
- Metadata подготовлены из существующих logo/preview, SHA256 записаны. Logo URL
  сейчас404: публикация и сверка содержимого обязательны **до launch**. Сам сайт
  этим пакетом не менялся; assets включить в пакет эксплуатации/публикации.

## Найденная и исправленная ошибка порядка запуска

Третий прогон развернул10tx и прошёл public admission, но ранний BUY упал при
lifecycle replay: `Mint before genesis epoch`. Прежний план создавал контроллеры
после launch, а первые покупки могли появиться до первой эпохи правил.

Решение: создаём registry, collector, adapter, оба controller и vault **до launch**.
Vault допускает ещё не созданный predicted TOKEN; реальные reverse bindings
проверяются конструктором. Controller clocks обычные, backdate/изменений Solidity нет.
Anchor — блок перед launch. Registry и первая эпоха уже существуют; scanner включает
сам launch block. Policy source/bindings завершаются позже, ранний BUY воспроизводится.

| Nonce | Транзакция |
|---|---|
| N | ParticipantRegistry |
| N+1 | LocalPonsCollector с predicted TOKEN |
| N+2 | DrandRandomAdapter с predicted Short/Monthly |
| N+3 | RobinhoodShortController с predicted vault |
| N+4 | RobinhoodMonthlyController с predicted vault |
| N+5 | DualControllerPromoVault с predicted TOKEN |
| N+6 | Pons launch, collector получает creator fees |
| N+7 | BuyPolicySource, genesis hash от manifest с фактическим anchor |
| N+8 | collector.bindPromo90/5/5 |
| N+9 | collector.bindVenue |

Launch prediction, факт Token/Curve и каждый CREATE address сверяются. Pending
транзакции личного кошелька и nonce drift запрещают продолжение. До каждого signing
проверять nonce заново; не выполнять посторонние tx посередине этого графа.
Фактические block hashes отличаются от fork: policy genesis/constructor calldata
после реальных receipts пересобираются. Этот шаг нельзя заменить слепым broadcast
всего JSON. Проверенный генератор — [скрипт](../scripts/pons-exact-deployment-rehearsal.cjs).

## Итоговый общий прогон

Финальный отчёт `.local/logs/package1-deployment-final.json`, unsigned requests
`.local/logs/package1-unsigned-transactions.json` с явным FORK_ONLY_DO_NOT_BROADCAST.
Все10deployment tx PASS, public admission matched. Ранняя покупка101USDG до policy/
bind завершения: Short1/Monthly1, не потеряна. Executor самостоятельно выполнил
sweep/pull/pay: vault3.363300USDG, личный адрес0.373700USDG суммарно за обе доли5%.
Это фактический creator revenue с учётом доли базовой комиссии Pons, не только tax3%.

Fresh solc0.8.37 compile совпал с использованным artifact:
`0x0ad6d513709738e74595134ad7a7ee77ea01a48e892183fbe3c7f11c456bdccd`.
Нет sourceOverrides; только локальный ArbSys shim, impersonation и синтетические
балансы. Для index/admission latest сопоставлен finalized; это не доказательство
Nitro finality. RNG/draw/payment полного цикла повторно здесь не выполнялись:
проверена доставка deployment и стартовый учёт, обычные6ч/30д не ускорялись.

Газ10tx:22131403 units. По base fee снимка + launch0.0005ETH получается около
**0.0010204ETH**, без гарантии цены, L1-data составляющей/дополнительных операций.
Сумма газовых лимитов при потолке10gwei даёт0.26930069ETH вместе с launch fee —
**это не требуемое пополнение и не прогноз расхода**. Перед подписью пересчитать
estimateGas/feeData и цену каждой tx, стартовый BUY101USDG и gas отдельно.

Пять наблюдений finalized за минуту:997–1059s, ниже принятого1200s. Это короткий
снимок, не SLA. Если сеть отстанет сильнее — новые задачи ждут, порог не ослабляется.

## Проверки и история прогонов

27 уникальных адресных tests PASS:
- public profile/execution/runtime18;
- отдельный новый USDG slot mutation после estimate1;
- public launch checks8.
Логи `.local/logs/package1-admission-tests.log`, `package1-quote-intent-test.log`,
`package1-launch-plan-tests.log`. Полного baseline нового HEAD не заявляем.

Неудачные first–fourth сохранены: отсутствие initial local mine; synthetic funding
probe без обработки неподходящего proxy slot; настоящий pre-genesis BUY; повторное
использование чужого index state. Пятый прогон PASS. Финальный повтор оправдан
изменением BUY notice с86400 на864000блоков; он прошёл целиком. Каждому прогону
теперь принадлежит собственный state; чужой checksum не сбрасывается.

## Условия перед реальной подписью

1. Ответ владельца по неполному source verification внешних Pons contracts остаётся
   ожидаемым; ограничение уже исследовано, полный исходный граф не объявлять verified.
2. Опубликовать logo/preview; проверить HTTP200, MIME и точные SHA256.
3. Пакет эксплуатации: public services/RPC/history/backup/attention и frontend bindings.
4. Перед signing обновить nonce/economics/runtime/implementation pins и fork rehearsal
   на свежем anchor; полученные адреса и расходы показать владельцу. Не подписывать
   тестовые anchor hashes. Никаких сбросов frozen/claimable или подмены RNG.

Контракты по этим адресам в публичной сети не создавались. Ключ автоматики не
загружался для симуляции и не подписывал публичных сообщений/транзакций.
