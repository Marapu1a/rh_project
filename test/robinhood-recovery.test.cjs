process.env.HARDHAT_CONFIG=require.resolve('./fixtures/public-hardhat.config.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{ethers}=require('ethers'),hre=require('hardhat');
const {prepare,beacon,target}=require('./fixtures/robinhood-obligations.cjs');hre.config.networks.hardhat.initialDate=new Date((target-40*86400)*1000).toISOString();
const compiled=require('../scripts/compile.cjs').compile({writeArtifacts:false});
const {setup,rpc,sent}=require('./fixtures/robinhood-runtime.cjs'),{runRobinhoodAutomation:run}=require('../scripts/robinhood-automation.cjs');
const disable=async(f,c=f.source)=>{const code=await f.provider.getCode(c.target);await rpc('hardhat_setCode',[c.target,'0x60006000fd']);return async()=>rpc('hardhat_setCode',[c.target,code]);};

test('source and BUY policy outage: both frozen draws settle and pay; restore resumes funding',async t=>{
 const f=await setup(t,compiled),ids=await prepare(f),restore=await disable(f);
 const policy=f.options.schedulerConfig.buyPolicy.source,policyCode=await f.provider.getCode(policy);await rpc('hardhat_setCode',[policy,'0x60006000fd']);
 const r=await run(f.options,{getBeacon:beacon});assert.equal(r.reason,'obligationsOnly',JSON.stringify(r));
 for(const action of ['processShort','finishShort','processMonth','finishMonth','claim'])assert(r.steps.some(s=>s.action===action),action+JSON.stringify(r));
 assert.equal(await f.vault.claimable(f.quote.target),0n);assert.equal(await f.vault.reserved(f.quote.target),0n);assert.equal((await f.monthly.month(ids.mId)).phase,5n);
 assert(!r.steps.some(s=>['begin','beginMonth','seal','sealMonth','checkpointCutoff','pull','pay'].includes(s.action)));
 const nonce=await f.provider.getTransactionCount(f.owner);const again=await run(f.options,{getBeacon:beacon});assert.equal(await f.provider.getTransactionCount(f.owner),nonce,JSON.stringify(again));
 await restore();await rpc('hardhat_setCode',[policy,policyCode]);const resumed=await run(f.options);assert.equal(resumed.results.admission.mode,'normal');assert.equal(resumed.results.funding.status,'complete',JSON.stringify(resumed));
});
test('recovery and explicit drain cannot freeze persisted ready jobs or fund; normal mode resumes',async t=>{
 const f=await setup(t,compiled),ids=await prepare(f,{freeze:false}),restore=await disable(f),nonce=await f.provider.getTransactionCount(f.owner);
 assert.equal((await run(f.options)).reason,'obligationsOnly');assert.equal(await f.provider.getTransactionCount(f.owner),nonce);
 await restore();assert.equal((await run({...f.options,drain:true})).reason,'obligationsOnly');assert.equal(await f.provider.getTransactionCount(f.owner),nonce);
 assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash);
 const preflight=require('../scripts/drand-preflight.cjs'),original=preflight.drandPreflight;preflight.drandPreflight=async()=>({status:'observedHealthy'});
 try{const r=await run(f.options);assert(r.steps.some(s=>s.action==='seal'),JSON.stringify(r));assert(r.steps.some(s=>s.action==='sealMonth'),JSON.stringify(r));}finally{preflight.drandPreflight=original;}
 assert.equal(await f.short.pendingDatasetDraw(),ids.sId);
});
function lostPull(f,known){const real=f.collector.connect(f.admin),reader=f.collector.connect(f.provider);const pull=async(...a)=>{const tx=await real.pull(...a);if(!known)throw Object.assign(Error('lost'),{code:'ECONNRESET'});return {hash:tx.hash,nonce:tx.nonce,wait:async()=>{throw Object.assign(Error('timeout'),{code:'TIMEOUT'});}};};
 for(const k of ['estimateGas','populateTransaction','fragment','staticCall'])pull[k]=real.pull[k];return new Proxy(reader,{get(t,k){if(k==='connect')return()=>new Proxy(real,{get(c,n){return n==='pull'?pull:Reflect.get(c,n);}});return Reflect.get(t,k);}});
}
for(const known of [true,false])test((known?'known':'unknown')+' funding intent is reconciled before source admission; never blindly re-sent',async t=>{
 const f=await setup(t,compiled),first=await run({...f.options,collector:lostPull(f,known)});assert.equal(first.status,'blocked',JSON.stringify(first));
 await disable(f);const nonce=await f.provider.getTransactionCount(f.owner),r=await run(f.options),state=JSON.parse(fs.readFileSync(f.options.statePath+'.funding'));
 if(known){assert.equal(r.reason,'obligationsOnly');assert(!state.pending);assert(state.lastResolved);}else{assert.equal(r.reason,'unknownHash');assert(state.pending);}
 assert.equal(await f.provider.getTransactionCount(f.owner),nonce);assert.equal(await f.vault.freeShort(),0n);
});
test('wrong critical runtime prevents all obligation sends even during explicit drain',async t=>{
 const f=await setup(t,compiled);await prepare(f);const nonce=await f.provider.getTransactionCount(f.owner);
 for(const c of [f.vault,f.random,f.short]){const restore=await disable(f,c),r=await run({...f.options,drain:true},{getBeacon:beacon});assert.equal(r.reason,'obligationAdmission',JSON.stringify(r));assert.equal(await f.provider.getTransactionCount(f.owner),nonce);await restore();}
});

