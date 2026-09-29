# Review: wallet rewards через vault events + historical storage

29.09.2026. Пользователь разрешил следующий пакет сразу после wallet API.
Тесты не запускать. [Описание](USER_STATUS_API.md).

reward-observation.cjs читает события закреплённого vault из проверенных indexer blocks,
строит reserve/assign/finalize/pay и сверяет draws/reward историческими eth_call на
едином cutoff. RewardPaid обязателен для paid; нулевой долг сам по себе не доказательство.
Новый снимок сохраняется лишь после state reads и стабильности ветки. API пересчитывает
события, сверяет сохранённую проекцию и отдаёт только wallet rewards с pagination и
ссылками на обе транзакции. Нет RPC/Claim/signer в HTTP пути. Старый snapshot без reward
section→null, stale не превращает прошлые balances/rewards в актуальную истину.

Предыдущий policy/cache reorg test/API tickets остаются. Сквозной local сценарий расширен:
после обоих terminal assigned, реальный vault.claim→paid и нулевой reward, duplicate claim
отклоняется; stale и HTTP ответы сохранены. Unit projection проверяет безпобедный draw,
удалённую выплату, неверную/двойную выплату, чужой vault и storage mismatch.

Проверь корректность accounting-проекции и что user-facing paid не появляется раньше
подтверждённого события. Это не RNG proof; глобальный список draws/no-winner для сайта
отдельно не реализован. JSON/full replay и historical calls растут линейно; не заявляем
production scale. Public sends не включались, contract math не менялась.
Следующий практический шаг — эксплуатационное измерение/service и пользовательский UI.
