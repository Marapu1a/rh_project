# Review: role-address canonicalization and exact legacy admission

23.09.2026. Baseline a0a5fb0. Read CURRENT_CONTEXT and the Role casing compatibility
section of LOCAL_NATIVE_REFILL_INSPECTOR. Report reviewed HEAD and replace response.
User update 23.09: use scoped tests for small changes; no automatic full rerun for each
review/commit. Full baseline already exists below. Run full only with a concrete
coverage/risk reason, using the canonical runner; see REVIEW_TESTING.

Scope: shared identity builder plus coordinator legacy candidates. New budget/refill
roles use ethers.getAddress, publisher null stays null, schema/hash for existing
checksummed callers and legacy unbudgeted config remain unchanged. Other config
fields and product contracts are not changed.

Important correction to simply retaining current input raw config: runtime usually
returns checksummed addresses, so that alone cannot recognize a pre-fix lowercase
journal. Builder therefore constructs only exact original raw candidate plus up to
27 checksum/lowercase/uppercase combinations of the SAME roles in pre-fix budget and
refill config shapes. It never derives configuration from an arbitrary stored hash.
Other fields still match exactly. Original raw candidate is retained as well.

Migration uses existing withState lock/checksum/pending guard. Existing native refill
history domain/pending guard still runs BEFORE writing identity. No jobs/history/spend/
cooldown/nonce/observations reset, no arbitrary address substitution, no new repair API.
Pending old hash must reconcile using previous version/config first. Canonical state
requires no migration write. Old non-canonical manifests require re-export; configHash
semantic equality is distinct from raw deploymentHash/provenance/manifest equality.

New regressions:
- actual lowercase deployment manifest matches checksummed runtime state (full CLI path);
- lowercase/uppercase/mixed pre-fix budget and refill states migrate;
- complete state payload preserved and repeated canonical admission is byte-identical;
- draw/prize/refill pending reject without state writes;
- incompatible refill history domain and history.pending reject without state writes;
- a different real role address cannot pass case migration; optional publisher remains null.
Admission regressions deliberately use an aborted signal to observe only migration,
without subsequent ordinary coordinator actions changing the journal.

Please inspect bounded candidate generation, unchanged migration guards, and whether
any real role/config change could be admitted. Keep venue/RNG/swap/manifest redesign
and product decisions out of this package. Exact run results will be in CURRENT_CONTEXT.

Verified: clean 0e5d8ea canonical npm run test:review — 336/336, 1466.8 s,
install/test/final exit 0, cleanupError null; worktree removed. Final focused
role-casing/manifest tests 3/3. Subsequent changes are documentation only. No fork/live.
