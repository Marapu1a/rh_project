const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{ethers}=require('ethers');
const {runShortAutomation}=require('../scripts/short-automation.cjs');
const {fixture,frozen,beacon,faultyVault,target,vector,rpc,sent}=require('./fixtures/promo-automation.cjs');
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
