# Review: read-only BUY policy admission prototype

24.09.2026. По указанию пользователя сохраняем прозрачность условий и гибкость,
не добавляем скрытые полномочия. Реализован scripts/buy-policy-admission.cjs.
Подробно: BUY_POLICY_ADMISSION.md. Контракт публикации НЕ реализован, trust source
и publisher НЕ назначены production ролями. Исторический pure replay не менялся.

Loader получает pinned trust root и genesis, читает finalized RPC события с полным
canonical manifest, проверяет источник/runtime, прямого publisher, receipt/header,
instance/previousHash/nextHash, notice и append-only constraints. Сам собирает
history; caller не передаёт announcedAtBlock. Старые snapshots сохраняются.
18/18 test:direct-buy; admission scenarios используют synthetic RPC. Нет live/fork/full.

Проверьте correctness/bypass/ложные отказы. Особенно: finalized checkpoint и reorg,
полнота источника, границы доверия к RPC, source runtime vs фактические полномочия,
отсутствующий notice, availability полного manifest в событии. Hash кода и finalized
от RPC не выдаются за независимое доказательство. Source proxy автоматически не
одобряем. Builders/CLI/coordinator не подключены; pure JSON остаётся тестовым входом.

Следующий ограниченный шаг: определить минимальный реальный источник публикации
без скрытого расширения прав, связывание instance/genesis и finality. Предложите
простую модель authority и оговорки для пользователя; не утверждайте параметры
notice или production readiness по mock-тестам. Deactivation отдельно.
