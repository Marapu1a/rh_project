# Текущий запрос GPT: bootstrap ETH refill общей автоматики

28.09.2026. Продолжение review `9ec1465`; пользователь одобрил ограниченный пакет
ETH refill в Infinity/drand runtime. Повторную диагностику lock-файлов сейчас не
проводим: не считать прежнее наблюдение доказательством продуктового бага и не
добавлять auto-unlock. Проверяй содержательную логику самостоятельно.

## Что сделали и почему

Worker раньше только ждал внешнего пополнения executor. Теперь опциональный
`nativeRefill` задаёт отдельный заранее пополненный EOA source, остаток,
maxPerRefill/maxPerPeriod (включая резерв gas), период и cooldown. Получатель только
executor. Оба EOA проверяются без кода, prize/source/recipient адреса исключены.
Один новый перевод за pass; расходы по receipt и nonce сохраняются в main journal.
Public broadcasts остаются disabled; CLI поддерживает только local/rehearsal.

Старый `local-native-refill` не переносили механически: его planner связан с другим
набором операций, старым coordinator state и LOCAL_EIP1559. Добавили узкий
`promo-native-refill.cjs`, переиспользующий transactionCost, bounded receipt wait и
существующий main lock. Нового state-файла, универсального treasury и on-chain
администратора нет. Старый coordinator не изменён.

Общий guard перед нехваткой native считает оставшуюся стоимость обоих frozen draws
и найденных claims. Пополняет прежде всего этот дефицит, новые действия сохраняют
этот резерв. Частичный refill разрешён; уже обеспеченные обязательства продолжаются
при пустом source/cooldown. Discovery должна догнать head перед новым refill.
Глобальный guard в funding/RNG теперь вызывается перед child budget, иначе child
останавливался по балансу раньше, чем появлялась возможность пополнения.

В main pending появился тип promoNativeRefill. Он сверяется до deployment admission;
после дочерних workers main pending дополнительно проверяется, чтобы ошибка refill,
перехваченная child, не позволила следующему lane отправлять транзакции.
Known hash → исходная tx/receipt/anchor; unknown → остановка, без повторной отправки.
Save receipt выполняется до изменения in-memory state, поэтому disk failure не
теряет pending. Revert учитывает только gas. Receipt пересёк окно → расход в новом
окне; mismatch envelope/cap учитывается и закрывает новые refill.

Local handoff сохраняет history, cooldown, halt и проверяет последний receipt/source
pending nonce. Включённую политику удалить/заменить нельзя; первоначальное включение
разрешено. Это не реализация public handoff или миграции refill policy.

## Где смотреть

- [Модель, конфигурация и пределы](PROMO_NATIVE_REFILL.md).
- scripts/promo-native-refill.cjs, promo-automation.cjs.
- scripts/drand-delivery-worker.cjs, infinity-worker.cjs: порядок guard/budget.
- scripts/promo-runtime-handoff.cjs и оба automation CLI.
- test/promo-native-refill.test.cjs, promo-refill-accounting.test.cjs,
  дополнительный сценарий promo-runtime-handoff.test.cjs.

## Что не закрыто

Это ETH bootstrap, НЕ USDG→ETH и НЕ утверждение creator allocation. Test100%Promo
не принятая экономика. Два signer требуют эксклюзивного владения одним worker;
лимит off-chain, ключ сам по себе не ограничен on-chain. Нельзя начинать новый
пустой журнал ради сброса истории. Runtime volume несинхронизируемый.

4663 proof — локальная Hardhat репетиция с ArbSys fixture, исторической BLS подписью
и вручную подготовленными frozen datasets. Затем worker автоматически делает
refill→drand→process/finish→claim. Нет live BUY→freeze, Nitro fee qualification,
public ключей или broadcasts. Gas/caps fixture завышены, не стоимость production.
Qualified archive RPC, реальные deployment/BUY pins и production timing остаются
релизными блокерами, не причина объявить весь продукт готовым.

## Вопросы

1. Есть ли путь продолжить sends после неизвестного refill или сбоя записи receipt?
2. Верно ли разделены приоритет старых обязательств и резерв перед новым действием,
   включая частичный refill, source outage и child worker budget?
3. Не обнуляется ли spent/cooldown/nonce через restart/handoff? Нет ли ошибки окна
   при mined/reverted receipt после границы периода?
4. Хватает ли выбранной bootstrap границы для этого шага? Следующий практический
   результат — принять creator allocation и подключить эксплуатационную долю к ETH
   либо закрывать public provider/deployment qualification; не нужен новый общий
   рефакторинг ради рефакторинга.

Прошли56 различных адресных сценариев +1 catalog отдельными запусками; после
усиления save повторены3 recovery cases. Команды и границы в PROMO_NATIVE_REFILL.md. Не называй их
full suite. При своём запуске отличай тестовое/файловое окружение от ошибки логики.
