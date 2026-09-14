"""Paired offline seven-day cash-flow sweeps. No rates here are production facts."""
import argparse
from dataclasses import replace
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import random
from statistics import mean

from short_economy import Allocation, USDG
from short_model_legacy import Rules, State, Wallet, custody, freeze, fund, settle

PROFILES = {
    'steady': ([20000]*7, False, Fraction(1,200)),
    'decay': ([40000,30000,20000,15000,10000,5000,2000], False, Fraction(1,200)),
    'whale': ([20000]*7, True, Fraction(1,200)),
    'stop': ([40000,10000,0,0,0,0,0], False, Fraction(1,200)),
    'low-fee-delay': ([20000]*7, False, Fraction(1,400)),
    'rich': ([200000]*7, False, Fraction(1,200)),
}


def quantile(values, p):
    if not values: return None
    values = sorted(values)
    return values[round((len(values)-1)*p)]


def budget_for(free, minimum, policy):
    if free < minimum: return None
    if policy == 'minimum': return minimum
    if policy == 'all': return free
    if policy == 'buffer': return max(minimum,free-minimum)
    raise ValueError('unknown policy')


def events(profile, seed):
    """Materialize once; trade randomness is independent of draw randomness."""
    volumes, whale, rate = PROFILES[profile]
    rng = random.Random(seed)
    initial_carry = tuple(rng.randrange(100*USDG) for _ in range(60))
    result = []
    for block in range(28):
        day = block//4
        turnover = volumes[day]*USDG//4
        buy_share = Fraction(max(20,60-5*day),100) if profile in ('decay','stop') else Fraction(3,5)
        buy = int(turnover*buy_share)
        # Persistent unequal core plus episodic buyers. Entry source is always real scenario BUY.
        weights = [rng.randint(1,10)*(6 if i<10 else 1) if rng.random()<.7 else 0 for i in range(60)]
        weights[0] = 300 if whale else 20
        total = sum(weights)
        purchases = [buy*w//total for w in weights]
        purchases[block%60] += buy-sum(purchases)
        result.append(((block+1)*6,turnover,tuple(purchases)))
    return initial_carry,tuple(result),rate,2 if profile=='low-fee-delay' else 0


def run(stream, k, h_e, policy, bank, seed, tiered=False, luck_enabled=True):
    carry, timeline, rate, delay = stream
    carry = list(carry)
    historical_carry = sum(carry)
    allocation = Allocation()
    s,_,_ = allocation.general(bank*USDG)
    state = State(s,tuple(Wallet(f'w{i:02}') for i in range(60)))
    weights = (7,5,2,2,1,1,1,1,1,1) if tiered else (1,)*k
    if tiered and k != 10: raise ValueError('tiered control requires ten seats')
    rules = Rules('experiment',Fraction(2,5),h_e,6,weights,5*USDG,luck_enabled=luck_enabled)
    minimum = sum(weights)*5*USDG
    volume = generated = received = project = entries = buy_total = 0
    scheduled = []
    payouts, times, prizes, fills, participants = [],[],[],[],[]
    eligible,played,winners = set(),set(),set()
    oldest = [None]*60
    streaks = [0]*60
    max_streak = 0
    for index,(hour,turnover,purchases) in enumerate(timeline):
        volume += turnover
        buy_total += sum(purchases)
        new_wallets = []
        for i,w in enumerate(state.wallets):
            count,carry[i] = divmod(carry[i]+purchases[i],100*USDG)
            entries += count
            if count:
                eligible.add(w.address)
                if oldest[i] is None: oldest[i] = hour
            new_wallets.append(replace(w,entries=w.entries+count,monthly=w.monthly+count))
        state = replace(state,wallets=tuple(new_wallets))
        total_generated = int(volume*rate)
        scheduled.append((index+delay,total_generated-generated))
        generated = total_generated
        cash = sum(amount for due,amount in scheduled if due<=index)
        scheduled = [(due,amount) for due,amount in scheduled if due>index]
        received += cash
        new_project = received//10
        short,_,_ = allocation.general(cash-(new_project-project))
        project = new_project
        state = fund(state,short)
        d = budget_for(state.free_short,minimum,policy)
        if d is not None and hour*3600>=state.next_at and any(w.entries for w in state.wallets):
            frozen = freeze(state,hour*3600,d,rules)
            # Same event-time seed across policies; no draws consume the event generator.
            draw_seed = int.from_bytes(hashlib.sha256(f'{seed}:{hour}'.encode()).digest(),'big')
            state,result = settle(frozen,frozen.pending.draw_id,hour*3600,draw_seed)
            payouts.append(result.awarded/USDG)
            times.append(hour)
            fills.append(sum(bool(o.prize) for o in result.outcomes)/k)
            participants.append(len(result.outcomes))
            for o in result.outcomes:
                i = int(o.address[1:])
                oldest[i] = None
                played.add(o.address)
                if o.prize:
                    winners.add(o.address)
                    prizes.append(o.prize/USDG)
                    streaks[i]=0
                else: streaks[i]+=1
                max_streak=max(max_streak,streaks[i])
        assert bank*USDG+received == project+allocation.current+allocation.next+custody(state)
        assert historical_carry+buy_total == entries*100*USDG+sum(carry)
    horizon=timeline[-1][0]
    gaps=[b-a for a,b in zip(times,times[1:])]
    return dict(draws=len(times),first_hour=times[0] if times else None,
                gap_p95=quantile(gaps,.95),tail_hours=horizon-(times[-1] if times else 0),
                oldest_open_hours=max((horizon-t for t in oldest if t is not None),default=0),
                paid=sum(payouts),prize_median=quantile(prizes,.5),prize_max=max(prizes,default=0),
                fill=mean(fills) if fills else None,unique=len(winners),never_won=len(played-winners),
                eligible_never_won=len(eligible-winners),repeat_assignments=len(prizes)-len(winners),
                max_loss_streak=max_streak,free_short=state.free_short/USDG,project=project/USDG,
                received=received/USDG,pending_revenue=sum(a for _,a in scheduled)/USDG,
                short_entries_open=sum(w.entries for w in state.wallets),monthly_entries=entries)


def aggregate(runs):
    output={}
    for field in runs[0]:
        values=[r[field] for r in runs if r[field] is not None]
        output[field]=dict(mean=mean(values) if values else None,p10=quantile(values,.1),
                           p50=quantile(values,.5),p90=quantile(values,.9),observed=len(values))
    return output


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seeds',type=int,default=20)
    parser.add_argument('--output',type=Path,default=Path('research/short-sweep.json'))
    args=parser.parse_args()
    if args.seeds<2: parser.error('at least two seeds required')
    seeds=list(range(20260914,20260914+args.seeds))
    rows=[]
    for profile in PROFILES:
        streams=[events(profile,s) for s in seeds]
        for bank in (0,400):
            for k in (5,10,20):
                for h_e in (3,1):
                    for policy in ('minimum','all','buffer'):
                        runs=[run(stream,k,h_e,policy,bank,seed) for stream,seed in zip(streams,seeds)]
                        rows.append(dict(profile=profile,bank=bank,k=k,h_e=h_e,policy=policy,
                                         basket='equal',metrics=aggregate(runs)))
            for h_e in (3,1):
                for policy in ('minimum','all','buffer'):
                    runs=[run(stream,10,h_e,policy,bank,seed,True) for stream,seed in zip(streams,seeds)]
                    rows.append(dict(profile=profile,bank=bank,k=10,h_e=h_e,policy=policy,
                                     basket='tiered',metrics=aggregate(runs)))
        print('completed',profile,flush=True)
    report=dict(schema=1,seeds=seeds,horizon_hours=168,rows=rows,
                assumptions=['Synthetic paired six-hour events, same bank/rates/carry/trades for all policies within profile+seed.',
                             'Rates .5% effective USDG, .25% with 12h lag in low-fee-delay; not verified PAIR rates.',
                             'Project 10%; prize GENERAL 3:2:1; Next 100; all shares experimental for creator revenue.',
                             'Initial carry is historical BUY credit, not new funding; begins with no ready entries or Luck.',
                             '60 wallet identifiers; unequal purchases and episodic activity, no identity/market-price model.',
                             'Equal baskets minimum $5 per seat; tiered K10 minimum $110, shape and threshold both differ.',
                             'paid means assigned fully funded awards, held claimable; withdrawal timing is not modeled.',
                             'gap metrics omit runs with fewer than two draws: observe count, tail and oldest open alongside.',
                             'prize_median aggregates per-run medians, not a pooled prize distribution; no confidence intervals.',
                             'No operating costs, monthly draw or RNG delay; seven-day horizon is not long-term sustainability.'])
    args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('saved',args.output,'runs',len(rows)*len(seeds))


if __name__=='__main__': main()
