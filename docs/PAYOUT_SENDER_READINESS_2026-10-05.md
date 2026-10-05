# Payout scanner and sender readiness — 5 October 2026

Scope: finish the local reliability package and prepare a separate production
transfer. No financial service activation, recognition publication, configuration
change, cursor reset or public transaction is part of this step.

## Changes

`pons-payout-scan.cjs` now reads up to 10,000 blocks per page and 100,000 blocks
per invocation (previously 10 and 1,000). Both controllers must complete before
the cursor advances. Result hashes, event provenance and both page boundaries
are still checked. A failed or reorganized page is read again after restart;
completed pages remain saved. The coordinator can call discovery three times
per pass, so its maximum discovery progress is 300,000 blocks per pass. This
does not store empty blocks or alter the indexer's project-history format.

The public sender changes from f018bb2 are included in the transfer package:
populate/sign locally, durably save nonce/hash/signed payload, then broadcast.
The new follow-up verifies the signed payload against the saved intent and
removes raw signed bytes from resolved journal records and callback output.
Disk failure before durable signed persistence prevents broadcasting. Receipt
recovery still verifies sender/target/data/value/nonce and the canonical block.
Gas fee headroom stays capped by the existing configured limit.

No automatic resend, fee replacement or stale-lock removal was introduced.
An unsigned intent or a signed transaction without a receipt still blocks
further sends and requires inspection. This package prevents losing the hash
on a lost broadcast response; it does not promise recovery from every possible
provider or process failure without an operator.

## Read-only production measurement

[Evidence](evidence/PAYOUT_SCAN_2026-10-05.json): chain4663, each controller's
10,000-block query matched two adjacent 5,000-block queries at finalized
80540589. These ranges had no payout events; nonempty pages are covered locally.
The new scanner read 100,000 blocks from a clone of the real automation state
in **14.732 seconds / 10 saved-in-memory pages**. The production journal's
bytes were unchanged and no transaction was sent. This is one measured sample,
not a throughput guarantee or a completed production catch-up.

## Transfer package and next stage

Validation: **42 unique targeted tests passed across runs**, not a full suite.
The initial seven-file run was 40/41 because the public-runtime test asserted
the obsolete 10-block RPC limit. Updated that assertion to 10,000 and increased
its synthetic history to 20,001 blocks; the affected scenario reran 1/1 PASS,
including both actual controller settlements, claims and idle restart. No
production BUY/indexer proof is implied by that synthetic participant fixture.

Commands:

```text
node --test test/pons-automation.test.cjs test/pace-public-rpc.test.cjs test/pons-storage-failure.test.cjs test/pons-gas-budget.test.cjs test/pons-public-runtime.test.cjs test/pons-public-execution.test.cjs test/pons-cadence.test.cjs
node --test --test-name-pattern="drains both real frozen" test/pons-public-runtime.test.cjs
node --test test/pons-crash-recovery.test.cjs
```

Crash test: 1/1 PASS with nine internal scenarios (legacy main, signed main,
drand; lost response, saved response, reverted transaction). The signed path
uses a disposable local wallet and real local EVM broadcasts. Forced process
termination after broadcast cannot lose its saved hash; restarting reconciles
the same transaction, preserves frozen/claimable balances and does not send
again. Existing stale-lock refusal is retained. Unit cases also cover signing
payload mismatch, persistence failure before broadcast, page boundaries,
deduplication, failed second reader, page reorg, cancellation and bounded resume.
Logs: `.local/logs/payout-sender-{runtime,crash}-20261005.log`.

Local overlay: `.local/releases/payout-sender-20261005/patch.json`, with SHA-256
for six files: payout scanner, transaction journal, automation coordinator,
receipt helper, RPC pacing helper and public CLI. Base is the integrity-checked
`/opt/qianqi/releases/funding-paced-20261004`; the regular inactive service still
points to `recognition-ready-20261004`, so changing only the funding directory
would not deploy the fix to that service.

Separate production stage:

1. Recheck that the financial service is stopped, no process owns the journal,
   and there is no unresolved transaction. Preserve config, profile and journals.
2. Copy the verified base to a new release, verify all six overlay hashes, update
   its release manifest and run release integrity checks. Keep the previous
   release and service configuration for rollback.
3. Run a bounded controlled pass with the same config/profile/state and executor
   custody. Confirm progress, receipts and restart behavior before watch mode.
4. Only then enable regular operation/monitoring. Recognition remains disabled
   until its independent notice window and admission checks pass. Do not reset
   journal/cursor or use the API index checkpoint as a payout cursor.

The first recognition confirm is still not before 5 October 11:30 UTC (14:30
Moscow). It is independent of preparing this scanner/sender package.
