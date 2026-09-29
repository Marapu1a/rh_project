# Review: read-only wallet API и policy/cache reorg

29.09.2026. Review b2d4368 учтён. Только статический review, тесты не запускать.
[Описание API и проверки](USER_STATUS_API.md).

Закрыт сценарий policy publication+накопленный cache+reorg+сохранённый unstarted job:
policy исчезает из ветки, индексер откатывает хвост, scheduler отвергает старый job
как Stored job BUY policy mismatch. Нет send/изменения artifact. Это не auto-reset
спорной финализированной истории. Публичные sends не открывались.

user-status-api.cjs: localhost GET /v1/wallets/:address, ограниченная pagination,
исходные blocks→replayAttempts, баланс open/frozen/consumed отдельно Short/Monthly,
carry и доказуемые payer-attributed decoder decisions. Отсутствие покупки в этом
списке не объявляется проверенным отказом; pending receipt lookup не реализован.
Checksum/config/admitted/replay обязательны; stale показывает прошлые значения,
unavailable503 с null. provenance включает высоту/hash/manifestHash/время данных.
index.observedAt теперь отдельно от status.updatedAt: failure не освежает snapshot.
Нет RPC/ключей/записи в API, no-store, loopback. JSON/replay всё ещё линейные.

8 различных адресных сценариев passed; первый reorg fixture использовал ускоренный
hardhat_mine и дал non-contiguous branch, последовательный evm_mine исправил тест.
Это local31337/mock, не actual Infinity/live/fork. Никакого полного прогона не делали.

Проверь смысл статусов и freshness, отсутствие неверных нулей/ложного rejection,
границы API и возможные утечки служебных данных. Призы/выплаты ещё не входят: дальше
нужны проверяемые on-chain источники для назначенного и реально выплаченного приза.
Не усложнять prize math и не объявлять localhost service публичной готовностью.
