process.env.HARDHAT_CONFIG=require.resolve('./fixtures/public-hardhat.config.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{ethers}=require('ethers'),hre=require('hardhat');
const {prepare,beacon,target}=require('./fixtures/robinhood-obligations.cjs');hre.config.networks.hardhat.initialDate=new Date((target-40*86400)*1000).toISOString();
const compiled=require('../scripts/compile.cjs').compile({writeArtifacts:false});
const {setup,rpc}=require('./fixtures/robinhood-runtime.cjs'),{runRobinhoodAutomation:run}=require('../scripts/robinhood-automation.cjs');
const read=f=>JSON.parse(fs.readFileSync(f.options.statePath));
async function fixture(t,{freeze=true}={}){
 const f=await setup(t,compiled);if(freeze)await prepare(f);
 f.options.nativeRefill={kind:'BOOTSTRAP_NATIVE',source:await f.other.getAddress(),minimumBalance:'1000000',transferGas:'30000',maxPerRefill:ethers.parseEther('100').toString(),maxPerPeriod:ethers.parseEther('200').toString(),periodSeconds:'86400',cooldownSeconds:'0'};
 f.options.refillSigner=f.other;f.options.drain=true;
 await rpc('hardhat_setBalance',[f.owner,'0x0']);return f;
}
test('empty executor refills once and automatically completes both frozen draws and claims during source outage',async t=>{
 const f=await fixture(t);await rpc('hardhat_setCode',[f.source.target,'0x60006000fd']);
 const before=await f.provider.getBalance(f.options.nativeRefill.source),r=await run(f.options,{getBeacon:beacon});
 assert.equal(r.results.refill.status,'confirmed',JSON.stringify(r));
 for(const action of ['finishShort','finishMonth','claim'])assert(r.steps.some(s=>s.action===action),JSON.stringify(r));
 assert.equal(await f.vault.reserved(f.quote.target),0n);assert.equal(await f.vault.claimable(f.quote.target),0n);
 const s=read(f);assert(!s.pending);assert.equal(before-await f.provider.getBalance(f.options.nativeRefill.source),BigInt(s.refillHistory.spent));
 const nonce=await f.provider.getTransactionCount(f.options.nativeRefill.source);await run(f.options,{getBeacon:beacon});assert.equal(await f.provider.getTransactionCount(f.options.nativeRefill.source),nonce);
});
test('empty ETH source waits, then external top-up resumes automatically',async t=>{
 const f=await fixture(t);await rpc('hardhat_setBalance',[f.options.nativeRefill.source,'0x0']);
 const r=await run(f.options,{getBeacon:beacon});assert.equal(r.results.refill.reason,'refillBudget',JSON.stringify(r));assert(!read(f).pending);
 await rpc('hardhat_setBalance',[f.options.nativeRefill.source,ethers.toQuantity(ethers.parseEther('100'))]);
 const next=await run(f.options,{getBeacon:beacon});assert(next.steps.some(s=>s.action==='finishMonth'),JSON.stringify(next));
});
test('expensive gas waits without refill intent or spending',async t=>{
 const f=await fixture(t);f.options.ops.maxGasPrice='1';const nonce=await f.provider.getTransactionCount(f.options.nativeRefill.source);
 const r=await run(f.options,{getBeacon:beacon});assert.equal(r.results.refill,undefined);assert.equal(await f.provider.getTransactionCount(f.options.nativeRefill.source),nonce);assert(!read(f).pending);
});
for(const known of [true,false])test((known?'known':'unknown')+' refill send is never blindly repeated on restart',async t=>{
 const f=await fixture(t),real=f.other,ownerNonce=await f.provider.getTransactionCount(f.owner);
 const signer=new Proxy(real,{get(t,k){if(k==='sendTransaction')return async request=>{const tx=await real.sendTransaction(request);if(!known)throw Object.assign(Error('lost response'),{code:'ECONNRESET'});return {hash:tx.hash,wait:async()=>{throw Object.assign(Error('timeout'),{code:'TIMEOUT'});}};};return Reflect.get(t,k);}});
 const r=await run({...f.options,refillSigner:signer},{getBeacon:beacon});assert.equal(r.status,'blocked',JSON.stringify(r));assert(read(f).pending);
 const nonce=await f.provider.getTransactionCount(f.options.nativeRefill.source),next=await run(f.options,{getBeacon:beacon});
 assert.equal(await f.provider.getTransactionCount(f.options.nativeRefill.source),nonce,JSON.stringify(next));
 if(known){assert(!read(f).pending);assert(next.steps.some(s=>s.action==='finishMonth'),JSON.stringify(next));}else{assert.equal(next.reason,'unknownHash');assert(read(f).pending);assert.equal(await f.provider.getTransactionCount(f.owner),ownerNonce);}
});
test('partial refill obeys period cap including gas and blocks new spending',async t=>{
 const f=await fixture(t);f.options.nativeRefill.maxPerRefill='40000000000000000';f.options.nativeRefill.maxPerPeriod='40000000000000000';
 const first=await run(f.options,{getBeacon:beacon});assert.equal(first.results.refill.status,'confirmed',JSON.stringify(first));
 const s=read(f);assert(BigInt(s.refillHistory.spent)<=BigInt(f.options.nativeRefill.maxPerPeriod));
 await rpc('hardhat_setBalance',[f.owner,'0x0']);const again=await run(f.options,{getBeacon:beacon});assert.equal(again.results.refill.reason,'refillBudget',JSON.stringify(again));
});
test('custody source and policy change cannot silently reset spending history',async t=>{
 const f=await fixture(t);await assert.rejects(run({...f.options,nativeRefill:{...f.options.nativeRefill,source:f.vault.target}}),/separate/);
 await run(f.options,{getBeacon:beacon});await assert.rejects(run({...f.options,nativeRefill:{...f.options.nativeRefill,maxPerPeriod:'999'}}),/config|identity|mismatch/i);
});
test('critical admission failure blocks refill; receipts still reconcile before admission',async t=>{
 const f=await fixture(t),real=f.other,ownerNonce=await f.provider.getTransactionCount(f.owner);
 const signer=new Proxy(real,{get(t,k){if(k==='sendTransaction')return async request=>{const tx=await real.sendTransaction(request);return {hash:tx.hash,wait:async()=>{throw Object.assign(Error('timeout'),{code:'TIMEOUT'});}};};return Reflect.get(t,k);}});
 await run({...f.options,refillSigner:signer},{getBeacon:beacon});assert(read(f).pending);
 await rpc('hardhat_setCode',[f.vault.target,'0x60006000fd']);const nonce=await f.provider.getTransactionCount(f.options.nativeRefill.source);
 const r=await run(f.options,{getBeacon:beacon});assert.equal(r.reason,'obligationAdmission');assert(!read(f).pending);assert.equal(await f.provider.getTransactionCount(f.options.nativeRefill.source),nonce);
});

test('cooldown survives restart; an unfunded source does not block already funded obligations',async t=>{
 const f=await fixture(t);f.options.nativeRefill.cooldownSeconds='3600';
 const stop=new AbortController();await run({...f.options,signal:stop.signal},{getBeacon:beacon,onStep:s=>{if(s.action==='transferNative')stop.abort();}});
 const source=f.options.nativeRefill.source,nonce=await f.provider.getTransactionCount(source);
 await rpc('hardhat_setBalance',[f.owner,'0x0']);const r=await run(f.options,{getBeacon:beacon});assert.equal(r.results.refill.reason,'refillCooldown',JSON.stringify(r));assert.equal(await f.provider.getTransactionCount(source),nonce);
 await rpc('hardhat_setBalance',[source,'0x0']);await rpc('hardhat_setBalance',[f.owner,ethers.toQuantity(ethers.parseEther('100'))]);
 const resumed=await run(f.options,{getBeacon:beacon});assert(resumed.steps.some(s=>s.action==='finishMonth'),JSON.stringify(resumed));assert.equal(await f.provider.getTransactionCount(source),nonce);
});

test('post-send fee envelope mismatch is accounted and halts further refill without replay',async t=>{
 const f=await fixture(t),real=f.other,stop=new AbortController();
 const signer=new Proxy(real,{get(t,k){if(k==='sendTransaction')return request=>real.sendTransaction({...request,gasLimit:request.gasLimit+1n});return Reflect.get(t,k);}});
 await run({...f.options,refillSigner:signer,signal:stop.signal},{getBeacon:beacon,onStep:s=>{if(s.action==='transferNative')stop.abort();}});
 assert(read(f).refillHalt);assert(!read(f).pending);assert(BigInt(read(f).refillHistory.spent)>0n);
 await rpc('hardhat_setBalance',[f.owner,'0x0']);const nonce=await f.provider.getTransactionCount(f.options.nativeRefill.source),r=await run(f.options,{getBeacon:beacon});
 assert.equal(r.results.refill.reason,'refillHalt',JSON.stringify(r));assert.equal(await f.provider.getTransactionCount(f.options.nativeRefill.source),nonce);
});

test('normal funding resumes from zero native; RPC read failure does not create an intent',async t=>{
 const f=await fixture(t,{freeze:false});f.options.drain=false;
 const original=f.provider.getBalance.bind(f.provider);f.provider.getBalance=async(a,...args)=>{if(String(a).toLowerCase()===f.options.nativeRefill.source.toLowerCase())throw Object.assign(Error('RPC offline'),{code:'ECONNRESET'});return original(a,...args);};
 const first=await run(f.options);assert(!read(f).pending);assert.notEqual(first.results.refill?.status,'confirmed');
 f.provider.getBalance=original;
 const second=await run(f.options);assert.equal(second.results.refill.status,'confirmed',JSON.stringify(second));
 for(let i=0;i<2&&await f.vault.freeShort()===0n;i++)await run(f.options);
 assert(await f.vault.freeShort()>0n);
});

test('refill for a Ready monthly job first covers frozen Short and cannot spend its reserve on a new freeze',async t=>{
 const f=await fixture(t,{freeze:false});f.options.drain=false;
 await rpc('hardhat_setBalance',[f.owner,ethers.toQuantity(ethers.parseEther('100'))]);
 const ids=await prepare(f,{freeze:false});await rpc('evm_setNextBlockTimestamp',[target-1801]);await (await f.short.seal(ids.proposal)).wait();
 await rpc('evm_setNextBlockTimestamp',[target+10]);await rpc('evm_mine');await rpc('hardhat_setBalance',[f.owner,'0x0']);
 const preflight=require('../scripts/drand-preflight.cjs'),original=preflight.drandPreflight;preflight.drandPreflight=async()=>({status:'observedHealthy'});
 try{
  const r=await run(f.options,{getBeacon:async()=>{throw Error('beacon temporarily unavailable');}});
  assert.equal(r.results.refill.status,'confirmed',JSON.stringify(r));assert.equal(r.steps.filter(s=>s.action==='transferNative').length,1);
  assert.equal(await f.short.pendingDatasetDraw(),ids.sId);assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash);
  assert(!r.steps.some(s=>['sealMonth','pull','pay'].includes(s.action)),JSON.stringify(r));
  // 1 chunk + finish + prove + deliver + 3 possible claims, at the fixture's conservative ceiling.
  const cost=require('../scripts/local-execution-budget.cjs').transactionCost(f.options.ops,'3000000');
  assert.equal(BigInt(read(f).lastRefill.value),7n*cost+BigInt(f.options.ops.nativeFloor));
 }finally{preflight.drandPreflight=original;}
});