test('policy drift without bytecode change closes funding and automatically resumes after restore',async t=>{
 const f=await setup(t,compiled),hook=new ethers.Contract(await f.collector.hook(),compiled.InfinityHookFixture.abi,f.other);
 await sent(hook.configure(f.source.target,400));const nonce=await f.provider.getTransactionCount(f.owner),r=await run(f.options);
 assert.equal(r.reason,'obligationsOnly',JSON.stringify(r));assert(r.results.admission.full.reasons.includes('sourceHealthUnavailable'));assert.equal(await f.provider.getTransactionCount(f.owner),nonce);
 await sent(hook.configure(f.source.target,300));assert.equal((await run(f.options)).results.funding.status,'complete');
});
test('source drift during estimate prevents broadcast and creates no pending intent',async t=>{
 const f=await setup(t,compiled),hook=new ethers.Contract(await f.collector.hook(),compiled.InfinityHookFixture.abi,f.other),real=f.collector.connect(f.admin),reader=f.collector.connect(f.provider);let changed=false;
 const pull=async(...a)=>real.pull(...a);for(const k of ['populateTransaction','fragment','staticCall'])pull[k]=real.pull[k];
 pull.estimateGas=async(...a)=>{const gas=await real.pull.estimateGas(...a);if(!changed){changed=true;await sent(hook.configure(f.source.target,400));}return gas;};
 const collector=new Proxy(reader,{get(t,k){if(k==='connect')return()=>new Proxy(real,{get(c,n){return n==='pull'?pull:Reflect.get(c,n);}});return Reflect.get(t,k);}});
 const nonce=await f.provider.getTransactionCount(f.owner),r=await run({...f.options,collector});assert(changed);assert.equal(r.results.admission.mode,'obligations-only');assert.equal(await f.provider.getTransactionCount(f.owner),nonce,JSON.stringify(r));
 const file=f.options.statePath+'.funding';assert(!fs.existsSync(file)||!JSON.parse(fs.readFileSync(file)).pending);assert.equal(await f.vault.freeShort(),0n);
});
test('publisher rotation does not strand already frozen permissionless settlement',async t=>{
 const f=await setup(t,compiled);await prepare(f);
 for(const c of [f.short,f.monthly]){await sent(c.proposePublisher(await f.other.getAddress()));await sent(c.connect(f.other).acceptPublisher());}
 const r=await run(f.options,{getBeacon:beacon});assert.equal(r.reason,'obligationsOnly',JSON.stringify(r));
 assert(r.steps.some(x=>x.action==='finishShort')&&r.steps.some(x=>x.action==='finishMonth'));assert.equal(await f.vault.claimable(f.quote.target),0n);
});

