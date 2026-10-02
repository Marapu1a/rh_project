# Pons V2: первичная проверка альтернативы

30.09: перенос придержан по решению владельца до внешней проверки. Hook runtime воспроизведён; реальные TOKEN→USDG conversion и escrow credits подтверждены. Factory source не собирается, source escrow/operator не найден; независимый вызов operator-контракта не доказан. [Проверка и вопросы Pons](PONS_VERIFICATION.md).

## Локальная репетиция 30.09 — результаты и ограничения

Runner: [scripts/pons-fork-rehearsal.cjs](../scripts/pons-fork-rehearsal.cjs).
Команда: `node scripts/pons-fork-rehearsal.cjs .local/logs/pons-fork-final.json`.
Итог: `CURVE_AND_V4_DIAGNOSTIC_PASSED`, exit0; fork anchor76626917.
После локального вызова от Pons operator conversion/sweep и повторный claim/split
прошли. Это условный успех при доступном операторе, не доказательство независимости.
Исходники для понимания ABI/ошибок: https://github.com/ponsdotdev/pons-labs,
commit `b51431f7d5242fc5414a7da7d3659ad3bc749eb7`. Они НЕ заменяют проверку
соответствия опубликованного кода фактическому runtime; она ещё открыта.

В репетиции используется настоящий runtime контрактов на локальном fork chain4663.
Upstream RPC закрыт read-only allowlist. Баланс USDG тестового покупателя изменён
только локально до20000USDG, ETH также выдан локально. Первый блок после anchor
майнится локально из-за отсутствия в Hardhat истории hardfork Robinhood.

Подтверждено этапами запуска:
- USDG approved, decimals6, phantom reserve3236USDG, graduation8090USDG;
  launch0.0005ETH, snipe3s, tax300bps/base100bps, buyback=false.
- Токен создан с контрактом-получателем. Прямая покупка списывает101USDG,
  начисляет base1.01USDG и creatorTax3.03USDG; продажа половины проходит.
- Snapshot protocol share30% от base. При выключенном buyback создатель получает
  весь tax плюс70% base: на кривой это3.7% соответствующей базы, а не ровно3%.
- Контракт-получатель может инициировать curve sweep, claimToken и распределить
  полученное90/5/5. После buy101 + sell half получено5.557236USDG:
  prize5.001514, ops0.277861, team0.277861. Округление оставлено prize.
- Пороговая покупка доводит выпуск до phase2 / Uniswap v4. Native pool fee=0,
  tickSpacing200. После graduation реальный poolManager исполняет buy и sell
  через тестовый explicit-pool router, без интерфейса или API Pons.
- Exact-input BUY после graduation начисляет creator tax в TOKEN, SELL — в USDG.
  Recipient sweep при необходимости conversion отклоняется selector0x31cdb504
  (`InternalSwapRequiresOperator`). Это подтверждённая зависимость от Pons operator.

Тестовый ProbeRecipient не является production collector: получатели — локальные
адреса, НЕ PromoVault. Не доказаны funding→GENERAL, BUY decoder, tickets, draws,
real UI routing, source/runtime equivalence и эксплуатационная доступность operator.
ProbeSwap не production router: в диагностике разрешены широкие price limits и
пороговый minOut0. Сценарий с operator имитирует его только в локальной сети;
никакого доступа к реальному ключу нет. Бюджет реального владельца не использован.
Ранние отчёты first/second/third — ошибки local provider/hardfork; fourth —
обнаружение USDG storage slot; fifth — ожидаемая необходимость ненулевого
conversion minOut, исправленная в последнем запуске.

Перед миграцией: выбрать поведение при остановке conversion operator, затем
отдельный PonsCollector + curve/v4 BUY decoder и связь с существующим PromoVault.
Математика розыгрышей и правила расходования казны в этом исследовании не менялись.

30.09.2026. Исследование, не решение о миграции и не допуск публичного запуска.

## Проверено

