const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{ethers}=require('ethers'),hre=require('hardhat');
const vector=require('../research/drand-feasibility/vector.json').beacon,target=1727521075+(vector.round-1)*3;
hre.config.networks.hardhat.initialDate=new Date((target-40*86400)*1000).toISOString();
const compiled=require('../scripts/compile.cjs').compile(),{setup}=require('./fixtures/local-scheduler.cjs'),{rpc,sent}=require('./fixtures/local-controllers.cjs');
const {runShortAutomation,ACTIONS}=require('../scripts/short-automation.cjs');
async function fixture(t,{noWin=false}={}){
 const rules=noWin?{version:1,pNumerator:1,pDenominator:4294967295,hNumerator:1,hDenominator:1}:require('./fixtures/short-outcome.cjs').nearCertainRules;
 const f=await setup(t,compiled,{drandTiming:[3600,30,5,1800,15],rules});
 const owner=await f.admin.getAddress(),hook=await f.deploy('InfinityHookFixture'),factory=await f.deploy('InfinityFactoryFixture');
 const collector=await f.deploy('InfinityCollector',[owner,f.token.target,f.quote.target,hook.target,factory.target]),source=await f.deploy('InfinityVaultFixture',[f.token.target,hook.target,factory.target,collector.target]);
 await sent(hook.configure(source.target,300));const ends=(await f.provider.getBlock('latest')).timestamp+100;
 const recipients=[f.vault.target,ethers.ZeroAddress,ethers.ZeroAddress];await sent(collector.bindSource(source.target,[ends,recipients,[10000,0,0]]));
 const anchor=await f.provider.getBlock('latest'),code=async c=>ethers.keccak256(await f.provider.getCode(c.target));
 const fundingJob={schema:'local-infinity-worker-v1',chainId:31337,collector:collector.target,token:f.token.target,quote:f.quote.target,promo:f.vault.target,source:source.target,collectorCodeHash:await code(collector),sourceFingerprint:await collector.sourceFingerprint(),anchor:{number:anchor.number,hash:anchor.hash},campaignId:'1',recipients,bps:[10000,0,0],legacy:[],maxGasPrice:'1000000000000',nativeFloor:'1000',gasUnits:{pull:'600000',pay:'600000'},pollSeconds:60};
 const deliveryJob={schema:'local-drand-delivery-v1',chainId:31337,adapter:f.random.target,short:f.short.target,monthly:f.monthly.target,adapterCodeHash:await code(f.random),shortCodeHash:await code(f.short),monthlyCodeHash:await code(f.monthly),anchor:fundingJob.anchor,maxGasPrice:fundingJob.maxGasPrice,nativeFloor:'1000',gasUnits:{prove:'500000',deliver:'500000'},pollSeconds:10};
 const ops={schema:'local-short-automation-v1',maxGasPrice:fundingJob.maxGasPrice,reserveGasPrice:fundingJob.maxGasPrice,nativeFloor:'1000',extraFeePerTx:'0',safetyBps:12000,maxTransactions:32,maxClaims:64,scanBlocks:2000,pollSeconds:10,gasUnits:Object.fromEntries(ACTIONS.map(a=>[a,'3000000']))};
 const options={provider:f.provider,executor:f.admin,collector:collector.connect(f.provider),adapter:f.random.connect(f.provider),vault:f.vault.connect(f.provider),short:f.short.connect(f.provider),monthly:f.monthly.connect(f.provider),fundingJob,deliveryJob,schedulerConfig:f.config,rpcUrl:f.options.rpcUrl,statePath:f.directory+'/automation.json',ops};
 await sent(f.registry.register());await f.buy(f.admin,200);
 await sent(f.quote.mint(source.target,600));await sent(source.fund(f.quote.target,600));
 return {...f,collector,source,hook,options,read:()=>JSON.parse(fs.readFileSync(options.statePath,'utf8'))};
}
async function frozen(f){
 await rpc('evm_setNextBlockTimestamp',[target-4000]);await rpc('evm_mine');
 // Standard scheduler creates the replay-backed artifact; no synthetic dataset.
 const {runScheduler}=require('../scripts/local-promo-scheduler.cjs');
 await runScheduler({...f.options,config:f.config,statePath:f.directory+'/prepare.json',publisher:f.admin,kinds:['SHORT']},{maxTicks:3});
 const job=JSON.parse(fs.readFileSync(f.directory+'/prepare.json')).jobs.SHORT[0].job;
 // Share the authenticated job with coordinator's scheduler state using its original config hash.
 fs.copyFileSync(f.directory+'/prepare.json',f.options.statePath+'.scheduler');
 await rpc('evm_setNextBlockTimestamp',[target-3601]);await sent(f.short.seal(job.proposalId));
 const id=await f.short.drawRequest(job.artifact.request.drawId);assert.equal((await f.random.requests(id)).round,BigInt(vector.round));
 await rpc('evm_setNextBlockTimestamp',[target+10]);await rpc('evm_mine');return job;
}
const beacon=async r=>{assert.equal(r,String(vector.round));return vector;};
function faultyVault(f,mode){const reader=f.vault.connect(f.provider),real=f.vault.connect(f.admin);let once=true;
 const claim=async(...args)=>{const tx=await real.claim(...args);if(once){once=false;if(mode==='unknown')throw Object.assign(Error('lost hash'),{code:'ECONNRESET'});return {hash:tx.hash,nonce:tx.nonce,wait:async()=>{throw Object.assign(Error('timeout'),{code:'TIMEOUT'});}};}return tx;};
 for(const k of ['estimateGas','populateTransaction','fragment'])claim[k]=real.claim[k];
 return new Proxy(reader,{get(t,k){if(k==='connect')return ()=>({claim});return Reflect.get(t,k);}});
}
test('Short automation delivers, settles, pays without harness claim; funding and rerun are independent',async t=>{
 const f=await fixture(t),job=await frozen(f),wallet=await f.admin.getAddress(),before=await f.quote.balanceOf(wallet);
 await sent(f.hook.configure(f.source.target,400)); // New source drift must not block old funded winnings.
 const r=await runShortAutomation(f.options,{getBeacon:beacon});assert.equal(r.status,'degraded',JSON.stringify(r));assert.equal(r.steps.filter(s=>s.action==='claim').length,1);
 assert(await f.quote.balanceOf(wallet)>before);assert.equal(await f.vault.reward(job.artifact.request.drawId,wallet),0n);assert.equal(f.read().payouts.length,0);
 const nonce=await f.provider.getTransactionCount(wallet),again=await runShortAutomation(f.options,{getBeacon:beacon});assert.equal(again.steps.length,0);assert.equal(await f.provider.getTransactionCount(wallet),nonce);
 assert.equal((await f.ledger()).wallets[0].MONTHLY.open,'2');
});
for(const mode of ['timeout','unknown'])test('claim '+mode+' survives restart without a second payment',async t=>{
 const f=await fixture(t);await frozen(f);
 const r=await runShortAutomation({...f.options,vault:faultyVault(f,mode)},{getBeacon:beacon});assert.equal(r.status,'blocked',JSON.stringify(r));
 const wallet=await f.admin.getAddress(),before=await f.quote.balanceOf(wallet),nonce=await f.provider.getTransactionCount(wallet);
 const again=await runShortAutomation(f.options,{getBeacon:beacon});
 if(mode==='unknown'){assert.equal(again.reason,'unknownHash');assert.equal(await f.provider.getTransactionCount(wallet),nonce);}
 else{assert.notEqual(again.status,'blocked',JSON.stringify(again));assert.equal(f.read().payouts.length,0);}
 assert.equal(await f.quote.balanceOf(wallet),before);
});
test('no-win creates no claims; manually paid old rewards are skipped after restart',async t=>{
 const f=await fixture(t,{noWin:true});await frozen(f);let r=await runShortAutomation(f.options,{getBeacon:beacon});assert(!r.steps.some(s=>s.action==='claim'));assert.equal(f.read().payouts.length,0);
});
test('native shortage preserves queued claims and top-up resumes; fixed winner can self-claim first',async t=>{
 const f=await fixture(t),job=await frozen(f);
 const stop=new AbortController();let r=await runShortAutomation({...f.options,signal:stop.signal},{getBeacon:beacon,onStep:s=>{if(s.action==='finishShort')stop.abort();}});assert(['stopped','waiting'].includes(r.status),JSON.stringify(r));
 const wallet=await f.admin.getAddress();await rpc('hardhat_setBalance',[wallet,'0x0']);r=await runShortAutomation(f.options,{getBeacon:beacon});assert.equal(r.reason,'nativeFunding',JSON.stringify(r));assert(f.read().payouts.length>0);
 await sent(f.vault.connect(f.executor).claim(job.artifact.request.drawId,wallet));
 await rpc('hardhat_setBalance',[wallet,'0x3635c9adc5dea00000']);r=await runShortAutomation(f.options,{getBeacon:beacon});assert(!r.steps.some(s=>s.action==='claim'));assert.equal(f.read().payouts.length,0);
});

