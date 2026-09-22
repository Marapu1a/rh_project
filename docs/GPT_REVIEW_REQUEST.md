# Review: shared runtime identity and inspection manifest

22.09.2026. Baseline af2754c. Read CURRENT_CONTEXT and LOCAL_NATIVE_REFILL_INSPECTOR.
Report reviewed HEAD; replace GPT_REVIEW_RESPONSE.md. This is one local diagnostics
package, not production deployment tooling or automatic recovery.

Implemented:
- Nonce RPC reads are best-effort evidence. Known receipts remain inspectable when
  nonce reads fail; hashless remains manual search, never safe retry.
- Refill fixture suites create .local before mkdtemp (clean checkout fix).
- Pure buildCoordinatorIdentity is shared by coordinator and manifest tooling.
  Existing legacy/budget/refill identity shape is preserved. Runtime additionally
  binds controller objects to configured addresses before journal access.
- inspection-manifest export takes explicit independent deployment JSON. It never
  derives expected identity from inspected state. Export uses exclusive create;
  verify is read-only, with no RPC/signers/journal/lock API.
- Full manifest includes coordinator config/hash, refill full protected set,
  deployment hash, commit/dirty/time provenance and checksum. Verifier independently
  rebuilds it from deployment input. Recomputed checksums cannot hide a mismatch
  with that input. Neither checksum nor commit constitutes external approval.
- Inspector CLI requires independent --deployment when --expected is a manifest;
  raw expected config remains available for existing trusted callers.

Review questions:
1. Does extraction preserve all runtime identity and admission checks, including
   legacy migration, role casing, controller target coverage and protected addresses?
2. Can source/network/config/protected-set drift pass independent verification?
3. Is the explicit input/provenance boundary clear enough without suggesting that
   self-generated checksum proves authenticity or that deployment matches on-chain code?
4. Any meaningful regression in read-only behavior, unknown-send handling or lock safety?

Tests include real coordinator configHash comparison, legacy/budget formula
comparison, modified payloads with recomputed checksum, stale deployment, CLI
export/verify/no-overwrite, inspector manifest admission and nonce outage.
Exact executed results are in CURRENT_CONTEXT. No contracts/prize math changed.

Next suggestion: take a bounded real-venue/BUY integration boundary from the roadmap;
keep stale-lock/hashless recovery separately designed, without force-clear or reroll.
Please prioritize confirmed issues and a reasonable next step over rare hypotheticals.
