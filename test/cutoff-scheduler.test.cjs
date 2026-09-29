const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs'),{runScheduler}=require('../scripts/local-promo-scheduler.cjs');
const {setup}=require('./fixtures/local-scheduler.cjs'),{sent,advance,rpc}=require('./fixtures/local-controllers.cjs');
const {normalRules}=require('./fixtures/short-outcome.cjs'),{hash}=require('../scripts/direct-buy.cjs');
const {initialAdapters}=require('../scripts/buy-policy-format.cjs');
const compiled=compile({writeArtifacts:false});
test('persistent indexer feeds lifecycle; missing cache waits while frozen draws finish',async t=>{
 const f=await start(t),fs=require('node:fs');
 f.config.indexer={statePath:f.options.statePath+'.index',maxAgeSeconds:120};
 const sync=()=>require('../scripts/persistent-buy-indexer.cjs').indexOnce({config:f.config,rpc:(m,p)=>f.provider.send(m,p),statePath:f.config.indexer.statePath,batchSize:1000});
 await sent(f.registry.register());await f.buy(f.admin,100);await advance(30*86400+1);
 f.setFinalized((await f.provider.getBlock('latest')).number);
 let r=await f.tick();assert.equal(r.results.SHORT.reason,'indexerUnavailable');assert.equal(await f.short.activeProposal(),ethers.ZeroHash);
 await sync();await f.tick();
 await rpc('evm_mine');f.setFinalized((await f.provider.getBlock('latest')).number);await sync();
 await f.tick(32);
 const state=f.readState();
 for(const [kind,c] of [['SHORT',f.short],['MONTHLY',f.monthly]]){
  const draw=state.jobs[kind][0].job.artifact.request.drawId;assert.notEqual(await c.drawRequest(draw),0n);
  let seed=ethers.ZeroHash;
  if(kind==='SHORT'){
   // Local RNG fixture: deterministically exercise the payout branch, not a lucky seed.
   const proposal=await f.short.datasetProposal(state.jobs.SHORT[0].job.proposalId),policy=await f.short.shortEpochPolicy(proposal.request.rulesEpoch);
   const threshold=require('../scripts/short-outcome.cjs').threshold(1n,policy.outcome);
   let found=false;for(let n=0;n<1000;n++){
    seed=ethers.id('reward test '+n);
    const rank=BigInt(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32','bytes32','bytes32','address'],[ethers.id('SHORT_ADMISSION_V1'),proposal.context,seed,await f.admin.getAddress()])));
    if(rank<threshold){found=true;break;}
   }assert(found,'fixture payout seed');
  }
  await sent(f.random.deliver(await c.drawRequest(draw),seed));
 }
 fs.renameSync(f.config.indexer.statePath,f.config.indexer.statePath+'.offline');
 await f.tick(32);assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash);
 fs.renameSync(f.config.indexer.statePath+'.offline',f.config.indexer.statePath);
 await advance(30*86400+1);f.setFinalized((await f.provider.getBlock('latest')).number);await sync();
 r=await f.tick();assert.equal(r.results.SHORT.reason,'empty');assert.equal(r.results.MONTHLY.reason,'empty');
 assert.equal(f.readState().jobs.SHORT.length,1);assert.equal(f.readState().jobs.MONTHLY.length,1);
 const api=require('../scripts/user-status-api.cjs'),wallet=await f.admin.getAddress();
 let view=api.walletStatus({config:f.config,wallet});assert.equal(view.status,'observed');
 assert.equal(view.balances.SHORT.open,'0');assert.equal(view.balances.SHORT.consumedTotal,'1');assert.equal(view.balances.MONTHLY.consumedTotal,'1');
 assert.equal(view.purchases.items.length,1);
 assert(view.rewards.items.length>0);assert(view.rewards.items.every(r=>r.status==='assigned'&&r.payment===null));
 const prize=view.rewards.items[0];await sent(f.vault.claim(prize.drawId,wallet));
 f.setFinalized((await f.provider.getBlock('latest')).number);await sync();
 view=api.walletStatus({config:f.config,wallet});const paid=view.rewards.items.find(r=>r.drawId===prize.drawId);
 assert.equal(paid.status,'paid');assert(paid.payment.transactionHash);assert.equal(await f.vault.reward(prize.drawId,wallet),0n);
 // A failed duplicate claim cannot manufacture a second payment.
 await assert.rejects(f.vault.claim(prize.drawId,wallet));
 view=api.walletStatus({config:f.config,wallet,now:Date.now()+121000});assert.equal(view.status,'stale');assert.equal(view.balances.SHORT.consumedTotal,'1');
 const server=api.createServer(f.config);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
 const url='http://127.0.0.1:'+server.address().port+'/v1/wallets/'+wallet;
 assert.equal((await fetch(url)).status,200);assert.equal((await fetch(url+'?limit=101')).status,400);assert.equal((await fetch(url,{method:'POST'})).status,405);
 fs.renameSync(f.config.indexer.statePath,f.config.indexer.statePath+'.offline');
 const unavailable=await fetch(url);assert.equal(unavailable.status,503);assert.equal((await unavailable.json()).balances,null);
});
test('policy publication reorg with cached unstarted job cannot silently replace its artifact',async t=>{
 const f=await start(t);f.config.indexer={statePath:f.options.statePath+'.index',maxAgeSeconds:120};
 const sync=()=>require('../scripts/persistent-buy-indexer.cjs').indexOnce({config:f.config,rpc:(m,p)=>f.provider.send(m,p),statePath:f.config.indexer.statePath,batchSize:1000});
 await sent(f.registry.register());await f.buy(f.admin,100);await advance(30*86400+1);
 const point=await rpc('evm_snapshot');
 const fromBlock=(await f.provider.getBlock('latest')).number+8;
 const next={...structuredClone(f.config.manifest),schema:'direct-buy-v2',routeVersion:'scheduled-routes-v1',routes:[{id:f.config.manifest.routeVersion,fromBlock:0},{id:'rh-ur-10-060c0f-v1',fromBlock}]};
 const tx=await require('../scripts/publish-buy-policy.cjs').publishBuyPolicy({trust:f.config.buyPolicy,genesis:f.config.manifest,next,signer:f.admin,rpc,persist:async()=>{}});await tx.wait();
 for(let i=0;i<10;i++)await rpc('evm_mine');f.setFinalized((await f.provider.getBlock('latest')).number);await sync();await f.tick(1,['SHORT']);
 await rpc('evm_mine');f.setFinalized((await f.provider.getBlock('latest')).number);await sync();await f.tick(1,['SHORT']);
 const old=f.readState().jobs.SHORT[0];assert(old);assert.equal(await f.short.activeProposal(),ethers.ZeroHash);
 const oldHash=hash(old),height=(await f.provider.getBlock('latest')).number;
 await rpc('evm_revert',[point]);await advance(1);
 while((await f.provider.getBlock('latest')).number<height)await rpc('evm_mine');
 f.setFinalized((await f.provider.getBlock('latest')).number);const indexed=await sync();assert(indexed.removedBlocks>0);
 const nonce=await f.provider.getTransactionCount(await f.admin.getAddress());
 const result=await runScheduler({...f.options,provider:f.provider,kinds:['SHORT']},{maxTicks:1});
 assert.equal(result.status,'error');assert.match(result.results.SHORT.message,/Stored job BUY policy mismatch/);
 assert.equal(hash(f.readState().jobs.SHORT[0]),oldHash);assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()),nonce);assert.equal(await f.short.activeProposal(),ethers.ZeroHash);
});
async function start(t,options={}){
 const f=await setup(t,compiled,options),owner=await f.admin.getAddress();
 const p=await f.deploy('BuyPolicySource',[f.config.lifecycle.instanceId,hash(f.config.manifest),owner,2,initialAdapters(f.config.manifest)]);
 f.config.buyPolicy={chainId:31337,source:p.target,sourceCodeHash:ethers.keccak256(await f.provider.getCode(p.target)),publisher:owner,instanceId:f.config.lifecycle.instanceId,genesisHash:hash(f.config.manifest),noticeBlocks:2};
 f.config.cutoffMode='FINALIZED_CHECKPOINT';let finalized=(await f.provider.getBlock('latest')).number;
 const provider=new Proxy(f.provider,{get(target,key){if(key==='send')return (m,p)=>target.send(m,m==='eth_getBlockByNumber'&&p[0]==='finalized'?['0x'+finalized.toString(16),false]:p);const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});
 const tick=async(maxTicks=1,kinds)=>{const r=await runScheduler({...f.options,provider,...(kinds?{kinds}:{})},{maxTicks});assert.notEqual(r.status,'error',JSON.stringify(r));return r;};
 return {...f,provider,tick,setFinalized:n=>{finalized=n;}};
}

test('finalized checkpoint scheduler waits without proposals, resumes aged cutoffs and settles both draws',async t=>{
 const f=await start(t);await sent(f.registry.register());await f.buy(f.admin,100);f.setFinalized((await f.provider.getBlock('latest')).number);await rpc('evm_mine');await advance(30*86400+1);
 await f.tick();const candidates=f.readState().cutoffs;
 assert.equal(f.readState().jobs.SHORT.length,0);assert.equal(f.readState().jobs.MONTHLY.length,0);
 assert.equal(await f.short.activeProposal(),ethers.ZeroHash);assert.equal(await f.monthly.activeMonth(),ethers.ZeroHash);
 await rpc('hardhat_mine',['0x12c']);let result=await f.tick();
 assert.equal(result.results.SHORT.reason,'cutoffFinality');assert.equal(await f.vault.reserved(f.quote.target),0n);
 f.setFinalized(candidates.SHORT.number);result=await f.tick();assert.equal(result.results.SHORT.reason,'cutoffCheckpointFinality');
 f.setFinalized((await f.provider.getBlock('latest')).number);await f.tick();
 let state=f.readState();for(const kind of ['SHORT','MONTHLY'])assert.equal(Number(state.jobs[kind][0].job.artifact.snapshot.cutoff.blockNumber),candidates[kind].number);
 await f.tick(32);state=f.readState();
 for(const [kind,c] of [['SHORT',f.short],['MONTHLY',f.monthly]]){
  const id=state.jobs[kind][0].job.artifact.request.drawId;assert.notEqual(await c.drawRequest(id),0n);
  await sent(f.random.deliver(await c.drawRequest(id),ethers.ZeroHash));
 }
 await f.tick(32);
 assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash);
 assert.equal(await f.vault.reserved(f.quote.target),0n);
});

