const {test}=require('node:test'),assert=require('node:assert/strict');
const {explain}=require('../scripts/pons-delay-status.cjs');
test('simultaneous Pons waits survive partial recovery and never alter execution result',()=>{
 const r={status:'waiting',results:{scheduler:{results:{SHORT:{reason:'indexerBehind'}}},rng:{requests:[{reason:'beaconUnavailable'}]},nativeFunding:[{reason:'nativeFunding'}]}};
 const before=JSON.stringify(r);assert.deepEqual(explain(r).reasons.map(x=>x.code),['beaconUnavailable','indexerBehind','nativeFunding']);assert.equal(JSON.stringify(r),before);
 delete r.results.scheduler;assert.equal(explain(r).state,'waiting');delete r.results.rng;delete r.results.nativeFunding;assert.equal(explain(r).state,'waiting');
});

test('waiting remains visible without a diagnostic reason or after a routine transaction limit',()=>{
 for(const reason of [undefined,'transactionLimit','poll','newJobsDeferred','obligationsOnly','draining']){
  const result=explain({status:'waiting',...(reason?{reason}:{})});
  assert.equal(result.state,'waiting');assert.deepEqual(result.reasons,[]);
 }
 assert.equal(explain({status:'ok'}).state,'clear');
 assert.equal(explain({status:'waiting',results:{scheduler:{status:'error'}}}).state,'attention');
});
test('lost send, receipt, failed funding and storage are visible without inventing recovery',()=>{
 for(const reason of ['unknownHash','pendingReceipt','SCHEDULER_STORAGE_ERROR']){const x=explain({status:'blocked',reason});assert.equal(x.state,'attention');assert.equal(x.reasons[0].code,reason);}
 assert.equal(explain({status:'waiting',results:{fundingError:'private RPC details'}}).reasons[0].code,'fundingUnavailable');
 assert(!JSON.stringify(explain({status:'error',error:'private RPC details'})).includes('private'));
 assert.equal(explain({status:'waiting',results:{funding:[{status:'reverted'}]}}).state,'attention');
 assert.equal(explain({status:'stopped'}).state,'stopped');
 assert.equal(explain({status:'waiting',results:{scheduler:{status:'error',error:'RPC timeout'}}}).state,'attention');
 assert.equal(explain({status:'waiting',results:{scheduler:{status:'waiting',reason:'indexerIdentity'}}}).reasons[0].code,'historyUnavailable');
 assert.equal(explain({status:'waiting',results:{scheduler:{status:'waiting',reason:'prizeFunding'}}}).reasons[0].code,'prizeFunding');
});