Live Chromium на https://www.ponsfamily.com/launchpad/create: USDG есть в списке,
выбор показывает graduation 8090 USDG, launch fee 0.0005 ETH, creator wallet,
creator tax. Screenshot владельца при tax3 показывает total4% / yours3%.
На странице предупреждение об обновлении backend и возможных устаревших данных.
Evidence: `.local/logs/pons-pairs-20260930.txt`, `pons-usdg-form-20260930.txt`.

Read-only ethers/RPC: `https://rpc.mainnet.chain.robinhood.com`, блок76618961,
factory из docs `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`:
- canLaunch(0x098afA6731239a00CE0aff669aaefD16b7C72114) = true;
- launchFee = 500000000000000 wei;
- maxCreatorTaxBps = 1000;
- launchConfigCount = 1.
Evidence `.local/logs/pons-live-20260930.json`. Нет подписи/кошелька/отправки tx.
Factory runtime/source correspondence и ABI полного запуска ещё не проверены.

## Документация и существенные границы

Источник: https://docs.ponsfamily.com/v2 (прочитан30.09).
Сначала bonding curve, затем автоматическое создание Uniswap v4 pool с locked LP.
Ликвидность graduation формируется из собранного curve quote и зарезервированных токенов;
8090 USDG — отображаемый порог, не требование к личному первоначальному взносу владельца.
Полноту доступной ликвидности/цену/порог нужно подтвердить launch economics on-chain.

creatorTaxBps фиксируется при запуске; creatorFeeRecipient задаётся адресом.
Это позволяет проектировать отдельный collector, но контракт-получатель ещё не испытан.
Holder fee sharing в UI — выплаты держателям Pons, не наши розыгрыши: не включать
как замену нашей механике. Buyback также не является нашим согласованным назначением денег.

Финансовые вопросы:
- Docs говорят о creator tax целиком создателю ПЛЮС остатке доли базовой комиссии.
  UI показывает yours3% при total4%. Нельзя пока утверждать итоговый доход ровно3%
  либо3.7%: прочитать snapshot fee policy, buyback flag и проверить receipts.
- До graduation комиссии в quote; после hook удерживает в unspecified currency,
  то есть иногда в токене проекта. Конвертация в USDG ограничена price impact и может ждать.
  Это не эквивалент мгновенным3%USDG с каждой сделки.
- sweepFees / sweepPoolFees доступны creator или sweep operator, но если требуется
  внутренний swap, creator получает InternalSwapRequiresOperator. Зависимость от
  оператора Pons для конвертации — открытая эксплуатационная граница.
- После sweep средства в escrow; claimToken(USDG) от получателя. Новый collector
  должен уметь вызывать claim, распределять90/5/5 и защищать неизменяемые назначения.
- Получатель может изменяться; protocol CTO может переназначить будущие fees через
  timelock. Нужно отдельно определить реакцию funding monitoring. Призовой vault не менять.

Расхождения: docs утверждают launches whitelist-only, но наш canLaunch=true;
docs snipe window5s, UI3s. Docs говорят, что3аудита ещё идут, опубликованного
завершённого аудита эта проверка не установила. Не переносить общий статус Pons на V2.

## Следующий ограниченный шаг

Read-only same-block snapshot: подтвердить USDG allowlist/decimals/launch config,
economics pin, base fee split и tax, buyback off, curve reserves/starting price,
snipe policy, recipients/operator/CTO permissions, graph и verified runtime.
Затем отдельный local fork: launch с collector → buy101 → sell → sweep/claim →90/5/5;
второй этап прогона — graduation и fee conversion, включая недоступного operator.
Старый PAIR decoder не переиспользовать вслепую: нужны curve и v4 пути, refunds,
payer/recipient attribution и отсутствие двойного начисления при graduation.
Наш хук писать/утверждать для использования готового Pons hook не требуется;
внешнее routing и indexing конкретного Pons pool всё равно проверить отдельно.

Итог: Pons V2 — предметный кандидат (USDG UI, tax, recipient, canLaunch), но ещё
не доказанная замена PAIR. Ничего не deployed, финансовые правила не изменены.
