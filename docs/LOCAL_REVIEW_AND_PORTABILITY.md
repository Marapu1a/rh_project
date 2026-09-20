# Самопроверка и переносимость

20.09.2026, код 571c068. Ограниченный review, не полный аудит безопасности.
Проверены coordinator/receipt/state/CLI, readiness контроллеров, точки привязки
FeeRouter/BUY/ChainBlocks/сборки и текущая документация. Контракты и runtime не менялись.
Внешние факты о сетях/PAIR заново не проверялись: ниже выводы из репозитория.

## Что сохраняем

- Разделённые Short/Monthly и единый vault: free/reserved/claimable не смешиваются.
- Успешный rollover остаётся атомарной границей campaign; старые credits не исчезают.
- Локальные worker, конвертер и coordinator действительно соединены. Это больше,
  чем отдельные модели, но реальные DEX/RNG и эксплуатационное финансирование отсутствуют.
- Unknown send не получает автоматического retry. Pending marker блокирует оба контура
  после обычного restart, когда state/lock доступны. Confirmed receipt позволяет продолжить.
- Domain commitments включают chainId и адрес экземпляра; новый deployment не должен
  переиспользовать старые commitments/jobs/state.

## Важные открытые места

### 1. Readiness не финансирует завершение draw — следующий функциональный шаг

`LocalShortController.executionReady` и Monthly проверяют баланс КОНТРОЛЛЕРА на RNG fee
и nativeFloor, readiness provider и gasprice. Это не баланс publisher/executor и не бюджет
на оставшиеся publish/process/finish. Workers ограничивают цену отдельной tx, но не
резервируют весь эксплуатационный расход. После freeze средств исполнителю может не хватить.

Нужно считать отдельно деньги на RNG, gas signers и уже начатые обязательства.
Не допускать новый freeze без запаса по принятой модели; высокая цена откладывает
исполнение, а не обнуляет draw. Начатые draws приоритетнее новых и необязательного collect.
Автообмен проектных средств в native и реальные fee-оценки — последующая интеграция.
Абсолютной гарантии при произвольной цене газа/отказе RPC такая модель не даёт.

Назначение награды и её получение — разные операции: `PromoVault.claim` переводит
USDG победителю, но coordinator его не вызывает. Claim может отправить любой адрес,
gas платит отправитель. Автоматический спонсируемый claim для всех победителей сейчас
не реализован; его стоимость нельзя молча включать или исключать из обещанного UX.

### 2. Config/state пока слишком тесно связаны

`local-promo-coordinator.cjs` хеширует весь prize job и scheduler config, включая
pollSeconds/maxGasPrice. Даже без pending изменение такого поля даёт config mismatch.
Это защищает от случайной подмены, но затрудняет штатную настройку эксплуатации.

Перед изменяемыми ops-настройками разделить:
- identity: chain/deployment/assets/custody/source/instance, соответствие signer ролям;
- объявленные продуктовые правила и их версии;
- ограниченные operational settings: polling, receipt timeout, разрешённые fee caps.

Сейчас signers в config представлены множеством адресов, а не привязкой каждого к роли.
Это также следует учесть в явной identity-модели. Нельзя обходить pending новым state path
или сменой config. Какая настройка применялась к отправке, должна быть видна при recovery.
Это план, не уже существующий API.

### 3. Не всякий crash автоматически восстанавливается

Hashless broadcast и stale lock после SIGKILL требуют диагностики. Lock защищает один
state path, а не все процессы с тем же signer. Повреждение/утрата state, replacement,
reorg после снятия marker и RPC outage при reconciliation не закрыты production journal.
State writer использует rename/fsync файла, не обещает сохранность после потери диска.
Не добавлять force-clear или слепой restart вместо доказательства исхода tx.

Недостающие fault-проверки для отдельного hardening-пакета: аварийное завершение процесса
между отправкой и сохранением hash; ошибки записи в каждой фазе; original mined revert
именно через coordinator; receipt-read outage. Семь текущих интеграций не доказывают всё это.

