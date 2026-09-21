# Review: fee-envelope fix on native refill executor

21.09.2026. Прочитай CURRENT_CONTEXT и LOCAL_NATIVE_REFILL, проверь HEAD и укажи его hash.
Перезапиши GPT_REVIEW_RESPONSE.md. Предыдущий ответ — исторический, не текущий план.

## What changed and why

The flat obligation list could fund a candidate ahead of frozen work because address order
was the only priority. Planner now requires committedObligations and candidateObligations;
legacy input fails. Evaluate committed and combined requirements separately to count shared
payer buffers once. Each transfer covers only its tier deficit: committed, candidate, buffer.
committedFundingReady reports frozen native coverage, not overall draw readiness.
Domain hash has a v2 tag; old history cannot silently inherit the changed semantics.

Already implemented: pure stageNativeRefill / recordNativeRefillHash / finalizeNativeRefill
in scripts/local-native-refill-state.cjs. They use the existing coordinator state and pending,
not a second journal. Finalization returns one state containing both actual expense and cleared
pending; caller must atomic-save under the existing lock. Success costs value + gas; revert
costs gas and advances lastAttemptAt/cooldown. Receipt time controls period. Actual overspend
is recorded rather than rejected after money was already spent. Duplicate finalization rejects.
Transaction identity, nonce, hash, block, history consistency and stale receipts are checked.

The state helpers are pure transitions over normalized evidence,
not finality proofs. Only local plain EVM receipts are supported; EXTRA profile rejects at staging.

## New bounded executor

scripts/local-native-refill-executor.cjs provides executeNativeRefill/reconcileNativeRefill.
Trusted caller holds the existing coordinator withState lock; no second journal. One transfer OR
one recovery per call. Source is BOOTSTRAP_NATIVE only, chain31337/plain local EVM. Exact signer
address/provider binding, exclusive source nonce, anchored balances, fee cap, estimate against
configured transferGas and block limit, head/nonce recheck before intent. Persist intent before
send; bind returned hash; fetch original receipt and canonical local block/anchor; atomic expense
and pending finalization. Revert costs gas/cooldown. No automatic unknown-send retry.

Coordinator startup now uses typed recovery; it does not initiate native funding yet. The next
bounded piece is automatic current obligations collection and funding admission in ordinary passes.
Committed/candidate obligations and protected addresses remain trusted caller inputs. No production
finality, config migration, project-share conversion or new prize math is claimed.

## Evidence

56/56 planner/ledger/executor/budget/lock/transaction tests. 4/4 targeted coordinator regressions; final executor-only rerun 7/7.
Atomic save failure test preserves pending and old spend, reload finalizes exactly once.
Priority regression gives the smaller-address candidate a deficit and enough cap for only frozen:
frozen wins. Shared payer test checks one buffer across tiers. Executor tests use real Hardhat sends, timeout/restart, mined revert, send ambiguity, failed
intent/hash/finalization persistence, source/gas/floor gates and stale head/nonce. Coordinator
integration verifies typed recovery from a real mined refill and persistence of its expense.
Commands in LOCAL_NATIVE_REFILL.md. Full npm test/fork not run for this package.

## Questions

1. Any priority/shared-payer or period/cooldown accounting defect in this implementation?
2. Any gap in pure receipt identity checks or atomic-save contract that should be fixed before wiring?
3. Review executor send/recovery boundaries, especially failed persistence and original receipt
   identity. Separate confirmed defects from future production/finality requirements.
4. For the next bounded integration: how to reuse current budget collection to build fresh
   committed/candidate tiers, bind source/policy to coordinator config and avoid optional buffers
   blocking already-funded frozen work? Do not introduce another journal or broad refactor.

No prize spending for ops, new allocation percentages, conversion, proxy or governance is authorized.
Project share economics and actual native source automation remain separate work.

## Latest fix to review

Prepared feeEnvelope binds type/gasLimit/maxFeePerGas/maxPriorityFeePerGas with stage ceiling
validation. Returned/RPC mismatch preserves the original known hash, records actual receipt
expense and latches nativeRefillHalt atomically with pending clearance. Coordinator and executor
stop automation. No reset API. Legacy pending without envelope is not silently trusted.
Post-broadcast checking cannot prevent the first overspend; this boundary is explicit in docs.
58 focused tests pass, including real signer mutation with timeout/restart and repeat-send stop.
Please check mismatch/recovery/persistence paths before the next obligations integration.
