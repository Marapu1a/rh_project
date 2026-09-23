"""Offline, single-draw expectation sweep; candidate parameters, not contract RNG.
Run: python scripts/mvp-economic-sweep.py > .local/logs/mvp-economic-sweep.json
No RPC. Probabilities below are floating-point analytic expectations, not simulations.
"""
import json
import math


def binomial(n, p):
    return [math.comb(n, k) * p**k * (1-p)**(n-k) for k in range(n+1)]


def expectation(honest, attackers, entries_each, budget, places, cap):
    # Honest wallets each have one entry. Independent admission, uniform winners,
    # independently shuffled prize positions; budget must build a complete basket.
    h = binomial(honest, cap / 2)
    a = binomial(attackers, cap * entries_each / (entries_each + 1))
    wins = paid = 0.0
    for nh, ph in enumerate(h):
        for na, pa in enumerate(a):
            count = nh + na
            if count:
                awarded = min(count, places)
                wins += ph * pa * awarded
                paid += ph * pa * awarded * na / count * budget / places
    return {'expected_winners': wins, 'expected_total_paid': wins * budget / places,
            'expected_attacker_paid': paid, 'no_winner_probability': h[0] * a[0]}


def run():
    # Sanity checks: one wallet; saturated competition symmetry; no attackers;
    # payout conservation bounds. This does not test bytecode or random generation.
    solo = expectation(0, 1, 1, 100, 10, .4)
    assert math.isclose(solo['expected_attacker_paid'], 2)
    symmetric = expectation(9, 1, 1, 100, 10, .4)
    assert math.isclose(symmetric['expected_attacker_paid'], symmetric['expected_total_paid']/10)
    assert expectation(20, 0, 1, 100, 10, .4)['expected_attacker_paid'] == 0
    rows = []
    for honest in [0, 20, 100]:
        for wallets in [1, 2, 5, 10]:
            entries = 10 // wallets  # Same 1000 USDG eligible BUY, split differently.
            for short in [100, 500, 1000]:
                s = expectation(honest, wallets, entries, short, 10, .4)
                for jackpot in [100, 1000]:
                    m = expectation(honest, wallets, entries, jackpot, 1, .1)
                    assert 0 <= s['expected_attacker_paid'] <= s['expected_total_paid'] + 1e-8 <= short + 2e-8
                    assert 0 <= m['expected_attacker_paid'] <= m['expected_total_paid'] + 1e-8 <= jackpot + 2e-8
                    rows.append({'honest_wallets': honest, 'attack_wallets': wallets,
                                 'entries_per_attack_wallet': entries, 'short_budget': short,
                                 'jackpot_budget': jackpot, 'short': s, 'monthly': m})
    funding = []
    for rate in [.0005, .002, .005]:
        for volume in [5000, 25000, 100000]:
            revenue = volume * rate
            funding.append({'volume_per_day': volume, 'net_creator_rate': rate,
                            'project_per_day': revenue*.1, 'short_per_day': revenue*.45,
                            'days_to_first_100_short': 100/(revenue*.45)})
    return {'schema': 'mvp-economic-candidate-v1', 'approved': False,
            'method': 'analytic independent binomial admission; uniform allocation; floats',
            'assumptions': {'attack_eligible_buy': 1000, 'honest_entries_each': 1,
                            'short_cap': .4, 'monthly_cap': .1, 'half_saturation_entries': 1,
                            'cost_comparison_only': '1000 BUY + approximately 1000 SELL at hypothetical 0.5% per side = 10; gas/impact/inventory risk excluded',
                            'scope': 'one Short and one Monthly, conditional on both being ready; no calendar/funding/finality simulation; budgets supplied externally, not derived from attack trading'},
            'funding_sensitivity': funding, 'cases': rows}


if __name__ == '__main__':
    print(json.dumps(run(), indent=2))
