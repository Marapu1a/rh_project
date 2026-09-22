# Review: pre-migration native refill admission fix

22.09.2026. Read CURRENT_CONTEXT / LOCAL_NATIVE_REFILL, report reviewed HEAD and replace
GPT_REVIEW_RESPONSE.md. The preceding automatic funding architecture is unchanged.

Confirmed defect: withState used to persist the new configHash before refill history/target
admission. A rejected first setup could pin an unusable identity and prevent compatible retry.

Fix:
- coordinator validates target coverage for every supplied prize/draw/publisher signer and both
  Short/Monthly native controllers before entering withState (fresh and legacy state alike);
- withState invokes optional validateMigration(detachedCopy) under the same lock after legacy
  authorization and pending rejection, before configHash mutation/save; guard throws on rejection;
- coordinator guard rejects existing history with another domain, malformed/null history or
  pending flag; absent history is allowed. No ledger reset or new journal;
- already accepted non-legacy config/source/policy changes remain rejected. This is admission
  prevention, not a repair command for identity already pinned by an older version.

Tests cover rejected guard byte-identical state, lock held during guard, mutation isolation,
compatible retry preserving history and pending rejection before callback. Real coordinator
regression seeds budget state with matching history/spent/attempt/nonce, rejects missing target
sets and a different domain without changing bytes or sending, then admits compatible config.
Fresh missing-target admission does not create state. Existing upgrade and automatic funding
scenarios are included. Commands/results in LOCAL_NATIVE_REFILL and CURRENT_CONTEXT.
25/25 state-lock/refill-state/refill-executor and 5/5 selected coordinator scenarios passed.
Full npm test/fork not run for this bounded fix.

Please check whether admission now happens early enough, identity/spend/cooldown stay intact,
and any remaining initial-setup issue merits a small follow-up. Do not expand this review into
reset APIs, broad config migration, new funding economics or production signing/finality.
