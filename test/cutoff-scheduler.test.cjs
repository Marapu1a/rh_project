const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs'),{runScheduler}=require('../scripts/local-promo-scheduler.cjs');
const {setup}=require('./fixtures/local-scheduler.cjs'),{sent,advance,rpc}=require('./fixtures/local-controllers.cjs');
const {normalRules}=require('./fixtures/short-outcome.cjs'),{hash}=require('../scripts/direct-buy.cjs');
const {initialAdapters}=require('../scripts/buy-policy-format.cjs');
const compiled=compile({writeArtifacts:false});
async function start(t){
 const f=await setup(t,compiled),owner=await f.admin.getAddress();
 const p=await f.deploy('BuyPolicySource',[f.config.lifecycle.instanceId,hash(f.config.manifest),owner,2,initialAdapters(f.config.manifest)]);
 f.config.buyPolicy={chainId:31337,source:p.target,sourceCodeHash:ethers.keccak256(await f.provider.getCode(p.target)),publisher:owner,instanceId:f.config.lifecycle.instanceId,genesisHash:hash(f.config.manifest),noticeBlocks:2};
 f.config.cutoffMode='FINALIZED_CHECKPOINT';let finalized=(await f.provider.getBlock('latest')).number;
 const provider=new Proxy(f.provider,{get(target,key){if(key==='send')return (m,p)=>target.send(m,m==='eth_getBlockByNumber'&&p[0]==='finalized'?['0x'+finalized.toString(16),false]:p);const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});
 const tick=async(maxTicks=1)=>{const r=await runScheduler({...f.options,provider},{maxTicks});assert.notEqual(r.status,'error',JSON.stringify(r));return r;};
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
