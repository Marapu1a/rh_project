import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from fractions import Fraction
from dataclasses import fields
from unittest.mock import patch
import unittest
from short_model import *

class ShortTests(unittest.TestCase):
    def setUp(self):
        self.rules=Rules('current',Fraction(2,5),1,(1,2,5),1)
        self.state=State(101,tuple(Wallet(str(i),2,7,3) for i in range(20)))
    def test_probability_no_history(self):
        self.assertEqual(admission(0,self.rules),0)
        self.assertEqual(admission(1,self.rules),Fraction(1,5))
        for e in (1,2,100,10**50):
            self.assertLess(admission(e,self.rules),self.rules.p_max)
            self.assertGreater(admission(e+1,self.rules),admission(e,self.rules))
        for cls in (Rules,Wallet,Outcome):
            self.assertFalse(any('luck' in f.name for f in fields(cls)))
    def test_pending_entries_and_credits(self):
        frozen=freeze(self.state,0,101,self.rules)
        fresh=add_entries(fund(frozen,10),'0',3)
        done,r=settle(fresh,1,99,123)
        self.assertEqual(custody(done),custody(self.state)+10)
        w=next(w for w in done.wallets if w.address=='0')
        self.assertEqual((w.entries,w.monthly),(3,10))
        self.assertTrue(all(o.entries_consumed==2 for o in r.outcomes))
        self.assertEqual(done.next_at,99+21600)
    def test_conservation(self):
        for seed in range(100):
            done,r=settle(freeze(self.state,0,101,self.rules),1,0,seed)
            self.assertEqual(r.awarded+r.returned,101)
            self.assertEqual(custody(done),custody(self.state))
            self.assertEqual(sum(o.prize>0 for o in r.outcomes),min(3,sum(o.admitted for o in r.outcomes)))
            self.assertTrue(all(w.claimable>=3 for w in done.wallets))
    def test_failure_stale_and_early(self):
        frozen=freeze(self.state,0,101,self.rules)
        with patch('short_model.random.Random',side_effect=RuntimeError):
            with self.assertRaises(RuntimeError): settle(frozen,1,0,1)
        with self.assertRaises(ValueError): settle(frozen,2,0,1)
        with self.assertRaises(ValueError): freeze(frozen,21600,1,self.rules)
        done,_=settle(frozen,1,0,1)
        with self.assertRaises(ValueError): settle(done,1,0,1)
        with self.assertRaises(ValueError): freeze(done,21599,0,self.rules)
    def test_no_win_and_not_ready(self):
        self.assertIs(freeze(self.state,0,7,self.rules),self.state)
        class Reject:
            def randrange(self,n): return n-1
            def shuffle(self,x): pass
        with patch('short_model.random.Random',return_value=Reject()):
            done,r=settle(freeze(self.state,0,101,self.rules),1,0,1)
        self.assertEqual(r.awarded,0)
        self.assertEqual(done.free_short,101)
        self.assertTrue(all(w.entries==0 and w.monthly==7 for w in done.wallets))
    def test_claim(self):
        done,paid=claim(self.state,'0')
        self.assertEqual(custody(done)+paid,custody(self.state))
        self.assertEqual(paid,3)
if __name__=='__main__': unittest.main()
