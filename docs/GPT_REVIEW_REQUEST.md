# Review: bounded watch recovery after transient RPC reads

23.09.2026. Previous test infrastructure accepted in 130a029. This package returns
work to runtime automation. Please review actual code; do not infer safety from retries alone.

Before: CLI --watch exited on receipt read outage. Now a narrow transport allowlist
permits backoff 1/2/4/8/16/30 seconds (capped), followed by a fresh coordinator pass.
Existing journal/locks/identity/reconciliation gate every pass. Single-shot API stays
single-shot. Config/state errors, cleanup, network change, unknown send/hashless,
policy halt, unconfirmed receipts and unclassified errors still stop.

Known hash + confirmation transport/receipt timeout can resume through reconciliation.
Known pendingReceipt polls at ordinary pollSeconds. No blind resend, no marker clearing,
no lock removal, no endpoint/signer failover. No contracts or product math changed.
Refill broadcast/persistence unknown result is deliberately not relaxed by this package.

Code: local-rpc-watch.cjs, run-local-coordinator.cjs, error metadata in prize-flow,
scheduler and coordinator; structured HTTP status from the independent replay scanner.
Temporary retry flags do not authorize journal migration. HTTP request timeout 20 s;
SIGINT/SIGTERM interrupt waits but cannot promise immediate cancellation of a running scan.

Tests: allowlist exclusions incl cleanup/network change; bounded/reset backoff; one-shot
failure; known receipt polling; abort; real HTTP 503 recovery using ethers. Integration:
real transaction timeout, mined original, two receipt outages, unchanged pending journal,
one conversion, next draw; estimate read retry followed by hashless send stop. Actual
CLI child recovers startup HTTP 503, completes, exits on SIGTERM event. Windows test
uses IPC to deliver process signal event, not native OS signal delivery.

Please focus on false retry permissions at broadcast/cleanup boundaries, propagation
of worker error metadata, known hash reconciliation, startup failures and stopped state.
No supervisor/stale-lock/hashless repair or fixture optimization in this package.
Scoped verification commands/results are recorded in CURRENT_CONTEXT. Do not run full
solely to review this change: targeted watch + coordinator neighbors is the intended scope.

Confirmed 23.09: watch 6/6 (0.26 s), coordinator --match "watch " 8 actual cases
(62.2 s compile+tests), final neighbor filter 10 cases (87.7 s), infrastructure 9/9
(2.19 s). These overlap; no full/fork/live. An initial test tried overriding tx.wait,
but ethers replaced that wrapper; the final test uses real automining-off timeout,
then original mining and controlled receipt-read outages. Do not confuse the old
341/341 full baseline with validation of this package.