test('finalized checkpoint scheduler closes empty draining epochs after aging',async t=>{
 const f=await start(t);await sent(f.short.announce(normalRules,[7,5,3],1));await sent(f.monthly.announce(normalRules));
 await advance(30*86400+1);await sent(f.short.activate());await sent(f.monthly.activate());await rpc('hardhat_mine',['0x3']);f.setFinalized((await f.provider.getBlock('latest')).number);
 await f.tick();await rpc('hardhat_mine',['0x12c']);
 f.setFinalized((await f.provider.getBlock('latest')).number);await f.tick(2);
 assert.equal(await f.short.drainingShortEpoch(),0n);assert.equal(await f.monthly.drainingMonthlyEpoch(),0n);
 assert.equal(await f.vault.reserved(f.quote.target),0n);
});

test('checkpoint candidate recovers a pre-proposal reorg and an unsent expiry without occupying a draw',async t=>{
 const f=await start(t);await sent(f.registry.register());await f.buy(f.admin,100);f.setFinalized((await f.provider.getBlock('latest')).number);await advance(30*86400+1);const snap=await rpc('evm_snapshot');
 await advance(2);await rpc('evm_mine');await f.tick();const before=f.readState().cutoffs.SHORT;
 await rpc('evm_revert',[snap]);await advance(3);let result=await f.tick();assert.equal(result.results.SHORT.action,'discardCutoff');
 assert.equal(f.readState().jobs.SHORT.length,0);assert.equal(await f.short.activeProposal(),ethers.ZeroHash);
 const {prepareCutoff}=require('../scripts/cutoff-checkpoint.cjs');const old=(await f.provider.getBlock('latest'));
 const state={cutoffs:{SHORT:{number:old.number,hash:old.hash}}};await rpc('hardhat_mine',['0x12c']);
 result=await prepareCutoff({provider:f.provider,source:f.short,publisher:f.admin,kind:'SHORT',state,save:()=>{},finalized:old});
 assert.equal(result.action,'discardCutoff');assert.match(state.lastCutoffDiscard.reason,/expired/);
 assert.equal(await f.short.cutoffHashes(before.number),ethers.ZeroHash);
});


