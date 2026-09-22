# Review: canonical isolated test runner

22.09.2026. Baseline before this package: 83f3812. Read CURRENT_CONTEXT and
REVIEW_TESTING. Report reviewed HEAD and overwrite GPT_REVIEW_RESPONSE.md.

We accepted the process finding independently: archive removes required git metadata;
main checkout runtime can be affected by external sync. Neither is a good canonical
review environment. This package changes review infrastructure only.

Canonical command: `npm run test:review`.
It creates a unique detached HEAD worktree under system temp, refuses temp inside the
source checkout, checks git HEAD and missing .local, creates runtime directories,
installs using `npm ci --ignore-scripts --no-audit --no-fund`, prints toolchain and exact
commands, then runs full npm test. Dirty/untracked work is explicitly excluded.

Cleanup uses the registered worktree only after checking the owned temp root/token and
non-redirected absolute checkout path. Evidence lives beside the disposable checkout
in the runner-owned .local/logs and is retained. Source runtime is not copied or cleaned.
Test exit survives cleanup failure; cleanup failure after green tests makes exit nonzero.
Forced process/OS termination cannot guarantee finally and is documented, not silently
presented as automatic safe recovery. There is no lock deletion in product runtime.

Self-test is explicitly not a baseline. Four fixture tests cover git provenance,
source stale-lock preservation, cleanup ownership refusal and actual locked-worktree
cleanup failure with test exits 0/7. The fake npm in those tests exercises process
handling only; the full review uses real npm ci and package-lock dependencies.

Important boundaries:
- Isolated checkout is not a container or a fully pinned OS/Node/npm toolchain.
- Registry/install failure is reported separately from product test failure.
- Manifest still expects .git; release bundles without it are not added requirements.
- Role-address casing remains an independent confirmed finding. No configHash or
  migration semantics changed in this package. Address canonicalization will need an
  explicit compatibility strategy for existing resolved and pending journals.
- No venue/RNG/recovery/manifest redesign/product-rule changes.

Please run the canonical command, not another hand-built archive/checkout recipe.
Assess ownership cleanup, exit preservation, isolation and clarity of evidence. After
this step propose the smallest role-casing fix with safe legacy identity compatibility.
Current run results and exact tested commit are recorded in CURRENT_CONTEXT.

Verified here: canonical full run on clean e0407e1: 334/334, 1462.0 s, install/test/final exit 0, cleanupError null. Worktree removed; subsequent changes are docs only.
