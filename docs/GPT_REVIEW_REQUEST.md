# Обращение к GPT: Pons V2 — исходники, оператор и сбор комиссий

01.10.2026. Нужны исследование внешних первоисточников и практический план интеграции.
Ответ на русском в docs/GPT_REVIEW_RESPONSE.md. Укажи HEAD, дату и доступные инструменты.
Не отправляй транзакции/сообщения Pons и не меняй продуктовый код.

## Задача и решение владельца

QIANQI — спекулятивный токен с автоматическими USDG-розыгрышами. Готовим переход
PAIR Infinity → Pons V2, Robinhood Chain4663. PAIR сохраняется резервом.
Creator tax3%, buyback/holder fee sharing выключены; полученный доход90/5/5:
призы/ops/команда. Призовые правила, порог100USDG, frozen/claimable и RNG не менять.

Владелец согласен на гибкое пополнение: собираем доступные USDG; TOKEN и несобранные
комиссии не считаем доступным призовым бюджетом. Ждём и повторяем при подходящем
состоянии, не жжём gas заведомыми revert. На старте допустим ручной/полуручной
запуск проверенных операций, позже автоматизируем тот же путь. Ручной режим
не обходит permissions. Полная независимость от Pons не обязательна для разработки.
Сначала выясняем внешние возможности, прежде чем писать PonsCollector.

## Входные документы

- [Результаты проверки](PONS_VERIFICATION.md).
- [Fork-прогон](PONS_V2_RESEARCH.md).
- [Перенос](PONS_MIGRATION.md), [draft](../config/pons-migration-draft.json).
- [Runner](../scripts/pons-fork-rehearsal.cjs), [ABI](../scripts/integrations/pons-v2.cjs).
- [Существующий collector PAIR](../contracts/InfinityCollector.sol) — по необходимости.

.local/ не передаётся через Git: скачай внешние исходники самостоятельно; наши
локальные результаты ниже — входные свидетельства, не твоя независимая проверка.
[Старое обращение](archive/GPT_REVIEW_REQUEST_BEFORE_PONS_2026-10-01.md) историческое.
Если веб/RPC недоступны, прямо укажи это, не имитируй исследование.

## Источники и адреса

- https://docs.ponsfamily.com/v2
- https://github.com/ponsdotdev/pons-labs
- Исследованный commit b51431f7d5242fc5414a7da7d3659ad3bc749eb7.
- https://www.ponsfamily.com/launchpad/create
- RPC https://rpc.mainnet.chain.robinhood.com
- Explorer https://robinhoodchain.blockscout.com
- Factory 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e
- Hook 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044
- Escrow 0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e
- Operator CONTRACT 0xa1018c1D9655292A2dE0F7dEa9a0F848EaA8cA83
- Keeper EOA наблюдавшихся tx 0x49BbF2b70955Fb3a106e084D4BFDa92d334573d2
- USDG 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
- PoolManager 0x8366a39CC670B4001A1121B8F6A443A643e40951

## Уже проверено Codex — не полный допуск

- Fork: launch, buy101USDG/sell, claim/split90/5/5, graduation, v4 trades,
  conversion при локальной имитации operator. Не PromoVault/tickets/draw proof.
- Hook15167bytes совпал с solc0.8.35, optimizer200, viaIR=true, cancun после
  исключения metadata/immutable slots. Два immutable адреса отдельно сверены.
- Factory указанного commit не собирается: строка749 вызывает
  PonsV2BondingCurve.exemptFromSnipeTax, отсутствующую в опубликованном curve.
  Не дописывай чужой код догадками ради объявления match.
- Реализации escrow/operator в checkout не найдены.
- Блоки76631780–76641780:76 PoolFeesSwept в76tx/76pools; пять receipts status1.
  Короткое окно активности, не SLA и не оценка failures.
- Реальная conversion:
  https://robinhoodchain.blockscout.com/tx/0x07664000987d99b4ebcddd6cbb0eba414fedda11e8c74efb69397bd4b8fd6c67
  30.09 15:58:21UTC swap получил9.644785USDG; вместе с накопленными quote fees
  creator credit15.976329USDG, protocol6.846997USDG, buyback0.
- Hook требует operator для conversion, но operator — контракт: это НЕ доказательство
  того, что вызывать его может только команда Pons.
- sweepPool(bytes32), selector0x431d17b7: eth_call по12пулам даёт одинаковый
  revert0x78013180(...1) для нашего адреса и keeper. Это не доказательство ACL.
  Selector0x21724275: keeper revert0x4e7e2916, посторонний0xc22a648e.
  Названия ошибок/ABI не установлены.
- TOKEN pending может блокировать creator sweep целиком, включая USDG на hook.
  Уже зачисленный escrow claim — отдельная операция.
- Blockscout API403, IPFS429/timeouts, Sourcify hook full/partial404, большие RPC
  queries timeout/429. Ограничения доступа не доказывают отсутствие исходников.

## Что исследовать

1. Найди точные deployment sources, ABI и build inputs factory/curve/hook/escrow/
   operator, далее зависимости по необходимости. Репозиторий/история, verified
   explorer, Sourcify, IPFS metadata, официальные ссылки. Отличай V1/V2 и mainnet/
   testnet. На каждый результат дай URL, commit/address и степень bytecode-проверки.
2. Разбери operator: функции, ACL, обнаруженные selectors/reverts, eligibility,
   cooldown/minimum/quote/slippage. Может ли наш EOA или collector сам запустить
   sweep? Нужны ли регистрация keeper/pool, особые роли, подпись Pons?
3. Проверь покрытие USDG pools, пороги/cadence и ручной маршрут через UI/контракт,
   fallback при offline keeper. Отдели документацию от наблюдения и предположения.
   Успех одного pool не доказывает обслуживание всех.
4. Предложи минимальный путь curve/hook sweep → escrow claim → collector90/5/5 →
   PromoVault. Таблица: этап/кто вызывает/что ждём/когда повторяем/gas/зависимость
   от Pons. Сначала ручное исполнение, потом scheduler без смены денежной логики.
5. Раздели блокеры безопасного запуска и допустимые задержки финансирования.
   Если остались вопросы только к Pons — составь короткий запрос, не отправляй.

## Ответ

- Что найдено сверх наших результатов и что осталось неизвестным.
- Таблица source verification с прямыми ссылками и пределами проверки.
- Operator: функции/ACL/условия/доказательства, без придуманных названий ошибок.
- Практический ручной путь, будущая автоматика и один минимальный пакет для Codex.
- Никаких обещаний production readiness, изменений призовой математики или public sends.
