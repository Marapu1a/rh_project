import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from fractions import Fraction
import unittest
from short_economy import Allocation, Config, simulate, USDG


class EconomyTests(unittest.TestCase):
    def test_general_split_invariant_and_overflow(self):
        whole,split = Allocation(),Allocation()
        whole.general(1000*USDG+5)
        for amount in (1,2,2,300*USDG,700*USDG): split.general(amount)
        self.assertEqual(vars(whole),vars(split))
        self.assertEqual(whole.next,100*USDG)

    def test_buy_carry_and_sell_only(self):
        report=simulate(Config(daily_volumes=(100,),initial_external=0,wallets=3,buy_share=Fraction(1)))
        self.assertEqual(report['totals']['entries'],0)
        self.assertEqual(report['totals']['carry_raw'],100*USDG)
        sell=simulate(Config(buy_share=Fraction(0)))
        self.assertEqual(sell['totals']['entries'],0)
        self.assertEqual(sell['totals']['draws'],0)
        self.assertGreater(sell['totals']['received_revenue_raw'],0)

    def test_delayed_money_not_spendable(self):
        report=simulate(Config(initial_external=0,conversion_delay_blocks=100))
        self.assertEqual(report['totals']['draws'],0)
        self.assertEqual(report['totals']['received_revenue_raw'],0)
        self.assertEqual(report['totals']['pending_revenue_raw'],350*USDG)

    def test_full_ledger_and_reproducibility(self):
        a=simulate(Config())
        self.assertEqual(a,simulate(Config()))
        t=a['totals']
        self.assertEqual(400*USDG+t['received_revenue_raw'],t['project_raw']+t['current_raw']+t['next_raw']+t['free_short_raw']+t['paid_raw'])
        self.assertEqual(t['monthly_entries'],420)
        self.assertEqual(t['short_allocated_raw'],357500000)
        self.assertEqual(t['project_raw'],35*USDG)
        for row in a['rows']:
            if row['draw']:
                d=row['draw']
                self.assertLessEqual(len(d['awards']),10)
                self.assertEqual(d['awarded_raw']+d['returned_raw'],d['budget_raw'])

    def test_zero_activity_and_invalid_config(self):
        t=simulate(Config(daily_volumes=(0,)))['totals']
        self.assertEqual(t['draws'],0)
        self.assertEqual(t['project_raw'],0)
        for changes in ({'wallets':0},{'conversion_delay_blocks':-1},{'revenue_rate':Fraction(2)}):
            with self.assertRaises(ValueError): Config(**changes)


if __name__ == '__main__': unittest.main()