### 4. Ограничения вне coordinator

Старый USDG-only recipient может получить TOKEN через публичный pay; worker лишь
диагностирует такой legacy debt. Новый converter-профиль это учитывает, старый не исправляет.
Полнота legacy списка доверена конфигурации. Fixed adapter/floor не доказывает рыночный
курс, ликвидность или защиту от MEV. Immutable adapter может навсегда остановить старый
TOKEN inventory: переносимость будущего deployment не является спасением старых средств.
RNG/finality и publisher/indexer trust остаются отдельными решениями до публичного запуска.

## Как сохранить переносимость

Цель — независимые развёртывания на совместимых EVM-сетях. Поддержка не-EVM здесь не
спроектирована. Перенос не означает bridge, общую межсетевую казну или замену правил
старого vault. Гибкость размещаем на границах интеграций и в новом deployment.

| Участок | Сейчас | Требование к следующему профилю |
|---|---|---|
| Призовой accounting/settlement | Raw units, заданные assets/controllers, отдельные резервы | Переиспользовать ядро и conservation/rounding тесты |
| Revenue | FeeRouter напрямую знает IPairNativeVault, epoch и position | Отдельная интеграция источника; сохранить atomic final collect/rollover, проверить семантику API |
| BUY | routeVersion rh-ur-10-060b0e-v1, конкретный decoder, 6 decimals и 100 USDG | Проверяемый decoder/manifest площадки; не считать любую Swap запись билетом |
| Номера/хеши блоков | ChainBlocks выбирает ArbSys для 4663/46630, иначе EVM opcodes | Явно проверенные block identities/cutoff/finality; другой Nitro не поддержан автоматически |
| Конвертация | Local-only fixed adapter и raw-unit floor | Venue-specific swap/price/liquidity policy, неизменное назначение призовых средств |
| Gas | type 2, zero priority fee, gasPrice, fee RNG и nativeFloor | Модель fee/нативного актива конкретной сети, включая дополнительные расходы при наличии |
| Build/RNG | evmVersion=cancun; Local contracts 31337; тестовый provider | Поддерживаемая EVM revision, лимиты размеров/gas, production RNG и future-round binding |

Минимальный deployment profile прежде всего документ/manifest, не новый универсальный
on-chain registry: chainId, instance и контракты; quote asset/decimals; source/BUY route;
block/finality model; native asset/fee model; RNG; swap adapter; compiler settings/code hashes.
Локальный профиль и production профиль явно различаются. Не снимать local-only guards
ради нового chainId и не добавлять mutable arbitrary-call adapter в prize custody.

Текущий продуктовый номинал — USDG. Название стейбла не должно определять raw-unit
арифметику; если будущая сеть требует другого prize asset, это отдельное явное решение
для нового deployment, а не молчаливая смена валюты уже существующих обязательств.

Первая проверка переносимости — второй локальный профиль с другими адресами, decimals
и fee/block допущениями плюс отказ для неподдерживаемой конфигурации. Затем fork/canary
выбранной реальной сети. Абстракции вводить на конкретном различии, не заранее на все сети.

## Проверки и вывод

В этом review повторный полный suite не запускался. Узкая повторная проверка
`node --test test/local-transaction.test.cjs`: **11/11**, fail 0 (~0.2 s), включая
estimate/broadcast/receipt ошибки, чужой receipt/replacement и abort. Это проверка
классификации, не полный coordinator crash test. Последний результат реализации:
старые 240/240 в общем прогоне 244/247; после исправления metadata новые 7/7 отдельно.
Новый подтверждённый путь потери призов или обхода pending в просмотренном коде не выявлен;
это не доказательство их отсутствия. Приоритет — ops funding/readiness с явной границей
network profile, затем recovery hardening и реальные внешние интеграции.
