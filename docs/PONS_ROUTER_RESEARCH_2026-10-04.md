# Массовый роутер65050… — исследование04.10.2026

Статус: исследовательский разбор28/28 сохранённых покупок завершён. Production
admission не добавлен; политика, билеты, сервер и денежные операции не менялись.
[Результаты и pins](evidence/PONS_ROUTER_RESEARCH_2026-10-04.json).

## Что установлено

Внешняя цель `0x65050a9b7e5075a2ba5ced7b1b64ee66262c40dc`, selector4d819a2a.
27 ETH-funded и1 USDG-funded BUY из snapshot79518814. Разбор связывает внешний
sender/input/value, полное множество логов trace с receipt, единственный внутренний
curve.buy с его CurveBuy, перевод USDG в curve и конечную передачу QIANQI sender.
Во всех28 сохранённых случаях проверки прошли. Это объясняет28 из52 неподдержанных
покупок; ещё24 не входят в этот адаптер. Никакой ELIGIBLE результат не возвращается.

USDG пример:200000000 списано с покупателя;198000000 ушло в curve,2000000 —
отдельная комиссия. ETH пример: USDG получен от funding pool; у внешнего покупателя
нет списания USDG, поэтому whole-wallet delta не является базой такого BUY.
Наблюдаемые суммы сохранены отдельно, продуктовая формула не изменена.

## Почему одного адреса недостаточно

Роутер имеет752bytes proxy code. В bytecode видны ветка admin и запись implementation;
адрес admin literal:0x75fc5cd1794921e617d97e4afa2ff93613413be3. Это анализ bytecode,
не утверждение о личности владельца или полном аудите доступа.
[Стандарт ERC1967](https://eips.ethereum.org/EIPS/eip-1967) определяет implementation
slot0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc.
На высоте первой выборки и свежей finalized79714938 слот содержит
0x56101165bcf508b288f383113892e6db6be6db0e.
Вызовы также исполняют модули0xd17b21b65cc273a4b342f14b19063da8bb410dbd
и0x1ab4c5dfe15ff16170201d7fe0edc20c3d0cada3. Hashes всех4 runtime совпали между
двумя проверенными высотами; это не доказательство отсутствия промежуточных upgrade.
Sourcify API для всех4 вернул404. Это отсутствие исходников в этом сервисе,
не доказательство отсутствия исходников вообще.

Проверять только hash proxy нельзя: implementation меняется через storage.
Для безопасного будущего допуска нужны фактически выполненные implementation/modules,
их семантика, funding pool/token dependencies и защита от смены внутри блока.
Одно чтение storage в конце блока недостаточно при upgrade-before/after внутри него.

## Реализация исследования

`scripts/pons-router-trace-research.cjs` — отдельный offline tool без включения
в direct-buy/PONS_PROFILES/indexer. Поля admitted=false и eligibility=null постоянны.
Trace — доверенные RPC execution evidence; envelope/log binding не превращает его
в криптографическое доказательство. Наличие корректной трассы не заменяет review
исполнителя/подписи/callback/refunds и не даёт право на retroactive tickets.
Неизвестные формы, failed frames, неоднозначная выдача и mixed SELL отвергаются.

Сохранены два полных публичных receipt+trace fixture: ETH и USDG. Команда воспроизведения:
`node scripts/pons-router-trace-research.cjs test/fixtures/pons-router-research/usdg.json NEW_REPORT.json`
Выход создаётся эксклюзивно, без перезаписи. Все28 исходных trace остаются в
.local/logs/night-traces; результаты каждого включены в публичный report.

Проверки04.10:
- `node --test test/pons-router-trace-research.test.cjs test/pons-channel-attribution.test.cjs`:7/7 PASS.
- `node --test test/test-launcher.test.cjs`:5/5 PASS, новый файл добавлен в full/pons-channels.
- Offline инспекция28/28 real samples PASS; это исследовательские проверки, не admitted/fork BUY.
- Read-only VPS06:26UTC:1362 successful passes,0 failures,lag0,2374609bytes.
  Финансовая автоматика inactive. Ночного роста от пустых блоков не наблюдается.

## Следующий ограниченный шаг

Восстановить ABI и семантику entry implementation561011… и двух модулей из
верифицируемых исходников либо отдельного анализа bytecode с локальным fork.
Затем тестировать payer/recipient substitution, чужое финансирование, leftovers,
refunds, callback spoofing, upgrade и mixed transactions. Если объём такого review
несоразмерен MVP — оставить65050… неподдержанным и выбрать более проверяемый маршрут,
а пользователю показывать поддержанный способ покупки. Не расширять допуск на все
CurveBuy только ради охвата. Активация новой policy — отдельный шаг после тестов.