test('coherent higher child floors: expensive gas waits across restart then refill and both draws resume',async t=>{
 const f=await fixture(t),floor=ethers.parseEther('1').toString();
 f.options.deliveryJob.nativeFloor=floor;f.options.fundingJob.nativeFloor=floor;
 await assert.rejects(run(f.options),/ops.nativeFloor must cover/);assert(!fs.existsSync(f.options.statePath));
 f.options.ops.nativeFloor=floor;
 const profile=f.options.deploymentProfile;f.options.deploymentProfile=require('../scripts/deployment-admission.cjs').createDeploymentProfile(f.options,{scope:profile.scope,executor:f.owner,timing:profile.timing,sourceCodeHash:profile.pins.source[1]});
 const original=f.provider.getFeeData.bind(f.provider),high=BigInt(f.options.ops.maxGasPrice)*2n;
 f.provider.getFeeData=async()=>({gasPrice:high,maxFeePerGas:high,maxPriorityFeePerGas:0n});
 const {runWatch}=require('../scripts/local-rpc-watch.cjs'),{observePromoStatus}=require('../scripts/promo-operational-status.cjs'),events=[];
 const pass=()=>run(f.options,{getBeacon:beacon}),observe=r=>observePromoStatus(f.options.statePath,r),emit=r=>events.push(r);
 const nonce=await f.provider.getTransactionCount(f.options.nativeRefill.source);
 await runWatch({pass,observe,emit,pollMs:1});assert.equal(events.at(-1).operational.event.current.reasons[0],'expensiveGas');
 await runWatch({pass,observe,emit,pollMs:1});assert(!events.at(-1).operational.event);assert.equal(await f.provider.getTransactionCount(f.options.nativeRefill.source),nonce);assert(!read(f).pending);
 f.provider.getFeeData=original;
 await runWatch({pass,observe,emit,pollMs:1});const resumed=events.at(-1);assert.equal(resumed.operational.event.type,'recovered',JSON.stringify(resumed));
 for(const action of ['finishShort','finishMonth','claim'])assert(resumed.steps.some(s=>s.action===action),JSON.stringify(resumed));
 assert(await f.provider.getBalance(f.owner)>=BigInt(floor));assert.equal(await f.vault.claimable(f.quote.target),0n);
});
