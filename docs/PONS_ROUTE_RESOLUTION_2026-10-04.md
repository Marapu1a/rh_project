# Итог решения по неподдержанным маршрутам — 04.10.2026

**Итог:** это не потеря транзакций и не поломка токена. Большинство покупателей
пришли через исполнения, которых нет в опубликованной политике билетов.
Роутер65050… технически разбирается, но **к боевому начислению сейчас не готов**.
Для текущего запуска подтверждаем прямую покупку USDG→QIANQI существующим
планировщиком и действующим v4 decoder. Это решение по готовности к выпуску,
не изменение пользовательских правил и не разрешение включить автоматику.

[Итоговые доказательства](evidence/PONS_ROUTE_RESOLUTION_2026-10-04.json).
Предыдущие исследования: [28 trace](PONS_ROUTER_RESEARCH_2026-10-04.md),
[19 fork-сценариев](PONS_ROUTER_FORK_2026-10-04.md).

## Что закрыто

- Snapshot106 содержит55 BUY/51 SELL.3 BUY поддержаны;52 не поддержаны.
  Пропажа104 операций не подтверждается; отсутствие билетов не равно потере receipt.
- Для28 BUY роутера65050… восстановлена ABI-signature:
  `swap((uint8,address,address,address,uint24,int24,address,bytes,address,bytes32)[],address,uint256,uint256,uint256)`.
  Кандидат получен из4byte.directory, selector4d819a2a и каноническое encode/decode
  независимо проверены по всем28 исходным calldata. Имена полей локальные;
  это не верифицированные исходники и не доказательство всей семантики.
- Поддерживаемые исследовательским фильтром формы: один USDG→curve step27 либо
  WETH→USDG step1 + curve step27. Неизвестные опции/лишние steps/неполное
  кодирование отвергаются. Все28 исходных записей проходят уточнённый фильтр.
- Проверяется точный порядок переводов USDG/QIANQI. Возвраты и посторонние потоки
  в этот профиль не входят; даже согласованная подмена receipt+trace не пройдёт
  проверку потока. Неизвестные исполненные router modules отвергаются.
- USDG200:2 комиссия и198 в curve. ETH-путь: USDG из funding pool полностью идёт
  в curve; ETH fee нельзя автоматически прибавлять к USDG basis.
-19 реальных fork-сценариев прошлой проверки подтверждают baseline, caller ownership
  в проверенных формах, отказ при allowance/deadline/minimum, неверном callback и
  чужом upgrade. Admin upgrade реально работает, значит внешний proxy pin недостаточен.

## Конкретные препятствия боевому допуску

1. Полная семантика трёх исполняемых runtime не верифицирована. Результаты сценариев
   нельзя расширять на все ветки, storage/owner изменения, leftovers и mixed execution.
   ABI найдена, исходники пока нет: Sourcify404; metadata CID сохранены, IPFS gateway429
   (также с VPS), alternate gateway timeout. Это не утверждение, что исходников нигде нет.
2. Исследовательский callTracer не входит в текущую модель доказательств индексатора.
   Боевой вариант потребует привязанных к tx/block execution/code evidence, ограничений
   размера и RPC отказов, проверки фактически выполненного implementation при upgrade
   внутри блока, сохранения необходимых evidence и независимого API replay.
3. Pons profiles сейчас genesis-only в программном декодере. `buy-policy-format.extend`
   возвращает null для Pons; тихое изменение старого profile изменит исторический ledger.
   **Контракт BuyPolicySource расширение поддерживает:** append-only announce с notice.
   Поэтому token redeploy не нужен и immutable genesis не означает вечный запрет
   новых маршрутов. Нужна реализация и тесты именно версионированного Pons admission.

Live проверка source на79722696: publishedCount0, currentHash=genesisHash=config hash,
noticeBlocks864000. Контракт/история не изменялись. Не объявлять адаптер до его
готовности: неизвестная policy может остановить admission/indexer.

## Проверенный путь без этого роутера

`scripts/pons-live-direct-accounting-rehearsal.cjs NEW_REPORT.json LOCAL_CONFIG.json`
с RH_FORK_RPC_URL проверяет существующий QIANQI, не новый тестовый токен:
штатные prepare/guard → exact approval → direct buy → действующий direct-buy replay.
На локальном fork101USDG дали Short1/Monthly1/carry1USDG. Full replay после JSON
roundtrip и checkpoint continuation совпали; повторная доставка блока идемпотентна,
конфликтная — отвергнута. Локальные synthetic средства, изменённый только в harness
anchor и mock admission отмечены явно; public sends0. Публичный интерфейс покупки
этим отчётом не включён, а реальный BUY пользователя не совершался.

Этот путь не обещает билеты за любую покупку через кнопку Pons: агрегатор может
выбрать другой маршрут. Для предсказуемого участия нужен именно сформированный
поддержанным планировщиком вызов; при смене venue/непрошедших guards — остановка.
Остальные receipts остаются в истории со статусом UNSUPPORTED, без ручной раздачи
или ретроактивной подмены правил.

## Решение по объёму

Не выдавать исследовательский matcher за production adapter. Для текущего релиза
использовать уже проверяемый прямой путь; роутер65050… оставить вне допуска до
одного законченного пакета расширения. Не нужно бесконечно дробить его на поиски ABI.
Если требуется именно охват65050…, пакет должен сразу включать:

1. Проверяемую семантику и execution/code pins выбранных форм, negative/refund/upgrade tests.
2. Версионированный Pons replay: старая история неизменна, новый adapter только после
   notice/границы; старые frozen/claimable не пересчитываются.
3. Scanner → bounded persistence → cold/restart/API → билеты, RPC failure/reorg сценарии.
4. Отдельный боевой rollout проверенной сборки, затем подписанное владельцем объявление.

Это существенное расширение охвата, а не аварийный фикс. Альтернатива готова и проверена
до учёта. Финансовая автоматика и текущая policy этим пакетом не меняются.

## Проверки текущего пакета

`node --test test/pons-direct-purchase.test.cjs test/pons-router-trace-research.test.cjs test/pons-channel-attribution.test.cjs`
12/12 PASS. Уточнённый фильтр28/28 captured BUY PASS. Отдельный direct fork/accounting
прогон указан в evidence. Полного baseline/готовности публичной покупки не заявляем.

Финальный direct fork/API прогон: fork79722696,230 upstream reads,0 errors/retries.
API200/observed: SHORT.open1, MONTHLY.open1, carryRaw1000000. В API harness
admission помечен локально как допущенный; это явно тестовое допущение, не
проверка объявления нового manifest на публичном BuyPolicySource. Реальная
production policy не менялась и остаётся с исходным genesisHash.
