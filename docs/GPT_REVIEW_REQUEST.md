# Review: versioned BUY policy в pure replay

24.09.2026. Исправляем конфликт hash manifest и исторических snapshots из 132b6af.
Добавлен buy-policy-history-v1 с полными manifests и activation/notice block+hash.
BUY выбирает manifest по блоку сделки; одна регистрация/carry ledger на всю историю.
FREEZE и EMPTY выбирают snapshot domain по cutoff, TERMINAL сохраняет ссылку на FREEZE.
Старый manifest API и snapshots не мигрируются вручную.

Проверьте scripts/direct-buy.cjs, scripts/attempt-lifecycle.cjs и новые тесты в
 test/direct-buy.test.cjs, test/monthly-replay.test.cjs. Документ DIRECT_BUY_REPLAY.md.
39/39 targeted (эти два файла + attempt-lifecycle.test.cjs); full/fork не запускались.
Переходы синтетические поверх старого fork evidence, не production execution.

Особое внимание: activation inclusive, notice canonical anchor, запрет исторических
изменений, непрерывный carry, pending/settled old draws, FREEZE после обновления
со старым cutoff, EMPTY domains, head domain vs draw domain. Не удаляли hash из domain.

Граница: запись notice block/hash не доказывает публикацию или авторизацию. Input
пока локальный; production admission, policy loader, builders/CLI/coordinator ещё
не подключены. Следующий отдельный шаг — публично проверяемая policy admission,
затем интеграция потребителей. Deactivation route пока не реализована.
Просьба проверить локальную модель и подсказать минимальный следующий пакет,
не выдавая этот replay за готовую production миграцию.
