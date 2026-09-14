"""Offline cash-flow scenario; assumed realized revenue, not a DEX price model."""
import argparse
from dataclasses import asdict, dataclass
from fractions import Fraction
import json
from pathlib import Path
import random

from short_model import Rules, State, Wallet, add_entries, claim, custody, freeze, fund, settle

USDG = 1_000_000


@dataclass(frozen=True)
class Config:
    daily_volumes: tuple = (10000, 20000, 40000)
    initial_external: int = 400
    wallets: int = 60
    buy_share: Fraction = Fraction(3, 5)
    revenue_rate: Fraction = Fraction(1, 200)
    project_share: Fraction = Fraction(1, 10)
    conversion_delay_blocks: int = 0
    seed: int = 20260914

    def __post_init__(self):
        for name in ('initial_external', 'conversion_delay_blocks', 'seed'):
            if type(getattr(self, name)) is not int or getattr(self, name) < 0:
                raise ValueError(name)
        if type(self.wallets) is not int or self.wallets < 1:
            raise ValueError('wallets')
        if not self.daily_volumes or any(type(v) is not int or v < 0 for v in self.daily_volumes):
            raise ValueError('daily volumes')
        for name in ('buy_share', 'revenue_rate', 'project_share'):
            if not isinstance(getattr(self, name), Fraction) or not 0 <= getattr(self, name) <= 1:
                raise ValueError(name)


class Allocation:
    """Same six-unit GENERAL order as funding design; one shared phase."""
    def __init__(self):
        self.short = self.current = self.next = self.phase = 0

    def general(self, amount):
        groups, tail = divmod(amount, 6)
        s, c, n = groups*3, groups*2, groups
        for i in range(tail):
            slot = (self.phase+i) % 6
            if slot in (0,2,4): s += 1
            elif slot in (1,3): c += 1
            else: n += 1
        self.phase = (self.phase+tail) % 6
        accepted = min(n,100*USDG-self.next)
        c += n-accepted
        self.short += s
        self.current += c
        self.next += accepted
        assert s+c+accepted == amount
        return s,c,accepted