test('finalized checkpoint mode does not spend gas on an empty current epoch',async t=>{
 const f=await start(t);await advance(30*86400+1);f.setFinalized((await f.provider.getBlock('latest')).number);
 const before=await f.provider.getTransactionCount(await f.admin.getAddress());const result=await f.tick();
 assert.equal(result.results.SHORT.reason,'empty');assert.equal(result.results.MONTHLY.reason,'empty');
 assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()),before);assert.equal(require('node:fs').existsSync(f.statePath),false);
});


test('maximum begin delay does not make checkpoint capture expire before broadcast',async()=>{
 const f=await require('./fixtures/local-controllers.cjs').fixture(compiled,{cutoffDelayBlocks:256});
 const {prepareCutoff}=require('../scripts/cutoff-checkpoint.cjs');const state={};
 let finalized=await f.provider.getBlock('latest');
 const args={provider:f.provider,source:f.short,publisher:f.admin,kind:'SHORT',state,save:()=>{},finalized};
 let result=await prepareCutoff(args);assert.equal(result.action,'checkpointCutoff');
 assert.equal(await f.short.cutoffHashes(state.cutoffs.SHORT.number),state.cutoffs.SHORT.hash);
 await rpc('hardhat_mine',['0x110']);finalized=await f.provider.getBlock('latest');
 result=await prepareCutoff({...args,finalized});assert.equal(result.status,'ready');
});


