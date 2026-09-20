const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs'),{fixture,rpc,sent,advance}=require('./fixtures/local-controllers.cjs');
const short=require('../scripts/local-short-executor.cjs'),monthly=require('../scripts/local-monthly-executor.cjs');
const sd=require('../scripts/short-dataset.cjs'),md=require('../scripts/monthly-dataset.cjs');
const {normalRules}=require('./fixtures/short-outcome.cjs'),{domainFor,snapshotFor}=require('../scripts/attempt-lifecycle.cjs');
const {hash}=require('../scripts/direct-buy.cjs'),{drawIdFor}=require('../scripts/draw-id.cjs');
const compiled=compile();
async function setup(){
  const f=await fixture(compiled);await advance(30*86400+1);
  const manifest={chainId:'31337',registry:f.registry.target,quote:f.quote.target,token:f.token.target};
  const code=async c=>ethers.keccak256(await f.provider.getCode(c.target));
  const sg=await f.short.shortEpochPolicy(1),mg=await f.monthly.monthlyEpochPolicy(1);
  const config={schema:'attempt-lifecycle-v4',source:f.short.target,sourceCodeHash:await code(f.short),instanceId:await f.short.datasetInstance(),
    monthlySource:f.monthly.target,monthlySourceCodeHash:await code(f.monthly),monthlyInstanceId:await f.monthly.monthlyInstance(),
    vault:f.vault.target,vaultCodeHash:await code(f.vault),
    shortRules:{rulesHash:sg.hash,noticeSeconds:String(await f.short.shortRulesNotice()),startedAt:String(await f.short.shortRulesStartedAt()),firstBlock:String(sg.firstBlock)},
    monthlyPolicy:{rulesHash:mg.hash,interval:String(await f.monthly.monthlyInterval()),startedAt:String(await f.monthly.monthlyStartedAt())},
    monthlyRules:{noticeSeconds:String(await f.monthly.monthlyRulesNotice()),firstBlock:String(mg.firstBlock)}};
  const domain=domainFor(manifest,config),head=await f.provider.getBlock('latest');
  // Self-consistent synthetic artifacts isolate executor transport; not BUY evidence.
  const participants=[{wallet:(await f.admin.getAddress()).toLowerCase(),count:'1',firstAttempt:'1',lastAttempt:'1'}];
  const jobs={};
  for(const kind of ['SHORT','MONTHLY']){
    const drawId=drawIdFor(kind,ethers.id('stability '+kind)),isShort=kind==='SHORT';
    const snapshot=snapshotFor(domain,drawId,kind,{blockNumber:head.number,blockHash:head.hash},isShort?sg.hash:mg.hash,participants,1);
    const artifact=isShort?{schema:'short-dataset-artifact-v1',snapshot,rules:normalRules,weights:[7,5,3],minimumUnit:1,
      request:{drawId,campaignId:1,rulesEpoch:1,cutoffBlockNumber:head.number,cutoffBlockHash:head.hash,snapshotHash:hash(snapshot),expectedRoot:sd.rootFor(participants),expectedCount:1,expectedAttempts:'1',budget:101}}
      :{schema:'monthly-dataset-artifact-v1',snapshot,rules:normalRules,request:{drawId,campaign:1,rulesEpoch:1,cutoff:head.number,cutoffHash:head.hash,snapshotHash:hash(snapshot),root:md.rootFor(participants),count:1,attempts:'1'}};
    jobs[kind]={provider:f.provider,source:isShort?f.short:f.monthly,publisher:f.admin,executor:f.executor,
      job:isShort?short.makeJob(artifact,ethers.id('stability proposal')):monthly.makeMonthlyJob(artifact),
      step:isShort?short.stepShort:monthly.stepMonthly,run:isShort?short.runShort:monthly.runMonthly};
  }
  return {f,jobs};
}
test('both workers reject age-256 cutoff before sending; age-255 can land at 256',async()=>{
  const {f,jobs}=await setup();let point=await rpc('evm_snapshot');
  for(const item of Object.values(jobs)){
    await rpc('hardhat_mine',['0x100']);
    const nonce=await f.provider.getTransactionCount(await f.admin.getAddress());
    await assert.rejects(()=>item.step(item),/cutoff expired|Cutoff expired/);
    assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()),nonce);
    await rpc('evm_revert',[point]);point=await rpc('evm_snapshot');
    await rpc('hardhat_mine',['0xff']);assert.equal((await item.step(item)).status,'progress');
    await rpc('evm_revert',[point]);point=await rpc('evm_snapshot');
  }
});
async function deadline(p,ms){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('worker did not stop')),ms);})]);}finally{clearTimeout(timer);}}
for(const kind of ['SHORT','MONTHLY'])for(const mode of ['abort','timeout'])test(`${kind}: ${mode} while receipt pending preserves the transaction and restart`,async()=>{
  const {f,jobs}=await setup(),item=jobs[kind],stop=new AbortController();let tx,running;
  const publisher={provider:f.provider,getAddress:()=>f.admin.getAddress(),sendTransaction:async request=>{
    await rpc('evm_setAutomine',[false]);tx=await f.admin.sendTransaction(request);
    if(mode==='abort')stop.abort();return tx;
  }};
  try{
    running=item.run({...item,publisher,receiptTimeoutMs:200},{maxSteps:1,signal:stop.signal});
    if(mode==='abort')assert.equal((await deadline(running,3000)).status,'stopped');
    else await assert.rejects(()=>deadline(running,3000),e=>e.code==='LOCAL_RECEIPT_TIMEOUT');
    assert(tx);assert.equal(await f.provider.getTransactionReceipt(tx.hash),null);
    const address=await f.admin.getAddress();
    assert.equal(await f.provider.getTransactionCount(address,'pending'),await f.provider.getTransactionCount(address,'latest')+1);
  }finally{
    await rpc('evm_mine');await rpc('evm_setAutomine',[true]);
    if(tx)await tx.wait();if(running)await running.catch(()=>{});
  }
  // The original begin mined; a new process continues publication, not begin again.
  assert.equal((await item.step(item)).action,kind==='SHORT'?'publish':'publishMonth');
});
