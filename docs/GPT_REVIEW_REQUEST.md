# Текущее обращение к GPT — Robinhood runtime

28.09.2026. После RPC qualification решили не блокировать перенос исполнителя выбором
провайдера: работаем с известными RPC требованиями, public broadcasts всё ещё закрыты.

Прочитай `docs/ROBINHOOD_RUNTIME.md`, затем код. Это ограниченный пакет сетевого
контекста/rehearsal, а не обещание public launch или полного automatic4663 e2e.

## Что сделано и почему

- runtime-network.cjs: AsyncLocalStorage с прежним local31337 default и явными
  robinhood-inspect / robinhood-rehearsal. Так funding, RNG и executors используют
  одну сеть на всём async пути; отдельного engine/journal не копировали.
- Прежние local CLI не расширены. Новые jobs/config/ops имеют robinhood schemas;
  snapshot/job commitment formats сохранены, chain проверяется на исполнении.
- Новый entrypoint требует pinned public-launch profile4663. Inspect не создаёт state
  и не отправляет; CLI использует VoidSigner без секретов. Rehearsal требует loopback,
  совпадающие chain/block/Hardhat instance для provider и scan RPC. Перед send ещё
  раз проверяется instance/network, tx имеет explicit4663.
- В rehearsal снимается только искусственный publicExecutionNotImplemented blocker;
  остальные checks и releaseBlockers остаются. Public inspector всегда false/blocked.
- Shared journal/gas/recovery logic не переписаны. RPC transport failure в admission
  получает retryableRpcRead и новый entrypoint ждёт; semantic mismatch блокирует.
- Main state identity Robinhood хранит origin+endpointHash вместо полного RPC URL.

## Что доказано

59 различных адресных продуктовых cases прошли отдельными запусками +1catalog.
45 соседних заняли219.6s; полного suite не было. Контракты не менялись, использовалась
проверенная compilation artifact. Точные команды/пределы — в модуле.

На Hardhat4663 с настоящими Robinhood wrappers и real drand verifier проверены funding,
gas/native waits, transient RPC, known receipt reconciliation и unknown-hash stop-all.
Оба заранее frozen draw получили seed через worker prove/deliver; после terminal
событий worker обнаружил rewards, выплатил, повторный запуск ничего не отправил.

В последнем кейсе datasets/begin/publish/seal/process/finish созданы тестом вручную.
Синтетические USDG/source/participants, исторический clock, ArbSys shim. Это не public
BUY/replay proof и не новое полное automatic4663 прохождение. Общие scheduler и оба
executor проверены соседними31337 сценариями. Public sends/fork не запускались.

## Что посмотреть независимо

1. Нет ли утечки network context в local default или обхода public no-send штатным CLI?
2. Не меняет ли разделение схем/chain checks существующие durable journals/recovery?
3. Достаточны ли same-node checks для явно локальной rehearsal, без заявлений о защите
   от злонамеренного RPC или изменённого JS? Никакой public key CLI не загружает.
4. Startup admission нового входа сейчас строгий: любой профиль/граф mismatch останавливает
   весь pass, включая claims. On-chain claim остаётся permissionless. Перед activation
   надо решить recovery/drain при внешнем source drift без ослабления защиты новых draw.
   Нужен ли следующий узкий пакет именно здесь или сначала qualification конфигурации?
5. Какие оставшиеся реальные release blockers важнее следующими: archive RPC/pins,
   key custody, operational fee allocation/refill, автоматический4663 e2e? Не предлагай
   ещё один общий audit/новые абстракции без конкретного результата.

Ответы — рекомендации, не разрешение параметров/публичного запуска. Тесты адресные;
не повторять уже успешные прогоны без причины.
