# PAIR: совместимость профиля запуска, 25.09.2026

Статус: read-only сверка, не утверждённый deployment. PAIR выбран пользователем;
поколение/режим/пулы пока не зафиксированы. [Evidence](../research/pair-launch-compatibility-2026-09-25.json).

## Вывод

Уже проверенные куски относятся к разным поколениям: новый AUTO adapter — V1,
а FeeRouter source integration — Launch V2 native fee vault. Нельзя объявлять
их одним готовым launch profile или выбирать V1 только ради готового AUTO.

| Профиль | BUY | Доход для нашего FeeRouter | Статус |
| --- | --- | --- | --- |
| V1 | Проверен AUTO через 1–2 stock pools | Locker, не native epoch vault ABI | Нужна отдельная интеграция источника; stock quote revenue не USDG |
| Launch V2 native, один USDG pool | Direct USDG формы проверены на V2 reference | Native vault collect/claim/epoch проверен на reference fork | Ближе к текущему денежному контуру, но свежий launch с нашим recipient ещё не доказан |
| Launch V2 custom/mixed | Отдельный signed USDG bridge | Только Creator Fees по текущим docs; source конкретного release не проверен | Не считать стандартным native профилем |
| Infinity | Pancake Infinity CL | Другой hook/fee policy | Не поддержан V4 decoder/converter/source |

Предлагаемый первый профиль: **Launch V2 native, TOKEN/USDG, fee sharing с нашим
FeeRouter единственным recipient (10000 bps своей recipient allocation)**.
Это не обещание 100% всех торговых комиссий. Размер creator/protocol долей надо
прочитать у конкретного handler/vault текущего release. V1 70/30 не переносим.
Это рекомендация, не новый принятый пользовательский выбор режима.

## Свежие наблюдения

- native-fee-v2-readiness: HTTP200, ready=true.
- native-fee/consumer-live: HTTP200, native version2, poolFee10000/tick200,
  mode1/2/3, feeSharingModeVersion5, coordinator 0xddc69c…1687b,
  native hook 0x438b86…780c0, aggregator 0xa2e7bc…a652a.
- standard-route/consumer-live: HTTP503,
  standard_route_consumer_attestation_unavailable. Это отдельная ветка;
  нельзя на этом основании объявить весь native Launch V2 неработающим.
- custom quote readiness: HTTP200 enabled/launchAuthorized, другой coordinator.
  Это заявление API, не доказательство подходящего fee source.
- RPC chain4663, block0x44fea86, anchorStable=true. Runtime V1 aggregator
  совпал с нашим pin. Native hook/aggregator имеют другие адреса и hashes.
- activeLaunchV2ModeRegistry совпал с адресом API. Обычный launchV2Coordinator
  getter вернул 0xdbc3e7…ced4d, а не API native coordinator. Это не объявлено
  поломкой: нужны release-specific registry bindings, старый getter недостаточен.
  Неподтверждённый getter pairLocker() reverted; никакого адреса locker из него
  не выведено. Ошибка сохранена в evidence.

## Актуальный UI

GET /launch вернул HTTP200. В опубликованном index-D6c-cNzh.js присутствует
VITE_BALANCED_AGGREGATOR_ADDRESS=0x9d7741776098aFA315e4D576ede4F2c67a21d8Ce,
совпадающий с AUTO pin. Сохранены SHA256 и excerpt, bundle остался локальным.
Это подтверждает наличие конфигурации, **не** фактический маршрут каждой кнопки:
браузер с кошельком/quote/preflight/signing в этой сверке не запускался.
Документация называет Infinity default, V1 AUTO — отдельной веткой; выбор
площадки PAIR не фиксирует конкретные contracts автоматически.

Источники: https://pair.fund/docs и точные API URLs/ответы в evidence.

## Следующий ограниченный пакет

На текущем native release доказать на локальном fork создание TOKEN/USDG проекта
с одним recipient=наш FeeRouter: реальные launch fee/dev-buy minima, mode/handler,
vault/position, BUY→collect→claim. До launch simulation сверить registry graph,
не использовать старый coordinator по привычке. Не impersonate чужого controller
как доказательство публичных прав нового launch. Если release не позволяет
задать нужного recipient, это конкретный blocker для профиля, а не повод молча
сменить поколение. V1 AUTO остаётся отдельной проверенной возможностью.

Runtime проекта не менялся; tests/fork/public sends в этой сверке не выполнялись.
