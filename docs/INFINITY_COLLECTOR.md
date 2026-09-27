# Infinity collector: USDG → campaigns → GENERAL

27.09.2026. Реализован отдельный [InfinityCollector](../contracts/InfinityCollector.sol).
V2 FeeRouter и его worker не изменены. Это код нового источника, не объявление готовности
всего продукта к mainnet; внутренние production bps/recipients ещё не утверждены.

## API и привязка

Constructor: owner, predicted TOKEN, quote USDG, hook, factory. TOKEN может ещё не
существовать. Эти адреса неизменяемы. Затем launch с collector-recipient, создание
PromoVault и однократный owner `bindSource(vault, initialPolicy)`.

Bind проверяет TOKEN code, vault projectToken/hook/admin, factory attestation,
CREATOR_QUOTE300bps с правильным destination, recipient=collector, epochs и отсутствие
pending policy. PromoVault проверяется по TOKEN/USDG и закрепляется навсегда.
Начальная campaign открывается только после bind; до него pull/sync/roll запрещены.
Source нельзя заменить; owner — Ownable2Step, все изменяющие accounting API nonReentrant.
Genesis receipt, bytecode/implementation, pool/engine graph по-прежнему требуют
deployment admission: source getters не заменяют независимую проверку deployment.

`pull()` permissionless: проверяет fingerprint и баланс, при положительном due вызывает
только `claim([USDG])`. Return, прирост баланса и due должны совпасть, post-claimable=0.
Fingerprint проверяется повторно после внешнего вызова. Пустой due не вызывает NoClaim;
pull при этом может распознать прямые USDG. Возвращаемое число — только полученный claim.

`sync()` permissionless: при неизменном source распознаёт USDG balance-accounted.
TOKEN и прочие активы не учитываются, rescue/конвертации/вывода для них нет.
Не отправлять такие активы collector в надежде получить призовое funding.

`pay(recipient)` permissionless: только накопленный credit и только этому recipient.
Для закреплённого PromoVault перевод и `syncUSDG()` происходят атомарно: деньги сразу
попадают в GENERAL. При ошибке перевода/sync кредит восстанавливается откатом.
Pay не зависит от доступности source; дефицит баланса всё равно блокирует выплаты.
Призовой адрес нельзя заменить в новой campaign; два остальных slots следуют явной
campaign policy. Slots не являются Short/Current/Next: их распределяет сам PromoVault.

## Кампании и rounding

Policy: endsAt, три recipients, три bps суммой10000; recipients[0] — закреплённый Promo.
Нет production долей по умолчанию. Received/credit рассчитываются cumulative floors
по кампании, поэтому дробление sync не меняет распределение. Остаток до2raw units
при закрытии добавляется Promo. Accounted включает unpaid credits и округление.

`rollCampaign(expectedId,next)` onlyOwner: после endsAt, с правильным id, выполняет
final claim → sync всех ещё нераспознанных USDG → закрытие rounding → новую policy.
Любая ошибка откатывает всю транзакцию. До успешного rollover доход остаётся старой
campaign, включая прямые переводы после endsAt; после — новой. Старые unpaid credits
сохраняются независимо от новых recipients. Платить их до rollover не требуется.

## Source drift

Fingerprint: последний hook epoch (включая запланированный), active hook policy,
vault epochCount/currentPolicy, TOKEN/hook/admin и factory attestation. Смена-и-возврат
и будущая scheduled policy обнаруживаются без сканирования всей истории. Обычная
graduation не включена в fingerprint и не блокирует доход сама по себе.

При drift pull/sync/roll остановлены; учтённые pay и обеспеченные призы остаются
доступными. Claimable/unaccounted не объявляются потерянными, но automatic recovery,
adopt/rebind отсутствуют. Необратимое внешнее изменение может потребовать отдельного
решения для продолжения дохода. Техническая ошибка чтения тоже откатывает новый учёт;
worker должен отдельно диагностировать RPC failure и настоящий drift.

## Проверки

Unit: до-bind guards, owner/bind, неправильные TOKEN/hook/admin/recipient/attestation/
fee/quote, pending policy, пустой claim, GENERAL, unsupported TOKEN, два rollover,
direct USDG после endsAt, unpaid credits, cumulative rounding, stale id, claim revert/
short return/неверный return, invalid next policy rollback, hook/vault scheduled и
change-back drift, deficit до claim, reentry при claim/pay, изменение policy во время
claim и rollback внешнего состояния, failed pay с сохранением credits.

```powershell
node -e "require('./scripts/test-launcher.cjs').runTests({profile:'infinity-collector-targeted',selection:{compile:true,files:['test/infinity-collector.test.cjs','test/fee-router.test.cjs','test/promo-vault.test.cjs']}}).then(r=>process.exitCode=r.exitCode)"
node scripts/infinity-launch-fork.cjs NEW_OUTPUT.json --collector
```

Первый адресный запуск:52pass/1fail,101.86s (`test-run-Qj7JdZ`). Failure был в setup:
MockToken по умолчанию запрещает burn на0; fixture явно настроен перед созданием deficit.
Исправленный сценарий1/1 (`test-run-V9xopH`,22.14s с compilation).
Добавленные identity/pay negatives и saved fork2/2 (`test-run-kAawDJ`,21.02s).
Это55 разных проверенных сценариев отдельными запусками, **не** единый55/55 прогон.
Full suite не запускался. Runtime collector10517bytes, compiler settings проекта.

## Новый fork

[Evidence](../research/infinity-source-audit/collector-fork-2026-09-27.json): настоящий
новый TOKEN/USDG launch с3% и recipient=InfinityCollector → BUY/SELL → pull → rollover
с unpaid credits → pay → реальные GENERAL reserves.

- Fee revenue5.934252USDG, direct до rollover7raw, после11raw.
- Campaign1 received5.934259, campaign2 received0.000011USDG.
- Итог Promo5.934270: Short2.967135 /Current1.978090 /Next0.989045USDG.
- Accounted и баланс collector после pay равны0; stale rollover отвергнут.
- Final claim на этом fork rollover пуст: ненулевой final claim и failure rollback
  проверены unit-сценариями. Старые BUY/SELL credits до rollover не выплачивались.
- Fixture allocation100% Promo, не принятое распределение проекта; inert draw authority,
  local31337, искусственное funding покупателя, тестовая цена/minOut и прочие ограничения
  исходного [Infinity proof](INFINITY_INTEGRATION_RESEARCH.md) сохраняются.
- Fork complete,377upstream requests/5retries/0errors. Metadata assumptions уточнены
  после прогона; raw tx/receipts/results не менялись.

Новый worker/CLI, deployment admission/monitor для collector, Infinity decoder,
automatic eligibility и payout не входят в этот пакет. Worker ещё должен использовать
существующий durable transaction reconciliation, а не повторять неизвестные sends.
Следующий шаг — review collector/funding, затем ограниченный worker с этим API;
база100USDG/entry остаётся отдельным продуктовым решением.
