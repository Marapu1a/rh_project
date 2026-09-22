# Review: native refill process-death and RPC recovery evidence

22.09.2026. Read CURRENT_CONTEXT and LOCAL_NATIVE_REFILL_RECOVERY. Report reviewed HEAD and
replace GPT_REVIEW_RESPONSE.md. This package adds tests/docs only; runtime behavior is unchanged.

A separate child runs actual executeNativeRefill under withState via parent-hosted local Hardhat
RPC. Test-only synchronous checkpoints hold it after prepared save, send-before-hash-save,
hash save, receipt-before-final-save, and after final save. Parent kills that exact child and
observes exit. Every stale-lock restart rejects unchanged. Harness then checks private path and
lock PID and removes ONLY its dead child fixture lock to test journal recovery. No runtime
force-clear/reset, no simulated in-memory restart.

Assertions: hashless remains stopped, sends never repeat, known receipts are accounted once,
actual source debit equals ledger spend, final state is unchanged on repeat. Separate test makes
receipt RPC fail, verifies byte-identical state, restores RPC and resumes in a fresh child.
Existing real coordinator recovery test now also injects receipt-read outage, verifies no worker
sends and released lock, then resumes. Tests included in npm test/test:local:refill.

Limits are explicit: chain31337, automined transactions in kill tests, server/chain survive,
no OS/power-loss/disk durability proof, no production finality/reorg proof. Child crashes cover
refill/shared journal, not full draw/prize coordinator kills. RPC outage still exits CLI;
restart is required, no reconnect loop/supervisor added. Stale locks/hashless require operator.

Please check whether crash evidence matches the claims, whether any fail-open or double-account
path remains, and suggest ONE bounded next diagnostic/recovery step. Do not propose automatic
pending reset/lock deletion as reconciliation. Full npm test/fork not run; results in context.

Validation: 31/31 process/state-lock/refill-state/executor and 3/3 selected coordinator tests passed.
