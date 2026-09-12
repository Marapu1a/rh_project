# PAIR Promo Token — Current Technical Context & Next Step

**Date:** 2026-09-11  
**Purpose:** concise working context for Codex. This file combines the current MVP decisions, verified integration facts, unresolved risks, and the recommended next implementation step.

---

# 1. Product baseline

We are building:

```text
ordinary meme TOKEN on PAIR / Robinhood Chain
+
separate opt-in Promo system
```

Promo concept:

```text
eligible BUY volume
→ promo entries
→ short draws with TOKEN rewards
→ monthly jackpot in USDG
```

Working product rules:

- TOKEN is a plain meme-token.
- TOKEN has no staking, dividend rights, revenue rights, jackpot rights, or investor rights.
- Promo participation is separate and opt-in.
- Working entry rule: every `$100 cumulative eligible BUY` creates 1 entry; remainder carries forward.
- SELL does not directly create entries.
- Short draws: working target every 6 hours with a minimum of 30 entries; otherwise entries and budget roll forward.
- Working reward frequency: roughly 1 in 3 entries wins something.
- Short rewards are intended to be paid in TOKEN.
- The same entries also participate in the monthly USDG jackpot.
- Rewards may only be created from assets already owned by the Promo system.
- Rules of an active campaign must not be changed retroactively.

Project revenue is separate:

```text
PAIR creator revenue
→ FeeRouter
   ├─ PromoVault
   ├─ InvestorVault   (future)
   └─ Treasury        (future)
```

Initial MVP policy:

```text
100% of received creator revenue → Promo
```

This is a configurable policy, not a permanent TOKEN property.

---

# 2. Verified integration facts

The following is verified by the current technical recon and local fork work.

## PAIR / market

A real direct TOKEN/USDG PAIR launch exists on Robinhood mainnet.

A new single-pool TOKEN/USDG launch has also passed `eth_call` with a contract as creator-fee recipient:

- with developer buy `0.00001 ETH`;
- and with no developer buy.

The native PAIR frontend currently requires at least `0.00001 ETH` developer buy, but the contract simulation itself did not require it.

The previous `InvalidLaunch()` issue was traced to the CREATE2 salt requirements and fixed with the correct creator-bound salt.

Native and custom quote launch branches are not equivalent.

**Current prototype scope is the verified native TOKEN/USDG path only.**

Do not broaden implementation to the custom branch unless a later task explicitly requires it.

## Fees

In the investigated native example:

```text
pool fee = 10000 = 1%
```

Observed LP-fee distribution was:

```text
70% creator
30% protocol
```

This is verified for the investigated path/example, but must **not** be treated as universal economics for every PAIR release, hook, market type, or future upgrade.

## Fee path

The following real integration path has been exercised on a local Robinhood fork:

```text
Uniswap / PAIR market
→ PAIR vault
→ collect
→ claim to FeeRouter
→ FeeRouter accounting
→ pay to test PromoVault
```

A real TOKEN sell was executed against the actual PoolManager.

The fork run received both assets:

```text
TOKEN: 5338917713972260336 raw
USDG: 184 raw
```

All integration transactions in that run succeeded.

No public deployment or real-money mainnet transaction has been made by us.

---

# 3. Current FeeRouter implementation

Current FeeRouter characteristics:

- supports TOKEN and USDG only;
- no swap or conversion;
- one-time binding to PAIR vault + positionId;
- validates projectToken;
- validates the current PAIR epoch recipient is the router at 10000 bps;
- vault provenance and positionId provenance are established from the launch receipt, not proven purely by FeeRouter getters;
- permissionless keeper calls may trigger collect / harvest / pay;
- keeper cannot redirect funds;
- incoming amounts are measured by balance delta;
- campaign recipients and shares are immutable while that campaign is active;
- after campaign completion owner can open the next campaign;
- already accrued recipient credits survive campaign changes;
- accounting uses cumulative revenue, so splitting inflows does not change recipient proportions;
- rounding reserve is bounded to at most 2 raw units per asset/campaign and is assigned to the old PromoVault on close;
- payout failure for one recipient does not block unrelated recipients;
- SafeERC20, ReentrancyGuard and Ownable2Step are used;
- no proxy;
- no arbitrary external calls;
- no admin withdrawal;
- ordinary ERC20 only;
- rebasing and fee-on-transfer tokens are explicitly out of scope;
- no rescue mechanism for unrelated ERC20/ETH.

