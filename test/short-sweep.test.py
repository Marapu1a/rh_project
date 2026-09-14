import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import unittest
from short_sweep import budget_for, events, run, aggregate


class SweepTests(unittest.TestCase):
    def test_budget_boundaries(self):
        for free in range(301):
            for policy in ('minimum','all','buffer'):
                d=budget_for(free,100,policy)
                if free<100: self.assertIsNone(d)
                else:
                    self.assertGreaterEqual(d,100)
                    self.assertLessEqual(d,free)
                    if policy=='buffer' and free>=200: self.assertGreaterEqual(free-d,100)
        self.assertEqual(budget_for(199,100,'buffer'),100)
        self.assertEqual(budget_for(201,100,'buffer'),101)

    def test_event_stream_reproducible_and_buy_bounded(self):
        stream=events('decay',42)
        self.assertEqual(stream,events('decay',42))
        for _,turnover,purchases in stream[1]:
            self.assertLessEqual(sum(purchases),turnover)
            self.assertTrue(all(x>=0 for x in purchases))

    def test_paired_money_and_entries(self):
        stream=events('steady',42)
        results=[run(stream,k,h,p,400,42) for k in (5,10,20) for h in (1,3) for p in ('all','buffer','minimum')]
        for field in ('received','project','monthly_entries'):
            self.assertEqual(len({r[field] for r in results}),1)
        self.assertEqual(results[0],run(stream,5,1,'all',400,42))

    def test_censored_wait_and_no_cash(self):
        carry,timeline,rate,delay=events('steady',42)
        r=run((carry,timeline,rate,100),10,1,'all',0,42)
        self.assertEqual(r['draws'],0)
        self.assertIsNone(r['first_hour'])
        self.assertIsNone(r['gap_p95'])
        self.assertEqual(r['tail_hours'],168)
        self.assertGreater(r['oldest_open_hours'],0)
        self.assertGreater(r['pending_revenue'],0)
        self.assertEqual(aggregate([r,r])['gap_p95']['observed'],0)


if __name__=='__main__': unittest.main()
