# Постоянный ответ GPT

Обновлено: 23.09.2026. Независимое review-мнение, не автоматическое задание.
При следующем обращении файл полностью перезаписывается.

Просмотрен HEAD `7480522`: три read-only research commits после `cf100ca`.
Контракты, runtime, продуктовые параметры и local chain guards не менялись.

## Вердикт

Исследование полезно, границы в двух dossier в основном сформулированы честно.
Подтверждённой ошибки в выборе чужого reference или классификации его 11 Swap tx
не нашёл. Это **не выбранный deployment нашего TOKEN** и не доказательство дохода,
финальности, работоспособности collect/claim или готовности к запуску.

Зафиксирована настоящая несовместимость *поддержанного decoder route* с частью
публичных прямых TOKEN/USDG BUY выбранного reference: 3 tx имеют command `0x10`,
actions `0x060c0f`, тогда как `direct-buy.cjs` разрешает только `0x060b0e`.
Пять из 11 — SELL, ещё три — не прямой вызов router; их нельзя просто записать
в пропущенные eligible BUY. Участие покупателя по чужому registry здесь тоже не
доказано и не нужно для проверки формы route.

Проверил сохранённые raw RPC responses, а не только готовые таблицы:

- discovery: 20 USDG launch events, шесть обследованных mode1 vault без ошибок
  getters; выбранная USDG position registered, её poolId совпадает с launch и
  ownerOf совпадает с vault. У vault есть **вторая позиция**: нельзя считать её
  автоматически частью того же USDG revenue.
- inspection: 11/11 sampled receipts соответствуют полученным block headers,
  anchor перечитан; ошибок `response.error` в discovery/inspection нет.
- все три прямые BUY имеют ровно один нужный Swap и два TOKEN/USDG Transfer в
  порядке Swap → USDG payer→PoolManager → TOKEN PoolManager→payer. Quote Transfer
  равен отрицательной quote delta, TOKEN Transfer — положительной token delta;
  `maxAmount` в SETTLE_ALL не меньше долга, `minAmount` в TAKE_ALL не больше выдачи.
  Эти три конкретных исполнения совместимы с gross quote accounting, но не
  доказывают все будущие формы вызова.
- в двух более ранних profile snapshots есть по 38 `eth_call` errors от попытки
  применить одни getters ко всем разным контрактам. Это не success этих getter
  путей; пригодные handler/launchpad bindings подтверждаются только теми вызовами,
  которые вернули декодируемое значение. Standard-route API503 и Sourcify400/404
  отражены в документах, не подменены «готовностью».

По сохранённому `V4Router.sol` SETTLE_ALL берёт фактический полный долг в валюте,
проверяет `<= maxAmount` и платит от `msgSender()`; TAKE_ALL берёт полный кредит,
проверяет `>= minAmount` и отправляет `msgSender()`. В `Lock.sol` прямой внешний
`execute` закрепляет исходного caller. Значения action `0x0c`/`0x0f` сверены с
[Actions.sol](https://github.com/Uniswap/v4-periphery/blob/main/src/libraries/Actions.sol).
Перед production adapter надо закрепить именно ревизию источников, соответствующую
уже проверенному runtime hash router, а не полагаться на текущий `main` библиотеки.

Адресная проверка GPT: отдельные assertions на все 3 сохранённые calldata/receipts
прошли; `node --check` четырёх новых read-only scripts прошёл;
`git diff --check cf100ca..7480522` чист. Публичный RPC заново не опрашивал:
проверял воспроизводимость вывода из сохранённого evidence. Full/fork не запускал.
Пользовательский untracked audit-файл не трогал.

## Следующий ограниченный шаг

Теперь есть достаточно материала для **отдельного route-v2 decoder slice** на
`0x10/0x060c0f`, если native-fee/custom TOKEN/USDG остаётся целевым кандидатом.
Старый `0x060b0e` оставить самостоятельной версией. Сначала закрепить source/runtime
provenance для router/actions/lock и внести три реальные положительные fixture;
затем негативные варианты: чужой pool/quote, extra commands или Swap, payer mismatch,
лишние transfers, неправильный порядок/суммы, noncanonical params, превышение
`maxAmount`, output ниже `minAmount`, failure receipt. Только после этого включать
route-v2 в manifest/replay за явным version/profile binding. Никакой общей
«принимай 0x0c0f» allowlist по одним трём примерам.

Дальнейшие неизвестные вести отдельно: выбранный будущий vault/position/recipient
для нашего TOKEN, реальный collect/claim из нужной позиции, цена conversion/RNG/draw,
cutoff/finality. Ноль `claimable` у чужого vault не означает ноль несобранных fees.
Сначала один проверяемый BUY route, затем revenue adapter; не смешивать их и не
переутверждать экономику по чужой истории.