test('freeze waits for the whole Short gas forecast, not just affordable seal gas',async t=>{
 const f=await fixture(t),{runScheduler}=require('../scripts/local-promo-scheduler.cjs');
 await rpc('evm_setNextBlockTimestamp',[target-4000]);await rpc('evm_mine');
 await runScheduler({...f.options,config:f.config,statePath:f.directory+'/prepare.json',publisher:f.admin,kinds:['SHORT']},{maxTicks:3});
 fs.copyFileSync(f.directory+'/prepare.json',f.options.statePath+'.scheduler');
 await rpc('evm_setNextBlockTimestamp',[target+1]);await rpc('evm_mine');
 const oldNow=Date.now,oldFetch=global.fetch;try{
  Date.now=()=>1000*(target+1);global.fetch=async()=>({ok:true,json:async()=>vector});
  await rpc('hardhat_setBalance',[await f.admin.getAddress(),'0x8ac7230489e80000']); // 10ETH: enough for one action, not the full bound.
  const r=await runShortAutomation(f.options,{getBeacon:beacon});assert.equal(r.status,'waiting',JSON.stringify(r));
  assert.equal(r.results.settlement.results.SHORT.reason,'executionBudget');assert.equal(r.results.settlement.results.SHORT.budget.reason,'nativeFunding');
  assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);assert(!f.read().pending);
 }finally{Date.now=oldNow;global.fetch=oldFetch;}
});

