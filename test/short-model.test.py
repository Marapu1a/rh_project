import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
from dataclasses import replace
from fractions import Fraction
import unittest
from unittest.mock import patch
from short_model import *


class ShortTests(unittest.TestCase):
    def setUp(self):
        self.rules = Rules('test', Fraction(2,5), 3, 6, (1,2,5), 1)
        self.state = State(101, tuple(Wallet(str(i), 2, 7, 4, 3) for i in range(20)))

    def test_probability_exact_and_monotone(self):
        for e in (0,1,2,100,10**50):
            for luck in (0,1,6,100,10**50):
                q = admission(e,luck,self.rules)
                self.assertLess(q,self.rules.p_max)
                self.assertGreaterEqual(q,0)
                if e:
                    self.assertGreater(admission(e+1,luck,self.rules),q)
                    self.assertGreater(admission(e,luck+1,self.rules),q)
        self.assertEqual(admission(1,0,self.rules),Fraction(1,10))
        self.assertEqual(admission(1,6,self.rules),Fraction(1,4))
        self.assertEqual(admission(0,100,self.rules),0)

    def test_basket_rounding_and_readiness(self):
        for d in range(200):
            b = basket(d,self.rules)
            if b:
                self.assertLessEqual(sum(b),d)
                self.assertLess(d-sum(b),8)
                self.assertTrue(all(p >= 1 for p in b))
            else:
                self.assertLess(d,8)
        self.assertIs(freeze(self.state,0,7,self.rules),self.state)
        empty = State(100,(Wallet('idle',luck=100),))
        self.assertIs(freeze(empty,0,100,self.rules),empty)

    def test_freeze_and_pending_new_entries(self):
        frozen = freeze(self.state,0,99,self.rules)
        self.assertEqual(custody(frozen),custody(self.state))
        fresh = add_entries(fund(frozen,10),'0',3)
        fresh = add_entries(fresh,'new',5)
        self.assertEqual(fresh.pending.participants,frozen.pending.participants)
        done,result = settle(fresh,1,99,123)
        self.assertEqual(custody(done),custody(self.state)+10)
        wallets = {w.address:w for w in done.wallets}
        self.assertEqual(wallets['0'].entries,3)
        self.assertEqual(wallets['0'].monthly,10)
        self.assertEqual(wallets['new'].luck,0)
        self.assertEqual(wallets['new'].entries,5)
        for o in result.outcomes:
            self.assertEqual(o.entries_consumed,2)
            self.assertEqual(o.after_luck,0 if o.prize else 5)
            self.assertEqual(wallets[o.address].claimable,3+o.prize)

    def test_invalid_transitions_and_no_timeout(self):
        frozen = freeze(self.state,0,100,self.rules)
        with self.assertRaises(ValueError): freeze(frozen,999999,1,self.rules)
        with self.assertRaises(ValueError): settle(frozen,2,0,1)
        with self.assertRaises(ValueError): settle(frozen,1,0,-1)
        done,_ = settle(frozen,1,90000,1)
        with self.assertRaises(ValueError): settle(done,1,90000,1)
        done = add_entries(done,'0',1)
        with self.assertRaises(ValueError): freeze(done,done.next_at-1,0,self.rules)
        self.assertEqual(done.next_at,90000+INTERVAL)
        self.assertEqual(frozen.pending.draw_id,1)

    def test_random_outcomes_conservation_and_no_second_weight(self):
        seen_short = seen_overflow = False
        for seed in range(300):
            frozen = freeze(self.state,0,101,self.rules)
            done,result = settle(frozen,1,0,seed)
            admitted = sum(o.admitted for o in result.outcomes)
            winners = [o for o in result.outcomes if o.prize]
            self.assertEqual(len(winners),min(3,admitted))
            self.assertTrue(all(o.admitted for o in winners))
            self.assertEqual(result.returned+result.awarded,101)
            self.assertEqual(custody(done),custody(self.state))
            self.assertEqual(result,settle(frozen,1,0,seed)[1])
            seen_short |= 0 < admitted < 3
            seen_overflow |= admitted > 3
        self.assertTrue(seen_short and seen_overflow)
        tiny = State(101,(Wallet('one',1),))
        amounts = {settle(freeze(tiny,0,101,self.rules),1,0,s)[1].awarded for s in range(500)}
        self.assertEqual(amounts,{0,12,24,60})

    def test_no_win_consumes_attempts_and_idle_luck_unchanged(self):
        state = State(101,(Wallet('active',1,3,9),Wallet('idle',0,4,7)))
        frozen = freeze(state,0,101,self.rules)
        class RejectAll:
            def randrange(self,n): return n-1
            def shuffle(self,items): pass
        with patch('short_model.random.Random',return_value=RejectAll()):
            done,result = settle(frozen,1,0,1)
        self.assertEqual(result.awarded,0)
        self.assertEqual(done.free_short,101)
        self.assertEqual(done.wallets[0],Wallet('active',0,3,10))
        self.assertEqual(done.wallets[1],state.wallets[1])

    def test_rng_failure_preserves_pending_and_all_balances(self):
        frozen = freeze(self.state,0,101,self.rules)
        with patch('short_model.random.Random',side_effect=RuntimeError('unavailable')):
            with self.assertRaises(RuntimeError): settle(frozen,1,0,1)
        self.assertEqual(frozen,freeze(self.state,0,101,self.rules))

    def test_multiple_cycles_keep_unpaid_credits_and_reserve(self):
        state = self.state
        initial = custody(state)
        for i in range(20):
            state = fund(state,101)
            state = add_entries(state,'0',1)
            before = {w.address:w.claimable for w in state.wallets}
            state,result = settle(freeze(state,state.next_at,101,self.rules),
                                  state.next_id,state.next_at,123+i)
            self.assertEqual(custody(state),initial+101*(i+1))
            self.assertTrue(all(w.claimable >= before[w.address] for w in state.wallets))

    def test_input_order_does_not_choose_winners(self):
        reversed_state = replace(self.state,wallets=tuple(reversed(self.state.wallets)))
        self.assertEqual(settle(freeze(self.state,0,101,self.rules),1,0,44)[1],
                         settle(freeze(reversed_state,0,101,self.rules),1,0,44)[1])

    def test_claim_keeps_luck_and_schedule(self):
        done,amount = claim(self.state,'0')
        self.assertEqual(amount,3)
        self.assertEqual(custody(done)+amount,custody(self.state))
        self.assertEqual(done.wallets[0].luck,4)
        self.assertEqual(done.next_at,self.state.next_at)
        with self.assertRaises(ValueError): claim(done,'0')

    def test_invalid_inputs(self):
        for changes in ({'p_max':Fraction(1)}, {'weights':()}, {'weights':(0,)},
                        {'min_prize':0},{'h_l':0},{'h_e':True}):
            with self.assertRaises(ValueError): replace(self.rules,**changes)
        with self.assertRaises(ValueError): State(1,(Wallet('x'),Wallet('x')))
        with self.assertRaises(ValueError): admission(-1,0,self.rules)
        with self.assertRaises(ValueError): freeze(self.state,0,102,self.rules)


if __name__ == '__main__':
    unittest.main()
