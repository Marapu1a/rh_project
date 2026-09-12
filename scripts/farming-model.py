"""Offline adversarial sensitivity model, calibrated to saved fork trades.

No simulated trade is presented as executed; no TOKEN spot valuation is used.
Run directly to regenerate CSV/JSON. All budgets and gas are scenario inputs.
"""
import csv
import hashlib
import json
from decimal import Decimal, getcontext
from itertools import product
from math import comb
from pathlib import Path

getcontext().prec = 40
D = Decimal
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'research/economics-fork-2026-09-12.json'


def observed_attacks():
    data = json.loads(SOURCE.read_text(encoding='utf-8'))
    result = []
    for scenario in data['scenarios']:
        if scenario['status'] != 'complete':
            raise ValueError('Incomplete source scenario')
        legs = scenario['legs']
        if sum(int(x['tokenDeltaRaw']) for x in legs) != 0:
            raise ValueError('Round trip has open TOKEN inventory')
        gross = sum(-int(x['quoteDeltaRaw']) for x in legs if x['direction'] == 'BUY')
        entries = gross // 100_000_000
        if entries != int(scenario['entries']):
            raise ValueError('Entry mismatch')
        result.append(dict(
            attack=scenario['name'], entries=entries,
            loss=D(-sum(int(x['quoteDeltaRaw']) for x in legs)) / 10**6,
            own_quote=D(sum(int(x['creatorFeesRaw']['USDG']) for x in legs)) / 10**6,
        ))
    return result


def evaluate(attack, short_others=0, month_others=0, external_quote=D(0),
             short_realized_value=D(0), gas=D(0), own_quote_fraction=D(1)):
    """Symmetric entry-weighted payout. Monthly minimum is unspecified: none assumed.

    short_realized_value is a hypothetical total USDG-equivalent executable payout,
    including any own TOKEN fees. It is NOT derived from observed token inventory.
    external_quote is already available prize money, excluding attacker's fees.
    gas includes all attacker transaction/claim costs as a sensitivity parameter.
    """
    if short_others < 0 or month_others < short_others:
        raise ValueError('Monthly set must include short set in this same-month model')
    if min(external_quote, short_realized_value, gas) < 0 or not 0 <= own_quote_fraction <= 1:
        raise ValueError('Invalid budget or gas')
    a = attack['entries']
    short_n, month_n = a + short_others, a + month_others
    short_runs = short_n >= 30
    short_share = D(a) / short_n if short_runs else D(0)
    month_share = D(a) / month_n if month_n else D(0)
    quote_budget = external_quote + attack['own_quote'] * own_quote_fraction
    short_ev = short_realized_value * a / short_n if short_runs else D(0)
    quote_ev = quote_budget * a / month_n if month_n else D(0)
    cost = attack['loss'] + gas
    # Infimum: equality is break-even, strictly greater is needed for profit.
    threshold = max(D(0), (cost-short_ev)*month_n/a - attack['own_quote']*own_quote_fraction) if a else None
    return dict(attack=attack['attack'], entries=a, short_others=short_others,
                month_others=month_others, external_quote=external_quote,
                short_realized_value=short_realized_value, gas=gas,
                own_quote_fraction=own_quote_fraction, short_runs=short_runs,
                short_share=short_share, month_share=month_share,
                quote_budget=quote_budget, short_ev=short_ev, quote_ev=quote_ev,
                cost=cost, profit_ev=short_ev+quote_ev-cost,
                external_quote_break_even=threshold,
                single_jackpot_profit_probability=month_share if quote_budget > cost else D(0))


def any_short_win(a, others):
    """Candidate: floor(N/3) distinct entries selected uniformly, equal prizes."""
    n = a + others
    if n < 30 or a == 0:
        return D(0)
    k = n // 3
    return D(1) - (D(comb(others, k))/comb(n, k) if others >= k else D(0))


def main():
    attacks = observed_attacks()
    rows = []
    for attack, short_n, month_n, budget, short_value, gas, fraction in product(
        attacks, [0, 25, 29, 100], [0, 25, 29, 100, 1000, 10000],
        map(D, ['0', '10', '100', '1000']), map(D, ['0', '10', '100']),
        map(D, ['0', '0.1', '1', '5']), map(D, ['0', '0.5', '1']),
    ):
        if month_n >= short_n:
            rows.append(evaluate(attack, short_n, month_n, budget, short_value, gas, fraction))
    out = ROOT/'research/farming-sensitivity-2026-09-12.csv'
    with out.open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    one = next(a for a in attacks if a['entries'] == 1)
    five = min((a for a in attacks if a['entries'] == 5), key=lambda a: a['loss'])
    cases = {
        'own_USDG_only': evaluate(five),
        'non_enrolled_fees_100_USDG': evaluate(five, external_quote=D(100), gas=D(1)),
        'organic_100_entries_100_USDG': evaluate(five, 100, 100, D(100), gas=D(1)),
        'carry_25_entries_100_USDG': evaluate(five, 25, 25, D(100), gas=D(1)),
        'external_subsidy_1000_USDG': evaluate(five, 100, 100, D(1000), gas=D(1)),
        'threshold_29_to_30': evaluate(one, 29, 29, D(0), D(100), D(1)),
        'threshold_large_monthly_set': evaluate(one, 29, 10000, D(0), D(100), D(1)),
        'late_month_entry_1000_USDG': evaluate(five, 25, 100, D(1000), gas=D(1)),
    }
    report = dict(source=str(SOURCE.relative_to(ROOT)),
                  source_sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                  mode='offline sensitivity; no new fork transactions',
                  rows=len(rows), cases=cases,
                  threshold_candidate_any_win=any_short_win(1, 29),
                  positive_ev_rows=sum(r['profit_ev'] > 0 for r in rows))
    (ROOT/'research/farming-summary-2026-09-12.json').write_text(
        json.dumps(report, default=str, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, default=str, indent=2))


if __name__ == '__main__':
    main()
