"""Paired Luck ablation and exact fixed-environment final prize probability."""
import argparse
from dataclasses import replace
from fractions import Fraction
import json
from pathlib import Path

from short_model_legacy import Rules, admission
from short_sweep import PROFILES, aggregate, events, run

VARIANTS = {'luck': (True,1), 'no-luck': (False,1), 'no-luck-higher-base': (False,Fraction(1,2))}


def seat_factor(probabilities, seats):
    """Exact Poisson-binomial count for other wallets; unbiased matching."""
    if seats < 1: raise ValueError('positive seats required')
    distribution=[Fraction(1)]
    for q in probabilities:
        if not 0<=q<=1: raise ValueError('invalid probability')
        nxt=[Fraction(0)]*(len(distribution)+1)
        for m,p in enumerate(distribution):
            nxt[m]+=p*(1-q)
            nxt[m+1]+=p*q
        distribution=nxt
    return sum(p*min(Fraction(1),Fraction(seats,m+1)) for m,p in enumerate(distribution))


def counterfactual():
    rules=Rules('counterfactual',Fraction(2,5),1,6,(1,)*10,1)
    rows=[]
    # Others frozen at the SAME probabilities even when changing focal wallet rules.
    for other_luck in (0,6,20):
        others=[admission(1,other_luck,rules)]*59
        factor=seat_factor(others,10)
        for name,(enabled,h_e) in VARIANTS.items():
            focal=replace(rules,h_e=h_e,luck_enabled=enabled)
            for e in (1,2,5,20):
                for luck in (0,1,3,6,20):
                    q=admission(e,luck,focal)
                    rows.append(dict(other_luck=other_luck,variant=name,entries=e,luck=luck,
                                     admission=float(q),final_prize_probability=float(q*factor)))
    return rows


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seeds',type=int,default=40)
    parser.add_argument('--output',type=Path,default=Path('research/short-luck-review.json'))
    args=parser.parse_args()
    if args.seeds<2: parser.error('at least two seeds')
    seeds=list(range(20260914,20260914+args.seeds))
    rows=[]
    for profile in PROFILES:
        streams=[events(profile,s) for s in seeds]
        for bank in (0,400):
            paired={}
            for name,(enabled,h_e) in VARIANTS.items():
                results=[run(stream,10,h_e,'buffer',bank,seed,True,enabled)
                         for stream,seed in zip(streams,seeds)]
                paired[name]=results
                rows.append(dict(profile=profile,bank=bank,variant=name,metrics=aggregate(results)))
            # Paired differences, not claims of significance from unpaired average differences.
            for row in rows[-3:]:
                differences=[]
                for base,other in zip(paired['luck'],paired[row['variant']]):
                    differences.append({field:other[field]-base[field] for field in
                                        ('paid','draws','unique','repeat_assignments','eligible_never_won','tail_hours')})
                row['delta_vs_luck']=aggregate(differences)
        print('completed',profile,flush=True)
    report=dict(seeds=seeds,rows=rows,counterfactual=counterfactual(),assumptions=[
        'Same seven-day streams and assumptions as short_sweep; 60 fixed wallets, 10 tiered seats, buffer D.',
        'Cap .4 unchanged; h_e=1 gives base .2, h_e=.5 gives base 4/15. h_l=6 with Luck.',
        'No-Luck ignores history for admission and leaves Luck zero after settlement; not adopted product rules.',
        'Counterfactual fixes other wallets AND K; only the focal wallet changes. Not a whole-system no-Luck forecast.',
        'No actual late-arriving cohort in lifecycle: beginner disadvantage tested at equal entries in a fixed environment.',
        'All rates hypothetical; awards held claimable, no actual claims or production transactions.',
        '40 seeds, empirical paired delta quantiles, not confidence intervals or a universal optimality proof.'
    ])
    args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('runs',len(rows)*len(seeds),'saved',args.output)


if __name__=='__main__': main()
