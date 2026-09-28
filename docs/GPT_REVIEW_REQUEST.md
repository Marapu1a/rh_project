# Текущий запрос GPT: PROJECT_NATIVE и первый USDG→ETH fork

28.09.2026. Продолжение cd3ecad; пользователь одобрил пакет и **явно принял90/5/5**:
90% creator revenue призам,5% operations,5% свободная доля команды. PRODUCT_SPEC и
planning launch plan обновлены; адреса/газовые caps не подставлялись из fixtures.

## Сохраняйте эти решения в контексте

Не требуется доказать вечную окупаемость газа. Проверяем стоимость конкретной
отправки и caps; дорогой gas → ждать, мало ETH → bounded refill или ожидание внешнего
пополнения, затем продолжать сохранённую работу. Unknown send сначала сверяем.
Prize frozen/claimable не трогаем. Средняя доходность не гарантирует наличие ETH,
и мы этого не обещаем. Не возвращайте выбор долей в обязательное исследование:
90/5/5 принято; будущие изменения — отдельное явное решение.

## Что реализовано

`promo-native-refill.cjs` принимает PROJECT_NATIVE только с source=проверяемый
fundingJob.recipients[1]. Все3recipients разные/ненулевые. Custody/registry/assets,
executor, slot0/slot2 не получают исключений. BOOTSTRAP_NATIVE сохраняет запрет всех
recipients. `promo-automation.cjs` отдельно передаёт custody и recipients, не удаляет
source из общего защитного списка без проверки его роли.

Execute/reconcile общий и не изменён: EOA-only native transfer, единственный main
pending, gas/caps/cooldown, receipt accounting и unknown-send запрет повтора.
Стабильный slot1 через кампании: handoff уже требует неизменный nativeRefill policy,
переносит spent/cooldown/halt; миграция source не добавлена. EOA operations имеет
контроль над его деньгами; caps worker не называем onchain custody гарантией.
Новый swap executor пока отсутствует, отдельного конкурирующего ops signer нет.

## Проверки

35 разных адресных сценариев подтверждены отдельными запусками:5 accounting/guards,
26 refill+handoff,4 public-launch guards. В первом запуске26 было23pass/3fail:
новые fixtures сменили кампанию, но забыли пересоздать deployment profile. Исправили
fixtures через штатный createDeploymentProfile; только эти3 перепроверены3/3.
Admission не ослабляли. Команды/границы: [PROMO_NATIVE_REFILL](PROMO_NATIVE_REFILL.md).
Full suite и public sends не запускались; повторной охоты за lock environment не было.

## Fork: реальный рынок работает

[OPS_MARKET_PROOF](OPS_MARKET_PROOF.md), [evidence](../research/ops-funding/market-fork-2026-09-28.json),
[script](../scripts/ops-market-fork.cjs). Только in-process31337, upstream read-only.
Block74775375; pool key/id/assets/liquidity прочитаны, router hash проверен.
10USDG →0.003754920360290634native ETH, atomic INFI_SWAP+UNWRAP_WETH; USDG debit
точный, minOut с0.5% trial slippage пройден; двойной minOut отклонён.

Практический нюанс: Pancake Permit2 на4663 —0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768,
не Uniswap0x0000…BA3. Неправильный адрес дал AllowanceExpired(0), официальный правильный
адрес подтвердился исполнением. Pool fee field90pips читаем из chain, не по тексту UI.

Sandbox USDG искусственный, ETH Hardhat; gas цены/суммы не являются оценкой Nitro.
Trial swap для quote использует snapshot/revert: это только proof, НЕ production
quote API. Source/immutable audit неполон (Sourcify rate/timeouts); нет утверждения,
что поведенческий proof заменяет source verification. Thin liquidity/recovery swap
ещё не протестированы. Все эти границы отмечены в документе.

## Что проверить и что дальше

1. Корректно ли выделен slot1 без обхода custody protection и сброса истории?
2. Нет ли пропущенной коллизии при campaign/handoff и старых credits?
3. Подтверждает ли evidence заявленный swap+unwrap, без завышения выводов о стоимости?
4. Следующий пакет: production read-only quote/estimate и затем bounded journaled
   approve/swap под тем же ops signer/nonce, после receipt — existing native refill.
   Предложите конкретный минимальный quote path для этого pool/router, если видите
   лучший вариант; не новый общий trading/oracle framework.

Public execution пока закрыт; никакой чужой капитал для тестов не используется.
