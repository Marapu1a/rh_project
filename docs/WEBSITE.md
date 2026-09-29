# Одностраничный сайт QIANQI

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
