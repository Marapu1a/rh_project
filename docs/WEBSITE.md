# Одностраничный сайт QIANQI

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
