# GPT: review typed BUY policy и границы расширяемости

24.09.2026. Реализован следующий пакет после d512733. Сначала читайте
BUY_POLICY_ADMISSION.md и diff относительно d512733. Не перечитывайте весь архив.
Ответ перезапишите в GPT_REVIEW_RESPONSE.md; самостоятельно код не меняйте.

## Решение владельца

Не пытаться охватить все маршруты и гарантировать решение любой ошибки.
Расширять подтверждённые покупки, неоднозначные не засчитывать; объяснять границы.
Новый способ доказать прежнюю покупку — расширение; новое правило оценки,
бенефициара или основания начисления — отдельное поколение/продуктовое решение.
Без отдельного candidate registry: подготовленный adapter release → future announcement.

## Что реализовано

- Новый BuyPolicySource ABI: announce(previousHash, adapterId, fromBlock).
  Нет JSON и caller-supplied nextHash. Цепочка keccak256(abi.encode(previous,
  uint256(1),adapterId,fromBlock)); count/lastFrom дополняют completeness.
- Constructor закрепляет initialAdapters hash, отмечает ids использованными.
  Нулевые/повторные ids, early/stale transition и unsafe JS block отклоняются.
  Publisher/notice immutable, ChainBlocks сохранён. Нет custody/proxy/reset.
- Format module восстанавливает manifest из genesis и известного version id.
  Commitment chain теперь НЕ manifestHash; prepare отдаёт оба отдельно.
- Loader проверяет полный finalized источник; неизвестный будущий id возвращает
  pendingAdapters. С активации старый decoder останавливает новые datasets.
  Старые cutoffs остаются доступными даже после новой активации.
- Scheduler сначала проверяет saved jobs по их cutoff, затем загружает policy
  для новых datasets. Отдельный интеграционный тест завершает frozen Short/Monthly
  после активации неизвестного id, но запрещает следующий новый dataset.
- Публичный config и v2 без buyPolicy по умолчанию отклоняются. Read-only research
  допускает явный buyPolicyMode=unadmitted; RPC CLI/verifiers показывают policyStatus
  отдельно от hashed artifact. Legacy v1 chain31337 fixture остаётся unadmitted.
- Математика, новые BUY routes, реальный RNG/venue и UI не менялись.

## Чего не обещаем

Это extensible wire protocol, не on-chain доказательство правильности decoder.
Adapter id = keccak(version name), НЕ digest executable JS. Id надо сохранять
семантически неизменным; source не скачивает/не выполняет код. Новый reviewed
release расширяет локальный каталог/decoder. Другой router не начинает работать
автоматически: runtime/settlement support ещё надо реализовать.

Авторизованный прямой вызов может объявить неизвестный или ошибочный id, минуя
prepare. С активации потребуется совместимый корректный индексер; new datasets
могут остановиться. Нельзя честно написать «весь риск остановки устранён»:
убрали arbitrary JSON/schema payload, сохранили явное доверие к выпуску publisher.
Отмены/skip/reroll нет; не предлагайте тайно добавить их для удобства.

JSON source ABI несовместим; это новый deployment, старого публичного у нас нет.
Production instance trust root всё ещё должен закрепляться deployment-политикой;
research config с явным unadmitted не является проверенным публичным instance.
Самосогласованный persisted artifact по-прежнему не проверяет участников:
независимый replay перед первым begin — следующий отдельный релизный gate.

## Проверьте

1. Осталась ли возможность malformed typed event/transition заблокировать прошлый
   cutoff, помимо явно описанного RPC/source trust failure?
2. Полноту chain/count/genesis ids и разделение announcement hash/manifest hash.
3. Unknown future vs activated adapter, отсутствие молчаливого неполного replay.
4. Завершение frozen без принятия новой policy и без ослабления job binding.
5. Trust removal/explicit unadmitted и правдивость CLI provenance.
6. Не обещает ли документация больше, чем реализовано? Особенно executable pinning
   и поддержка новых router/assets внутри текущей схемы.
7. Подтвердите разумность следующего пакета: independent replay persisted job
   перед первым begin. Не смешивать с добавлением целой семьи маршрутов.

Адресные проверки и их точные ограничения записаны в BUY_POLICY_ADMISSION.md.
Full suite, live/fork sends для этого пакета не требовались и не запускались.
