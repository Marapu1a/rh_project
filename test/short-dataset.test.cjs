const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const hre=require('hardhat');
const {compile}=require('../scripts/compile.cjs');
const model=require('../scripts/short-dataset.cjs');
const {hash}=require('../scripts/direct-buy.cjs');
const {normalRules,participants,rpc,sent}=require('./fixtures/short-outcome.cjs');
const compiled=compile(),id=ethers.id;
async function rejected(p){await assert.rejects(async()=>sent(p()));}
async function fixture(n=70){
  await rpc('hardhat_reset');
  const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
  const admin=await provider.getSigner(),other=await provider.getSigner(1);
  async function deploy(name,args=[]){const a=compiled[name],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,admin).deploy(...args);await c.waitForDeployment();return c;}
  const token=await deploy('MockToken'),quote=await deploy('MockToken'),registry=await deploy('ParticipantRegistry');
  const predicted=ethers.getCreateAddress({from:await admin.getAddress(),nonce:await provider.getTransactionCount(await admin.getAddress())+1});
  const source=await deploy('ShortDatasetFixture',[predicted,registry.target,id('instance')]);
  const vault=await deploy('PromoVault',[token.target,quote.target,source.target,100]);
  await sent(quote.mint(await admin.getAddress(),10000));await sent(quote.approve(vault.target,10000));
  const ps=participants(n),block=await rpc('eth_getBlockByNumber',['latest',false]);
  const rules=normalRules,weights=[7,5,3],minimumUnit=1;
  const request={drawId:id('draw'),campaignId:1,rulesEpoch:1,cutoffBlockNumber:Number(BigInt(block.number)),cutoffBlockHash:block.hash,
    expectedRoot:model.rootFor(ps),expectedCount:n,expectedAttempts:String(ps.reduce((s,p)=>s+p.lastAttempt,0n)),budget:101};
  const snapshot={schema:'attempt-snapshot-v1',kind:'SHORT',drawId:request.drawId,
    domain:{chainId:'31337',source:source.target.toLowerCase(),sourceCodeHash:ethers.keccak256(await provider.getCode(source.target)),instanceId:id('instance'),registry:registry.target.toLowerCase()},
    cutoff:{blockNumber:request.cutoffBlockNumber,blockHash:request.cutoffBlockHash},rulesHash:model.rulesHash(rules,weights,minimumUnit),
    participants:ps.map(p=>({wallet:p.wallet.toLowerCase(),count:String(p.lastAttempt),firstAttempt:String(p.firstAttempt),lastAttempt:String(p.lastAttempt)}))};
  request.snapshotHash=hash(snapshot);
  const artifact={schema:'short-dataset-artifact-v1',snapshot,request,rules,weights,minimumUnit};
  const proposal=id('proposal');
  const begin=(pid=proposal,r=request)=>sent(source.begin(pid,r,rules,weights,minimumUnit));
  const publish=async(size=64,pid=proposal)=>{for(let i=0;i<ps.length;i+=size)await sent(source.publish(pid,ps.slice(i,i+size)));};
  return {provider,admin,other,source,vault,quote,registry,ps,request,artifact,proposal,begin,publish};
}
test('complete data is recoverable from calldata; seal atomically freezes funded basket',async()=>{
  const f=await fixture();await f.begin();await f.publish();
  assert.equal(await f.vault.reserved(f.quote.target),0n);
  assert.equal((await f.source.datasetProposal(f.proposal)).status,2n);
  const ready=await model.verifyPublication(f.provider,f.source,f.proposal,f.artifact);
  assert.equal(ready.publications.length,2);assert.equal(ready.status,'READY');
  await sent(f.vault.fundUSDG(200,1));
  await sent(f.source.connect(f.other).seal(f.proposal));
  const sealed=await model.verifyPublication(f.provider,f.source,f.proposal,f.artifact);
  assert.equal(sealed.context,ready.context);assert.equal(sealed.status,'SEALED');
  assert.equal(await f.vault.freeShort(),99n);assert.equal(await f.vault.reserved(f.quote.target),101n);
  assert.deepEqual(Array.from(await f.source.datasetBasket(f.proposal)),[42n,30n,18n]);
  assert.equal((await f.source.queryFilter(f.source.filters.AttemptsFrozen())).length,1);
  await rejected(()=>f.source.seal(f.proposal));await rejected(()=>f.source.supersede(f.proposal));
  await rejected(()=>f.source.publish(f.proposal,f.ps));await assert.rejects(()=>f.begin(id('later')));
});
test('chunk partition and proposal identity never alter canonical context',async()=>{
  const f=await fixture(12);await sent(f.vault.fundUSDG(200,1));const checkpoint=await rpc('evm_snapshot');
  await f.begin();await f.publish(1);await sent(f.source.seal(f.proposal));
  const context=(await f.source.datasetProposal(f.proposal)).context;
  await rpc('evm_revert',[checkpoint]);const second=id('second');await f.begin(second);await f.publish(12,second);
  await sent(f.source.connect(f.other).seal(second));assert.equal((await f.source.datasetProposal(second)).context,context);
});
test('failed reserve preserves READY and emits no freeze; anchored cutoff survives 256 blocks',async()=>{
  const f=await fixture(2);await f.begin();await f.publish();await rpc('hardhat_mine',['0x12c']);
  await rejected(()=>f.source.seal(f.proposal,{gasLimit:2000000}));
  assert.equal((await f.source.datasetProposal(f.proposal)).status,2n);
  assert.equal(await f.source.pendingDatasetDraw(),ethers.ZeroHash);
  assert.equal((await f.source.queryFilter(f.source.filters.AttemptsFrozen())).length,0);
  await sent(f.vault.fundUSDG(101,1));await sent(f.source.seal(f.proposal));
  assert.equal(await f.vault.reserved(f.quote.target),101n);
});
test('partial and ready preparation may be superseded; identifiers/history cannot be erased or reused',async()=>{
  const f=await fixture(3);await f.begin();await sent(f.source.publish(f.proposal,f.ps.slice(0,1)));
  await rejected(()=>f.source.seal(f.proposal));await sent(f.source.supersede(f.proposal));
  assert.equal((await f.source.datasetProposal(f.proposal)).status,3n);
  assert.equal(await f.source.datasetChunkCount(f.proposal),1n);
  await assert.rejects(()=>f.begin());const next=id('next');await f.begin(next);await f.publish(2,next);
  await rejected(()=>f.source.seal(f.proposal));await sent(f.source.supersede(next));
  assert.equal(await f.vault.reserved(f.quote.target),0n);
});
test('invalid, duplicate, oversize and mismatched datasets cannot become ready',async()=>{
  const f=await fixture();await f.begin();
  for(const data of [[],f.ps.slice(0,65),[{...f.ps[0],wallet:ethers.ZeroAddress}],
    [{...f.ps[0],wallet:f.vault.target}],[{...f.ps[0],firstAttempt:0}],
    [{...f.ps[0],firstAttempt:2,lastAttempt:1}],[f.ps[1],f.ps[0]]])await rejected(()=>f.source.publish(f.proposal,data));
  await sent(f.source.publish(f.proposal,f.ps.slice(0,64)));
  await rejected(()=>f.source.publish(f.proposal,[f.ps[63]]));
  const wrong=f.ps.slice(64).map(x=>({...x}));wrong[0].lastAttempt+=1n;
  await rejected(()=>f.source.publish(f.proposal,wrong));
  assert.equal((await f.source.datasetProposal(f.proposal)).count,64n);
  await f.source.supersede(f.proposal).then(t=>t.wait());
  const bad=id('bad-root');await f.begin(bad,{...f.request,expectedRoot:id('wrong')});
  await sent(f.source.publish(bad,f.ps.slice(0,64)));await rejected(()=>f.source.publish(bad,f.ps.slice(64)));
  assert.equal((await f.source.datasetProposal(bad)).status,1n);
  assert.equal(await f.vault.reserved(f.quote.target),0n);
});
test('unauthorized writes and invalid begin are rejected before funds are reserved',async()=>{
  const f=await fixture(1);
  for(const patch of [{expectedCount:0},{rulesEpoch:0},{expectedAttempts:0},{cutoffBlockHash:id('wrong')},{budget:0}])
    await assert.rejects(()=>f.begin(f.proposal,{...f.request,...patch}));
  await rejected(()=>f.source.connect(f.other).begin(f.proposal,f.request,normalRules,[7,5,3],1));
  await f.begin();await rejected(()=>f.source.connect(f.other).publish(f.proposal,f.ps));
  await rejected(()=>f.source.connect(f.other).supersede(f.proposal));await f.publish();
  const bad=structuredClone(f.artifact);bad.request.rulesEpoch=2;
  await assert.rejects(()=>model.verifyPublication(f.provider,f.source,f.proposal,bad),/Request mismatch/);
});
test('history replay includes all OPEN, preserves carry and excludes already consumed attempts',()=>{
  const h=require('./fixtures/attempt-history.cjs').history();
  const make=()=>model.buildFromHistory({manifest:h.manifest,lifecycle:h.config,blocks:h.blocks,
    request:{drawId:id('next draw'),campaignId:1,rulesEpoch:1,budget:101,cutoffBlockNumber:h.head().blockNumber,cutoffBlockHash:h.head().blockHash},
    rules:normalRules,weights:[7,5,3],minimumUnit:1});
  const first=make();assert.equal(first.request.expectedAttempts,'1');
  const draw=h.freeze('previous','SHORT',h.head(),[h.participant(1)]);
  assert.throws(make,/pending/);h.buy(250_000000n);h.terminal(draw);
  const next=make();assert.equal(next.request.expectedAttempts,'2');
  assert.equal(next.snapshot.participants[0].firstAttempt,'2');assert.equal(next.snapshot.participants[0].lastAttempt,'3');
  h.buy(50_000000n);assert.equal(make().request.expectedAttempts,'3');
  const other='0x000000000000000000000000000000000000abcd';h.register(other);h.buy(100_000000n,other);
  const all=make();assert.equal(all.request.expectedCount,2);assert.equal(all.request.expectedAttempts,'4');
  assert.equal(all.request.expectedRoot,model.rootFor(all.snapshot.participants));
});