Current tests:

- 7/7 local tests passed;
- local fork integration also passed;
- this is still an integration prototype, not a security audit.

---

# 4. Current architectural blocker: campaign boundary accounting

The current prototype temporarily attributes revenue according to **when FeeRouter harvests / recognizes it**, not when the underlying swap happened.

Current problematic behavior:

```text
swap happens during Campaign A
↓
PAIR fee remains uncollected
↓
Campaign A ends
↓
harvest happens later
↓
depending on implementation timing, revenue may be attributed to another campaign
```

This becomes especially dangerous once campaign revenue shares differ.

A permissionless keeper does not solve this by itself because it cannot guarantee that harvest occurs at the intended boundary.

---

# 5. Recommended minimal campaign-boundary model

**Status: recommendation for next implementation step, not yet a historical product rule.**

Do **not** reconstruct the exact swap-time origin of every fee for MVP.

Instead define the campaign boundary by a deterministic on-chain rollover transaction.

Conceptual operation:

```text
rollCampaign(nextConfig):

1. collect/harvest everything currently claimable from the bound PAIR position
2. sync all currently unaccounted TOKEN/USDG already sitting in FeeRouter
3. attribute all of that recognized revenue to the OLD campaign
4. finalize OLD campaign accounting
5. switch campaign configuration
6. open NEW campaign
```

Important property:

> Everything recognized by FeeRouter before the rollover transaction belongs to the old campaign. Everything recognized after the rollover belongs to the new campaign.

This is not the exact economic timestamp of the original swaps.

It is intentionally simpler:

> **campaign accounting boundary = successful rollover transaction**

`endsAt` should be treated as a target/scheduled time, not as the accounting boundary by itself.

---

# 6. Abuse / failure cases the rollover change must handle

## Delayed rollover

Campaign nominally ends at 00:00, but owner rolls at 00:20.

Expected MVP semantics:

```text
fees recognized during rollCampaign at 00:20
→ old campaign
```

## Direct transfer before rollover

TOKEN/USDG transferred to FeeRouter before rollover:

```text
sync during rollover
→ old campaign
```

## Direct transfer after rollover

Expected:

```text
later sync/harvest
→ new campaign
```

## PAIR collect/claim failure

Rollover must not silently switch campaign if final harvest failed.

Prefer atomic revert.

## Payout failure

Existing recipient debt survives rollover.

Opening a new campaign must not require all old debts to have been paid.

## Reentrancy

Final collect/sync/finalize/switch path must remain protected.

## Double rollover / stale config

Invalid transition attempts must revert cleanly.

## Owner loss

Owner is currently required for campaign transitions.

Accepted as prototype operational risk. Do not add governance/recovery complexity yet.

---

# 7. PromoVault — next module after rollover

Do not implement this until campaign-boundary semantics are stable.

Minimal accounting model per asset:

```text
balance
reserved
claimable
available
```

Where:

```text
balance   = actual ERC20 balance of PromoVault
reserved  = budget locked for draws started but not finalized
claimable = finalized prizes owed but not yet claimed
available = balance - reserved - claimable
```

Hard invariant:

```text
reserved + claimable <= balance
```

No IOUs.

Lifecycle:

```text
funds arrive
→ available increases

draw begins
→ budget moves available → reserved

draw finalizes
→ winning amount moves reserved → claimable
→ unused reserved returns to available

winner claims
→ claimable decreases
→ token balance decreases
```

If short draw is skipped because minimum entries were not reached:

```text
do not reserve anything
```

Funds simply remain available.

---

# 8. Eligible BUY — intentionally narrow MVP rule

PAIR trades API has already produced at least one incorrect BUY classification for:

```text
USDG → TOKEN → WETH
```

where TOKEN was only an intermediate asset.

Therefore PAIR API must not be the sole source of entry accounting.

Recommended temporary MVP rule:

> An eligible BUY is a direct swap through the canonical TOKEN/USDG pool where the registered promo wallet is both the attributable payer and final TOKEN recipient.

