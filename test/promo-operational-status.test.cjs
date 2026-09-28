const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {classify,observePromoStatus}=require('../scripts/promo-operational-status.cjs');
const {runWatch}=require('../scripts/local-rpc-watch.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'promo-status-')),file=path.join(dir,'runtime.json');t.after(()=>{for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);});return file;}
for(const [label,report,reason,expectedState]of [
 ['source read',{status:'degraded',results:{funding:{status:'degraded',failures:[{action:'pull',reason:'sourceReadUnavailable'}]}}},'sourceReadUnavailable','waiting'],
 ['beacon',{status:'waiting',results:{rng:{status:'waiting',requests:[{status:'waiting',reason:'beaconUnavailable'}]}}},'beaconUnavailable','waiting'],
 ['claim',{status:'degraded',results:{claimFailures:[{drawId:'draw',winner:'wallet',reason:'claimRejected'}]}},'operationFailed','attention']
])test(label+' failure after gas wait cannot emit recovered; repeats are suppressed until actual recovery',async t=>{
 const file=fixture(t);await observePromoStatus(file,{status:'waiting',reason:'gasPrice'});
 const r=await observePromoStatus(file,report);assert.equal(r.operational.event.type,'changed');assert.equal(r.operational.state,expectedState);assert.deepEqual(r.operational.reasons,[reason]);
 assert(!(await observePromoStatus(file,report)).operational.event);
 assert.equal((await observePromoStatus(file,{status:'complete'})).operational.event.type,'recovered');
 assert(!(await observePromoStatus(file,{status:'complete'})).operational.event);
});
test('planned drand round wait stays normal; rejected funding/RNG failures require attention',()=>{
 assert.deepEqual(classify({status:'waiting',results:{rng:{status:'waiting',requests:[{status:'waiting',reason:'roundNotDue'}]}}}),{state:'clear',reasons:[]});
 for(const reason of ['sourceDrift','pullRejected','payRejected','invalidBeacon','invalidProof','proveRejected','callbackRejected']){
  const r=classify({status:'waiting',results:{lane:{status:'degraded',failures:[{reason}]},other:{status:'complete'}}});assert.equal(r.state,'attention',reason);assert.deepEqual(r.reasons,['operationFailed']);
 }
 assert.equal(classify({status:'waiting',results:{rng:{requests:[{status:'rejected',reason:'invalidBeacon'}]}}}).state,'attention');
});
test('simultaneous source and beacon outages survive partial recovery without a recovered event',async t=>{
 const file=fixture(t),report={status:'waiting',results:{funding:{failures:[{reason:'sourceReadUnavailable'}]},rng:{requests:[{status:'waiting',reason:'beaconUnavailable'}]}}};
 const r=await observePromoStatus(file,report);assert.deepEqual(r.operational.reasons,['beaconUnavailable','sourceReadUnavailable']);
 report.results.funding={status:'complete'};const next=await observePromoStatus(file,report);assert.equal(next.operational.event.type,'changed');assert.deepEqual(next.operational.reasons,['beaconUnavailable']);
});
test('operational reasons distinguish empty source, caps, cooldown and normal draw waits',()=>{
 for(const [constraint,reason]of [['sourceBalance','sourceNeedsETH'],['periodCap','refillPeriodLimit'],['attemptCap','refillAttemptLimit']]){
  const r=classify({status:'waiting',reason:'nativeFunding',results:{refill:{status:'waiting',reason:'refillBudget',constraint}}});assert.deepEqual(r.reasons,[reason]);
 }
 assert.deepEqual(classify({status:'waiting',results:{rng:{status:'waiting',reason:'seed'}}}),{state:'clear',reasons:[]});
 assert.equal(classify({status:'waiting',reason:'refillCooldown'}).state,'waiting');
 assert.equal(classify({status:'blocked',reason:'unknownHash',retryableRpcRead:true}).state,'attention');
 assert.equal(classify({status:'blocked',reason:'pendingReceipt'}).state,'attention');
 assert.equal(classify({status:'blocked',reason:'pendingReceipt',pending:{transactionHash:'0x123'}}).state,'waiting');
 assert.deepEqual(classify({status:'waiting',reason:'pendingRefillSigner'}).reasons,['signerPending']);
 assert.equal(classify({status:'stopped'}),null);
});
test('persistent transitions suppress repeat notifications after restart and record recovery once',async t=>{
 const file=fixture(t),wait={status:'waiting',reason:'gasPrice'},observe=r=>observePromoStatus(file,r);
 const first=await observe(wait);assert.equal(first.operational.event.type,'waiting');
 const disk=fs.readFileSync(file+'.status','utf8');assert(!Object.hasOwn((await observe(wait)).operational,'event'));assert.equal(fs.readFileSync(file+'.status','utf8'),disk);
 // New call/closure has no in-memory deduplication state.
 assert(!(await observePromoStatus(file,wait)).operational.event);
 const changed=await observe({status:'waiting',reason:'nativeFunding'});assert.equal(changed.operational.event.type,'changed');
 const recovered=await observe({status:'complete'});assert.equal(recovered.operational.event.type,'recovered');assert.equal(recovered.operational.event.sequence,3);
 assert(!(await observe({status:'complete'})).operational.event);assert(!fs.existsSync(file));
});
test('monitor records bounded events without changing blocked journal semantics',async t=>{
 const file=fixture(t);fs.writeFileSync(file,'execution journal untouched');let calls=0;
 const exit=await runWatch({watch:true,pollMs:1,observe:r=>observePromoStatus(file,r),pass:async()=>{calls++;return {status:'blocked',reason:'unknownHash'};},wait:()=>assert.fail('No retry')});
 assert.equal(exit,1);assert.equal(calls,1);assert.equal(fs.readFileSync(file,'utf8'),'execution journal untouched');
 for(let i=0;i<40;i++)await observePromoStatus(file,{status:'waiting',reason:i%2?'gasPrice':'nativeFunding'});
 const state=JSON.parse(fs.readFileSync(file+'.status'));assert.equal(state.events.length,32);assert.equal(state.sequence,41);
});
test('watch observes RPC outage and recovery; repeated outage emits only one transition',async t=>{
 const file=fixture(t),events=[];let calls=0;
 await runWatch({watch:true,pollMs:1,observe:r=>observePromoStatus(file,r),emit:r=>events.push(r),wait:async()=>{},pass:async()=>{
  calls++;if(calls<3)throw Object.assign(Error('RPC unavailable'),{code:'ECONNRESET'});return {status:calls===3?'complete':'stopped'};
 }});
 assert.deepEqual(events.flatMap(r=>r.operational?.event?[r.operational.event.type]:[]),['waiting','recovered']);
 assert.equal(events[0].reason,'rpcUnavailable');assert.equal(events[2].operational.state,'clear');
});
test('status storage failure cannot change execution retry or clear an unknown send',async()=>{
 let calls=0;const outputs=[];
 assert.equal(await runWatch({watch:true,pollMs:1,observe:async()=>{throw Error('disk failure');},pass:async()=>{calls++;return {status:'blocked',reason:'unknownHash'};},emit:r=>outputs.push(r),wait:()=>assert.fail()}),1);
 assert.equal(calls,1);assert(outputs[0].statusObservationError);assert.equal(outputs[0].reason,'unknownHash');
});
test('partial RPC/source failure is not announced as recovery while other lanes progress',()=>{
 assert.deepEqual(classify({status:'waiting',reason:'obligationsOnly',results:{admission:{full:{status:'blocked',retryableRpcRead:true}},rng:{status:'complete'}}}).reasons,['rpcUnavailable']);
 assert.deepEqual(classify({status:'waiting',reason:'obligationsOnly',results:{admission:{full:{status:'matched'}}}}).reasons,[]);
 assert.deepEqual(classify({status:'waiting',results:{draw:{status:'waiting',results:{SHORT:{status:'waiting',reason:'executionBudget',budget:{reason:'gasPrice'}}}}}}).reasons,['expensiveGas']);
 assert.deepEqual(classify({status:'waiting',results:{draw:{status:'waiting',results:{MONTHLY:{status:'waiting',reason:'executionReadiness'}}}}}).reasons,['executionReadiness']);
});

test('a fresh OS process reuses notification history instead of emitting the same alert again',async t=>{
 const file=fixture(t),report={status:'waiting',reason:'gasPrice'};await observePromoStatus(file,report);
 const {execFileSync}=require('node:child_process');
 const child=r=>JSON.parse(execFileSync(process.execPath,['-e',"require(process.argv[1]).observePromoStatus(process.argv[2],JSON.parse(process.argv[3])).then(r=>process.stdout.write(JSON.stringify(r)))",require.resolve('../scripts/promo-operational-status.cjs'),file,JSON.stringify(r)],{encoding:'utf8'}));
 assert(!child(report).operational.event);assert.equal(child({status:'complete'}).operational.event.sequence,2);
});
