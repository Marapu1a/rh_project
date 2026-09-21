# Review: automatic native funding in coordinator

21.09.2026. Read CURRENT_CONTEXT and LOCAL_NATIVE_REFILL, report reviewed HEAD and overwrite
GPT_REVIEW_RESPONSE.md. Previous replies are historical, not the current task.

This package integrates the existing bounded executor into normal coordinator passes and CLI.
collectExecutionObligations is extracted from the existing execution-budget collector. Frozen
Short/Monthly work becomes committed; the current candidate becomes candidate. Both use one
block. Executor requires the obligations anchor to match its balance snapshot before any intent.
Gas observations stay mutable without changing the base funding domain. No prize math changed.

Coordinator nativeRefill config binds funding domain/source to existing state identity; source
must be dedicated, plain local BOOTSTRAP_NATIVE, shared provider. Protected prize addresses come
from deployment plus optional additions. Enabling legacy config only without pending; no silent
policy reset. No second state/lock/journal. Existing unknown-send and fee mismatch stops remain.

Pass: startup recovery ends an enabled refill pass; committed funding comes first. Draw/prize
workers yield on native shortfall, and coordinator sends outside the nested worker transaction
boundary. Candidate refill cannot displace covered frozen work. Optional buffer is after workers
only with no frozen work. One transfer per pass; next pass rereads state. Regular funding waits
are waiting (watch can poll), unknown sends blocked. Policy alarm now requiresOperatorAction,
not receipt reconciliation. No reset API. CLI --native-refill FILE --refill-signer INDEX with --ops.

Tests: 59 focused tests and 12 distinct selected coordinator regressions pass. New scenarios exercise candidate funding then freeze on next pass,
committed refill, configured large buffer not triggering while frozen work remains, changed
funding policy rejection, CLI source-floor wait/resume with the same state, CLI options, anchor mismatch and deferred buffer with pending source
nonce. Final coordinator results/commands in CURRENT_CONTEXT / LOCAL_NATIVE_REFILL.
Full npm test and fork not run; still local chain31337/fixture venue+RNG.

Please independently review:
1. Does the shared collector preserve existing budget mathematics, especially shared payers,
   current action extras and committed-vs-candidate classification?
2. Any path that continues sending after refill, uses stale obligations or bypasses pending/halt?
3. Does funding config admission preserve history and prevent source/custody mistakes?
4. Do ordinary waits remain resumable without blocking funded frozen work for optional buffers?
5. Identify a bounded next stabilization step; do not expand into conversion, raw signing,
   governance, production RNG/finality or a new journal.
