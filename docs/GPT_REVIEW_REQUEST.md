# Review: первая одностраничная QIANQI страница

Дополнение29.09: по просьбе владельца убрали маркетинговые/временные подписи,
укрупнили интерфейс до16/22/40px (hero отдельно), сократили UI copy. Правила,
stale/unavailable и отсутствие гарантии сохранены.3 browser scenarios прошли,
мобильный layout и опубликованный HTTPS проверены. Backend/math не менялись.
Текущий preview https://qianqi.109.73.196.111.sslip.io/, release type-cleanup-20260929.

29.09.2026. Только static review, не запускать tests/build/fork.
Пользователь дал макеты и images_for_site; задача воспроизвести визуальный стиль
одной страницы, без новых продуктовых правил. [Готовое/ограничения](WEBSITE.md).

web/ — адаптивная vanilla HTML/CSS/JS страница. Browser EIP-1193 connect/EIP-6963
выбор wallet, chain4663, accountsChanged/chainChanged/disconnect, version guard
на fetch. GET через фиксированный server proxy к существующему wallet API.
Observed/stale/unavailable различаются; при failure данные очищаются, не обнуляются.
Суммы rewards не форматируются по quote decimals: ждём проверенный asset profile.
Нет txn signing/Claim/произвольных buy links. Банки pre-launch прочерки, не fake jackpot.

Макет Daily/buy-or-sell/register исправлен на Short/eligible BUY/no registration.
3 browser сценария passed, реальные wallets/API заменены тестовыми; desktop/mobile
просмотрены. Full/backend suite не запускались: backend контрактов не менялся.
Исходные пользовательские assets сохранены отдельно, рабочие копии web/assets.

Проверь соответствие существующим правилам/API, reset данных при wallet changes,
ошибки UI, которые могут ввести пользователя в заблуждение. Это не production launch:
общий draw/reserve API, проверенные payout asset/claim, полная история, мобильный QR
и реальный deployment ещё впереди. Следующий пакет — общий draw API и карточки/результаты.
Предыдущий service93bd488 остаётся отдельным локально проверенным пакетом; если ещё
не прочитал его, read-only supervisor/recovery описаны в INDEXER_SERVICE.md.
