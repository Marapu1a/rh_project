# Review: scoped compile-once test harness

23.09.2026. Baseline 2a8b57f. Read REVIEW_TESTING and CURRENT_CONTEXT; report reviewed
HEAD and replace response. User approved profiles + fresh compilation per invocation +
per-file timing as one bounded test-infrastructure package. Product tests retained.

New launcher selects explicit profiles and optional regex; fullSuite is false whenever
filtered. Unknown/empty selection fails. Full catalog preserves original 35 files plus
new infrastructure tests; unrelated drand research suites are not silently added.
Test groups are a coverage guide, not permission to ignore affected consumers.

Contract profiles compile project once fresh, ignoring inherited artifact env. Workers
receive a unique absolute artifact and SHA-256; loader rejects missing/partial/corrupt/
mismatched artifacts without fallback. sourceOverrides always runs solc; outside env,
compile behaves as before. Existing child CLIs still read artifacts/compiled.json.
No persistent cache, concurrency remains 1, no snapshot reuse or product scenario removal.

Reporter records file wrapper wall time and case time separately. Empty filtered files
can count as passing wrappers in Node; executedCases prevents a zero-case green result.
The launcher checks expected full-project compilation count. Compiler fixture tests use
a separate tiny Probe source: their deliberate compilations are outside that counter.
Review runner propagates profile/filter and copies structured timing evidence before
cleanup, separately recording install/test/total durations. Existing failure/cleanup
semantics remain; no silent green run if invocation evidence is missing.

Test risks to inspect: artifact freshness vs integrity, accidental inherited cache,
sourceOverrides/writeArtifacts behavior, profile coverage, zero-selection semantics,
Node reporter compatibility, child CLI artifact identity, failure and signal handling,
retaining evidence through worktree cleanup. Forced OS termination is not a cleanup guarantee.

Addressed locally before canonical full: loader/launcher/review fault tests, two real
contract files with one project compilation, positive filtered math profile. Exact final
counts/timings and tested commit will be in CURRENT_CONTEXT. One full run is justified
for this harness change; do not reintroduce mandatory full after every small step.

Comparison: prior Windows baseline 0e5d8ea had 336 cases, 1466.8 s Node test duration;
case sum 1107.4 s and other overhead 359.4 s. Compile-once can remove repeated compilation,
not the remaining integration workload. Use compilation + test wall for fair comparison
because compilation is now outside Node's reported test duration. Prior install was 8 s;
prior review total was not measured separately, so do not invent a total speedup.

Final evidence: clean HEAD 4efca7d, canonical npm run test:review: 341/341,
fail/skipped/cancelled=0, install/test/final exit=0, cleanupError=null, checkout removed.
Compile 17.05 s + test 1112.25 s = 1129.30 s (about 23% below previous 1466.8 s).
Review total 1136.57 s including install 5.74 s. Project compilation=1, reuse=22.
No product scenarios removed. Five infrastructure regressions added. Same Windows toolchain.
Slowest files: coordinator 436.5 s, scheduler 128.3 s, BUY-cycle 83.4 s,
prize-flow 79.0 s, USDG funding 78.7 s. Do not expand this step into fixture redesign.
An actual isolated filtered math review also passed: two executed cases, evidence copied,
cleanup successful. Documentation-only result recording follows the tested code commit.