Temporarily exclude:

- TOKEN used only as intermediate route asset;
- atomic BUY→SELL routes;
- unsupported aggregators/routes;
- flash-loan / flash-accounting volume;
- developer buy;
- project wallets;
- purchases before Promo enrollment;
- cases where payer and final TOKEN recipient differ.

This is an attribution restriction, **not** a holding requirement.

Do not silently redefine gross BUY as net BUY.

---

# 9. Economic work before choosing reward sizes

Do not finalize:

- short reward sizes;
- exact 1-in-3 implementation;
- short-vs-jackpot split;
- monthly jackpot distribution;

until real route economics are measured.

Recommended fork dataset:

```text
BUY  $25
BUY  $100
BUY  $500

SELL comparable sizes

BUY $100 → SELL back

repeated BUY/SELL loop
```

For every scenario record:

```text
gross quote spent
TOKEN received
quote received on exit
pool fee
creator TOKEN revenue
creator USDG revenue
price impact
round-trip loss
gas
```

The farming calculation must include both reward layers:

```text
short rewards
+
monthly jackpot EV
```

and an attacker controlling a large share of all entries.

Question to answer:

> Can an attacker buy a dominant share of entries cheaply enough to capture rewards funded by organic users?

---

# 10. RNG / draw requirements before integration

RNG provider is not final yet.

Define the state machine independently:

```text
OPEN
→ FROZEN
→ RANDOMNESS_REQUESTED
→ FINALIZED
```

At `FROZEN`, commit at least:

```text
campaignId
drawId
cutoffBlock
entryCount
participant / entry commitment
reward budget
draw rules version
```

If entries are computed off-chain, store an on-chain commitment such as a Merkle root before requesting randomness.

Required rule:

> Operator must not be able to request fresh randomness because a result is undesirable.

Timeout policy must be defined in advance.

Acceptable:
- retry/fulfill same request;
- keep draw pending;
- pre-defined cancel-and-rollover rule.

Unacceptable:

```text
request
→ dislike/timeout
→ request fresh random until convenient
```

Callbacks and finalization must be idempotent.

---

# 11. Immediate work order

Do not expand MVP.

## STEP 1 — blocker
Fix campaign rollover semantics in FeeRouter.

Goal:

```text
final harvest/sync old campaign
→ finalize
→ switch config
```

as one deterministic transition.

## STEP 2
Implement minimal PromoVault accounting:

```text
available / reserved / claimable
```

No RNG yet.

## STEP 3
Collect fork-based economic measurements.

Do not choose final rewards before this.

## STEP 4
Build first entry indexer for **direct canonical TOKEN/USDG BUY only**.

No generalized aggregator attribution.

## STEP 5
Implement draw state machine + participant commitment + selected RNG adapter.

Frontend comes after the full backend/contract loop works.

---

# 12. Explicit non-goals right now

Do not spend time on:

- custom PAIR branch;
- multi-pool support;
- generalized aggregators;
- NFT tickets;
- staking;
- DAO;
- referrals;
- investor dashboard;
- investor token;
- cross-chain;
- own DEX;
- advanced KYC;
- buyback/burn;
- final UI polish.

Do not mainnet-deploy yet.

---

# 13. Proven vs not proven

## Proven enough to continue

- direct native TOKEN/USDG path is viable;
- contract creator-fee recipient is viable in launch simulation;
- actual PAIR fee collection can reach FeeRouter on a local fork;
- both TOKEN and USDG may reach router in the verified path;
- FeeRouter can distribute assets to PromoVault;
- basic FeeRouter accounting works under current tests.

## Not proven

- security of FeeRouter;
- exact economics of every PAIR route/release;
- compatibility with future PAIR upgrades;
- eligible-BUY attribution across arbitrary routers;
- final reward economics;
- final RNG provider;
- legal applicability in target jurisdiction;
- public mainnet operational reliability.

---

# 14. Engineering principle

Prefer a narrow system with explicit semantics over a general system with ambiguous semantics.

For MVP:

```text
one TOKEN
one canonical TOKEN/USDG market
one FeeRouter
one PromoVault
one clearly defined eligible BUY path
one campaign boundary rule
one draw state machine
```

Generalize only after the complete loop works.
