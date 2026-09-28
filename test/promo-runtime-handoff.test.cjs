const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture,frozen}=require('./fixtures/promo-automation.cjs');
const {runPromoAutomation,prepareRuntime}=require('../scripts/promo-automation.cjs');
const {handoffRuntime}=require('../scripts/promo-runtime-handoff.cjs');
const {withState}=require('../scripts/local-scheduler-state.cjs');
async function setup(t){const f=await fixture(t);await runPromoAutomation(f.options);return {...f,next:{...f.options,statePath:f.directory+'/next.json',ops:{...f.options.ops,maxClaims:32}}};}

test('handoff preserves refill spend, cooldown and halt; cannot remove or change policy',async t=>{
 const f=await fixture(t),source=await (await f.provider.getSigner(3)).getAddress();
 f.options.nativeRefill={kind:'BOOTSTRAP_NATIVE',source,minimumBalance:'1000',transferGas:'30000',maxPerRefill:'1000000',maxPerPeriod:'2000000',periodSeconds:'86400',cooldownSeconds:'60'};
 await runPromoAutomation(f.options);
 const runtime=await prepareRuntime(f.options),history={windowStart:'0',spent:'1234',lastAttemptAt:'123',lastNonce:9};
 await withState(runtime.files.main,runtime.identity,async(s,save)=>{s.refillHistory=history;s.refillHalt='operator review';s.opsSwapHistory={spent:'12',periodFees:'3'};s.opsSwapHalt='review';save(s);});
 const next={...f.options,statePath:f.directory+'/refill-next.json'};
 await assert.rejects(handoffRuntime(f.options,{...next,nativeRefill:undefined}),/preserve refill/);
 await assert.rejects(handoffRuntime(f.options,{...next,nativeRefill:{...next.nativeRefill,maxPerPeriod:'3000000'}}),/preserve refill/);
 assert.equal((await handoffRuntime(f.options,next)).status,'complete');
 const moved=JSON.parse(fs.readFileSync(next.statePath));assert.deepEqual(moved.refillHistory,history);assert.equal(moved.refillHalt,'operator review');assert.deepEqual(moved.opsSwapHistory,{spent:'12',periodFees:'3'});assert.equal(moved.opsSwapHalt,'review');
});
test('runtime handoff retires old owner, starts fresh discovery and is repeatable',async t=>{
 const f=await setup(t),nonce=await f.provider.getTransactionCount(await f.admin.getAddress());
 assert.equal((await handoffRuntime(f.options,f.next)).status,'complete');assert.equal((await handoffRuntime(f.options,f.next)).alreadyCompleted,true);
 assert.equal((await runPromoAutomation(f.options)).reason,'runtimeRetired');
 const r=await runPromoAutomation(f.next);assert(!['error','blocked'].includes(r.status),JSON.stringify(r));assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()),nonce);
});
test('interruption after retirement resumes the same handoff and rejects a different successor',async t=>{
 const f=await setup(t);await assert.rejects(handoffRuntime(f.options,f.next,{afterRetire:()=>{throw Error('injected crash');}}),/injected crash/);
 assert.equal((await runPromoAutomation(f.options)).reason,'runtimeRetired');assert(!fs.existsSync(f.next.statePath));
 await assert.rejects(handoffRuntime(f.options,{...f.next,statePath:f.directory+'/other.json'}),/Different handoff/);
 assert.equal((await handoffRuntime(f.options,f.next)).status,'complete');
});
test('handoff rejects unresolved parent intent and leaves old state active',async t=>{
 const f=await setup(t),runtime=await prepareRuntime(f.options);
 await withState(runtime.files.main,runtime.identity,async(s,save)=>{s.pending={stage:'broadcast'};save(s);});
 await assert.rejects(handoffRuntime(f.options,f.next),/Resolve main pending/);assert(!f.read().handoff);assert(!fs.existsSync(f.next.statePath));
});
test('handoff rejects child lock, overlapping paths and frozen draw',async t=>{
 const f=await setup(t);fs.writeFileSync(f.options.statePath+'.scheduler.lock','999999');
 await assert.rejects(handoffRuntime(f.options,f.next),/state locked/);assert(!f.read().handoff);fs.unlinkSync(f.options.statePath+'.scheduler.lock');
 await assert.rejects(handoffRuntime(f.options,{...f.next,statePath:f.options.statePath+'.rng'}),/paths overlap/);
 await assert.rejects(handoffRuntime(f.options,{...f.next,statePath:f.options.statePath+'.tmp'}),/paths overlap/);
 await frozen(f);await assert.rejects(handoffRuntime(f.options,f.next),/Finish active SHORT/);assert(!f.read().handoff);
});
const {beacon,sent,rpc}=require('./fixtures/promo-automation.cjs');
const {ethers}=require('ethers');
test('handoff rediscovers an unpaid on-chain reward after campaign rollover without copying the queue',async t=>{
 const f=await setup(t),job=await frozen(f),stop=new AbortController();
 await runPromoAutomation({...f.options,signal:stop.signal},{getBeacon:beacon,onStep:s=>{if(s.action==='finishShort')stop.abort();}});
 const wallet=await f.admin.getAddress(),id=job.artifact.request.drawId,debt=await f.vault.reward(id,wallet);assert(debt>0n);
 const end=(await f.provider.getBlock('latest')).timestamp+10000;await sent(f.collector.rollCampaign(1,[end,f.options.fundingJob.recipients,[10000,0,0]]));
 f.next.fundingJob={...f.next.fundingJob,campaignId:'2'};f.next.schedulerConfig={...f.config,campaignId:'2'};
 const before=await f.quote.balanceOf(wallet);await handoffRuntime(f.options,f.next);
 const r=await runPromoAutomation(f.next,{getBeacon:beacon});assert.equal(r.steps.filter(s=>s.action==='claim').length,1,JSON.stringify(r));assert.equal(await f.quote.balanceOf(wallet)-before,debt);
 const again=await runPromoAutomation(f.next,{getBeacon:beacon});assert(!again.steps.some(s=>s.action==='claim'));
});
test('drain suppresses fresh jobs and child unknown journals block handoff',async t=>{
 const f=await setup(t);await rpc('evm_increaseTime',[21601]);await rpc('evm_mine');
 const r=await runPromoAutomation({...f.options,drain:true});assert(!r.steps.some(s=>['begin','beginMonth'].includes(s.action)));assert.equal(await f.short.activeProposal(),ethers.ZeroHash);
 const {normalize}=require('../scripts/promo-automation.cjs'),sender=await f.admin.getAddress();
 for(const [suffix,config]of [['funding',normalize({worker:'infinity-v1',job:f.options.fundingJob,sender})],['rng',normalize({worker:'drand-delivery-v1',job:f.options.deliveryJob,sender})],['scheduler',f.config]]){
  const file=f.options.statePath+'.'+suffix;await withState(file,config,async(s,save)=>{s.pending={stage:'broadcast'};save(s);});
  await assert.rejects(handoffRuntime(f.options,f.next),new RegExp('Resolve '+suffix+' pending'));assert(!f.read().handoff);
  await withState(file,config,async(s,save)=>{delete s.pending;save(s);});
 }
});

