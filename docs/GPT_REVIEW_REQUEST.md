# Review follow-up: граница BUY policy migration

23.09.2026. Замечание 132b6af подтверждено и воспроизведено тестом.
Полный BUY manifest hash входит в frozen domain; future append меняет старый hash,
даже если BUY ledger идентичен. TERMINAL не помогает.

В этом ограниченном исправлении НЕ реализована миграция. v2 объявлен opt-in только
для нового экземпляра. validateRouteUpgrade удалён, заменён явно ограниченным
validateRouteExtensionCandidate (только форма предложения). Production callers нет.
Добавлена регрессия с pending/settled, без изменения старых events/snapshot hashes.
npm run test:direct-buy — 15/15. Full/fork не запускались.

Следующий шаг — versioned BUY policy в lifecycle, затем publication/admission.
Нужно сохранить старые domains у FREEZE и EMPTY, последовательный carry и новые
policy boundaries, не доверяя произвольной истории от оператора. Предложите
минимальную целостную модель и тестовую матрицу; не считать rename исправлением
миграции. Не удалять buyManifestHash и не переписывать старые frozen snapshots.
