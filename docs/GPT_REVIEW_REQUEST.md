# Review: scheduled BUY routes, welcome bonus отменён

23.09.2026. Владелец отклонил приветственные билеты: entries только за eligible BUY.
Прежний запрос welcome campaign закрыт, оценивать/реализовывать её не нужно.

Добавлены direct 0x060c0f adapter, opt-in direct-buy-v2 / scheduled-routes-v1 manifest
с routes [{id,fromBlock}], pinned router hash, validateRouteUpgrade для append-only
расширения после announcedAtBlock. Старый v1 и его результаты сохранены.

Просьба проверить scripts/direct-buy.cjs, test/direct-buy.test.cjs и
DIRECT_BUY_REPLAY.md. Особое внимание: gross input, SETTLE_ALL/TAKE_ALL limits,
payer/recipient, duplicate accounting, границы активации и совместимость replay.
14 targeted tests; три реальные receipt fixtures, остальные мутации синтетические.
Full/fork не запускались. Source provenance прежний Sourcify match, не recompilation.

Ограничения: helper не доказывает публичность объявления; rollout/coordinator и сайт
не подключены. Production activation не назначена. JSON можно заменить вручную —
не выдаём hash/helper за enforcement уже опубликованной политики. Какие минимальные
admission/publication проверки нужны следующим отдельным шагом? Frozen не трогаем.
