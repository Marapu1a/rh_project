# Infinity BUY → автоматическое участие

27.09.2026. Новый deployment использует `direct-buy-infinity-v1`, adapter
`rh-infinity-exact-input-v1`, eligibility `automatic-buy-v1`, basis
`wallet-net-debit-v1`. Это отдельная genesis policy, не миграция старого V2 ledger.

## Начисление

Поддержан прямой `executeExactInput` проверенного PAIR Infinity adapter для одного
TOKEN/USDG pool. Payer, recipient и tx.from должны совпадать. Runtime adapter,
manager и hook закреплены в версии decoder; deployment закрепляет TOKEN, USDG,
settlement vault, registry, pool key/id и anchor. RPC scan проверяет code hashes
на cutoff и исторические Infinity зависимости на каждом просканированном блоке.
Неизвестные proxy implementation changes этим сравнением runtime не доказаны;
production deployment admission и мониторинг внешних зависимостей остаются обязательными.

Один Swap → одно решение. BUY определяется по знакам pool deltas. Проверяются
canonical calldata, pool, direction, input/minimum, swap sender и ERC20 settlement:
одна оплата buyer→adapter равна inputMaximum, доставка TOKEN settlement→buyer
равна pool output; возвраты USDG разрешены только из adapter/settlement после Swap.

Зачёт = фактическое списание USDG с покупателя минус возвраты ему в той же tx.
Комиссии уже включены; pool input не прибавляется повторно. Каждые100 nominal USDG
создают entry, carry сохраняется; одна entry даёт Short и Monthly попытку через
существующий lifecycle. Поле `grossQuoteRaw` сохранено для совместимости ledger:
в этой явно версионированной policy оно равно `netQuoteDebitRaw`, а не pool input.

SELL, простой перевод/holding, exact-output, посредник вместо отправителя,
неизвестный маршрут и неоднозначный settlement не создают entries. Решение содержит
reason и evidence log indexes. За неподдержанный маршрут билеты не обещаем.

## Связь с существующим контуром

`infinity-buy.cjs` → `direct-buy.replay` → `attempt-lifecycle` → `short-dataset` →
штатный scheduler. Сканируются полные блоки со всеми receipts; повторная доставка
идентичных блоков не начисляет повторно, противоречащая история отклоняется.
Полный replay ветки остаётся способом восстановления; постоянный incremental
service и production finality этим пакетом не добавлены.

BuyPolicySource закрепляет hash новой genesis и adapter id; admission не обходится.
Неизвестное будущее расширение блокирует cutoff после activation до обновления
decoder; сейчас новых Infinity routes нет. V2 route extensions работают по прежним
правилам. Нельзя переключить старый manifest в automatic задним числом.

Registry остаётся существующей immutable частью deployment domain контроллеров.
Для Infinity регистрационные события не дают и не отнимают участия; register()
не нужен. Это совместимость формата привязок, а не отдельный механизм eligibility.
Контракты контроллеров и призовая математика не менялись.

## Проверки и пределы

Pure проверки saved receipts + direct BUY и lifecycle:43/43 командой
`node --test test/infinity-buy.test.cjs test/direct-buy.test.cjs test/attempt-lifecycle.test.cjs`.
Среди новых сценариев:103.30USDG→1entry+3.30carry без регистрации, возврат6.70 из
лимита110, неоднозначный recipient/payment/delivery, неизвестный маршрут, SELL,
повторные блоки и отказ несовместимой schema. Синтетический refund сначала проверен
как vector; фактический fork результат записывается отдельно ниже.

Fork harness: `node scripts/infinity-launch-fork.cjs NEW_OUTPUT.json --entries`.
Он запускает новый PAIR TOKEN/USDG, затем отдельные локальные draw contracts,
BuyPolicySource и две покупки с inputMaximum110USDG. Для draw budget используются
100USDG тестового внешнего funding, для RNG — прежний LocalRandomFixture.
Цель проверки — admission → RPC scan → entries → dataset → begin/publication,
не production RNG/победители/выплата. Public sends отсутствуют; upstream read-only.


Фактический новый fork **complete**, evidence:
[entries-fork-2026-09-27.json](../research/infinity-source-audit/entries-fork-2026-09-27.json).
Две покупки по110USDG maximum вернули по6.70USDG; net206.60USDG дали2entries и
6.60carry без register(). BuyPolicySource admission → полный RPC scan → scheduler
saveJob → begin → publish выполнены. Независимый buildFromHistory дал тот же artifact.
Upstream443reads,4retries,0errors. Сохранённый evidence проверен отдельно2/2:
`node --test test/infinity-buy-evidence.test.cjs`. Full suite не запускался.

Ближайшее продолжение: связать реальный RNG и исполнение до выплаты с этим путём.
Отдельные открытые границы: production admission/finality, постоянный indexer,
единый coordinator денежного/draw контуров, газ и recovery, утверждённые внутренние
bps. Fixture budget100USDG не означает доход от двух BUY; fixture probabilities
не переутверждают экономические параметры релиза.

27.09: совместный [Infinity→Short→USDG прогон](INFINITY_PAYOUT_PROOF.md) выполнен. Реальные fork fees финансируют этот же vault; live drand worker и claim проверены. Ускорение часов конструктора/тестовые odds и lead описаны отдельно; Monthly draw и непрерывный coordinator не заявлены.