def simulate(config):
    alloc = Allocation()
    startup = alloc.general(config.initial_external*USDG)
    state = State(startup[0],tuple(Wallet(a) for a in sorted(f'w{i:03}' for i in range(config.wallets))))
    carry = [0]*config.wallets
    rng = random.Random(config.seed)
    rules = Rules('EXPERIMENT-ten-seats',Fraction(2,5),3,6,(7,5,2,2,1,1,1,1,1,1),5*USDG)
    minimum = sum(rules.weights)*rules.min_prize  # 110 USDG; all free Short selected
    pending = []
    cumulative_volume = cumulative_buy = buy_delivered = 0
    revenue_generated = revenue_received = project = paid = total_entries = 0
    winners = set()
    rows = []
    for block in range(1,len(config.daily_volumes)*4+1):
        hour = block*6
        volume = config.daily_volumes[(block-1)//4]*USDG//4
        cumulative_volume += volume
        new_buy_total = int(cumulative_volume*config.buy_share)
        buy = new_buy_total-cumulative_buy
        cumulative_buy = new_buy_total
        sell = volume-buy
        # Equal synthetic BUY allocation, rotating raw-unit remainder to avoid losing carry.
        base, tail = divmod(buy,config.wallets)
        entries = 0
        for i,w in enumerate(state.wallets):
            extra = int((i-buy_delivered % config.wallets) % config.wallets < tail)
            carry[i] += base+extra
            count, carry[i] = divmod(carry[i],100*USDG)
            if count:
                state = add_entries(state,w.address,count)
                entries += count
        buy_delivered += buy
        total_entries += entries
        target_revenue = int(cumulative_volume*config.revenue_rate)
        generated = target_revenue-revenue_generated
        revenue_generated = target_revenue
        pending.append((block+config.conversion_delay_blocks,generated))
        received = sum(amount for due,amount in pending if due <= block)
        pending = [(due,amount) for due,amount in pending if due > block]
        revenue_received += received
        new_project = int(revenue_received*config.project_share)
        project_delta = new_project-project
        project = new_project
        s,c,n = alloc.general(received-project_delta)
        state = fund(state,s)
        row = dict(hour=hour,volume_raw=volume,buy_raw=buy,sell_raw=sell,new_entries=entries,
                   revenue_generated_raw=generated,revenue_received_raw=received,
                   project_raw=project_delta,short_funding_raw=s,current_funding_raw=c,next_funding_raw=n,
                   free_short_before_raw=state.free_short,draw=None)
        if state.free_short >= minimum and any(w.entries for w in state.wallets):
            frozen = freeze(state,hour*3600,state.free_short,rules)
            if frozen.pending:
                state,result = settle(frozen,frozen.pending.draw_id,hour*3600,rng.getrandbits(128))
                awards = [{'wallet':o.address,'prize_raw':o.prize} for o in result.outcomes if o.prize]
                winners.update(a['wallet'] for a in awards)
                row['draw'] = dict(id=result.draw_id,participants=len(result.outcomes),
                                   entries=sum(o.entries_consumed for o in result.outcomes),
                                   admitted=sum(o.admitted for o in result.outcomes),
                                   budget_raw=result.budget,basket_raw=list(frozen.pending.prizes),
                                   awards=awards,awarded_raw=result.awarded,returned_raw=result.returned)
                # Scenario assumption: winners claim immediately and successfully.
                for award in awards:
                    state,amount = claim(state,award['wallet'])
                    paid += amount
        row.update(free_short_after_raw=state.free_short,current_raw=alloc.current,next_raw=alloc.next,
                   pending_revenue_raw=sum(a for _,a in pending),
                   reason='draw' if row['draw'] else ('no entries' if not any(w.entries for w in state.wallets) else 'below 110 USDG'))
        assert config.initial_external*USDG+revenue_received == project+custody(state)+alloc.current+alloc.next+paid
        assert cumulative_buy == total_entries*100*USDG+sum(carry)
        rows.append(row)
    return dict(assumptions=['Hypothetical rates and prize settings, not PAIR facts or approved product settings.',
                            'Revenue rate is assumed effective USDG proceeds per turnover, not total pool fee.',
                            'Equal BUY among fixed wallets; all BUY eligible, carry initially zero; SELL creates no entries.',
                            'Events and readiness sampled every six hours, not a production scheduling decision.',
                            'All free Short is selected when it covers the 110 USDG minimum; no exposure cap.',
                            'External startup is GENERAL without project fee; creator prize share uses candidate 3:2:1.',
                            'Conversion delay is a fixed cash-arrival lag, not a swap or TOKEN price model.',
                            'All winners claim immediately; no monthly draw, operating costs, RNG delay or market profit modeled.'],
                config=asdict(config),startup_raw=dict(zip(('short','current','next'),startup)),
                rules=asdict(rules),minimum_budget_raw=minimum,rows=rows,
                totals=dict(volume_raw=cumulative_volume,buy_raw=cumulative_buy,sell_raw=cumulative_volume-cumulative_buy,
                            generated_revenue_raw=revenue_generated,received_revenue_raw=revenue_received,
                            pending_revenue_raw=sum(a for _,a in pending),project_raw=project,
                            short_allocated_raw=alloc.short,current_raw=alloc.current,next_raw=alloc.next,
                            free_short_raw=state.free_short,paid_raw=paid,entries=total_entries,
                            carry_raw=sum(carry),short_entries_open=sum(w.entries for w in state.wallets),
                            monthly_entries=sum(w.monthly for w in state.wallets),
                            draws=sum(r['draw'] is not None for r in rows),unique_winners=len(winners)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--initial-bank',type=int,default=400,help='External GENERAL USDG, no project fee')
    parser.add_argument('--daily-volumes',default='10000,20000,40000')
    parser.add_argument('--revenue-rate',default='1/200',help='Assumed realized USDG per unit turnover')
    parser.add_argument('--wallets',type=int,default=60)
    parser.add_argument('--delay-blocks',type=int,default=0)
    parser.add_argument('--seed',type=int,default=20260914)
    parser.add_argument('--output',type=Path)
    args = parser.parse_args()
    report = simulate(Config(daily_volumes=tuple(map(int,args.daily_volumes.split(','))),
                             initial_external=args.initial_bank,revenue_rate=Fraction(args.revenue_rate),
                             wallets=args.wallets,conversion_delay_blocks=args.delay_blocks,seed=args.seed))
    if args.output:
        args.output.write_text(json.dumps(report,default=str,indent=2)+'\n',encoding='utf-8')
    print('hour | turnover | revenue | project | Short | Current | Next | draw payout | Short left')
    for r in report['rows']:
        payout=r['draw']['awarded_raw']/USDG if r['draw'] else 0
        print(f"{r['hour']:4} | {r['volume_raw']/USDG:8.2f} | {r['revenue_received_raw']/USDG:7.2f} | "
              f"{r['project_raw']/USDG:7.2f} | {r['short_funding_raw']/USDG:6.2f} | "
              f"{r['current_funding_raw']/USDG:7.2f} | {r['next_funding_raw']/USDG:6.2f} | "
              f"{payout:11.2f} | {r['free_short_after_raw']/USDG:10.2f}")
    print(json.dumps(report['totals'],indent=2))


if __name__ == '__main__':
    main()
