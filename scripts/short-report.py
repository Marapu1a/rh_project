"""Reproducible parameter experiments, not approved settings or profit forecasts."""
import argparse
from dataclasses import asdict, replace
from fractions import Fraction
import json
from pathlib import Path
import random

from short_model_legacy import Rules, State, Wallet, freeze, settle, fund, custody

USDG = 1_000_000


def experiment(rules, scenario, rounds, seed, budget):
    count, entries, initial_luck, whale = scenario
    wallets = tuple(Wallet(f"w{i:04}", luck=initial_luck) for i in range(count))
    state = State(0, wallets)
    rng = random.Random(seed)
    wins = {w.address: 0 for w in wallets}
    streaks = dict(wins)
    waits = []
    admitted = awarded = settled = skipped = max_streak = no_winner = 0
    now = 0
    for _ in range(rounds):
        # Explicit experimental policy: inject one D into Short and new entries each round.
        state = fund(state, budget)
        state = replace(state, wallets=tuple(replace(w, entries=w.entries+(whale if i == 0 and whale else entries),
                                                     monthly=w.monthly+(whale if i == 0 and whale else entries))
                                            for i, w in enumerate(state.wallets)))
        frozen = freeze(state, now, budget, rules)
        if not frozen.pending:
            skipped += 1
            now += 21600
            continue
        state, result = settle(frozen, frozen.pending.draw_id, now, rng.getrandbits(128))
        settled += 1
        now = state.next_at
        awarded += result.awarded
        no_winner += int(not result.awarded)
        for o in result.outcomes:
            admitted += o.admitted
            if o.prize:
                wins[o.address] += 1
                waits.append(streaks[o.address]+1)
                streaks[o.address] = 0
            else:
                streaks[o.address] += 1
                max_streak = max(max_streak, streaks[o.address])
        assert custody(state) == (_+1)*budget
    waits.sort()
    return dict(settled=settled, skipped=skipped, participants=count,
                entries_per_wallet_per_round=entries, initial_luck=initial_luck,
                first_wallet_entries_override=whale or None,
                admission_rate=admitted/(settled*count) if settled else 0,
                mean_winners=sum(wins.values())/settled if settled else 0,
                no_winner_draws=no_winner, awarded_raw=awarded, free_short_raw=state.free_short,
                claimable_raw=sum(w.claimable for w in state.wallets),
                spend_fraction=awarded/(rounds*budget) if budget else 0,
                wallets_never_won=sum(n == 0 for n in wins.values()),
                max_observed_loss_streak=max_streak,
                completed_wait_p50=waits[len(waits)//2] if waits else None,
                completed_wait_p95=waits[min(len(waits)-1, int(len(waits)*.95))] if waits else None,
                first_wallet_win_rate=wins[wallets[0].address]/settled if settled else 0)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rounds', type=int, default=300)
    parser.add_argument('--seed', type=int, default=20260914)
    parser.add_argument('--budget-raw', type=int, default=100*USDG)
    parser.add_argument('--p-max', default='2/5')
    parser.add_argument('--h-e', type=int, default=3)
    parser.add_argument('--h-l', type=int, default=6)
    parser.add_argument('--weights', default='1,1,1,1,2,2,3,5')
    parser.add_argument('--min-prize-raw', type=int, default=USDG)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.rounds < 1 or args.budget_raw < 0 or args.seed < 0:
        parser.error('positive rounds, nonnegative budget and seed required')
    base = Rules('experimental-base', Fraction(args.p_max), args.h_e, args.h_l,
                 tuple(map(int, args.weights.split(','))), args.min_prize_raw)
    variants = [base, replace(base, version='experimental-faster-luck', h_l=max(1,base.h_l//3)),
                replace(base, version='experimental-slower-luck', h_l=base.h_l*3)]
    scenarios = {'few': (3,1,0,0), 'ordinary': (100,1,0,0),
                 'high-luck-crowd': (500,1,100,0), 'one-large-buyer': (100,1,0,100),
                 'many-small-wallets': (1000,1,0,0)}
    rows = []
    for rules in variants:
        for name, scenario in scenarios.items():
            rows.append(dict(variant=rules.version, scenario=name, budget_raw=args.budget_raw,
                             **experiment(rules, scenario, args.rounds, args.seed, args.budget_raw)))
    for name, budget in [('tiny-budget', 1), ('large-external-funding', args.budget_raw*100)]:
        rows.append(dict(variant=base.version, scenario=name, budget_raw=budget,
                         **experiment(base, scenarios['ordinary'], args.rounds, args.seed, budget)))
    report = dict(schema=1, seed=args.seed, rounds=args.rounds, rules=[asdict(r) for r in variants],
                  assumptions=['All settings are experimental, not approved.',
                               'Each round adds D of already allocated Short funding and fresh eligible entries.',
                               'Remainders accumulate; claims stay unpaid; D is a fixed scenario input.',
                               'No trading costs, economic profit, general funding allocation, monthly draw or gas modeled.',
                               'Wait quantiles exclude unfinished waits; never-won and max streak include unfinished waits.',
                               'Seeded Python RNG is for local experiments only.'], rows=rows)
    encoded = json.dumps(report, default=str, indent=2)+'\n'
    if args.output:
        args.output.write_text(encoded, encoding='utf-8')
    print('variant | scenario | winners/draw | spent | never won | max loss streak')
    for row in rows:
        print(f"{row['variant']} | {row['scenario']} | {row['mean_winners']:.2f} | "
              f"{row['spend_fraction']:.1%} | {row['wallets_never_won']} | {row['max_observed_loss_streak']}")


if __name__ == '__main__':
    main()
