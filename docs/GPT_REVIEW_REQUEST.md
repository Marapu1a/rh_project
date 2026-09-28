# Review: публичные controllers, launch plan и RPC/fork границы

28.09.2026. Начни с CURRENT_CONTEXT, ROADMAP и PUBLIC_CONTROLLERS. Код изменён, но публичных
транзакций не было. Пользователь одобрил ограниченный пакет public wrappers/config/RPC/доступный fork.

## Архитектура

Прежние Local controllers выделены в abstract ShortControllerBase/MonthlyControllerBase.
Local wrappers сохраняют31337 guard/ABI/поведение; public Robinhood wrappers допускают4663,
проверяют drand PROFILE/CHAIN_HASH/fee0/consumer bindings, требуют cached cutoff для begin/empty.
Monthly interval строго30days; Short6hours. Public Short minimumUnit передаётся явно в constructor,
local сохраняет1 raw. Реальные prize settings этим не утверждали. Base общие, чтобы не копировать
и не расходить исполнение выплат между local/public. Никаких proxy, emergency admin или reset.

Constructor drand binding НЕ доказывает правильность bytecode. Его runtime pins проверяет
read-only deployment admission; public branch дополнительно проверяет generation profiles и
FINALIZED_CHECKPOINT. Даже полное совпадение оставляет publicExecutionNotImplemented:
существующий worker ещё local-only. Не называй совпавший профиль разрешением запуска.

Runtime public Short22738 / Monthly17943 bytes; local22540 /17745. Build evidence с обычным
solc0.8.37/optimizer200/Cancun, без viaIR/source overrides. Конструкторные immutable требуют
реальных deployment runtime pins; template hashes не подставляются вместо них.

## Параметры

config/robinhood-launch-plan.json явно incomplete-not-executable. Известны4663/Infinity300bps,
USDG6/entry100/Next100/6h/30days. Адрес нашего токена/пула/contracts/roles пока null.
Timing1800 остаётся кандидатом. Creator allocation, odds/weights/minUnit/budget, notice,
gas caps, archiveRPC, runtime/refill перечислены unresolved. scripts/public-launch-plan.cjs
только печатает missing, не умеет отправлять и не может выдать executable=true.

## Реальная сеть и fork

public-rpc-check читает historical code/call/storage на явных block heights без fallback.
Official endpoint не дал historical state даже для sampled finalized. Blockreq отдал finalized
и finalized−10000, но rejected finalized−864000 с лимитом32768blocks. Нужен archive provider.
Проверялся существующий USDG, не storage будущих наших contracts. Это не SLA.

public-controller-fork: read-only upstream proxy → in-process4663 Hardhat → deploy точных
public bytecodes/drand/vault → read actual USDG → checkpoint обоих → age>256. Partial complete.
ArbSys явно заменён локальным shim, потому что EDR не Nitro. Project token синтетический.
Constructor clocks и Solidity sources не переписывались, timestamp override не делался.
Интервалы ещё не истекли, reserve0. Не выдаём это за full Short+Monthly+live drand/finality.

## Проверки

18 продуктовых адресных сценариев отдельными запусками +1 catalog check.
PUBLIC_CONTROLLERS содержит команды и границы. Local public-controller fixture использует
историческую genesis/test time и реальную сохранённую BLS подпись, synthetic participants.
Пройден settlement/claim обоих draw, empty, cached-cutoff requirement, constructor refusals,
public inspector, старые local permissions/reentrancy/unpaid claims и cutoff history.
Не full suite. Есть профиль public-controllers; он шире фактически выполненных команд.

## Что проверить

1. Не потерялись ли role/reentrancy/request/claim guards при выделении base? Посмотри diff,
   не только зелёные тесты. Public wrappers не просто local без одной строки guard.
2. Нет ли дыр в constructor binding/predicted consumer addresses и explicit minimumUnit?
3. Не завышаем ли доказательства native Nitro/finality и scope fork? Особенно ArbSys shim.
4. Верно ли отделены incomplete plan, deployment pins и право публичного executor на отправку?
5. Следующий пакет — public runtime/admission + archive/операционная конфигурация. Предложи
   ограниченный следующий шаг с сохранением shared unknown-send reconciliation, без массового
   удаления31337/loopback guards и без объявления timing1800 утверждённым.
