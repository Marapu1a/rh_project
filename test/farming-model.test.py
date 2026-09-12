"""Economic invariants; independent hand-computed cases, not contract tests."""
import importlib.util
from pathlib import Path
import unittest
from decimal import Decimal as D

spec = importlib.util.spec_from_file_location('farming', Path(__file__).resolve().parents[1]/'scripts/farming-model.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class FarmingTests(unittest.TestCase):
    def setUp(self):
        self.a = dict(attack='hand calculated', entries=5, loss=D(10), own_quote=D(3))

    def test_external_break_even(self):
        r = m.evaluate(self.a, 25, 25, D(63), gas=D(1))
        self.assertEqual(r['profit_ev'], 0)  # (63+3)*5/30 - 11
        self.assertEqual(r['external_quote_break_even'], 63)

    def test_no_entry_no_award(self):
        self.a['entries'] = 0
        self.assertEqual(m.evaluate(self.a, external_quote=D(1000))['profit_ev'], -10)

    def test_minimum_gate_and_month_independent(self):
        below = m.evaluate(self.a, 24, 100, short_realized_value=D(300))
        above = m.evaluate(self.a, 25, 100, short_realized_value=D(300))
        self.assertEqual(below['short_ev'], 0)
        self.assertEqual(above['short_ev'], 50)
        self.assertEqual(below['quote_ev'], above['quote_ev'])

    def test_budget_not_double_counted(self):
        r = m.evaluate(self.a, external_quote=D(100), own_quote_fraction=D('0.5'))
        self.assertEqual(r['quote_ev'], D('101.5'))
        self.assertEqual(r['short_ev'], 0)

    def test_carried_entries_dilute(self):
        empty = m.evaluate(self.a, external_quote=D(100))
        carried = m.evaluate(self.a, 25, 25, D(100))
        self.assertGreater(empty['profit_ev'], carried['profit_ev'])

    def test_uniform_entry_sybil_conservation(self):
        # Splitting five owned entries between wallets cannot change total EV.
        n, budget = D(30), D(90)
        self.assertEqual(D(5)/n*budget, sum(D(a)/n*budget for a in [1, 1, 3]))
        # Splitting gross BUY with initially empty carries cannot create entries.
        for amounts in ([99, 99, 2], [100, 100], [25, 75, 100], [1]*200):
            self.assertLessEqual(sum(x//100 for x in amounts), sum(amounts)//100)

    def test_exact_short_probability(self):
        self.assertEqual(m.any_short_win(1, 29), D(1)/3)
        self.assertEqual(m.any_short_win(30, 0), 1)
        self.assertEqual(m.any_short_win(1, 28), 0)

    def test_source_roundtrips(self):
        attacks = m.observed_attacks()
        five = min((a for a in attacks if a['entries'] == 5), key=lambda a: a['loss'])
        self.assertEqual(five['loss'], D('9.318078'))
        self.assertEqual(five['own_quote'], D('3.499999'))

    def test_invalid_inputs(self):
        with self.assertRaises(ValueError):
            m.evaluate(self.a, 30, 29)
        with self.assertRaises(ValueError):
            m.evaluate(self.a, gas=D(-1))


if __name__ == '__main__':
    unittest.main()
