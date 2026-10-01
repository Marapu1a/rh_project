# Одностраничный сайт QIANQI

01.10: local /transparency/ (web/transparency/index.html + style.css), ссылка в HK footer. Датированные факты/ожидания Pons, бюджет только по фактическому USDG, внешние evidence links. Не live monitor и не deployed. Browser390/1440 без overflow/page errors, footer navigation PASS. При deployment включить каталог transparency в release.

30.09: HK release data-20260930 на qianqi.site: overview/reserves/history, frozen tickets, суммы и tx наград. API за Nginx работает в standby до deployment. DNS/HTTPS и renewal dry-run прошли. [Детали, rollback и проверки](PUBLIC_STATUS_API.md).

30.09, итог DNS-проверки: выявлена рассинхронизация authoritative Timeweb: ns1/ns3/ns4 →201.51.22.244, ns2 →109.73.196.111 (TTL600), поэтому это НЕ только recursive cache. Первичная выдача HTTPS успешна, но `certbot renew --dry-run --no-random-sleep-on-renew` failed: staging CA пришёл на старый109.73.196.111 и получил404. Реальный сертификат не изменён, timer active. До устранения DNS публичная доступность не гарантирована; после синхронизации повторить обычный браузер без IP pin и renewal dry-run. Нужна проверка DNS панели/поддержки Timeweb, доступа к DNS API у агента нет.

30.09: публикация HK на qianqi.site / www.qianqi.site, Timeweb Amsterdam201.51.22.244. Ubuntu26.04.1, Nginx1.28.3; Node не требуется для статического фронта. Release `/var/www/qianqi/releases/front-20260930`, symlink `/var/www/qianqi/current`, nginx `/etc/nginx/sites-available/qianqi`. Сборка release: HK index.html в корень, CSS по /concepts/hk/style.css, общий app.js, assets,404.html/404.css. Исходный web/index.html и старый preview109.73.196.111 сохранены. Убраны ссылки Original design из HK. Отдельная404 с mouse-error и ссылкой домой возвращает реальный404, включая вложенные пути; local serve-site использует ту же страницу.

HTTPS Let’s Encrypt для обоих имён, HTTP→HTTPS, certbot.timer active. Сертификат `/etc/letsencrypt/live/qianqi.site/`, initial expiry29.12.2026; регистрация ACME без email (контакт не предоставлен). CSP self-only без inline scripts/styles, nosniff, frame deny, no-cache для обновлений. `/v1/` временно JSON503 unavailable: данные не выдумываются, signer/API/RPC на сервере отсутствуют. Права/SSH пользователя не менялись. Ключ qianqi-ams-201-51-22-244 локально вне git, сохраняется.

Исправлен review finding: silent restore с исчезнувшим saved address отключает сессию вместо автоматического выбора другого разрешённого адреса. Regression проверяет отсутствие запроса данных нового адреса до явного подключения. Frozen/open presentation остаётся задачей подключения API, не объявлено исправленным.

Проверки30.09: `SITE_TEST_PATH=/concepts/hk/ node --test web/site.test.cjs web/wallet.test.cjs`16/16; `node --test web/site.test.cjs`3/3; `git diff --check`. Live `.local/logs/live-front-check.cjs`: Chromium с host-resolver pin201.51.22.244 (проверка TLS включена), ширины1440/768/390/320, раскрытыеFAQ/anchors/assets, buy/no-wallet dialogs, отсутствие JS/CSP ошибок, nested404 на3ширинах и возврат домой, JSON503 и HTTPS всех имён. Скриншоты `.local/logs/live-front-*` и `live-404-*`; mobile404 просмотрена. Полный contract suite не запускался: изменены только фронт/local static server. Authoritative ns1/ns2 Timeweb отдавали201.51.22.244, recursive1.1.1.1 ещё109.73.196.111; обычную доступность повторить после истечения TTL600.

Rollback будущих релизов: сохранить прежний каталог, переключить current на него через ln -sfn, nginx -t и reload. Перед изменением nginx сохранить копию конфигурации; первичный deploy не затронул старый сервер. Runtime и nginx backup доступны в `.local/logs/`, секреты в git не копируются.

