"""Offline, unapproved Infinity product candidate; no RPC, deployments or production RNG.
Reuses legacy Calendar funding/carry and Short model, overrides old fee/budget assumptions.
Run: python scripts/infinity-product-model.py > .local/logs/infinity-product-model.json
"""
import importlib.util
import json
from dataclasses import replace
from pathlib import Path
from fractions import Fraction
from short_model import freeze, basket

spec = importlib.util.spec_from_file_location('calendar_model', Path(__file__).with_name('mvp-calendar-model.py'))
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)
U, STEP = legacy.U, legacy.STEP
CAP = 1000*U
MONTH_MIN = 100*U

class Candidate(legacy.Calendar):
    def __init__(self, count, seed):
        super().__init__(count, seed)
        self.ops = self.team = self.dust = 0
        self.short = replace(self.short, next_at=STEP)

    def revenue(self, amount):
        before = self.creator
        self.creator += amount
        # Same cumulative floors as InfinityCollector, one campaign, no rollover.
        parts = [self.creator*b//10000-before*b//10000 for b in (9000,500,500)]
        self.ops += parts[1]
        self.team += parts[2]
        self.dust = self.creator - sum(self.creator*b//10000 for b in (9000,500,500))
        self.funding(parts[0])

    def short_start(self, now):
        if self.short.pending or now < self.short.next_at:
            return
        self.short = freeze(self.short, now, min(self.short.free_short, CAP), legacy.RULES)
        if self.short.pending:
            self.short_due = now
            self.short_finish(now)

    def short_finish(self, now):
        participants = self.short.pending.participants
        before = [w.claimable for w in self.short.wallets]
        super().short_finish(now)
        awards = [w.claimable-old for w,old in zip(self.short.wallets,before) if w.claimable > old]
        self.events[-1].update(wallets=len(participants), winners=len(awards), awards=awards)

    def monthly_start(self, now):
        if self.current >= MONTH_MIN:
            super().monthly_start(now)

    def check(self):
        super().check()
        assert self.creator == self.creator*9000//10000+self.ops+self.team+self.dust
        assert self.dust in (0,1,2)

SCENARIOS = [
 dict(name='quiet',volume=500,wallets=5),
 dict(name='regular',volume=5000,wallets=20),
 dict(name='busy',volume=50000,wallets=100),
 dict(name='burst',volume=5000,wallets=20,burst=True),
 dict(name='sponsor_general',volume=500,wallets=5,sponsor='GENERAL'),
 dict(name='sponsor_short',volume=500,wallets=5,sponsor='SHORT'),
 dict(name='no_eligible',volume=5000,wallets=20,eligible=False),
 dict(name='stop_day10',volume=5000,wallets=20,stop=10),
]

def run(s, seed):
    c=Candidate(s['wallets'],seed)
    for tick in range(1,241):  # 60 days, idealized immediate settlement
        day=Fraction(tick,4)
        v=s['volume']*U//4 if day <= s.get('stop',60) else 0
        if s.get('burst') and 10 < day <= 11: v*=50
        c.revenue(v*300//10000) # hypothetical realized revenue at 3% of defined fee base
        if s.get('eligible',True): c.buy(v//4) # 50% BUY * 50% supported; uniform cohort/carry
        if tick==4 and s.get('sponsor'): c.funding(1000*U,s['sponsor'])
        c.tick(tick*STEP)
    shorts=[e for e in c.events if e['kind']=='short']
    months=[e for e in c.events if e['kind']=='monthly']
    awards=[a/U for e in shorts for a in e['awards']]
    return dict(seed=seed,short_draws=len(shorts),first_short_day=shorts[0]['hour']/24 if shorts else None,
        short_winners=sum(e['winners'] for e in shorts),short_no_win=sum(e['paid']==0 for e in shorts),
        short_claimable=sum(e['paid'] for e in shorts)/U,short_prize_range=[min(awards),max(awards)] if awards else [],
        monthly_draws=len(months),monthly_wins=sum(e['paid']>0 for e in months),monthly_claimable=c.month_claimable/U,
        free_short=c.short.free_short/U,current=c.current/U,next=c.next/U,ops=c.ops/U,team=c.team/U,
        first_short=shorts[0] if shorts else None)

def main():
    # Accounting corner checks, independent of random calendar samples.
    a,b=Candidate(1,0),Candidate(1,0)
    a.revenue(100000003)
    for n in (1,2,100000000): b.revenue(n)
    assert (a.prize_in,a.ops,a.team,a.dust,a.phase)==(b.prize_in,b.ops,b.team,b.dust,b.phase)
    a.check();b.check()
    for d in (100*U,100*U+1,200*U,1000*U):
        prizes=basket(d,legacy.RULES)
        assert len(prizes)==10 and min(prizes)>=5*U and 0<=d-sum(prizes)<20
    assert not basket(100*U-1,legacy.RULES)
    assert CAP>=sum(legacy.RULES.weights)*legacy.RULES.min_prize
    rows={s['name']:[run(s,seed) for seed in range(20)] for s in SCENARIOS}
    print(json.dumps(dict(schema='infinity-product-candidate-v1',approved=False,days=60,seeds=20,
        assumptions=dict(creatorRateBps=300,eligibleShareOfVolume='1/4',shortCapRaw=str(CAP),monthlyMinRaw=str(MONTH_MIN)),
        scenarios=SCENARIOS,limits=['synthetic fee base, not forecast of realized PAIR revenue','fixed cohorts/uniform BUY',
        '6h grid; immediate settlement and funding; no gas/finality/outages',
        'Python RNG is not drand; claimable is not an executed payment','not a farming profitability proof'],rows=rows),indent=2))
if __name__=='__main__': main()
