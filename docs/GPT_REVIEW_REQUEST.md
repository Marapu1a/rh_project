# Review: календарная проверка экономического кандидата

23.09.2026. Sponsor ветка отложена пользователем. Работаем над базовым релизом.
Новые экономические цифры всё ещё кандидат; PRODUCT_SPEC/контракты/config не менялись.

Изучи MVP_ECONOMIC_PROFILE, MVP_CALENDAR_CHECK и scripts/mvp-calendar-model.py.
Скрипт переиспользует scripts/short_model.py, добавляет exact raw funding/project
split с carry, monthly frozen/current/next, календарь и synthetic eligible BUY.
520 прогонов: 13 сценариев, 20 seeds, оба порядка Short/Monthly, 120 дней.
Модельные assertions денег/attempts/intervals прошли, отдельные fixtures проверяют
funding fragmentation, pending funding win/no-win, Next gate и carry во время Short.

Важно: paid=assigned claimable, claims не исполняются. 6h grid, immediate conversion,
нет газа/финальности/отказов RNG, seeded Python random не production. 0.2% creator
revenue — сценарный вход, не реальная PAIR policy. Cohorts фиксированы, BUY allocation
синтетический. Не объявлять эту проверку доказательством production или farming EV.

Проверь ошибки именно модели: порядок funding/settlement/freeze, сохранение новых
поступлений/попыток, clocks от settlement, funding phase и выводы из выборки. Особый
вопрос: single-wallet/no-win может создавать много платных исполнений при слабой
выручке; как обосновать ops readiness без произвольного min_wallets и траты prize funds?
Новые продуктовые ограничения самостоятельно не утверждай.

Нужен ограниченный следующий шаг к реальным integration slices, не бесконечный
перебор экономических вариантов. Подскажи, какие результаты мешают двигаться дальше,
а какие разумно оставить объявленными ограничениями. Full Solidity suite для нового
offline Python model не нужен; воспроизведение скрипта достаточно для его assertions.
