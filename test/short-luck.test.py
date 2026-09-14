import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from dataclasses import replace
from fractions import Fraction
import unittest
from short_model import Rules,Wallet,State,admission,freeze,settle,custody
from short_luck_review import seat_factor
from short_sweep import run,events


class LuckTests(unittest.TestCase):
    def setUp(self):
        self.rules=Rules('test',Fraction(2,5),1,6,(1,)*10,1,luck_enabled=False)

    def test_history_independent_and_no_free_attempt(self):
        for e in (0,1,2,20):
            self.assertEqual(admission(e,0,self.rules),admission(e,1000,self.rules))
        self.assertEqual(admission(0,100,self.rules),0)
        self.assertEqual(admission(1,0,replace(self.rules,h_e=Fraction(1,2))),Fraction(4,15))

    def test_no_luck_settlement_ignores_history_and_clears_luck(self):
        a=State(100,tuple(Wallet(str(i),1,4,0) for i in range(40)))
        b=replace(a,wallets=tuple(replace(w,luck=99) for w in a.wallets))
        da,ra=settle(freeze(a,0,100,self.rules),1,0,42)
        db,rb=settle(freeze(b,0,100,self.rules),1,0,42)
        self.assertEqual([o.prize for o in ra.outcomes],[o.prize for o in rb.outcomes])
        self.assertTrue(all(w.luck==0 and w.monthly==4 for w in db.wallets))
        self.assertEqual(custody(db),100)

    def test_exact_seat_factor(self):
        self.assertEqual(seat_factor([],1),1)
        self.assertEqual(seat_factor([Fraction(1)]*9,1),Fraction(1,10))
        self.assertEqual(seat_factor([Fraction(1,2)],1),Fraction(3,4))
        self.assertEqual(seat_factor([Fraction(1,2)]*9,10),1)

    def test_sweep_default_still_has_luck(self):
        stream=events('steady',42)
        self.assertEqual(run(stream,10,1,'buffer',400,42,True),run(stream,10,1,'buffer',400,42,True,True))
        on=run(stream,10,1,'buffer',400,42,True)
        off=run(stream,10,Fraction(1,2),'buffer',400,42,True,False)
        for key in ('received','project','monthly_entries'): self.assertEqual(on[key],off[key])


if __name__=='__main__': unittest.main()
