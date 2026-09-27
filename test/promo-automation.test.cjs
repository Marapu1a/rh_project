const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{ethers}=require('ethers');
const {fixture,beacon,target,vector,rpc,sent}=require('./fixtures/promo-automation.cjs');
const {runPromoAutomation,MONTHLY_ACTIONS}=require('../scripts/promo-automation.cjs');
const preflight=require('../scripts/drand-preflight.cjs');
async function setup(t,{noWin=false,automatic=false}={}){
 const f=await fixture(t,{noWin});f.options.ops.schema='local-promo-automation-v1';
 for(const a of MONTHLY_ACTIONS)f.options.ops.gasUnits[a]='3000000';
 // Keep Short unfunded for this single-lane test, without disabling it in the worker.
 f.config.shortBudget='10000';
 await rpc('evm_setNextBlockTimestamp',[target-4000]);await rpc('evm_mine');
 if(automatic){await require('../scripts/infinity-worker.cjs').runInfinityWorker({provider:f.provider,collector:f.options.collector,executor:f.admin,job:f.options.fundingJob,statePath:f.options.statePath+'.funding'});return f;}
 const {runScheduler}=require('../scripts/local-promo-scheduler.cjs');
 await runScheduler({...f.options,config:f.config,statePath:f.directory+'/prepare.json',publisher:f.admin,kinds:['MONTHLY']},{maxTicks:3});
 fs.copyFileSync(f.directory+'/prepare.json',f.options.statePath+'.scheduler');
 const job=JSON.parse(fs.readFileSync(f.directory+'/prepare.json')).jobs.MONTHLY[0].job;
 return {...f,job};
}
async function freeze(f){
 await rpc('evm_setNextBlockTimestamp',[target-(f.job?3602:3700)]);await rpc('evm_mine');
 // Isolate operational wall-clock observation; real on-chain BLS verification remains enabled.
 const original=preflight.drandPreflight;preflight.drandPreflight=async(provider,source)=>{if(source.target===f.short.target)return {status:'waiting',reasons:['fixtureShortDeferred']};await rpc('evm_setNextBlockTimestamp',[target-3601]);return {status:'observedHealthy'};};
 let r;try{r=await runPromoAutomation(f.options,{getBeacon:beacon});}finally{preflight.drandPreflight=original;}
 if(!f.job){assert(r.steps.some(s=>s.action==='beginMonth')&&r.steps.some(s=>s.action==='publishMonth'),JSON.stringify(r));f.job=JSON.parse(fs.readFileSync(f.options.statePath+'.scheduler')).jobs.MONTHLY[0].job;}
 assert(r.steps.some(s=>s.action==='sealMonth'),JSON.stringify(r));
 const id=await f.monthly.drawRequest(f.job.artifact.request.drawId);assert.equal((await f.random.requests(id)).round,BigInt(vector.round));
 await rpc('evm_setNextBlockTimestamp',[target+10]);await rpc('evm_mine');
}
for(const noWin of [false,true])test('Monthly automation '+(noWin?'no-win':'winner')+' seals, verifies drand, finishes and pays exactly once',async t=>{
 const f=await setup(t,{noWin,automatic:!noWin});await freeze(f);const wallet=await f.admin.getAddress(),before=await f.quote.balanceOf(wallet),vaultBefore=await f.quote.balanceOf(f.vault.target);
 const r=await runPromoAutomation(f.options,{getBeacon:beacon});assert(!['error','blocked'].includes(r.status),JSON.stringify(r));
 assert(r.steps.some(s=>s.action==='finishMonth'));assert.equal(r.steps.filter(s=>s.action==='claim').length,noWin?0:1);
 const m=await f.monthly.month(f.job.artifact.request.drawId);assert.equal(m.phase,5n);
 assert.equal(await f.quote.balanceOf(f.vault.target)+(await f.quote.balanceOf(wallet)-before),vaultBefore);assert.equal(await f.vault.reserved(f.quote.target),0n);assert.equal(await f.vault.claimable(f.quote.target),0n);
 assert.equal(await f.quote.balanceOf(wallet)-before,noWin?0n:m.budget);assert.equal(f.read().payouts.length,0);
 const ledger=await f.ledger();assert.equal(ledger.wallets[0].MONTHLY.open,'0');assert.equal(ledger.wallets[0].SHORT.open,'2');
 const nonce=await f.provider.getTransactionCount(wallet),again=await runPromoAutomation(f.options,{getBeacon:beacon});assert.equal(again.steps.length,0,JSON.stringify(again));assert.equal(await f.provider.getTransactionCount(wallet),nonce);
});
test('Monthly finish receipt timeout reconciles then pays without a second finish',async t=>{
 const f=await setup(t);await freeze(f);const real=f.monthly.connect(f.admin),reader=f.monthly.connect(f.provider);let once=true;
 const finishMonth=async(...a)=>{const tx=await real.finishMonth(...a);if(once){once=false;return {hash:tx.hash,nonce:tx.nonce,wait:async()=>{throw Object.assign(Error('timeout'),{code:'TIMEOUT'});}};}return tx;};
 for(const k of ['estimateGas','populateTransaction','fragment'])finishMonth[k]=real.finishMonth[k];
 const wrapped=new Proxy(reader,{get(t,k){if(k==='connect')return()=>new Proxy(real,{get(c,n){return n==='finishMonth'?finishMonth:Reflect.get(c,n);}});return Reflect.get(t,k);}});
 const r=await runPromoAutomation({...f.options,monthly:wrapped},{getBeacon:beacon});assert.equal(r.reason,'pendingReceipt',JSON.stringify(r));
 const again=await runPromoAutomation(f.options,{getBeacon:beacon});assert.equal(again.steps.filter(s=>s.action==='finishMonth').length,0);assert.equal(again.steps.filter(s=>s.action==='claim').length,1);assert.equal(f.read().payouts.length,0);
});
async function bothReady(t){
 const f=await fixture(t);f.options.ops.schema='local-promo-automation-v1';for(const a of MONTHLY_ACTIONS)f.options.ops.gasUnits[a]='3000000';
 await rpc('evm_setNextBlockTimestamp',[target-4000]);await rpc('evm_mine');
 await require('../scripts/local-promo-scheduler.cjs').runScheduler({...f.options,config:f.config,statePath:f.directory+'/prepare.json',publisher:f.admin},{maxTicks:3});
 fs.copyFileSync(f.directory+'/prepare.json',f.options.statePath+'.scheduler');const jobs=JSON.parse(fs.readFileSync(f.directory+'/prepare.json')).jobs;
 f.job=jobs.MONTHLY[0].job;f.shortJob=jobs.SHORT[0].job;
 await rpc('evm_setNextBlockTimestamp',[target-3602]);await sent(f.short.seal(f.shortJob.proposalId));return f;
}
test('Monthly freeze reserves gas for the already pending Short too',async t=>{
 const f=await bothReady(t),original=preflight.drandPreflight;preflight.drandPreflight=async()=>({status:'observedHealthy'});
 await rpc('hardhat_setBalance',[await f.admin.getAddress(),ethers.toQuantity(ethers.parseEther('30'))]);
 try{
  const r=await runPromoAutomation(f.options,{getBeacon:beacon});assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash,JSON.stringify(r));assert.notEqual(await f.short.pendingDatasetDraw(),ethers.ZeroHash);
  assert.equal(r.results.settlement.results.MONTHLY.budget.reason,'nativeFunding');
  assert(!r.steps.some(s=>s.action==='sealMonth'));assert.equal((await f.monthly.month(f.job.artifact.request.drawId)).phase,2n);
 }finally{preflight.drandPreflight=original;}
});
test('unpaid Short survives Monthly settlement; both queues resume without repeating the jackpot',async t=>{
 const f=await bothReady(t),original=preflight.drandPreflight;preflight.drandPreflight=async()=>{await rpc('evm_setNextBlockTimestamp',[target-3601]);return {status:'observedHealthy'};};
 try{const r=await runPromoAutomation(f.options,{getBeacon:beacon});assert(r.steps.some(s=>s.action==='sealMonth'),JSON.stringify(r));}finally{preflight.drandPreflight=original;}
 const id=await f.monthly.drawRequest(f.job.artifact.request.drawId);assert.equal((await f.random.requests(id)).round,BigInt(vector.round));
 await rpc('evm_setNextBlockTimestamp',[target+10]);await rpc('evm_mine');
 const stop=new AbortController();await runPromoAutomation({...f.options,signal:stop.signal},{getBeacon:beacon,onStep:s=>{if(s.action==='finishShort')stop.abort();}});
 const reader=f.vault.connect(f.provider),real=f.vault.connect(f.admin),shortId=f.shortJob.artifact.request.drawId;
 const claim=async(...a)=>real.claim(...a);claim.fragment=real.claim.fragment;claim.populateTransaction=real.claim.populateTransaction;
 claim.estimateGas=async(...a)=>{if(a[0]===shortId)throw Object.assign(Error('Short recipient rejects'),{code:'CALL_EXCEPTION'});return real.claim.estimateGas(...a);};
 const wrapped=new Proxy(reader,{get(t,k){if(k==='connect')return()=>({claim});return Reflect.get(t,k);}});
 const r=await runPromoAutomation({...f.options,vault:wrapped},{getBeacon:beacon});assert(r.steps.some(s=>s.action==='finishMonth'),JSON.stringify(r));assert.equal(r.steps.filter(s=>s.action==='claim').length,1);
 assert(f.read().payouts.some(p=>p.kind==='SHORT'));assert(!f.read().payouts.some(p=>p.kind==='MONTHLY'));
 const before=await f.quote.balanceOf(await f.admin.getAddress()),debt=await f.vault.reward(shortId,await f.admin.getAddress());assert(debt>0n);
 const again=await runPromoAutomation(f.options,{getBeacon:beacon});assert.equal(again.steps.filter(s=>s.action==='claim').length,1);assert.equal(await f.quote.balanceOf(await f.admin.getAddress())-before,debt);assert.equal(f.read().payouts.length,0);
 const ledger=await f.ledger();assert.equal(ledger.wallets[0].SHORT.open,'0');assert.equal(ledger.wallets[0].MONTHLY.open,'0');
});

test('unknown Monthly send stops every lane on restart without re-sending',async t=>{
 const f=await setup(t);await freeze(f);const real=f.monthly.connect(f.admin),reader=f.monthly.connect(f.provider);
 const processMonth=async(...a)=>{await real.processMonth(...a);throw Object.assign(Error('hash lost'),{code:'ECONNRESET'});};
 for(const k of ['estimateGas','populateTransaction','fragment'])processMonth[k]=real.processMonth[k];
 const wrapped=new Proxy(reader,{get(t,k){if(k==='connect')return()=>new Proxy(real,{get(c,n){return n==='processMonth'?processMonth:Reflect.get(c,n);}});return Reflect.get(t,k);}});
 const r=await runPromoAutomation({...f.options,monthly:wrapped},{getBeacon:beacon});assert.equal(r.status,'blocked',JSON.stringify(r));assert(!f.read().pending.transactionHash);
 const nonce=await f.provider.getTransactionCount(await f.admin.getAddress());const again=await runPromoAutomation(f.options,{getBeacon:beacon});assert.equal(again.reason,'unknownHash');assert.equal(again.steps.length,0);assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()),nonce);
});
