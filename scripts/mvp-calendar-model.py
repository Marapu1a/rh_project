"""Offline candidate economics. Six-hour observation grid; seeded RNG is not production.
Uses the existing Short reference model. Exact raw USDG accounting, no RPC or gas model.
python scripts/mvp-calendar-model.py > .local/logs/mvp-calendar-model.json
"""
import json
import random
from dataclasses import replace
from fractions import Fraction
from short_model import State, Wallet, Rules, fund, freeze, settle

U = 10**6
STEP = 6*3600
MONTH = 30*86400
TARGET = 100*U
RULES = Rules('candidate-10', Fraction(2, 5), 1, (7,4,2,1,1,1,1,1,1,1), 5*U)


class Calendar:
    def __init__(self, count, seed, delay=0, monthly_first=False):
        self.short = State(0, tuple(Wallet(str(i)) for i in range(count)))
        self.rng = random.Random(seed)
        self.current = self.next = self.phase = 0
        self.creator = self.project = self.creator_remainder = self.prize_in = 0
        self.carry = [0]*count
        self.minted = self.short_consumed = self.month_consumed = 0
        self.month_pending = None
        self.month_at = MONTH
        self.short_due = None
        self.month_claimable = 0
        self.delay = delay*STEP
        self.monthly_first = monthly_first
        self.events = []

    def funding(self, amount, target='GENERAL'):
        self.prize_in += amount
        if target == 'GENERAL':
            cycles, rem = divmod(amount, 6)
            parts = [cycles*3, cycles*2, cycles]
            order = [0,1,0,1,0,2]
            for _ in range(rem):
                parts[order[self.phase]] += 1
                self.phase = (self.phase+1) % 6
        else:
            parts = [0,0,0]
            parts[{'SHORT':0,'CURRENT':1,'NEXT':2}[target]] = amount
        accepted = min(parts[2], TARGET-self.next)
        self.short = fund(self.short, parts[0])
        self.next += accepted
        self.current += parts[1]+parts[2]-accepted

    def revenue(self, amount):
        self.creator += amount
        project, self.creator_remainder = divmod(amount+self.creator_remainder, 10)
        self.project += project
        self.funding(amount-project)

    def buy(self, amount, concentrated=False):
        weights = [20]+[1]*(len(self.carry)-1) if concentrated else [1]*len(self.carry)
        portions = [amount*w//sum(weights) for w in weights]
        portions[-1] += amount-sum(portions)
        wallets = []
        for i, (w, part) in enumerate(zip(self.short.wallets, portions)):
            entries, self.carry[i] = divmod(self.carry[i]+part, 100*U)
            self.minted += entries
            wallets.append(replace(w, entries=w.entries+entries, monthly=w.monthly+entries))
        self.short = replace(self.short, wallets=tuple(wallets))

    def short_finish(self, now):
        before = sum(w.entries for w in self.short.pending.participants)
        self.short, result = settle(self.short, self.short.pending.draw_id, now, self.rng.getrandbits(128))
        self.short_consumed += before
        self.short_due = None
        self.events.append({'kind':'short', 'hour':now//3600, 'paid':result.awarded,
                            'budget':result.budget, 'consumed':before})

    def monthly_finish(self, now):
        pending = self.month_pending
        admitted = [w for w in pending['wallets'] if self.rng.randrange(10*(w.monthly+1)) < w.monthly]
        paid = pending['budget'] if admitted else 0
        if admitted:
            self.rng.choice(admitted)  # Uniform winner; only aggregate credit tracked here.
            self.month_claimable += paid
            self.current += self.next
            self.next = 0
        else:
            self.current += pending['budget']
        self.month_consumed += sum(w.monthly for w in pending['wallets'])
        self.events.append({'kind':'monthly','hour':now//3600,'paid':paid,'budget':pending['budget']})
        self.month_pending = None
        self.month_at = now+MONTH

    def short_start(self, now):
        if self.short.pending or now < self.short.next_at:
            return
        self.short = freeze(self.short, now, self.short.free_short, RULES)
        if self.short.pending:
            self.short_due = now+self.delay
            if not self.delay:
                self.short_finish(now)

    def monthly_start(self, now):
        wallets = tuple(w for w in self.short.wallets if w.monthly)
        if self.month_pending or now < self.month_at or self.next < TARGET or not self.current or not wallets:
            return
        self.month_pending = {'wallets':wallets,'budget':self.current,'due':now+self.delay}
        self.current = 0
        self.short = replace(self.short, wallets=tuple(replace(w,monthly=0) for w in self.short.wallets))
        if not self.delay:
            self.monthly_finish(now)

    def tick(self, now):
        if self.short_due is not None and now >= self.short_due:
            self.short_finish(now)
        if self.month_pending and now >= self.month_pending['due']:
            self.monthly_finish(now)
        for action in ([self.monthly_start,self.short_start] if self.monthly_first else [self.short_start,self.monthly_start]):
            action(now)
        self.check()

    def check(self):
        short_frozen = self.short.pending.budget if self.short.pending else 0
        month_frozen = self.month_pending['budget'] if self.month_pending else 0
        total = self.short.free_short+self.current+self.next+short_frozen+month_frozen
        total += sum(w.claimable for w in self.short.wallets)+self.month_claimable
        assert total == self.prize_in
        assert 0 <= self.next <= TARGET
        short_open = sum(w.entries for w in self.short.wallets)
        month_open = sum(w.monthly for w in self.short.wallets)
        short_locked = sum(w.entries for w in self.short.pending.participants) if self.short.pending else 0
        month_locked = sum(w.monthly for w in self.month_pending['wallets']) if self.month_pending else 0
        assert self.minted == short_open+short_locked+self.short_consumed
        assert self.minted == month_open+month_locked+self.month_consumed
        for kind, interval in [('short',6),('monthly',720)]:
            times = [e['hour'] for e in self.events if e['kind']==kind]
            assert all(b-a >= interval for a,b in zip(times,times[1:]))


SCENARIOS = [
    dict(name='low', volume=5000, wallets=20),
    dict(name='medium', volume=25000, wallets=50),
    dict(name='high', volume=100000, wallets=100),
    dict(name='stop_day30', volume=25000, wallets=50, stop=30),
    dict(name='sponsor_short', volume=5000, wallets=20, sponsor='SHORT'),
    dict(name='sponsor_general', volume=5000, wallets=20, sponsor='GENERAL'),
    dict(name='concentrated', volume=25000, wallets=50, concentrated=True),
    dict(name='delayed_settlement', volume=25000, wallets=50, delay=3),
    dict(name='no_eligible_buy', volume=25000, wallets=20, eligible=False),
    dict(name='no_revenue', volume=25000, wallets=50, rate=0),
    dict(name='low_stop_day30', volume=5000, wallets=20, stop=30),
    dict(name='burst', volume=5000, wallets=20, burst=True),
    dict(name='one_wallet', volume=5000, wallets=1),
]


def simulate(s, seed, monthly_first=False):
    c = Calendar(s['wallets'],seed,s.get('delay',0),monthly_first)
    for step in range(1,481):  # 120 days; income first, then settlement, then new readiness.
        day = Fraction(step,4)
        volume = s['volume']*U//4 if day <= s.get('stop',120) else 0
        if s.get('burst') and 10 < day <= 11:
            volume *= 50
        c.revenue(volume*s.get('rate',20)//10000)  # Hypothetical net creator rate 0.2%.
        if s.get('eligible',True):
            c.buy(volume//4,s.get('concentrated',False))  # 50% BUY * 50% eligible.
        if step == 120 and 'sponsor' in s:
            c.funding(5000*U,s['sponsor'])
        c.tick(step*STEP)
    shorts = [e for e in c.events if e['kind']=='short']
    months = [e for e in c.events if e['kind']=='monthly']
    return {'scenario':s['name'],'seed':seed,'monthly_first':monthly_first,
            'short_draws':len(shorts),'short_paid':sum(e['paid'] for e in shorts)/U,
            'short_no_win':sum(e['paid']==0 for e in shorts),
            'first_short_day':shorts[0]['hour']/24 if shorts else None,
            'monthly_draws':len(months),'monthly_wins':sum(e['paid']>0 for e in months),
            'monthly_paid':c.month_claimable/U,'project':c.project/U,
            'free_short':c.short.free_short/U,'current':c.current/U,'next':c.next/U,
            'open_short':sum(w.entries for w in c.short.wallets),
            'open_monthly':sum(w.monthly for w in c.short.wallets),
            'draws_after_day31':sum(e['hour']>31*24 for e in c.events),
            'short_frozen':c.short.pending.budget/U if c.short.pending else 0,
            'monthly_frozen':c.month_pending['budget']/U if c.month_pending else 0}


def checks():
    # Funding split independence, overflow and pending draws receiving new funding.
    a,b = Calendar(1,1),Calendar(1,1)
    a.funding(601*U+7)
    for value in [1,2,100*U,501*U+4]: b.funding(value)
    assert (a.short.free_short,a.current,a.next,a.phase)==(b.short.free_short,b.current,b.next,b.phase)
    for win in [False,True]:
        c = Calendar(1,1,1)
        c.funding(100*U,'NEXT');c.funding(200*U,'CURRENT');c.buy(100*U)
        c.monthly_start(MONTH);c.funding(60*U)
        # Deterministic fixture outcomes, never production RNG substitution.
        class Outcome:
            def randrange(self,n): return 0 if win else n-1
            def choice(self,items): return items[0]
        c.rng = Outcome();c.monthly_finish(MONTH+STEP);c.check()
        assert c.current == (130 if win else 230)*U
        assert c.next == (0 if win else 100)*U
        assert c.month_at == MONTH*2+STEP
    c = Calendar(1,1);c.buy(100*U);c.tick(STEP)
    assert c.minted==1 and c.short_consumed==0 and c.short.wallets[0].entries==1
    c.funding(1000*U,'CURRENT');c.tick(MONTH)
    assert c.month_pending is None and c.short.wallets[0].monthly==1  # Next not funded.
    d = Calendar(1,1,3);d.funding(100*U,'SHORT');d.buy(100*U);d.tick(STEP)
    d.buy(50*U);d.buy(50*U);d.funding(30*U,'SHORT');d.tick(STEP*2)
    assert d.short.pending.budget==100*U and d.short.wallets[0].entries==1
    assert d.minted==2 and d.short_consumed==0
    d.tick(STEP*4)
    assert d.short_consumed==1 and d.short.wallets[0].entries==1 and d.short.next_at==STEP*5


if __name__ == '__main__':
    checks()
    rows = [simulate(s,seed,order) for s in SCENARIOS for seed in range(20) for order in [False,True]]
    print(json.dumps({'schema':'candidate-calendar-v1','approved':False,'days':120,
                     'seeds':20,'scenarios':SCENARIOS,
                     'limits':['6h observation grid','instant conversion','20 seeded samples per order, not probability bounds',
                               'paid fields mean assigned claimable rewards, not executed claims',
                               'no gas, price impact, finality, network failure or claim transactions',
                               'fixed cohort and synthetic BUY distribution; not farming profitability'],
                     'rows':rows},indent=2))
