const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs'),{fixture,rpc,sent,advance}=require('./fixtures/local-controllers.cjs');
const sw=require('../scripts/local-short-executor.cjs'),mw=require('../scripts/local-monthly-executor.cjs'),cache=require('../scripts/verified-draw-cache.cjs');
const sd=require('../scripts/short-dataset.cjs'),md=require('../scripts/monthly-dataset.cjs'),mo=require('../scripts/monthly-outcome.cjs');
const {normalRules,participants}=require('./fixtures/short-outcome.cjs'),{domainFor,snapshotFor}=require('../scripts/attempt-lifecycle.cjs');
const {hash}=require('../scripts/direct-buy.cjs'),{drawIdFor}=require('../scripts/draw-id.cjs');
const compiled=compile();
async function setup(t){
 const f=await fixture(compiled,{monthlyRules:mo.RULES});t.after(()=>f.provider.destroy());await f.fundExecution();await advance(30*86400+1);
 const code=async c=>ethers.keccak256(await f.provider.getCode(c.target)),sg=await f.short.shortEpochPolicy(1),mg=await f.monthly.monthlyEpochPolicy(1);
 const config={schema:'attempt-lifecycle-v4',source:f.short.target,sourceCodeHash:await code(f.short),instanceId:await f.short.datasetInstance(),monthlySource:f.monthly.target,monthlySourceCodeHash:await code(f.monthly),monthlyInstanceId:await f.monthly.monthlyInstance(),vault:f.vault.target,vaultCodeHash:await code(f.vault),
  shortRules:{rulesHash:sg.hash,noticeSeconds:String(await f.short.shortRulesNotice()),startedAt:String(await f.short.shortRulesStartedAt()),firstBlock:String(sg.firstBlock)},monthlyPolicy:{rulesHash:mg.hash,interval:String(await f.monthly.monthlyInterval()),startedAt:String(await f.monthly.monthlyStartedAt())},monthlyRules:{noticeSeconds:String(await f.monthly.monthlyRulesNotice()),firstBlock:String(mg.firstBlock)}};
 const domain=domainFor({chainId:'31337',registry:f.registry.target,quote:f.quote.target,token:f.token.target},config),b=await f.provider.getBlock('latest');
 const ps=participants(130).map(p=>({wallet:p.wallet.toLowerCase(),count:String(p.lastAttempt),firstAttempt:'1',lastAttempt:String(p.lastAttempt)})),attempts=String(ps.reduce((a,p)=>a+BigInt(p.count),0n));
 const jobs=[];
 for(const kind of ['SHORT','MONTHLY']){
  const s=kind==='SHORT',c=s?f.short:f.monthly,id=drawIdFor(kind,ethers.id('verified '+kind)),pid=ethers.id('verified proposal');
  const snapshot=snapshotFor(domain,id,kind,{blockNumber:b.number,blockHash:b.hash},s?sg.hash:mg.hash,ps,1);
  const request=s?{drawId:id,campaignId:1,rulesEpoch:1,cutoffBlockNumber:b.number,cutoffBlockHash:b.hash,snapshotHash:hash(snapshot),expectedRoot:sd.rootFor(ps),expectedCount:ps.length,expectedAttempts:attempts,budget:101}:
   {drawId:id,campaign:1,rulesEpoch:1,cutoff:b.number,cutoffHash:b.hash,snapshotHash:hash(snapshot),root:md.rootFor(ps),count:ps.length,attempts};
  const artifact={schema:s?'short-dataset-artifact-v1':'monthly-dataset-artifact-v1',snapshot,request,rules:s?normalRules:mo.RULES,...(s?{weights:[7,5,3],minimumUnit:1}:{})};
  const job=s?sw.makeJob(artifact,pid):mw.makeMonthlyJob(artifact),step=s?sw.stepShort:mw.stepMonthly;
  const options={provider:f.provider,source:c,job,publisher:f.admin,executor:f.executor};
  // Exercise incremental publication through the actual workers too.
  for(let i=0;i<5;i++)assert.equal((await step(options)).status,'progress'); // begin, 3 chunks, seal
  await sent(f.random.deliver(await c.drawRequest(id),ethers.id('fixed verified seed')));
  jobs.push({kind,s,c,id,job,step,options,state:()=>c[s?'settlements':'month'](id)});
 }
 return {...f,jobs};
}
async function reads(f,run){let count=0;const original=f.provider.getTransaction;f.provider.getTransaction=function(...args){count++;return original.apply(this,args);};try{return {value:await run(),count};}finally{f.provider.getTransaction=original;}}
test('verified publication reuses evidence, independently finishes both draws and survives cold cache',async t=>{
 const f=await setup(t);
 for(const j of f.jobs){
  const first=await reads(f,()=>j.step(j.options));assert(first.count>=3);assert.equal((await j.state()).nextChunk,1n);
  const warm=await reads(f,()=>j.step(j.options));assert(warm.count<=1);assert.equal((await j.state()).nextChunk,2n);
  cache.clear(f.provider,j.kind); // Fresh process has no proof; persisted chain progress remains authoritative.
  const cold=await reads(f,()=>j.step(j.options));assert(cold.count>=3);assert.equal((await j.state()).nextChunk,3n);
  assert.equal((await j.step(j.options)).action,j.s?'finishShort':'finishMonth');
  assert.equal((await j.step(j.options)).status,'terminal');
 }
 assert.equal(await f.vault.reserved(f.quote.target),0n);
 assert.equal(await f.quote.balanceOf(f.vault.target),await f.vault.freeShort()+await f.vault.freeCurrent()+await f.vault.freeNext()+await f.vault.claimable(f.quote.target));
});
test('edited job cannot reuse proof, immutable private copy and live chunk hash remain enforced',async t=>{
 const f=await setup(t);
 for(const j of f.jobs){
  await j.step(j.options);const nonce=await f.provider.getTransactionCount(await f.executor.getAddress());
  const boundary={preflight:()=>{throw Object.assign(Error('expected coordinator pause'),{code:'LOCAL_BUDGET_WAIT'});}};
  for(let i=0;i<2;i++){
   const paused=await reads(f,()=>assert.rejects(()=>require('../scripts/local-receipt.cjs').withTransactionBoundary(boundary,()=>j.step(j.options)),/expected coordinator pause/));
   assert.equal(paused.count,0,'A pre-send budget yield must retain the verified publication');
  }
  const privateArtifact=(j.s?sw:mw).validateCachedJob(f.provider,j.job);assert(Object.isFrozen(privateArtifact.snapshot.participants[0]));
  const edited=structuredClone(j.job);edited.artifact.snapshot.participants[0].lastAttempt='999';
  await assert.rejects(()=>j.step({...j.options,job:edited}),/checksum/);
  const {commitment,...payload}=edited;edited.commitment=hash(payload);
  await assert.rejects(()=>j.step({...j.options,job:edited}),/metadata|participants|attempts/i);
  assert.equal(await f.provider.getTransactionCount(await f.executor.getAddress()),nonce);
  await j.step(j.options); // Reload valid evidence, nextChunk=2.
  const method=j.s?'datasetChunkHash':'monthChunkHash';
  const bad=new Proxy(j.c,{get(target,key){return key===method?async()=>ethers.ZeroHash:Reflect.get(target,key);}});
  const before=await f.provider.getTransactionCount(await f.executor.getAddress());
  await assert.rejects(()=>j.step({...j.options,source:bad}),/chunk changed/);
  assert.equal(await f.provider.getTransactionCount(await f.executor.getAddress()),before);
  assert((await reads(f,()=>j.step(j.options))).count>=3); // Failure invalidates the proof.
 }
});
test('real branch rollback invalidates anchor before sending, then cold verification resumes',async t=>{
 const f=await setup(t),point=await rpc('evm_snapshot');await rpc('evm_mine');
 for(const j of f.jobs)await j.step(j.options);
 await rpc('evm_revert',[point]);await rpc('evm_increaseTime',[5]);await rpc('evm_mine');
 for(const j of f.jobs){
  const before=await f.provider.getTransactionCount(await f.executor.getAddress());
  await assert.rejects(()=>j.step(j.options),/anchor (changed|unavailable)/);
  assert.equal(await f.provider.getTransactionCount(await f.executor.getAddress()),before);
  assert((await reads(f,()=>j.step(j.options))).count>=3);assert.equal((await j.state()).nextChunk,1n);
 }
});
test('changed deployment code cannot reuse warm proof',async t=>{
 const f=await setup(t),j=f.jobs[0];await j.step(j.options);
 const code=await f.provider.getCode(j.c.target),before=await f.provider.getTransactionCount(await f.executor.getAddress());
 await rpc('hardhat_setCode',[j.c.target,'0x00']);
 await assert.rejects(()=>j.step(j.options),/runtime mismatch/);
 assert.equal(await f.provider.getTransactionCount(await f.executor.getAddress()),before);
 await rpc('hardhat_setCode',[j.c.target,code]);assert((await reads(f,()=>j.step(j.options))).count>=3);
});
test('anchor changing during cold verification discards the proof; binding and seed changes cannot reuse old results',async()=>{
 let blockHash=ethers.id('branch A'),validations=0,loads=0,calculations=0;
 const provider={send:async()=>({number:'0x10',hash:blockHash})},job={artifact:{snapshot:{participants:[{count:'1'}]}}};
 const get=()=>cache.get(provider,'SHORT',job,()=>validations++),read=async()=>({root:'A'});
 await assert.rejects(()=>get().publication({root:'A'},read,async()=>{blockHash=ethers.id('branch B');return {publications:[{count:1}]};}),/anchor changed/);
 const handle=get();assert.equal(validations,2);
 const load=async()=>{loads++;return {publications:[{count:1}]};};
 const value=await handle.publication({root:'A'},read,load);assert(Object.isFrozen(value.publications[0]));
 await handle.publication({root:'A'},read,load);assert.equal(loads,1);
 // Walking an unrelated old terminal job must not displace the current draw proof.
 cache.validate(provider,'SHORT',{old:true},()=>true);
 assert.equal(get(),handle);await handle.publication({root:'A'},read,load);assert.equal(loads,1);
 assert.equal(handle.expected({seed:'A'},()=>++calculations),1);assert.equal(handle.expected({seed:'A'},()=>++calculations),1);
 assert.equal(handle.expected({seed:'B'},()=>++calculations),2);
 await handle.publication({root:'B'},async()=>({root:'B'}),load);assert.equal(loads,2);
 assert.equal(handle.expected({seed:'B'},()=>++calculations),3);
 await assert.rejects(()=>handle.publication({root:'C'},read,load),/Draw changed/);
 get();assert.equal(validations,3);
});
