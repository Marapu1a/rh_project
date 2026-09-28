# Допуск старых обязательств и восстановление Robinhood runtime

28.09.2026. Этот пакет разделяет новые операции и завершение уже frozen обязательств.
Действует в Robinhood4663 runtime/rehearsal; публичные отправки остаются закрыты.
Контракты, RNG, призовая математика и формат журналов не менялись.

## Порядок прохода

1. Проверка сети/узла и структурных связок конфигурации, signer и путей state.
   `prepareRuntime(...deferContractChecks:true)` не читает текущие роли/граф контрактов;
   это внутренний этап, не разрешение отправки. Local31337 оставлен на прежнем пути.
2. Под прежними locks сверяются main pending, funding pending, RNG pending. Известный
   hash проверяется против canonical receipt/tx/from/to/data/nonce; unknown hash
   останавливает все lanes. На этом этапе нет транзакций, но подтверждённый результат
   сохраняется в journal. Scheduler sends уже покрыты main journal.
3. `inspectObligations` проверяет chain4663, runtime pins token/quote/registry/vault/
   Short/Monthly/adapter, взаимные bindings, instances, RNG profile, anchors и стабильность
   наблюдения. Ошибка критической связки запрещает все отправки; transport outage — wait.
   Revenue source, collector policy, текущий publisher и BUY policy для этого не нужны.
4. Full deployment admission определяет, можно ли добавлять новые операции. Дополнительно
   `collector.sync.staticCall()` проверяет актуальную source policy/fingerprint и solvency:
   хранящийся в collector sourceFingerprint сам по себе не доказывает отсутствие drift.
   Это eth_call, не реальный sync/collect и не изменение бухгалтерии.
5. Если полный допуск не прошёл либо указан drain, выполняются только старые обязательства.
   На следующем проходе режим вычисляется заново; совпадение исходных pins/policy возвращает
   normal автоматически. Неизвестные новые pins не принимаются сами собой.

## Допустимые действия

| Действие | Normal с полным допуском | Obligations-only / Robinhood drain |
|---|---|---|
| Сверка pending intents | Да | Да, до contract admission |
| pull/pay collector | Да | Нет, в том числе выплаты creator credits |
| checkpoint/begin/publish/seal/closeEmpty, оба draw | Да | Нет, даже для сохранённой Ready-заявки |
| prove/deliver для уже frozen request | Да | Да, с проверкой request/consumer/context/round |
| process/finish уже frozen draw | Да | Да, с проверкой committed dataset/publications/result |
| claim готового результата | Да | Да, с проверкой происхождения и неизменного победителя |

Creator credits сохраняются в collector; запрет pay в recovery их не уничтожает.
Permissionless on-chain claims не менялись. Это не emergency admin/reset/reroll.
Прежний local31337 drain/handoff не переопределён: строгая таблица относится к Robinhood.

## Защита непосредственно перед отправкой

Общий transaction guard повторяет obligation admission перед estimate и перед записью
intent/broadcast. Для каждого действия вне фиксированного списка старых обязательств
требует полный допуск и свежую source health проверку; drain их запрещает безусловно.
Изменение policy после estimate не приводит к отправке или ложному pending marker.
Режим в отчёте обновляется при обнаружении drift внутри прохода.

Funding lane в recovery вообще не запускает новые действия. Сохранённые деньги prizes
не тратятся на газ; существующий native budget/price guard действует как раньше.
Это не обещание фиксированной стоимости. Повторные проверки добавляют RPC reads;
throughput/тариф квалифицируются на реальном provider перед запуском.

## Frozen dataset и BUY policy

Scheduler определяет frozen состояние по контракту, не по локальному флагу. В recovery
пропускает unfrozen/empty jobs. Для frozen/terminal не перечитывает внешний BuyPolicySource:
заявка уже привязана к on-chain snapshot/root/rules, publication history и draw context.
Сохранённый артефакт проходит прежние checksums **и** независимую сверку с контрактом;
пересчитанный checksum не разрешает переписать участников. Новые/unfrozen заявки
сохраняют прежний policy admission/replay путь.

Исчезнувшая started-заявка остаётся явной ошибкой reorg/recovery, не превращается в
обычное ожидание из-за frozen-only фильтра. Потеря самого frozen job всё ещё требует
восстановления его данных; нет автоматической замены dataset или результата.

## Проверки 28.09

На Hardhat4663 с настоящими публичными wrappers/DrandRandomAdapter:
- source runtime и BUY policy недоступны → worker сам prove/deliver, process/finish обоих
  draw, находит и оплачивает награды; повторный запуск не отправляет повторно;
- source возвращается → прежняя конфигурация возвращается в normal и funding работает;
- Ready jobs не freeze при drift/drain, после восстановления normal продолжаются;
- known/unknown funding intent перед source admission, known RNG receipt перед отказом
  изменённого adapter, затем продолжение без второго prove;
- wrong vault/adapter/controller блокируют отправки;
- policy drift без смены runtime, drift между estimate и send, publisher rotation;
- переписанный frozen artifact и исчезнувший started job не допускаются к исполнению.

Это синтетический committed dataset и тестовый источник/USDG/market state; initial
begin/publish/seal подготовлены тестом, clock исторический и ArbSys shim. **Новое здесь —
автоматическое завершение и выплаты обоих frozen draw в аварийных условиях на4663**.
Это не live/fork proof и не автоматический реальный BUY→freeze. Ready-resume testcase
подменяет operational preflight на здоровый результат; finality им не доказана.

Всего33 различных продуктовых сценария прошли отдельными запусками:11 новых recovery
и22 соседних; дополнительно1catalog check. Соседний прогон203.3s. После последней
защиты disappeared-started ещё раз прошли2 адресных сценария, включая сквозной recovery.
Не full baseline и не единый запуск profile.

Адресные команды:

```text
node --test test/robinhood-recovery.test.cjs
node --test --test-name-pattern="source and BUY|persisted ready|wrong critical" test/robinhood-recovery.test.cjs
node --test --test-name-pattern="policy drift|during estimate|publisher rotation" test/robinhood-recovery.test.cjs
node --test --test-name-pattern="RNG receipt" test/robinhood-recovery.test.cjs
node --test --test-name-pattern="rewritten frozen" test/robinhood-recovery.test.cjs
node --test --test-name-pattern="source and BUY|disappeared started" test/robinhood-recovery.test.cjs
node --test test/robinhood-runtime.test.cjs test/promo-automation.test.cjs test/cutoff-scheduler.test.cjs test/robinhood-runtime-cli.test.cjs
node --test --test-name-pattern="catalog" test/test-launcher.test.cjs
```

Использовалась проверенная compilation artifact без изменения Solidity. В первом
новом прогоне исправлена сериализация BigInt в synthetic snapshot fixture. Проверки
добавлялись по ходу; результаты отдельных запусков не выдаются за единый full run.

## Оставшиеся релизные границы

Archive RPC, реальные deployment/pool/BUY pins, production timing, fee allocation/
native refill и key custody остаются отдельными задачами. Public gate сохранён.
Recovery не чинит повреждённый vault/adapter, отсутствие необходимых исторических
данных, утраченный job или неизвестный hash. Эти случаи остаются честной остановкой.
