# Самостоятельный запуск на Infinity: исследование

30.09.2026. Статус: исследование альтернативы PAIR, решение о миграции не принято.
Задача: сохранить комиссию проекта 3% в USDG и распределение 90/5/5,
обеспечить покупку/продажу и проверяемое начисление билетов.

## Что подтверждено

- Infinity позволяет отдельному hook удерживать токены через return delta;
  это отдельная логика от LP fee. [Описание](https://developer.pancakeswap.finance/contracts/infinity/overview/custom-layer-hook).
- Официальный [пример удержания комиссии](https://developer.pancakeswap.finance/contracts/infinity/guides/hook-examples/taking-fee-via-hook)
  посвящён снятию ликвидности, НЕ готовому 3% swap hook. Переносить его как готовое решение нельзя.
- Live Chromium: `https://pancakeswap.finance/swap?chain=robinhood` показывает Robinhood,
  ETH/USDG и котировку для 0.001 ETH без подключения кошелька.
  API `/api/pools/candidates` с chainId=4663 и protocol=v2,v3,infinityCl вернул HTTP200.
  Сохранённый ответ содержит только type0/type1 кандидатов; этот опыт НЕ доказывает
  выбор Infinity и тем более поддержку нашего будущего hook.
- [PancakeSwap описывает](https://blog.pancakeswap.finance/articles/infinity-hooks)
  routing через поддержанные hook pools. Публичного обещания включать любой новый hook не найдено.
- Найдена действующая [Hook Application Form](https://docs.google.com/forms/d/e/1FAIpQLSdFRDoA5mmpSasnthV6xOKA0MXaAyabeAJoRBN4x5EaTo9rSg/viewform)
  по ссылке из [официальной программы](https://blog.pancakeswap.finance/articles/introducing-the-pancake-swap-infinity-cake-emission-program-fueling-liquidity-and-growth-for-hook-enabled-pools).
  Программа описывает review, whitelist, видимость на liquidity/pool creation страницах и incentives.
  Это не опубликованная гарантия routing admission для Robinhood: в форме есть Other,
  но отдельной опции Robinhood нет. Ответ в течение недели — цель, не обязательство.
- У [Uniswap Labs](https://support.uniswap.org/hc/en-us/articles/48291859140621-Routing-for-hooked-pools)
  beforeSwapReturnsDelta/afterSwapReturnsDelta/dynamicFees требуют ручного допуска в routing.
  Проверенный исходник, отсутствие upgradeable proxy и особых router calldata входят в критерии.
  Это ограничение интерфейса/routing Labs, а не запрет on-chain swaps.
- [DEX Screener](https://docs.dexscreener.com/token-listing) описывает автоматическую индексацию
  после ликвидности и первой сделки. Покрытие именно Robinhood Infinity с новым hook
  этим общим правилом не доказано. График и торговая интеграция проверяются отдельно.

## Влияние на наш проект

По [INFINITY_COLLECTOR](INFINITY_COLLECTOR.md) существующий collector закрепляет PAIR
factory/hook/policy и забирает claimable. Собственный hook нельзя просто подставить
в существующий deployment: нужен отдельный источник funding с сохранением учёта 90/5/5.
По [INFINITY_BUY](INFINITY_BUY.md) decoder поддерживает конкретный direct PAIR adapter.
Universal Router/агрегатор сейчас не создаёт билеты автоматически. Нужен отдельный
decoder с доказательством payer/recipient/net USDG debit; tx.origin не заменяет такое доказательство.

## Следующий ограниченный шаг

Локальный прототип TOKEN/USDG + fee hook + явный swap route, без публичного deployment.
Критерии: buy/sell, обе ориентации валют, 6/18 decimals, partial fills/refunds,
минимальная сумма/округления, minOut/deadline, комиссия только с исполнения,
доставка всей комиссии проекта, восстановление indexer без двойных entries.
Базу расчёта 3% переносить из принятого экономического профиля; gross/net не менять молча.
Сначала определить начальную цену, диапазоны и источник ликвидности в тестовом сценарии:
101 USDG на первую покупку не является согласованным бюджетом обеспечения пула.

Два независимых результата: (1) наш сайт может исполнить обмен в конкретном пуле;
(2) внешний UI находит и котирует пул с этим hook. Первый можно доказать локально,
второй требует проверки внешней интеграции; поддержку/заявку никто не отправлял.
Hook не собирает комиссию с чужих пулов или обычных переводов токена.

## Evidence и пределы

Read-only browser probe: Playwright Chromium, swap page, input 0.001 ETH,
сбор body text и network response URLs/statuses; затем GET candidates через Node fetch.
Локальные отчёты: `.local/logs/infinity-ui-research-20260930.json`,
`.local/logs/infinity-pool-candidates-20260930.json`.
Нет кошелька, подписи, публичной транзакции, нового hook или прогона продуктовых тестов.
Документационные ссылки и diff проверены; будущая схема не объявляется готовой.
