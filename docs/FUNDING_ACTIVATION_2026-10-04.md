# Funding activation — 4 October 2026

User authorized starting work independent of the late-confirmation notice window. Executor received0.001ETH (latest chain state). Recognition publishing stays disabled; notice not-before05 October11:30UTC is unchanged.

Initial live public admission hit QuickNode JSON-RPC -32007 (50requests/second); no transaction sent. Added a120ms serialized request queue to the public entrypoint. Failed requests are propagated without retries, including ambiguous sends. Live paced read-only admission matched all contract/runtime/owner/fee/timing checks. Collector simulations:300.285210USDG in escrow plus6.377889USDG sweepable at observation.

Tests: pace/public gas budget/funding pass9/9; catalog1/1. Config/product rules unchanged. Isolated runtime `/opt/qianqi/releases/funding-paced-20261004` cloned from the previously verified recognition runtime, overlaid only entrypoint and pacing helper with updated integrity manifest327 files PASS. Prior journals backed up under `/opt/qianqi/backups/funding-paced-20261004`.

Started transient unit `qianqi-funding-first`, using systemd credentials and the existing shared automation journal/config/profile, one pass and maxTransactions2. No watch flag, no permanent activation marker. Regular financial service remains inactive. Existing payout scanner still uses10-block windows and advances at most1000 per invocation: catch-up performance is a remaining operational limitation, no cursor skipped or reset.