test('campaign handoff refuses to drop old creator credit and accepts its on-chain legacy witness',async t=>{
 const f=await fixture(t),recipient=await f.executor.getAddress();await rpc('evm_increaseTime',[101]);await rpc('evm_mine');
 let end=(await f.provider.getBlock('latest')).timestamp+100;
 const recipients=[f.vault.target,recipient,ethers.ZeroAddress],bps=[5000,5000,0];
 await sent(f.collector.rollCampaign(1,[end,recipients,bps]));f.options.fundingJob={...f.options.fundingJob,campaignId:'2',recipients,bps};
 await runPromoAutomation(f.options);await sent(f.quote.mint(f.collector.target,600));await sent(f.collector.pull());assert.equal(await f.collector.credit(recipient),300n);
 await rpc('evm_increaseTime',[101]);await rpc('evm_mine');end=(await f.provider.getBlock('latest')).timestamp+1000;
 const nextRecipients=[f.vault.target,ethers.ZeroAddress,ethers.ZeroAddress];await sent(f.collector.rollCampaign(2,[end,nextRecipients,[10000,0,0]]));
 const next={...f.options,statePath:f.directory+'/next.json',fundingJob:{...f.options.fundingJob,campaignId:'3',recipients:nextRecipients,bps:[10000,0,0]}};
 await assert.rejects(handoffRuntime(f.options,next),/drops unpaid creator credit/);assert(!f.read().handoff);
 next.fundingJob.legacy=[{recipient,campaignId:'2',slot:1}];await handoffRuntime(f.options,next);
 const before=await f.quote.balanceOf(recipient);await runPromoAutomation(next);assert.equal(await f.quote.balanceOf(recipient)-before,300n);
});