30.09: полный локальный редакторский проход HK в стиле одобренного hero. Финансирование, шаги, wallet empty states и все 9 FAQ переписаны разговорным английским; численные условия, admission vs win, Monthly 75/25, расход tickets, multi-wallet edge, pending/claim gas, indexer trust и pre-launch границы сохранены. Слоган и одобренные два hero-абзаца побайтно сохранены. Общий `web/app.js` получил только новые пользовательские строки: динамические статусы, ошибки, wallet menu и buy placeholder теперь в том же тоне. Изменение buy-сообщения отражено в существующем browser assertion. Исходная HTML-версия не редактировалась; её динамические строки используют общий app.js.

Проверено 30.09: `SITE_TEST_PATH=/concepts/hk/ node --test web/site.test.cjs web/wallet.test.cjs` (в PowerShell переменная через `$env:SITE_TEST_PATH`) — 15/15; `npm run test:site` без переменной — 3/3. Chromium: 9 раскрытых FAQ и внутренние anchors на 1440/768/390/320, без horizontal overflow; desktop/mobile screenshots `.local/logs/hk-tone-1440.png`, `hk-tone-390.png`. DOM IDs и набор численных значений FAQ сохранены; смысл дополнительно сверен редакторским проходом. Только локально, production/full suite не запускались и сервер не обновлялся.



30.09: согласованный владельцем живой текст hero вставлен локально в HK: «A speculative token with a little extra thrill…» / «Trading fees fuel the prizes…». Слоган и правила сохранены; публикации на сервер не было.


## Browser wallets — локальный шаг 30.09.2026

Общий `web/app.js` доработан без SDK и новых зависимостей. HK-тексты владельца не изменялись. Кнопка подключённого адреса открывает меню: полный выбранный адрес и остальные разрешённые адреса, управление разрешениями в wallet, смена расширения, ручной переход на Robinhood Chain при неверной сети, локальное отключение. Один активный адрес; выбираются только адреса, раскрытые провайдером. Выбор адреса в нашем меню меняет просматриваемый адрес сайта, не глобальный активный аккаунт расширения.

EIP-6963: discovery продолжается после загрузки, providers дедуплицируются по UUID/объекту, поздний provider появляется в открытом выборе. Названия выводятся через textContent, внешние wallet icons/HTML не используются. rdns/name — самообъявленные метки, не доказательство подлинности. Legacy window.ethereum остаётся fallback при отсутствии объявленных providers; неоднозначные старые расширения автоматически не перечисляются.

После перезагрузки в той же вкладке восстановление использует sessionStorage (метка провайдера и выбранный публичный адрес) и только eth_accounts/eth_chainId. Нет автоматического eth_requestAccounts, подписи, permission popup или network switch. При нескольких совпадающих метках silent restore не выполняется; legacy provider без устойчивой метки требует клика. sessionStorage не подтверждает разрешение: accounts перепроверяются; недоступность storage не блокирует ручное подключение. Локальный disconnect удаляет сохранённый выбор и запрещает повторное автоматическое подключение; разрешение внутри wallet этим не отзывается.

Manage accounts запрашивает только wallet_requestPermissions([{eth_accounts:{}}]) и перечитывает доступные accounts. Неподдержанный метод даёт инструкцию управлять доступом в расширении. Сеть переключается через wallet_switchEthereumChain только по кнопке; незнакомая сеть не добавляется с непроверенным RPC. RPC ограничен ожиданием 20s: таймаут не отменяет запрос в расширении, UI предлагает проверить его перед повтором. Ошибки 4001/-32002/4100/4900/4901/4902/4200/-32601 различаются. Отзыв доступа очищает показанные данные.

Session generation и подписки защищают от позднего ответа старого provider; accounts/chain events очищают устаревшие статусы, поздние API ответы не заменяют новый адрес. Подписки снимаются при смене/отключении. Подписей, approve, отправки транзакций, auth-сессии на backend и WalletConnect QR нет. Обнаружение кошелька не доказывает live readiness.

Проверено 30.09: PowerShell `$env:SITE_TEST_PATH='/concepts/hk/'; node --test web/site.test.cjs web/wallet.test.cjs` — 15/15; отдельный `npm run test:site` без переменной — исходник 3/3. Новые 12 сценариев покрывают два provider, dedup, account/provider switch, silent restore/revocation, chain/permissions, ошибки, late connection/API replies, timeout, events во время connect, позднее объявление и ambiguous identity. Это synthetic browser providers, не настоящие расширения. Мобильное меню локально просмотрено, overflow отсутствует; screenshot `.local/logs/wallet-menu-mobile.png`. `git diff --check` passed. Сервер не обновлялся, полный product suite не запускался.

