# Review: закрытие cutoff/finality через историю подлинных hashes

28.09.2026. Прочти CURRENT_CONTEXT, ROADMAP, CUTOFF_HISTORY и изменённый код.
Предыдущие замечания приняты, но provisional begin сознательно не реализован:
его Ready/permissionless seal и empty closure усложняли решение без необходимости.

## Что сделали и почему

CutoffHistory наследуется обоими settlement cores. Permissionless checkpointCutoff(number)
сохраняет hash, прочитанный через ChainBlocks/ArbSys в окне256. Caller не передаёт hash.
Mapping immutable, повтор идемпотентен, нет active slot/резервов/owner/внешнего oracle.
Begin и closeEmpty принимают recent либо cached authentic hash; прочие ограничения сохранены.
Это hash history, НЕ финальность и НЕ разрешение на freeze.

FINALIZED_CHECKPOINT в scheduler требует admitted BUY policy. Сначала finalized replay
проверяет наличие работы, чтобы не жечь газ на пустом проекте. Потом durable candidate
head−1 → checkpoint tx → ожидание finalized cutoff И checkpoint storage → replay под
точный cutoff → save job → прежний независимый pre-begin replay → begin/publish/seal.
Задержка cutoffDelayBlocks относится к begin и не мешает быстрой записи свежего hash.

Так full scan больше не обязан укладываться в256blocks; не нужно держать последний chunk
или создавать provisional proposals, которые придётся исправлять через supersede.
Пустые draining epochs используют тот же cached hash. Reorg/expiry до job дают явный
record discard; начатый/frozen job не перезапускается. Epoch boundary drift до job проверяется.
Cache mapping не выбирает worker cutoff: чужие записи не меняют сохранённый кандидат.

Shared executor поддерживает checkpointCutoff на двух targets с явным gas bound,
существующими admission/native checks и intent/hash/receipt journal. Unknown send
блокирует signer даже при видимой on-chain записи. Local-only guards оставлены.

## Проверки и границы

24 продуктовых сценария отдельными адресными запусками +1 catalog check прошли.
Команды и тестовые допущения в CUTOFF_HISTORY. Новые тесты включены в full и профиль
cutoff-history. Обычная сборка одна, SHA-проверенное reuse. Не full, не live/fork.
Два тестовых assert были исправлены: reorg fixture сначала оставлял cutoff живым;
empty path вообще не создаёт journal — это правильное отсутствие записи.
LocalShort22540 bytes, LocalMonthly17745 bytes, лимит24576. Public wrappers ещё не готовы.

Финальность остаётся операционным доверием к publisher/worker/RPC. Permissionless seal
после Ready не стал защищён от обхода worker timing/gas preflight. Новый путь не создаёт
Ready до finalized admission при честном worker. Не обещаем защиты от глубокого reorg.
Новый bytecode означает новый deployment/pins; proxy и миграций старых призов нет.

## Что проверить независимо

1. Есть ли способ записать чужой/неподлинный hash или использовать cache в обход
   epoch/last-terminal/schedule правил? Проверь Nitro и обычную EVM ветви.
2. Не пропущен ли путь закрытия empty/draining или зависания candidate после restart/reorg?
3. Не обходит ли checkpoint shared unknown-send/gas boundary, особенно Monthly target?
4. Достаточно ли явно сохранено доверие к publisher, без ложного обещания on-chain finality?
5. Следующий пакет — public controller/profile/timing. Какие конкретные препятствия остались
   после устранения гонки на256blocks? Не предлагай просто удалить local guard.

Не утверждай production timing1800s по короткой выборке. Призовую математику не меняли.