test('handoff rejects disabling Monthly and a noncanonical RNG anchor before retirement',async t=>{
 const f=await fixture(t),{MONTHLY_ACTIONS}=require('../scripts/promo-automation.cjs');f.options.ops.schema='local-promo-automation-v1';for(const a of MONTHLY_ACTIONS)f.options.ops.gasUnits[a]='3000000';await runPromoAutomation(f.options);
 const next={...f.options,statePath:f.directory+'/next.json'};
 await assert.rejects(handoffRuntime(f.options,{...next,ops:{...next.ops,schema:'local-short-automation-v1'}}),/cannot disable Monthly/);
 await assert.rejects(handoffRuntime(f.options,{...next,deliveryJob:{...next.deliveryJob,anchor:{...next.deliveryJob.anchor,hash:ethers.ZeroHash}}}),/RNG anchor mismatch/);assert(!f.read().handoff);
 assert.equal((await handoffRuntime(f.options,next)).status,'complete');
});

test('project source survives campaign rollover with 90/5/5 credits and history; source migration rejected',async t=>{
 const f=await fixture(t),source=await (await f.provider.getSigner(3)).getAddress(),team=await (await f.provider.getSigner(4)).getAddress();
 const recipients=[f.vault.target,source,team],bps=[9000,500,500];
 await rpc('evm_increaseTime',[101]);await rpc('evm_mine');
 await sent(f.collector.rollCampaign(1,[(await f.provider.getBlock('latest')).timestamp+100,recipients,bps]));
 f.options.fundingJob={...f.options.fundingJob,campaignId:'2',recipients,bps};
 f.options.nativeRefill={kind:'PROJECT_NATIVE',source,minimumBalance:'1000',transferGas:'30000',maxPerRefill:'1000000',maxPerPeriod:'2000000',periodSeconds:'86400',cooldownSeconds:'60'};
 await runPromoAutomation({...f.options,drain:true});
 await sent(f.quote.mint(f.collector.target,1000));await sent(f.collector.pull());assert.equal(await f.collector.credit(source),50n);assert.equal(await f.collector.credit(team),50n);
 const runtime=await prepareRuntime(f.options),history={windowStart:'0',spent:'1234',lastAttemptAt:'123',lastNonce:9};
 await withState(runtime.files.main,runtime.identity,async(s,save)=>{s.refillHistory=history;save(s);});
 await rpc('evm_increaseTime',[101]);await rpc('evm_mine');
 await sent(f.collector.rollCampaign(2,[(await f.provider.getBlock('latest')).timestamp+1000,recipients,bps]));
 const next={...f.options,statePath:f.directory+'/project-next.json',fundingJob:{...f.options.fundingJob,campaignId:'3'}};
 await assert.rejects(handoffRuntime(f.options,{...next,nativeRefill:{...next.nativeRefill,source:team}}),/slot1/);
 await assert.rejects(handoffRuntime(f.options,{...next,fundingJob:{...next.fundingJob,recipients:[recipients[0],team,source]},nativeRefill:{...next.nativeRefill,source:team}}),/preserve refill/);
 await handoffRuntime(f.options,next);assert.deepEqual(JSON.parse(fs.readFileSync(next.statePath)).refillHistory,history);
 const before=await f.quote.balanceOf(source);await runPromoAutomation({...next,drain:true});assert.equal(await f.quote.balanceOf(source)-before,50n);
});