Основание: [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963), [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193), [EIP-2255](https://eips.ethereum.org/EIPS/eip-2255), [EIP-3326](https://eips.ethereum.org/EIPS/eip-3326).



30.09: по просьбе владельца SVG-стрелки HK удалены полностью; кнопки и ссылки текстовые. connect-label сохранён, чтобы wallet updates не возвращали стрелки. Только локально; тексты владельца сохранены.


30.09: локальная правка иконок: HK HTML использует inline SVG (18px, currentColor, aria-hidden), декоративные Unicode-стрелки удалены. `web/app.js` обновляет `.connect-label`, сохраняя иконку; для исходного HTML без такого label оставлен прежний fallback. Тексты владельца не переписывались. Адресные `node --test web/site.test.cjs` для исходника и с `SITE_TEST_PATH=/concepts/hk/` для HK: по 3/3 passed; после HTML изменения HK повторён 3/3. Local Chromium подтвердил размер SVG и сохранение после отклонённого wallet connection; текстовых стрелок в HK нет. Серверный release не менялся.


## Прозрачные тексты HK — 29.09.2026

HK-направление понравилось владельцу больше исходного. На том же `/concepts/hk/` опубликован release `/opt/rh-preview/releases/hk-copy-20260929`. Предыдущий `hk-study-20260929` сохранён; конфигурация перед обновлением — `/opt/rh-preview/nginx-host-server.conf.before-hk-copy`. Основной `/` по-прежнему использует `hero-20260929`.

Тексты сверены с USER_RULES и PRODUCT_SPEC, без изменения продукта. В начале: два энтузиаста, спекулятивный токен, автоматические entries за поддержанные покупки, финансирование из комиссий и добровольных пополнений. Видимый блок 3% creator fee и 90/5/5 различает доход проекта и всю стоимость сделки. Девять раскрываемых правил покрывают маршруты/учёт, призовую корзину и odds, Monthly 75/25, интервалы/ожидания, преимущество нескольких адресов, распределение резервов, выплаты/claim gas, indexer trust и спекулятивный риск. Указано, какие публичные ссылки и данные ещё не подключены. Не обещается, что любая торговля даёт билеты или что получение всегда мгновенное и бесплатное.

Изменены только HTML/CSS HK и static release route; JS/API/контракты не менялись. На мобильном описание стало полноширинным перед сценой mascot для читаемости. Проверка: `$env:SITE_TEST_PATH='/concepts/hk/'; node --test web/site.test.cjs` — 3/3, адресно, synthetic wallet/API. Отдельно проверены все 9 открытых разделов правил на 1440/768/390/320 без горизонтального overflow; desktop/mobile визуально просмотрены. Внешний Chromium подтвердил совпадение опубликованного HTML с локальным, wallet dialog и сохранность исходного `/`. `nginx -t` и `git diff --check` passed. Screenshot evidence: `.local/logs/hk-copy-live-1440.png`, `hk-copy-live-390.png`. Full suite/live signing не запускались.



## Сравнение концепций — 29.09.2026

- Исходный сайт: https://qianqi.109.73.196.111.sslip.io/ — release `hero-20260929`, HTML/CSS/JS и assets не изменены.
- HK study 01: https://qianqi.109.73.196.111.sslip.io/concepts/hk/ — отдельный release `/opt/rh-preview/releases/hk-study-20260929`. На странице есть ссылки на исходный вариант.
- Локально: `npm run site`, затем http://127.0.0.1:4173/concepts/hk/.

Это самостоятельная HTML/CSS-композиция, а не тема исходного CSS: крупный QIANQI/千祺, отдельная сцена mascot, горизонтальная полоса draws, новая сетка инструкции/кошелька/правил. Картинки и `/app.js` общие с исходником; правила и поведение кошелька сохранены. Для следующих экспериментов создавать соседние каталоги, не перезаписывать согласованные варианты. Дизайн пока не выбран окончательно.

Маршрут Nginx имеет отдельный root только для `/concepts/hk/`; основной root, ACME и API503 сохранены. Конфигурация до добавления маршрута: `/opt/rh-preview/nginx-host-server.conf.before-hk-study`. Возврат маршрутизации: восстановить этот файл на место `nginx-host-server.conf`, выполнить `nginx -t -c /opt/rh-preview/nginx-host.conf`, затем `nginx -s reload -c /opt/rh-preview/nginx-host.conf`. Release и ключи не удалять.

Проверено 29.09.2026: `npm run test:site` — исходник 3/3; PowerShell `$env:SITE_TEST_PATH='/concepts/hk/'; node --test web/site.test.cjs` — концепция 3/3. Переменную после проверки удалить через `Remove-Item Env:SITE_TEST_PATH`, если команды выполняются в постоянной оболочке. Это адресные browser tests с синтетическим wallet/API; не полный product suite и не реальное подписание. Внешний Chromium: HTTPS, картинки, отсутствие horizontal overflow на 1440/768/390/320, wallet/buy dialogs, без JS errors. HTML `/` побайтно совпал с локальным исходником. Визуально просмотрены desktop/mobile; screenshots `.local/logs/hk-live-1440.png`, `hk-live-390.png`.

Референсы направления: [Pengguin / Langham Place 2025](https://pengguin.hk/works/langham-place/), [Typetonic](https://typetonic.studio/), [RGBK](https://rgbk.studio/). Это дизайнерская интерпретация, не утверждение об общем стиле всех жителей Гонконга.



29.09 hero: по макету владельца растянуты первые F/H, строки сведены в масштабируемую
SVG-типографику без прежних больших промежутков. h1 имеет доступное текстовое имя;
SVG декоративный. Мышонок увеличен, обрезан снизу, перекрывает край hero/card;
pointer-events:none, на телефоне отдельная композиция над карточкой. Размеры остального
интерфейса16/22/40 не менялись. Layout browser test passed; live320/390/768/1440 без
overflow, диалог доступен, desktop/mobile визуально просмотрены. Текущий preview release
`/opt/rh-preview/releases/hero-20260929`, прежняя конфигурация `.before-hero` сохранена.

29.09: по замечаниям владельца интерфейс приведён к шкале16/22/40px (текст/заголовки/числа),
кроме декоративного hero. Удалены слоганы, pre-launch labels и повторяющиеся пояснения;
важные правила, отсутствие гарантий и состояния unavailable/stale сохранены.
Короткие тексты применены и к состояниям кошелька. При ширине до440px prize cards идут
вертикально. Три browser scenarios прошли; после CSS исправления повторён layout test.
На HTTPS подтверждены три computed font sizes, видимость заголовков карточек/правил,
отсутствие horizontal overflow. Backend/призовые правила не менялись.
Текущий static release: `/opt/rh-preview/releases/type-cleanup-20260929`.
Предыдущий release9ad5660 и server config `.before-typography` сохранены для возврата.
ACME webroot остаётся на9ad5660 для совместимости с существующим certbot renewal.

## Дизайнерский стенд

Публичный preview: https://qianqi.109.73.196.111.sslip.io/ — static release9ad5660.
http://109.73.196.111/ перенаправляет на HTTPS. Временное DNS-имя sslip.io привязано
к IP; позднее можно заменить своим доменом. Это открытый визуальный стенд, не приватный
кабинет: robots/noindex являются указанием поисковикам, не контролем доступа.

На сервере109.73.196.111 отдельный host Nginx/systemd `qianqi-preview`, enabled/active.
Files `/opt/rh-preview/releases/9ad5660`, config `/opt/rh-preview/nginx-host.conf`
и `nginx-host-server.conf`; воспроизводимые копии в [ops/preview](../ops/preview/).
Let’s Encrypt certificate до28.12.2026, certbot.timer active и deploy hook для reload.
Ключи SSH/TLS не включены в репозиторий. SSH доступ сохранён до явного закрытия владельцем.

Никакие RPC credentials, signer или indexer не развёрнуты: /v1/ отвечает503 JSON.
HTTPS позволяет проверять wallet connect, но без боевых выплат/операций. Браузерная
проверка настоящего расширения кошелька остаётся отдельной от визуального smoke.

Старый `gk_project-frontend-1` остановлен, не удалён; backend/db продолжают работать.
Compose configs и container inspect сохранены в root-only
`/root/rh-preview-backups/before-9ad5660/`; inspect/env не копировать в git.
Первоначальный пробный Docker `qianqi-preview` также остановлен; активен systemd service.
Возврат старого сайта на сервере:

```sh
systemctl disable --now qianqi-preview
docker start gk_project-frontend-1
```

Проверено29.09: HTTPS возвращает весь HTML8286bytes с доверенным сертификатом;
реальный внешний Chromium загрузил страницу и диалог, mobile390 без overflow.
HTTP проба отдельных assets дала200, wallet API503. Сначала некоторые HTTP body reads
обрывались после первого фрагмента; смена Docker/host Nginx сама этого не устранила.
На HTTPS браузерный smoke прошёл. Причина промежуточной сетевой проблемы не установлена;
изменения экспериментальной Docker MTU-сети отменены, сеть старого проекта не менялась.
Скриншот `.local/logs/qianqi-live-check.png`. Это не live integration/payout qualification.

Первая адаптивная версия по макетам пользователя: `web/index.html`, `style.css`,
`app.js`. Без framework/build pipeline: статические файлы, CSP-compatible scripts,
локальные изображения. Иллюстрации скопированы из пользовательского images_for_site
в web/assets с понятными именами; исходная папка не удалена и не включена в commit.
Шрифты системные, внешних fonts/trackers нет. Английский текст, традиционные китайские
иероглифы в hero. Полной китайской локализации пока нет.

Запуск: `npm run site`, открыть http://127.0.0.1:4173.
PORT меняет порт; RH_STATUS_API_ORIGIN (по умолчанию http://127.0.0.1:8787) задаёт
фиксированный upstream wallet API. Он запускается отдельно по INDEXER_SERVICE.md.
Прокси разрешает только GET /v1/wallets/ADDRESS и не раскрывает RPC/env.
Не является настройкой публичного HTTPS deployment.

Готово:
- адаптивные hero/Short/Monthly, how-it-works, личные билеты/награды, правила, footer;
- браузерные EIP-1193 wallets и выбор нескольких через EIP-6963;
- запрос только accounts/chain, смена сети4663 по нажатию, никаких подписей/транзакций;
- чтение существующего wallet-status API, open Short/Monthly, carry, provenance,
  наблюдаемые reward statuses. Stale явно помечен, unavailable не заменяется нулём;
- account/chain change сбрасывают показанные данные и защищены от старого fetch ответа;
- локальное отключение (не отзыв разрешения в самом wallet), обновление каждые30s
  только на видимой странице; отказ подключения/нет wallet/неверная сеть.

Границы текущего пакета:
- pre-launch, банки показывают прочерк. Общий draw/reserve API ещё не реализован;
- buy link и Claim не выдуманы: нужны реальные проверенные deployment addresses/routes;
- суммы наград пока не показываются: нельзя использовать decimals quote для произвольного
  reward asset без asset profile. API отдаёт raw amounts; следующий интеграционный пакет
  должен закрепить USDG address/decimals и безопасный claim/tx links;
- отображаются первые25 rewards с явным количеством, полной истории/пагинации сайта пока нет;
- token balance/PNL из макета не показаны, данных для них нет;
- WalletConnect QR/mobile deep links и полный Chinese UI не добавлены;
- нет демонстрационных выплат/фальшивых средств. Подключение не является регистрацией.

Проверка: `npx playwright install chromium` один раз, `npm run test:site`.
3 browser scenarios passed:320/390/768/1440 без horizontal overflow, диалоги/правила,
кошелёк+stale/carry, outage очистка, disconnect, wrong chain/rejected request.
API ответы и wallet в tests синтетические, настоящая extension/signing не тестировалась.
Скриншоты desktop/mobile визуально просмотрены, локально `.local/logs/qianqi-*.png`.
Browser tests отдельные от contract suite; full/fork/live не запускались.

Следующий ограниченный пакет: общий read-only draw/reserve API и привязка карточек,
истории результатов, затем deployment-bound reward amounts/claim. Не менять призовую
математику под устаревшие подписи макета Daily/buy-or-sell/register.
