# Pons: подготовка боевого deployment

Статус03.10.2026: подготовка, не executable manifest и не разрешение отправок.
Основа:18eee32 и [release-репетиция](PONS_RELEASE_REHEARSAL_2026-10-03.md).

## Принятые данные — не спрашивать повторно

Источник: [launch plan](../config/robinhood-launch-plan.json) и решения пользователя.

| Назначение | Значение |
|---|---|
| Сеть / venue | Robinhood Chain4663 / Pons V2 |
| Имя / ticker | QIANQI / QIANQI |
| Creator, governor, получатель5% команды | 0x098afA6731239a00CE0aff669aaefD16b7C72114 |
| Creator fee / распределение | 3%; фактически полученное90/5/5 |
| Первоначальная покупка | Отдельно после допуска индексатора; максимум101 USDG, gas отдельно |
| Автоматика | Отдельный кошелёк; основной MetaMask не переносится на сервер |
| RPC | Локальный .local/rpc-url.txt; секрет не копировать в git/документацию |
| Сервер | Timeweb Amsterdam201.51.22.244; публичные financial services выключены |

Developer buy внутри launch остаётся выключен. Стартовая покупка не совмещается
с созданием токена. Существующие адреса/хеши в тестовых fixtures не являются
адресами будущего deployment.

## Custody: решение получено03.10

Отдельный executor [создан, восстановление вне сервера проверено](PONS_EXECUTOR_CUSTODY.md).
Перенос пароля в личный менеджер и дополнительная копия на независимый носитель
остаются действием пользователя. Seed/private key/пароль в чат не запрашивать.

Согласованная схема: основной MetaMask сохраняет governor и publisher BUY policy;
серверный executor выполняет рутинные транзакции без owner-полномочий.
Publisher в BuyPolicySource immutable: адрес нужно выбрать до deployment.
Не считать legacy-имя поля publisherExecutor доказательством, что publisher и
executor обязаны быть одним адресом. Public profile имеет отдельный publisher.
Получателя5% operations надо явно зафиксировать; USDG на нём не превращается
автоматически в ETH для газа. Пополнение газа сначала ручное по сигналу/оценке
ближайшей транзакции, без фиксированного требования0.6 ETH.
Пользователь утвердил схему: governor/publisher/operations/team — личный кошелёк,
executor — отдельный. Operations USDG пополняют gas вручную по необходимости.

## Что готовит разработчик

1. Квалификация LocalPonsCollector для deployment: состав исходников/artifact,
   immutable ссылки, escrow/venue/proxy trust boundaries. Не снимать пометку
   прототипа по одному успешному fork-прогону.
2. Точный deployment plan: bytecode/constructor args, зависимости адресов,
   ожидаемые runtime hashes и подписи конкретных транзакций. Для prediction
   нужны реальный sender/nonce или доказанный deterministic factory;
   между расчётом и подписью повторно сверять nonce. Не заполнять null случайными адресами.
3. Обновить Pons facts чтением RPC перед финальной симуляцией: factory/escrow,
   router/manager/Permit2, quote и mutable launch settings. Исторические pins
   и тестовая fixture не заменяют текущую проверку.
4. Подготовить metadata из существующих logo/preview; закрепить URI/hash.
5. Timing/notice/gas: предложить значения с измерениями finality и оценкой газа;
   тестовые backdated clocks, local ArbSys и lead60s не переносить. Текущий
   timingCandidate тоже не является автоматически утверждённым.
6. Из одних manifest/config/profile вывести indexer/operator/API/site config,
   затем выполнить read-only inspector на развёрнутых адресах. Отдельно
   квалифицировать серверные службы, custody/backup и уведомления.

## Порядок будущих транзакций и включения

Проверенный fork-путь сначала предсказывает адрес collector и адрес Pons token,
создаёт collector с TOKEN/USDG/escrow, затем вызывает Pons launch с collector
как creatorFeeRecipient. Обычная форма с личным адресом получателя не эквивалентна
этой схеме. Сам collector launch не выполняет; его адрес подставляется в params.

Далее — deployment и binding vault/controllers/adapter/registry/policy в порядке
точного плана, bindPromo/bindVenue и кампания90/5/5; зависимости циклических адресов
разрешаются в симуляции до подписания. Это описание связей, не готовый скрипт отправки.
После подтверждения адресов/receipts/hash: admission, indexer с правильным anchor,
API и site, затем разрешение новых задач operator. Первоначальная покупка101 USDG
идёт после этого через подтверждённый маршрут с minOut/deadline и свежей оценкой.
Запуск токена может сразу открыть торговлю: промежуток до готовности promo нельзя
выдавать на сайте за уже работающий автоматический розыгрыш. Правило допуска и
начальный блок должны быть опубликованы явно; история покупок не теряется из-за
позднего старта процесса, но допуск должен быть определён заранее.

Публичные отправки остаются отдельным шагом после review конкретного пакета.

## Проверка этого подготовительного пакета

03.10.2026: inspectPlan(config/robinhood-launch-plan.json) — conflicts0,
publicLaunchReady=false. Локальный вывод: .local/logs/pons-deployment-inputs.json.
Это проверка принятых параметров/пропусков, не RPC, deployment или аудит контрактов.
Код исполнения, ключи и сервер не менялись. Docs-only: ссылки и diff.