test('offline CLI rebuilds an artifact from raw history, with explicit provenance',()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
  const h=require('./fixtures/attempt-history.cjs').history();
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'rh-dataset-')),input=path.join(folder,'input.json'),output=path.join(folder,'output.json');
  try {
    fs.writeFileSync(input,JSON.stringify({manifest:h.manifest,lifecycle:h.config,blocks:h.blocks,
      request:{drawId:id('cli draw'),campaignId:1,rulesEpoch:1,budget:101,cutoffBlockNumber:h.head().blockNumber,cutoffBlockHash:h.head().blockHash},
      rules:normalRules,weights:[7,5,3],minimumUnit:1}));
    execFileSync(process.execPath,['scripts/verify-short-dataset.cjs','--input',input,'--output',output]);
    const result=JSON.parse(fs.readFileSync(output,'utf8'));
    assert.match(result.provenance,/Offline/);assert.equal(result.artifactHash,hash(result.artifact));
    assert.equal(result.artifact.request.expectedAttempts,'1');
  } finally {for(const file of [input,output])if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(folder);}
});

test('reserve callback cannot reenter sealing',async()=>{
  const f=await fixture(1);
  const deploy=async(name,args=[])=>{const a=compiled[name],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,f.admin).deploy(...args);await c.waitForDeployment();return c;};
  const vault=await deploy('DatasetReentrantVault');
  const source=await deploy('ShortDatasetFixture',[vault.target,f.registry.target,id('guard instance')]);
  await sent(vault.bind(source.target,f.proposal));
  await sent(source.begin(f.proposal,f.request,normalRules,[7,5,3],1));await sent(source.publish(f.proposal,f.ps));
  await sent(source.seal(f.proposal));assert.equal(await vault.callbackRejected(),true);
  assert.equal((await source.datasetProposal(f.proposal)).status,4n);
});

test('reorg rolls back freeze and reserve together, while preparation can be sealed again',async()=>{
  const f=await fixture(1);await f.begin();await f.publish();await sent(f.vault.fundUSDG(101,1));
  const checkpoint=await rpc('evm_snapshot');await sent(f.source.seal(f.proposal));
  const context=(await f.source.datasetProposal(f.proposal)).context;
  await rpc('evm_revert',[checkpoint]);
  assert.equal((await f.source.datasetProposal(f.proposal)).status,2n);assert.equal(await f.vault.reserved(f.quote.target),0n);
  assert.equal((await f.source.queryFilter(f.source.filters.AttemptsFrozen())).length,0);
  await sent(f.source.connect(f.other).seal(f.proposal));assert.equal((await f.source.datasetProposal(f.proposal)).context,context);
});
