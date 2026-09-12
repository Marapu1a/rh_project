"""Summarize observed fork values. No estimated reward schedule or synthetic successful trades."""
import csv
import json
from decimal import Decimal, getcontext
from pathlib import Path

getcontext().prec = 40
root = Path(__file__).resolve().parents[1]
data = json.loads((root / 'research/economics-fork-2026-09-12.json').read_text(encoding='utf-8'))
rows = []
for scenario in data.get('scenarios', []):
    legs = scenario.get('legs', [])
    gross = sum(-int(leg['quoteDeltaRaw']) for leg in legs if leg['direction'] == 'BUY')
    returned = sum(int(leg['quoteDeltaRaw']) for leg in legs if leg['direction'] == 'SELL')
    token_fees = sum(int(leg['creatorFeesRaw']['TOKEN']) for leg in legs)
    quote_fees = sum(int(leg['creatorFeesRaw']['USDG']) for leg in legs)
    gas = sum(int(leg['gasUnits']) for leg in legs)
    complete = scenario.get('status') == 'complete'
    if complete:
        assert sum(int(leg['tokenDeltaRaw']) for leg in legs) == 0, 'Open TOKEN inventory cannot be called a completed round trip'
        assert gross // 100_000_000 == int(scenario['entries'])
    rows.append({
        'scenario': scenario['name'], 'status': scenario.get('status'),
        'gross_buy_USDG': str(Decimal(gross)/10**6),
        'quote_returned_USDG': str(Decimal(returned)/10**6) if complete else '',
        'round_trip_loss_USDG_excluding_gas': str(Decimal(gross-returned)/10**6) if complete else '',
        'hypothetical_entries': gross//100_000_000,
        'carry_USDG': str(Decimal(gross%100_000_000)/10**6),
        'creator_TOKEN_inventory': str(Decimal(token_fees)/10**18),
        'creator_USDG': str(Decimal(quote_fees)/10**6),
        'swap_execution_gas_units': gas,
        'loss_USDG_per_entry_excluding_gas': str(Decimal(gross-returned)/10**6/(gross//100_000_000)) if complete and gross>=100_000_000 else '',
        'error': scenario.get('error',''),
    })
if not rows:
    raise SystemExit('No observed scenarios to summarize')
with (root/'research/economics-2026-09-12.csv').open('w',encoding='utf-8-sig',newline='') as handle:
    writer=csv.DictWriter(handle,fieldnames=rows[0].keys());writer.writeheader();writer.writerows(rows)
print(json.dumps(rows,indent=2,ensure_ascii=False))
