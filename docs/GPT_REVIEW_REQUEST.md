# Постоянное обращение к GPT: текущий пакет QIANQI

30.09.2026. Прочитай актуальный main и сделай static review пакета после `13bea9c`.
Дизайн и тексты сайта согласованы владельцем; этот этап закрыт, возвращаемся
к сквозному пользовательскому пути. Это не публичный запуск.

## Как работаем

Начни с [CURRENT_CONTEXT](CURRENT_CONTEXT.md), текущего шага [ROADMAP](ROADMAP.md)
и [WEBSITE](WEBSITE.md). Весь архив перечитывать не нужно.
По [REVIEW_TESTING](REVIEW_TESTING.md): **не запускай tests/build/fork, не устанавливай
зависимости и не диагностируй своё окружение**. Ревью — чтение кода и связей модулей.

Ищи конкретные проблемы с понятным последствием для пользователя. Не превращай
следующий шаг в исследование всех теоретических сочетаний отказов. Реальные ошибки
начисления, выплат, чужих данных и денег не пропускать. Не меняй принятую математику,
правила или согласованный дизайн. Отделяй гипотезу от дефекта; при недостатке покрытия
предложи Codex адресный сценарий и ожидаемый результат.

## Пакет

- `web/concepts/hk/`: выбранная HK-композиция, мышонок, QIANQI/千祺, живой английский
  текст, видимая комиссия 3% и разбивка 90/5/5, девять раскрываемых правил.
  Слоган: “A token to trade. A chance to win.” Стрелки удалены по просьбе владельца.
  Смысл сверять с [USER_RULES](USER_RULES.md) и [PRODUCT_SPEC](PRODUCT_SPEC.md).
- Исходный HTML-дизайн сохранён на `/`, новый — на `/concepts/hk/`.
  `scripts/serve-site.cjs` разрешает новые static routes. JS и картинки общие;
  wallet-dialog CSS и поведение общего JS изменены для обоих вариантов.
- `web/app.js`: EIP-6963 discovery/dedup, выбор расширения и разрешённого адреса,
  меню wallet, ручные permissions/network requests, sessionStorage restore через
  eth_accounts, disconnect, 20s RPC timeout и guards для поздних connection/API
  replies. Provider name/rdns — самообъявленные метки, не удостоверенная личность.
  Legacy injection не восстанавливается автоматически.
- `web/wallet.test.cjs`, `web/site.test.cjs`, команда `test:site:wallet`.
  Backend, API schema, контракты и правила денег не менялись.

## Что проверить

1. Смена account/provider/network, silent restore, отказ/отзыв доступа, disconnect
   и поздние ответы: не выдаём ли чужие/старые данные как новые, не появляется ли
   неожиданный permission/signing/send запрос.
2. Тексты не обещают ли участие за любую торговлю, личный шанс Monthly75%, точное
   расписание выплат, всегда бесплатный Claim или готовый live launch. Сохранены
   ли odds, расход билетов, multi-wallet edge, комиссии, custody и indexer trust.
3. Совместимость с wallet API: stale/unavailable отличаются от нуля; reward amounts
   не форматируются без проверенного asset profile.

## Проверки и пределы

30.09, рабочее дерево пакета до коммита, после финальной редакции текста:

```powershell
$env:SITE_TEST_PATH='/concepts/hk/'
node --test web/site.test.cjs web/wallet.test.cjs
# 15/15 passed
Remove-Item Env:SITE_TEST_PATH
npm run test:site
# 3/3 passed для исходного варианта
```

Также: 9 раскрытых FAQ и anchors на1440/768/390/320 без overflow; mobile wallet menu
и desktop/mobile просмотрены; git diff --check passed. Проверки адресные, wallet/API
synthetic. Реальные несколько расширений, WalletConnect QR, live signing,
full/backend suite не заявлены. Commit/push сам по себе не требует повторных тестов.

Локально npm run site → http://127.0.0.1:4173/concepts/hk/.
Тестовый HTTPS `/concepts/hk/` пока на старом `hk-copy-20260929`: тексты и wallet-логика
30.09 туда ещё не выложены. Не используй preview как доказательство текущего HEAD.
Исходный `/` и releases сохранены. `images_for_site/` оставлена локально, рабочие
картинки уже в `web/assets/`. SSH ключи/логи/временные материалы не входят в пакет.

## Ответ и следующий шаг

Обнови [GPT_REVIEW_RESPONSE](GPT_REVIEW_RESPONSE.md), указав проверенный HEAD.
Старый ответ про `93bd488` не является ревью текущего фронта. Для дефекта укажи
файл/место, обычный воспроизводимый сценарий, последствия и минимальную правку.
Если blockers нет — скажи прямо. Не требуй full suite только ради передачи пакета.

Следующий предлагаемый ограниченный пакет: **общий read-only draw/reserve API и
подключение Short/Monthly карточек и истории результатов**. Нужны наблюдаемые
бюджеты/состояния/причины ожидания, “не раньше” вместо обещанного таймера,
win/rollover и ссылки на подтверждения. Asset profile, Claim/buy routes и публичное
исполнение — отдельные открытые границы. Оцени порядок по текущему коду;
реализацию следующего этапа в рамках ревью не начинай.
