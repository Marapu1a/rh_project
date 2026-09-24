# Review: завершённая цепочка BUY policy, не очередной mock loader

24.09.2026. По требованию владельца довели цепочку до контрактной публикации и
scheduler. Сначала читать BUY_POLICY_ADMISSION.md и diff текущего пакета.

Реализация:
- BuyPolicySource: immutable instance/genesis/publisher/notice, no proxy/setters/custody.
  hash(bytes), previousHash/currentHash, future activation, count/lastFrom; ChainBlocks.
- prepareBuyPolicy: admission, semantic validation, exact-byte eth_call и estimate.
  publish сохраняет intent/nonce до send и hash после; без автоматического retry.
  CLI готовит calldata; локальный send 31337 с exclusive durable journal.
- admission сверяет state count/hash/lastFrom и immutable bindings, ловит последний
  пропущенный лог. Авторизация через source.msg.sender; contract wallet поддержан,
  outer tx.from больше не считается publisher.
- runtime resolver/CLI читают history из source. Builders явно берут cutoff domain.
  Scheduler держит постоянные genesis+trust и проверяет policy saved jobs; coordinator
  вызывает этот scheduler. Live execution state отделён от finalized dataset cutoff.

Проверки: targeted 5 файлов 59/59 (208.6 s, compile once). После финальных изменений
3/3 затронутых сценария: admission, prepare CLI + два scheduler cycles, Monthly CLI.
EVM source/реальная транзакция публикации/transfer/settlement, старая и новая policy;
сохранение frozen, отказ persisted forgery, задержка finalized. Venue/RNG остаются
прежними test fixtures. Добавлен только test contract wallet, это не доказательство
работы конкретного Safe. 109562 gas для 1371 bytes на chain31337. Full/fork не запускали.

Существенные границы, не скрывать:
1. Авторизованный обход preflight с семантически неверным JSON всё ещё может
   заблокировать admission. Контракт проверяет bytes hash, не весь parser/route.
   Нельзя назвать риск устранённым только из-за dry-run. Нет skip/reset/cancel.
2. Production publisher/address/notice/finality не утверждены. Trust root нельзя
   менять в живом config/state молча. Нового публичного deployment нет.
3. Native local guards остаются. LocalBuyFixture расширен новой формой только для
   интеграционного теста. v2 допускает routerProfile=local-fixture исключительно на
   chain31337 с привязкой к фактическому hash; публичный router hash остаётся pinned.
4. Подключение нового trust в старую конфигурацию с jobs не мигрируется автоматически;
   при заранее закреплённом trust новые версии не меняют identity.
5. При проблеме source admission scheduler безопасно останавливается; это остаётся
   риском доступности, а не обходом проверки для frozen jobs.

Проверьте особенно публикацию/unknown-send, finality lag vs live jobs, полноту истории,
CLI trust bypass, старые cutoff при новом head, consumers и источник полномочий.
Нужен независимый verdict по release blockers, не просто ещё один маленький helper.
Если риск ошибочного авторизованного manifest надо закрыть до релиза, предложите
целостное решение без ретроактивного изменения BUY/frozen и скрытой смены источника.