test('a failed claim remains queued without stopping funding and pays on the next pass',async t=>{
 const f=await fixture(t);await frozen(f);const reader=f.vault.connect(f.provider),real=f.vault.connect(f.admin);
 const claim=async(...a)=>real.claim(...a);claim.fragment=real.claim.fragment;claim.populateTransaction=real.claim.populateTransaction;claim.estimateGas=async()=>{throw Object.assign(Error('recipient temporarily rejected'),{code:'CALL_EXCEPTION'});};
 const wrapped=new Proxy(reader,{get(t,k){if(k==='connect')return ()=>({claim});return Reflect.get(t,k);}});
 let r=await runShortAutomation({...f.options,vault:wrapped},{getBeacon:beacon});assert.equal(r.status,'degraded',JSON.stringify(r));assert.equal(f.read().payouts.length,1);assert.equal(r.results.funding.status,'complete');
 r=await runShortAutomation(f.options,{getBeacon:beacon});assert.equal(r.steps.filter(s=>s.action==='claim').length,1);assert.equal(f.read().payouts.length,0);
});

test('scheduler receipt timeout reconciles globally before continuation and pays once',async t=>{
 const f=await fixture(t);await frozen(f);const reader=f.short.connect(f.provider),real=f.short.connect(f.admin);let once=true;
 const processShort=async(...args)=>{const tx=await real.processShort(...args);if(once){once=false;return {hash:tx.hash,nonce:tx.nonce,wait:async()=>{throw Object.assign(Error('timeout'),{code:'TIMEOUT'});}};}return tx;};
 for(const k of ['estimateGas','populateTransaction','fragment'])processShort[k]=real.processShort[k];
 const signerContract=new Proxy(real,{get(t,k){if(k==='processShort')return processShort;return Reflect.get(t,k);}}),wrapped=new Proxy(reader,{get(t,k){if(k==='connect')return ()=>signerContract;return Reflect.get(t,k);}});
 let r=await runShortAutomation({...f.options,short:wrapped},{getBeacon:beacon});assert.equal(r.status,'blocked',JSON.stringify(r));assert.equal(r.reason,'pendingReceipt');assert(f.read().pending.transactionHash);
 r=await runShortAutomation(f.options,{getBeacon:beacon});assert.equal(r.steps.filter(s=>s.action==='claim').length,1);assert(!f.read().pending);assert.equal(f.read().payouts.length,0);
});
