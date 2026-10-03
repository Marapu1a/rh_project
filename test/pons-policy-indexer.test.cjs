const {test}=require('node:test'),assert=require('node:assert/strict');
const {ethers}=require('ethers'),{fixture}=require('./fixtures/pons-indexer.cjs');
const {ABI,loadBuyPolicy}=require('../scripts/buy-policy-admission.cjs');
const F=require('../scripts/buy-policy-format.cjs'),D=require('../scripts/direct-buy.cjs');
const {indexOnce,readSnapshot}=require('../scripts/persistent-buy-indexer.cjs');
const {resolveBuyPolicy}=require('../scripts/buy-policy-runtime.cjs');
const {schedulerConfigFor}=require('../scripts/pons-automation.cjs');
function admitted(t){
 const f=fixture(t),source='0x'+'9'.repeat(40),publisher='0x'+'8'.repeat(40),instanceId=ethers.id('Pons fixture');
 const trust={source,publisher,instanceId,sourceCodeHash:ethers.keccak256('0x01'),genesisHash:D.hash(f.m),chainId:4663,noticeBlocks:20};
 const flags={badPublisher:false,badRuntime:false};
 const rpc=async(method,params=[])=>{
  if(method==='eth_getLogs')return [];
  if(method==='eth_getCode'&&params[0]===source)return flags.badRuntime?'0x02':'0x01';
  if(method==='eth_call'&&params[0].to===source){const name=ABI.parseTransaction({data:params[0].data}).name;
   const values={instanceId,genesisHash:trust.genesisHash,publisher:flags.badPublisher?source:publisher,noticeBlocks:20,SCHEMA_VERSION:1,genesisAdaptersHash:F.genesisAdaptersHash(f.m),publishedCount:0,currentHash:trust.genesisHash,lastFromBlock:0};return ABI.encodeFunctionResult(name,[values[name]]);}
  return f.rpc(method,params);
 };
 const config={manifest:f.m,buyPolicy:trust,indexer:{statePath:require('path').resolve(f.statePath),maxAgeSeconds:60}};
 return {...f,rpc,trust,config,flags};
}
test('Pons genesis adapters admitted explicitly; upgrades never silently cross into other routes',()=>{
 for(const P of [require('../scripts/pons-curve-buy.cjs'),require('../scripts/pons-v4-buy.cjs')]){
  const m={schema:P.SCHEMA,routeVersion:P.ID};assert.deepEqual(F.initialAdapters(m),[ethers.id(P.ID)]);assert.equal(F.extend(m,ethers.id('rh-ur-10-060c0f-v1'),100,50),null);
  assert.equal(F.extend({schema:'direct-buy-v1'},ethers.id(P.ID),100,50),null);
 }
});
test('Pons admitted snapshot is consumed via verified policy; stale/behind/branch/identity fail closed',async t=>{
 const f=admitted(t);await indexOnce({config:f.config,rpc:f.rpc,statePath:f.statePath});const resolved=await resolveBuyPolicy(f.config,f.rpc,12);
 const args={config:f.config,rpc:f.rpc,statePath:f.statePath,manifest:resolved.manifest,cutoff:12};
 const snapshot=await readSnapshot(args);assert.equal(D.replay(snapshot.manifest,snapshot.blocks).wallets[0].entriesMinted,'1');assert.equal(f.read().index.policyStatus.mode,'admitted');
 await assert.rejects(readSnapshot({...args,now:Date.now()+120000}),e=>e.reason==='indexerStale');
 await assert.rejects(readSnapshot({...args,cutoff:13}),e=>e.reason==='indexerBehind');
 await assert.rejects(readSnapshot({...args,config:{...f.config,buyPolicy:{...f.trust,publisher:f.trust.source}}}),e=>e.reason==='indexerIdentity');
 f.replace();await assert.rejects(readSnapshot(args),e=>e.reason==='indexerBranch');
});
test('source authority/runtime drift stops admission and index refresh, retaining last valid snapshot',async t=>{
 const f=admitted(t);await indexOnce({config:f.config,rpc:f.rpc,statePath:f.statePath});const before=f.read().index;
 f.flags.badPublisher=true;await assert.rejects(resolveBuyPolicy(f.config,f.rpc,12),/authority/);await assert.rejects(indexOnce({config:f.config,rpc:f.rpc,statePath:f.statePath}),/authority/);assert.deepEqual(f.read().index,before);
 f.flags.badPublisher=false;f.flags.badRuntime=true;await assert.rejects(loadBuyPolicy({trust:f.trust,genesis:f.m,rpc:f.rpc}),/runtime/);
});
test('zero-announcement policy needs no historical logs but still validates finalized commitments',async t=>{
 const f=admitted(t);let logs=0;
 const rpc=async(method,params)=>{if(method==='eth_getLogs'){logs++;throw Error('Provider log range limit');}return f.rpc(method,params);};
 assert.equal((await loadBuyPolicy({trust:f.trust,genesis:f.m,rpc})).history.versions.length,1);
 assert.equal(logs,0);
 for(const [name,value] of [['currentHash',ethers.ZeroHash],['lastFromBlock',1],['publishedCount',1]]){
  const changed=async(method,params)=>method==='eth_call'&&params[0].to===f.trust.source&&ABI.parseTransaction({data:params[0].data}).name===name?ABI.encodeFunctionResult(name,[value]):rpc(method,params);
  await assert.rejects(loadBuyPolicy({trust:f.trust,genesis:f.m,rpc:changed}),name==='publishedCount'?/Provider log range limit/:/Incomplete policy history/);
 }
 assert.equal(logs,1);
});
test('coordinator selects strict indexed config only with matching policy and snapshot config',async t=>{
 const f=admitted(t),c={manifest:f.m,lifecycle:{instanceId:f.trust.instanceId},buyPolicy:f.trust,indexer:f.config.indexer};
 const s=schedulerConfigFor(c);assert.equal(s.cutoffMode,'FINALIZED_CHECKPOINT');assert.equal(s.buyPolicyMode,'admitted');assert.equal(s.ponsRehearsal,undefined);assert.equal(s.indexer.statePath,c.indexer.statePath);
 for(const altered of [{...c,buyPolicy:undefined},{...c,indexer:undefined},{...c,buyPolicy:{...c.buyPolicy,genesisHash:ethers.ZeroHash}},{...c,indexer:{...c.indexer,maxAgeSeconds:0}}])assert.throws(()=>schedulerConfigFor(altered));
 const legacy=schedulerConfigFor({manifest:f.m,lifecycle:c.lifecycle});assert.equal(legacy.buyPolicyMode,'unadmitted');assert.equal(legacy.indexer,undefined);
});
