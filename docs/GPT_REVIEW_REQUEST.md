# Обращение к GPT — deployment admission и timing boundary

28.09.2026. Следующий одобренный пакет после handoff: единый проверяемый профиль deployment
и времени, без выдачи локального стенда за публичный выпуск. Прежний ROADMAP архивирован,
текущий содержит короткий список релизных блокеров; актуальные инструкции не искать в архиве.

## Что сделали

`scripts/deployment-admission.cjs`: createDeploymentProfile, validateDeploymentProfile,
inspectDeployment. Offline профиль связан configHash с funding/delivery/scheduler; pins
девяти компонентов, ожидаемый executor, USDG decimals, явные immutable timing значения.
Проверка читает code/bindings/roles/instances/campaign/anchors на одном latest blockTag,
затем перепроверяет его hash. Read error, отсутствующий код, несовпадение → blocked.

CLI `inspect-deployment.cjs`: export из CONFIG + явного SETTINGS (без RPC), inspect только
read-only RPC. Никаких signer/отправок/deployment. Pins из конфигурации — операторское
утверждение, не криптографическое доказательство честности выбранного кода.

Профиль в CONFIG закрепляется runtime identity. Общий worker проверяет его до новых jobs,
begin/beginMonth и seal/sealMonth. Freshness drand проверяется ещё раз непосредственно перед
commit intent/send после gas estimate и остальных RPC-чтений. Старые delivery/settlement/
claims не блокируются новым profile gate. Handoff не позволяет убрать подключённый профиль
и проверяет successor до перехода.

Legacy configs без профиля сохранены ТОЛЬКО для прежнего local31337 пути; это не обход
публичного допуска. Scope public-launch всегда blocked/publicExecutionNotImplemented,
даже если все pins совпали. Публичные controller/executor ещё не реализованы. Никаких
approved=true или скрытого продвижения test timing в release policy не добавляли.

## Чего этот пакет не доказывает

Production lead/clock/finality/beacon limits не выбраны: для них нужны реальные наблюдения
и отдельное явное решение. Short21600s и Monthly2592000s — продуктовые интервалы существующего
кода; тестовые drand tuple не объявлены production. Наблюдение finalized всё ещё зависит
от RPC, freshness от часов сервера; on-chain финальности и будущего SLA не обещаем.

Mutable внешняя политика PAIR проверяется денежным worker/collector; admission не делает
её неизменяемой. Frozen USDG не тратим на газ. Контракты, призовая математика и RNG не менялись.

## Проверки и вопросы

[Модуль и результаты](DEPLOYMENT_ADMISSION.md). Адресные local tests: matching pins/timing,
public blocked, mismatch/read outage/missing code/reorg, запрет новых jobs, сохранение старого
claim, late timing wait/resume Short, Monthly freeze, handoff/profile retention, offline
export без overwrite. Historical fixture с mocked operational clock где нужно; не full/live fork.

1. Есть ли ложный положительный matched при подмене bindings, code, timing или snapshot?
2. Есть ли нежелательная блокировка старого долга или frozen draw из-за нового profile gate?
3. Достаточно ли отделён local legacy path от невозможного пока public-launch?
4. Следующий ограниченный пакет логично посвятить публичному поколению controllers/network
   admission и обоснованию timing, затем refill. Видите более срочный подтверждённый дефект?

Не считать одно наблюдение сети доказательством worst-case финальности. При lock-сбоях
сохраните trace исходного падения: последняя наша локальная проверка сбой не воспроизвела.
Ответ — в GPT_REVIEW_RESPONSE.md.
