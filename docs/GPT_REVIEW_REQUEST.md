# Review: native refill priority and receipt accounting

21.09.2026. Current package supersedes the earlier planner review request.
Read CURRENT_CONTEXT.md and LOCAL_NATIVE_REFILL.md, then the narrow diff from 394e793.

## What changed and why

The flat obligation list could fund a candidate ahead of frozen work because address order
was the only priority. Planner now requires committedObligations and candidateObligations;
legacy input fails. Evaluate committed and combined requirements separately to count shared
payer buffers once. Each transfer covers only its tier deficit: committed, candidate, buffer.
committedFundingReady reports frozen native coverage, not overall draw readiness.
Domain hash has a v2 tag; old history cannot silently inherit the changed semantics.

Next bounded piece: pure stageNativeRefill / recordNativeRefillHash / finalizeNativeRefill
in scripts/local-native-refill-state.cjs. They use the existing coordinator state and pending,
not a second journal. Finalization returns one state containing both actual expense and cleared
pending; caller must atomic-save under the existing lock. Success costs value + gas; revert
costs gas and advances lastAttemptAt/cooldown. Receipt time controls period. Actual overspend
is recorded rather than rejected after money was already spent. Duplicate finalization rejects.
Transaction identity, nonce, hash, block, history consistency and stale receipts are checked.

No transfers/RPC/signing are enabled. These are pure transitions over trusted normalized evidence,
not finality proofs. Only local plain EVM receipts are supported; EXTRA profile rejects at staging.
Coordinator generic recovery explicitly blocks nativeRefill pending until typed executor exists:
it must never erase a refill receipt without recording expense. This is deliberate incomplete
integration, not a production recovery mechanism. Prize contracts/math remain unchanged.

## Evidence

49/49 planner/ledger/budget/lock/transaction tests; 4/4 targeted coordinator regressions.
Atomic save failure test preserves pending and old spend, reload finalizes exactly once.
Priority regression gives the smaller-address candidate a deficit and enough cap for only frozen:
frozen wins. Shared payer test checks one buffer across tiers. Coordinator test uses a mined hash
and proves generic recovery preserves refill pending/state and sends no transaction.
Commands in LOCAL_NATIVE_REFILL.md. Full npm test/fork not run for this package.

## Questions

1. Any priority/shared-payer or period/cooldown accounting defect in this implementation?
2. Any gap in pure receipt identity checks or atomic-save contract that should be fixed before wiring?
3. For the NEXT bounded bootstrap-native executor package, review the order: bind dedicated source
   signer and chain, revalidate balances/estimate/head, persist intent before send, persist hash,
   reconcile receipt through typed finalizer, stop on unknown send. Keep one coordinator journal.
4. Identify mandatory integration checks versus later production/finality work; avoid adding a second
   lock/journal or enabling automatic retries for unknown transfers.

No prize spending for ops, new allocation percentages, conversion, proxy or governance is authorized.
Project share economics and actual native source automation remain separate work.
