# Review: read-only native refill inspector

22.09.2026. Read CURRENT_CONTEXT and LOCAL_NATIVE_REFILL_INSPECTOR. Report reviewed HEAD and
replace GPT_REVIEW_RESPONSE.md. Executor/coordinator funding behavior is unchanged.

New inspectNativeRefill function and loopback CLI accept statePath, trusted expected configHash
and full refill config (domain recomputed), plus read provider. No withState/save/lock deletion,
no signer or send methods. Schema/checksum/config/domain/history/intent checked before RPC;
known tx/receipt validated using existing pure record/finalize functions on copies.
Projected accounting is labelled persisted=false. Hashless never implies safe retry, even when
latest/pending nonce match. Policy violations remain operator issues.

Our addition: explicit nextAction/lockAction and best-effort end-of-inspection state/lock reread.
Changed bytes/metadata return snapshotChanged and remove projected accounting. This is not a
lease/atomic snapshot and cannot detect ABA. A recoverable receipt with a lock still exits nonzero.
CLI has JSON status/exit and bounded request/overall timeouts. Source nonce is evidence only.

Expected configHash must originate from approved coordinator configuration, not the inspected
journal; full protected-address set is required. Deployment manifest export is not implemented.
That tooling gap is documented rather than silently trusting the journal's own configHash.

31/31 inspector/process-death/refill-state/state-lock tests passed. Real Hardhat crash checkpoints
now invoke inspector while stale fixture lock exists: no writes/deletions/additional sends.
Tests cover success/revert, hashless, nonce equality, pending/missing receipt, RPC failure, fee
mismatch, conflicting chain evidence, bad checksum/history/config and concurrent state/lock change.
CLI test verifies JSON/nonzero and only read RPC methods. No full npm test/fork run this package.

Please check false-positive recoverability, snapshot limitations, config/domain trust boundaries,
projection vs actual accounting and exit classifications. Suggest one bounded next step; avoid
turning this diagnostic into implicit repair or automatic pending/lock reset.

Финальная проверка inspector suite: 10/10, включая idle/other-worker, lock exit code и отказ unsupported fee profile.
