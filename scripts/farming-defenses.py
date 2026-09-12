"""Counterexamples to candidate policies; hypothetical rules, no production edits."""
import importlib.util
import json
from decimal import Decimal as D
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('farming', ROOT/'scripts/farming-model.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
a = min((x for x in m.observed_attacks() if x['entries'] == 5), key=lambda x: x['loss'])
cost = a['loss'] + D(1)
others = 100
n = a['entries'] + others
budget = D(1000) + a['own_quote']
rows = []


def add(policy, reward, extra_assumption):
    rows.append(dict(policy=policy, expected_reward_USDG=reward,
                     cost_USDG=cost, profit_EV_USDG=reward-cost,
                     assumption=extra_assumption))


base = budget*a['entries']/n
add('No additional restriction', base, '1000 USDG available externally, 100 other entries, TOKEN payout zero')
add('Minimum 100 total entries', base, '105 total entries already satisfy the minimum')
add('Cap one entry per wallet: one wallet', budget/(others+1), 'Four owned entries excluded; same observed trading loss')
add('Cap one entry per wallet: five wallets', base, 'Conditional same total eligible volume and cost; additional wallet/route costs NOT measured')
add('Release 10% now', base/D(10), 'Other 90% not awarded in this observation horizon')
add('Release 10% in each of ten draws', base, 'Same entries remain eligible in all ten; no discount, added claims, or new participants')
add('Jackpot capped at 1 USDG per total entry', D(a['entries']), 'Available budget sufficient; TOKEN payout zero')
add('Each of two reward layers capped at 1 USDG per entry', D(2*a['entries']), 'Both draws active and funded; TOKEN value hypothetical executable value')
# In this last policy lower gas restores positive EV for the measured attack.
rows.append(dict(policy='Two separate caps, gas excluded', expected_reward_USDG=D(2*a['entries']),
                 cost_USDG=a['loss'], profit_EV_USDG=D(2*a['entries'])-a['loss'],
                 assumption='Counterexample to separately limiting each reward layer'))
assert rows[0]['expected_reward_USDG'] == rows[1]['expected_reward_USDG']
assert rows[0]['expected_reward_USDG'] == rows[3]['expected_reward_USDG']
assert rows[0]['expected_reward_USDG'] == rows[5]['expected_reward_USDG']
assert rows[-1]['profit_EV_USDG'] > 0
report = dict(mode='offline candidate-policy counterexamples',
              source='research/economics-fork-2026-09-12.json',
              attack=a, rows=rows,
              limits='No general safety proof; no wallet-splitting fork or TOKEN liquidation represented here')
(ROOT/'research/farming-defenses-2026-09-12.json').write_text(
    json.dumps(report, default=str, indent=2)+'\n', encoding='utf-8')
print(json.dumps(report, default=str, indent=2))
