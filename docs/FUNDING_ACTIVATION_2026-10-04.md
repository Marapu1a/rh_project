# Funding activation — 4 October 2026

User authorized starting work independent of the late-confirmation notice window. Executor received0.001ETH (latest chain state). Recognition publishing stays disabled; notice not-before05 October11:30UTC is unchanged.

Initial live public admission hit QuickNode JSON-RPC -32007 (50requests/second); no transaction sent. Added a120ms serialized request queue to the public entrypoint. Failed requests are propagated without retries, including ambiguous sends. Live paced read-only admission matched all contract/runtime/owner/fee/timing checks. Collector simulations:300.285210USDG in escrow plus6.377889USDG sweepable at observation.

Tests: pace/public gas budget/funding pass9/9; catalog1/1. Config/product rules unchanged. Isolated runtime `/opt/qianqi/releases/funding-paced-20261004` cloned from the previously verified recognition runtime, overlaid only entrypoint and pacing helper with updated integrity manifest327 files PASS. Prior journals backed up under `/opt/qianqi/backups/funding-paced-20261004`.

Started transient unit `qianqi-funding-first`, using systemd credentials and the existing shared automation journal/config/profile, one pass and maxTransactions2. No watch flag, no permanent activation marker. Regular financial service remains inactive. Existing payout scanner still uses10-block windows and advances at most1000 per invocation: catch-up performance is a remaining operational limitation, no cursor skipped or reset.

## Confirmed funding result

The first regular pass stopped with unknownHash after persisting pull intent; the CLI did not retain a detailed broadcast error, so the exact cause is unproven. Latest/pending/finalized executor nonce all remained0 and balance unchanged. Preserved the original intent. Recovery used the identical pull target/data with nonce0 (not a new nonce), fresh public admission/estimate, fee headroom within the configured cap, and persisted signed hash before broadcast. No journal reset. Successful receipt reconciled through the shared journal.

Confirmed transactions:
- pull300.285210USDG:0x5b1dbd441c8bb447c596e45166a73a4fa1755810a2ff98c24daae1caa460debd, block80063196.
- pay prize vault270.256689USDG:0xbb19694fb1b5e31113ca40f8f342f269cf23a1caa9e57aec84a7e904a0e9c9b1, block80063918.
- pay combined operations/team credit30.028520USDG to the configured common recipient:0x83365687dfea27ba3cc34d4686ebe6b844d26f79b025f6c5fe0faa06b7e2b281, block80064228.

Fresh vault balance270.256689USDG; executor0.000990438702004ETH; no pending journal. Shared state ownership restored to qianqi. Signed recovery records retained privately in the backup directory; not committed. Regular service remains inactive and recognition publishing disabled. Additional curve fees were not swept by these three transactions. Public API may wait for finalized indexing before showing funded balances.

Four currently admitted wallets have carries86.856874,26.465071,2 and6USDG; all have0 minted ticket pairs at this observation. Thus current participant absence is independent of the notice time.

Local follow-up fixes: public journal now persists nonce/hash/signed transaction before broadcast so a lost response retains identity; public send has20% fee headroom capped by configured ceiling. Exact cause of the initial failure remains unproven; these address demonstrated recovery weakness and stale fee exposure. Tests21/21 plus public guard8/8 PASS; catalog1/1. These follow-up sender changes are committed but NOT in the running/prepared server runtime yet. Existing slow10-block payout scan and a controlled restart with the new sender remain prerequisites for regular activation. No production draws or payouts to winners claimed.