test('FREE_SHORT finalized funding wait refreshes only an unused cutoff and preserves saved budget on restart',async t=>{
 const f=await start(t,{maxBudget:ethers.MaxUint256,weights:[2000]});
 f.config.shortBudgetMode='FREE_SHORT';delete f.config.shortBudget;
 const tick=(n=1)=>f.tick(n,['SHORT']);
 const finalize=async()=>f.setFinalized((await f.provider.getBlock('latest')).number);
 await sent(f.registry.register());await f.buy(f.admin,100);await advance(6*3600+1);await finalize();
 await tick();const old=f.readState().cutoffs.SHORT;
 await finalize();let r=await tick();assert.equal(r.results.SHORT.reason,'prizeFunding');
 const nonce=await f.provider.getTransactionCount(await f.admin.getAddress());
 await rpc('hardhat_mine',['0x3']);await finalize();
 for(let i=0;i<3;i++)assert.equal((await tick()).results.SHORT.reason,'prizeFunding');
 assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()),nonce);
 assert.deepEqual(f.readState().cutoffs.SHORT,old);
 assert.equal(f.readState().jobs.SHORT.length,0);
 // Sufficient latest funding is not sufficient finalized evidence yet.
 await sent(f.quote.approve(f.vault.target,ethers.MaxUint256));await sent(f.vault.fundUSDG(2000,1));
 assert.equal((await tick()).results.SHORT.reason,'prizeFunding');
 assert.deepEqual(f.readState().cutoffs.SHORT,old);
 await rpc('evm_mine');await finalize();
 r=await tick();assert.equal(r.results.SHORT.action,'discardCutoff');
 assert.equal(f.readState().cutoffs.SHORT,undefined);
 assert.equal(await f.short.cutoffHashes(old.number),old.hash);
 assert.equal(await f.short.activeProposal(),ethers.ZeroHash);
 await tick();const fresh=f.readState().cutoffs.SHORT;assert(fresh.number>old.number);
 await finalize();r=await tick();assert.equal(r.results.SHORT.action,'saveJob');
 const job=f.readState().jobs.SHORT[0].job;
 assert.equal(job.artifact.request.budget,'3000');
 assert.equal(job.artifact.snapshot.participants.length,1);
 assert.equal(job.artifact.snapshot.participants[0].firstAttempt,'1');
 assert.equal(job.artifact.snapshot.participants[0].lastAttempt,'1');
 // New invocations reload disk; later funding cannot rewrite even an unbegun job.
 await sent(f.vault.fundUSDG(4000,1));await finalize();
 r=await tick(32);assert.equal(r.results.SHORT.reason,'seed');
 assert.equal(f.readState().jobs.SHORT[0].job.commitment,job.commitment);
 assert.equal((await f.vault.draws(job.artifact.request.drawId)).budget,3000n);
 assert.equal(await f.vault.freeShort(),4000n);
 await sent(f.random.deliver(await f.short.drawRequest(job.artifact.request.drawId),ethers.ZeroHash));
 await tick(32);
 assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);
 assert.equal((await f.ledger()).draws.length,1);
});
