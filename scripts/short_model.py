"""Offline Short reference model. Exact arithmetic; seeded RNG is NOT production RNG."""
from dataclasses import dataclass, replace
from fractions import Fraction
import random

INTERVAL = 6 * 60 * 60


def natural(value, name, minimum=0):
    if type(value) is not int or value < minimum:
        raise ValueError(f"{name} must be an integer >= {minimum}")


@dataclass(frozen=True)
class Rules:
    version: str
    p_max: Fraction
    h_e: int
    h_l: int
    weights: tuple
    min_prize: int
    min_wallets: int = 1

    def __post_init__(self):
        if not self.version or not isinstance(self.p_max, Fraction) or not 0 < self.p_max < 1:
            raise ValueError("version and exact fractional p_max in (0,1) required")
        natural(self.h_e, "h_e", 1)
        natural(self.h_l, "h_l", 1)
        natural(self.min_prize, "min_prize", 1)
        natural(self.min_wallets, "min_wallets", 1)
        if type(self.weights) is not tuple or not self.weights:
            raise ValueError("nonempty immutable weights required")
        for weight in self.weights:
            natural(weight, "weight", 1)


def admission(entries, luck, rules):
    natural(entries, "entries")
    natural(luck, "luck")
    if not entries:
        return Fraction(0)
    return rules.p_max * (1 - Fraction(rules.h_e * rules.h_l,
                                      (entries + rules.h_e) * (luck + rules.h_l)))


def basket(budget, rules):
    natural(budget, "budget")
    unit = budget // sum(rules.weights)
    return tuple(unit * w for w in rules.weights) if unit >= rules.min_prize else ()


@dataclass(frozen=True)
class Wallet:
    address: str
    entries: int = 0
    monthly: int = 0
    luck: int = 0
    claimable: int = 0

    def __post_init__(self):
        if not self.address:
            raise ValueError("wallet address required")
        for name in ("entries", "monthly", "luck", "claimable"):
            natural(getattr(self, name), name)


@dataclass(frozen=True)
class Frozen:
    draw_id: int
    at: int
    budget: int
    prizes: tuple
    participants: tuple
    rules: Rules


@dataclass(frozen=True)
class State:
    free_short: int
    wallets: tuple
    next_at: int = 0
    next_id: int = 1
    pending: Frozen | None = None
    last_settled: int = 0

    def __post_init__(self):
        natural(self.free_short, "free_short")
        if type(self.wallets) is not tuple or len({w.address for w in self.wallets}) != len(self.wallets):
            raise ValueError("unique immutable wallet list required")


def fund(state, amount):
    """Already allocated SHORT funding, not general funding or creator revenue."""
    natural(amount, "amount")
    return replace(state, free_short=state.free_short + amount)


def add_entries(state, address, count):
    """Prevalidated eligible entries; BUY attribution is outside this model."""
    natural(count, "count", 1)
    wallets = {w.address: w for w in state.wallets}
    w = wallets.get(address, Wallet(address))
    wallets[address] = replace(w, entries=w.entries + count, monthly=w.monthly + count)
    return replace(state, wallets=tuple(wallets[k] for k in sorted(wallets)))


def freeze(state, now, budget, rules):
    natural(now, "now")
    natural(budget, "budget")
    if state.pending or now < state.next_at:
        raise ValueError("pending short or checkpoint too early")
    if budget > state.free_short:
        raise ValueError("insufficient free Short")
    prizes = basket(budget, rules)
    participants = tuple(sorted((w for w in state.wallets if w.entries), key=lambda w: w.address))
    if not prizes or len(participants) < rules.min_wallets:
        return state  # not ready: no attempts, Luck or money changed
    snapshot = Frozen(state.next_id, now, budget, prizes, participants, rules)
    wallets = tuple(replace(w, entries=0) if w.entries else w for w in state.wallets)
    return replace(state, free_short=state.free_short-budget, wallets=wallets,
                   pending=snapshot, next_id=state.next_id+1)


@dataclass(frozen=True)
class Outcome:
    address: str
    entries_consumed: int
    used_luck: int
    probability: Fraction
    admitted: bool
    prize: int
    after_luck: int


@dataclass(frozen=True)
class Result:
    draw_id: int
    budget: int
    basket_total: int
    awarded: int
    returned: int
    outcomes: tuple


def settle(state, draw_id, now, seed):
    """Pure transition: any failure leaves input untouched. No retries in runner."""
    natural(now, "now")
    natural(seed, "seed")
    draw = state.pending
    if draw is None or draw.draw_id != draw_id or now < draw.at:
        raise ValueError("missing, stale or invalid draw")
    rng = random.Random(seed)
    probabilities = {w.address: admission(w.entries, w.luck, draw.rules) for w in draw.participants}
    admitted = [w.address for w in draw.participants
                if rng.randrange(probabilities[w.address].denominator) < probabilities[w.address].numerator]
    admitted_set = set(admitted)
    rng.shuffle(admitted)
    prizes = list(draw.prizes)
    rng.shuffle(prizes)
    awards = dict(zip(admitted, prizes))
    outcomes = tuple(Outcome(w.address, w.entries, w.luck, probabilities[w.address],
                             w.address in admitted_set, awards.get(w.address, 0),
                             0 if w.address in awards else w.luck+1)
                     for w in draw.participants)
    by_address = {o.address: o for o in outcomes}
    wallets = tuple(replace(w, luck=by_address[w.address].after_luck,
                            claimable=w.claimable+by_address[w.address].prize)
                    if w.address in by_address else w for w in state.wallets)
    awarded = sum(awards.values())
    result = Result(draw_id, draw.budget, sum(draw.prizes), awarded, draw.budget-awarded, outcomes)
    return replace(state, wallets=wallets, free_short=state.free_short+result.returned,
                   pending=None, last_settled=draw_id, next_at=now+INTERVAL), result


def claim(state, address):
    wallets = {w.address: w for w in state.wallets}
    if address not in wallets or not wallets[address].claimable:
        raise ValueError("no claim")
    amount = wallets[address].claimable
    wallets[address] = replace(wallets[address], claimable=0)
    return replace(state, wallets=tuple(wallets[w.address] for w in state.wallets)), amount


def custody(state):
    return state.free_short + sum(w.claimable for w in state.wallets) + (state.pending.budget if state.pending else 0)
