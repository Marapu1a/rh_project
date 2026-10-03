# Проверка перед включением индексатора

04.10.2026. [Read-only evidence](evidence/PONS_ACTIVATION_PREFLIGHT_2026-10-04.json).

Фактический config/profile собран локально из публичного manifest и проверенного
deployment: anchor79377859, реальный genesis/runtime BuyPolicySource, серверный
statePath. Финальность дошла до79378127; admission matched на79389574.
Отставание finalized на снимке1155 секунд, executor0ETH. Это снимок, не постоянный допуск.
Сервисы на VPS не включены, activation marker не создан, отправок0.

Pons показывает получателя0x9FbAAb62DB88123fdB61217D244003a201A0CD9b — наш collector,
не отдельный EOA. Его не нужно импортировать в MetaMask. Прямой balanceOfToken
показал281.311122USDG; pull.staticCall вернул ту же сумму, estimateGas215026.
pull забирает средства и начисляет доли90/5/5; отдельный pay перечисляет их получателям.
Симуляция не является фактическим сбором или пополнением призового фонда.

Первый indexOnce остановился на Alchemy HTTP400: тариф ограничивает eth_getLogs
десятью блоками. У BuyPolicySource publishedCount=0, однако admission каждый раз
запрашивал всю историю notices. Теперь при нуле используется пустая история,
подтверждённая pinned runtime и finalized getters; currentHash/lastFromBlock,
identity/authority и canonical checkpoint продолжают проверяться. При ненулевом
счётчике прежняя полная проверка остаётся; совместимость её диапазонов с этим тарифом
ещё требует отдельного решения до первой публикации изменений правил.

Проверки: `node --test test/pons-policy-indexer.test.cjs` —5/5;
`node --test --test-name-pattern='policy|Policy' test/direct-buy.test.cjs` —3/3.
Проверены запрет log-запроса при нуле, неверные commitment/lastFrom, переход к
ненулевому count, а также существующие проверки notices и старых cutoff.
Это адресная проверка, не полный suite. Runtime собран локально в
`.local/logs/runtime-activation-20261004`, на сервер не установлен.

Первоначальный повторный batch100 остановлен после нескольких минут без публикации:
остановлен только подтверждённый PID локального read-only probe, его lock архивирован
после выхода процесса. Состояние не сбрасывалось. Повтор с batchSize1 успешно обработал
launch block79377860: admitted/catchingUp, target79385701, lag7841, total7.14s,
scan3.42s, reward1.78s, state640538bytes. Это один реальный блок, не throughput baseline
и не подтверждение обработки всех покупок. Отправок0. До постоянной службы необходимо
снизить число/последовательность RPC-чтений и подтвердить догон сети: повышение
таймаута само по себе проблему скорости не решает. Фактический anchor не переносить.
Следующие незавершённые действия: indexer/API, frontend bindings/fee copy,
публичная source verification, gas funding и отдельное включение финансовой автоматики.