test('RNG receipt reconciles before a broken adapter is rejected, then resumes without duplicate proof',async t=>{
 const f=await setup(t,compiled);await prepare(f);const real=f.random.connect(f.admin),reader=f.random.connect(f.provider);let once=true;
 const prove=async(...args)=>{const tx=await real.prove(...args);if(once){once=false;return {hash:tx.hash,nonce:tx.nonce,wait:async()=>{throw Object.assign(Error('timeout'),{code:'TIMEOUT'});}};}return tx;};
 for(const k of ['estimateGas','populateTransaction','fragment'])prove[k]=real.prove[k];
 const adapter=new Proxy(reader,{get(t,k){if(k==='connect')return()=>new Proxy(real,{get(c,n){return n==='prove'?prove:Reflect.get(c,n);}});return Reflect.get(t,k);}});
 const first=await run({...f.options,adapter},{getBeacon:beacon});assert.equal(first.reason,'pendingReceipt',JSON.stringify(first));
 const restore=await disable(f,f.random);await disable(f);const nonce=await f.provider.getTransactionCount(f.owner),blocked=await run(f.options,{getBeacon:beacon});assert.equal(blocked.reason,'obligationAdmission');
 const state=JSON.parse(fs.readFileSync(f.options.statePath+'.rng'));assert(!state.pending);assert(state.lastResolved);assert.equal(await f.provider.getTransactionCount(f.owner),nonce);
 await restore();const r=await run(f.options,{getBeacon:beacon});assert.equal(r.reason,'obligationsOnly');assert.equal(r.results.rng.steps.filter(s=>s.action==='prove').length,1);assert.equal(await f.vault.claimable(f.quote.target),0n);
});

test('recovery rejects a rewritten frozen artifact even with recomputed local checksums',async t=>{
 const f=await setup(t,compiled),ids=await prepare(f);await disable(f);
 const {hash}=require('../scripts/direct-buy.cjs'),sd=require('../scripts/short-dataset.cjs');
 await require('../scripts/local-scheduler-state.cjs').withState(f.options.statePath+'.scheduler',f.options.schedulerConfig,async(state,save)=>{
  const job=state.jobs.SHORT[0].job,a=job.artifact;a.snapshot.participants[0].lastAttempt='2';a.snapshot.participants[0].count='2';
  a.request.snapshotHash=hash(a.snapshot);a.request.expectedRoot=sd.rootFor(a.snapshot.participants);a.request.expectedAttempts='3';
  const {commitment,...payload}=job;job.commitment=hash(payload);save(state);
 });
 const r=await run(f.options,{getBeacon:beacon});assert.equal(r.status,'error',JSON.stringify(r));assert(!r.steps.some(s=>['processShort','finishShort'].includes(s.action)));assert.notEqual((await f.short.settlements(ids.sId)).phase,3n);
});

test('recovery does not hide a disappeared started job behind the frozen-only filter',async t=>{
 const f=await setup(t,compiled);await prepare(f);await disable(f);
 const {hash}=require('../scripts/direct-buy.cjs');await require('../scripts/local-scheduler-state.cjs').withState(f.options.statePath+'.scheduler',f.options.schedulerConfig,async(state,save)=>{
  const job=state.jobs.SHORT[0].job;job.proposalId=ethers.id('missing started proposal');const {commitment,...payload}=job;job.commitment=hash(payload);save(state);
 });
 const r=await run(f.options,{getBeacon:async()=>{throw Error('fixture beacon offline');}});assert.equal(r.status,'error',JSON.stringify(r));assert.match(r.results.settlement.results.SHORT.message,/Previously started job disappeared/);
});

test('matching but unapproved allocation blocks new work while both frozen draws and claims complete',async t=>{
 const f=await setup(t,compiled);
 await rpc('evm_increaseTime',[101]);await rpc('evm_mine');
 const bps=[10000,0,0];await sent(f.collector.rollCampaign(1,[(await f.provider.getBlock('latest')).timestamp+10000,f.options.fundingJob.recipients,bps]));
 f.options.fundingJob={...f.options.fundingJob,campaignId:'2',bps};
 const old=f.options.deploymentProfile;f.options.deploymentProfile=require('../scripts/deployment-admission.cjs').createDeploymentProfile(f.options,{scope:old.scope,executor:old.executor,timing:old.timing,sourceCodeHash:old.pins.source[1]});
 await prepare(f);const r=await run(f.options,{getBeacon:beacon});assert.equal(r.reason,'obligationsOnly',JSON.stringify(r));
 assert(r.results.admission.full.reasons.includes('approvedCreatorAllocation'));
 for(const action of ['finishShort','finishMonth','claim'])assert(r.steps.some(s=>s.action===action),JSON.stringify(r));
 assert(!r.steps.some(s=>['begin','beginMonth','seal','sealMonth','pull','pay'].includes(s.action)));
});
