const {test}=require('node:test'),assert=require('node:assert/strict');
const {inspectPlan}=require('../scripts/public-launch-plan.cjs');
const active=require('../config/robinhood-launch-plan.json'),reserve=require('../config/reserve/pair-launch-plan.json');
test('active Pons plan and explicit PAIR reserve remain separate and non-executable',()=>{
 for(const p of [active,reserve]){const r=inspectPlan(p);assert.equal(r.conflicts.length,0);assert.equal(r.executable,false);assert.equal(r.integration,p.integration);}
 const r=inspectPlan(active);assert(r.missing.includes('contracts.factory'));assert(r.missing.includes('launch.launchParameters'));assert(!r.settings.some(x=>x.path==='contracts.pairSource'));
 assert.deepEqual(active.product,reserve.product);assert.deepEqual(active.unresolved,reserve.unresolved);
 for(const update of [{integration:undefined},{integration:'pair-infinity'},{initialPurchase:reserve.initialPurchase},{contracts:{...active.contracts,pairSource:null}},{launch:{...active.launch,openingProfile:null}}])assert.throws(()=>inspectPlan({...active,...update}));
});
test('PAIR preparation refuses active Pons config before any network request',async()=>{
 const pair=require('../scripts/pair-launch-preview.cjs');let calls=0;
 await assert.rejects(pair.collect(active,{fetcher:async()=>{calls++;},rpc:async()=>{calls++;}}),/PAIR reserve/);
 assert.throws(()=>pair.review({plan:active}),/PAIR reserve/);assert.equal(calls,0);
});
