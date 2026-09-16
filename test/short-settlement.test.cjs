const {test}=require('node:test'),assert=require('node:assert/strict');
const {ethers}=require('ethers'),hre=require('hardhat');
const {compile}=require('../scripts/compile.cjs');
const {normalRules,nearCertainRules,participants,rpc,sent}=require('./fixtures/short-outcome.cjs');
const {split,normalize}=require('./fixtures/short-streaming.cjs');
const dataset=require('../scripts/short-dataset.cjs'),model=require('../scripts/short-settlement.cjs');
const compiled=compile(),id=ethers.id,weights=[7,5,3];
const advance=async()=>{await rpc('evm_increaseTime',[21601]);await rpc('evm_mine');};
const rejected=async fn=>assert.rejects(async()=>sent(fn()));
async function fixture(ps=participants(75),rules=normalRules){
  await rpc('hardhat_reset');const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
  const admin=await provider.getSigner(),other=await provider.getSigner(1),third=await provider.getSigner(2);
  const deploy=async(name,args=[])=>{const a=compiled[name],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,admin).deploy(...args);await c.waitForDeployment();return c;};
  const token=await deploy('MockToken'),quote=await deploy('MockToken'),registry=await deploy('ParticipantRegistry');
  const predicted=ethers.getCreateAddress({from:await admin.getAddress(),nonce:await provider.getTransactionCount(await admin.getAddress())+1});
  const source=await deploy('ShortSettlementFixture',[predicted,registry.target,id('terminal'),3600,rules,weights]);
  const vault=await deploy('PromoVault',[token.target,quote.target,source.target,100]);
  await sent(quote.mint(await admin.getAddress(),10000));await sent(quote.approve(vault.target,10000));await sent(vault.fundUSDG(10000,1));
  await advance();let sequence=0;
  const request=async(epoch=1)=>{const b=await rpc('eth_getBlockByNumber',['latest',false]);return {drawId:id('terminal draw'+(++sequence)),campaignId:1,rulesEpoch:epoch,
    cutoffBlockNumber:Number(BigInt(b.number)),cutoffBlockHash:b.hash,snapshotHash:id('synthetic participants; no BUY claim'),expectedRoot:dataset.rootFor(ps),
    expectedCount:ps.length,expectedAttempts:ps.reduce((a,p)=>a+p.lastAttempt-p.firstAttempt+1n,0n),budget:101};};
  const prepare=async(r,size=32,pid=id('proposal '+sequence))=>{
    await sent(source.begin(pid,r));const chunks=split(ps,size);
    for(const c of chunks)await sent(source.publish(pid,c));await sent(source.connect(other).seal(pid));return {pid,chunks};};
  return {provider,source,vault,quote,admin,other,third,ps,rules,request,prepare};
}
async function processAll(f,r,chunks){for(let i=0;i<chunks.length;i++)await sent(f.source.connect(f.other).processShort(r.drawId,i,chunks[i]));}
test('canonical result independent of partition and executor; real awards, rounding and claims',async()=>{
  const f=await fixture(),r=await f.request();let checkpoint=await rpc('evm_snapshot'),baseline;
  for(const size of [1,7,64]){
    const {pid,chunks}=await f.prepare(r,size,id('partition '+size));
    await sent(f.source.supplySeed(r.drawId,id('one seed')));await processAll(f,r,chunks);
    const p=await f.source.datasetProposal(pid),basket=Array.from(await f.source.datasetBasket(pid));
    const expected=model.compute(p.context,id('one seed'),f.ps,f.rules,basket),actual=await f.source.shortResult(r.drawId);
    assert.deepEqual(normalize(actual),normalize(expected));assert.equal(actual.resultHash,expected.resultHash);
    if(baseline)assert.deepEqual([p.context,actual.resultHash],baseline);else baseline=[p.context,actual.resultHash];
    const receipt=await sent(f.source.connect(f.third).finishShort(r.drawId));
    const awarded=actual.amounts.reduce((a,b)=>a+b,0n);assert(awarded>0n);
    assert.equal(await f.vault.freeShort(),10000n-awarded);assert.equal(await f.vault.reserved(f.quote.target),0n);
    assert.equal(await f.vault.claimable(f.quote.target),awarded);assert.equal(await f.source.pendingDatasetDraw(),ethers.ZeroHash);
    assert.equal((await f.source.settlements(r.drawId)).phase,3n);
    const consumed=receipt.logs.map(l=>{try{return f.source.interface.parseLog(l);}catch{return null;}}).filter(e=>e?.name==='AttemptsConsumed');
    assert.equal(consumed.length,1);assert.equal(consumed[0].args.resultHash,actual.resultHash);
    await rejected(()=>f.source.finishShort(r.drawId));await rejected(()=>f.source.supplySeed(r.drawId,id('reroll')));
    await sent(f.vault.claim(r.drawId,actual.winners[0]));assert.equal(await f.quote.balanceOf(actual.winners[0]),actual.amounts[0]);
    await rpc('evm_revert',[checkpoint]);checkpoint=await rpc('evm_snapshot');
  }
});
test('partial admission across chunks ignores unused candidates and awards a random subset of prizes',async()=>{
  const f=await fixture(participants(12,1)),r=await f.request(),checkpoint=await rpc('evm_snapshot');
  const {pid,chunks}=await f.prepare(r,4);const context=(await f.source.datasetProposal(pid)).context;
  const basket=Array.from(await f.source.datasetBasket(pid));let seed,expected;
  // Deterministic fixture seed search only; production never selects/retries seeds.
  for(let i=0;i<1000;i++){
    seed=id('partial admission '+i);expected=model.compute(context,seed,f.ps,f.rules,basket);
    const chunkIds=new Set(expected.winners.map(w=>Math.floor(f.ps.findIndex(p=>p.wallet.toLowerCase()===w)/4)));
    if(expected.admittedCount===2n&&chunkIds.size===2&&!expected.prizeIndices.includes(0n))break;
  }
  assert.equal(expected.admittedCount,2n);assert(!expected.prizeIndices.includes(0n));
  assert.equal(new Set(expected.winners.map(w=>Math.floor(f.ps.findIndex(p=>p.wallet.toLowerCase()===w)/4))).size,2);
  await sent(f.source.supplySeed(r.drawId,seed));await processAll(f,r,chunks);
  let actual=await f.source.shortResult(r.drawId);assert.equal(actual.resultHash,expected.resultHash);
  assert.deepEqual(normalize(actual),normalize(expected));assert(!actual.winners.includes(ethers.ZeroAddress));
  await sent(f.source.finishShort(r.drawId));assert.equal(await f.vault.claimable(f.quote.target),expected.amounts.reduce((a,b)=>a+b,0n));
  await rpc('evm_revert',[checkpoint]);const again=await f.prepare(r,1,id('partial repartition'));
  assert.equal((await f.source.datasetProposal(again.pid)).context,context);
  await sent(f.source.supplySeed(r.drawId,seed));await processAll(f,r,again.chunks);
  actual=await f.source.shortResult(r.drawId);assert.equal(actual.resultHash,expected.resultHash);
  await sent(f.source.finishShort(r.drawId));
});

test('public calldata recovery resumes after interruption; ordered authenticated chunks only',async()=>{
  const f=await fixture(),r=await f.request(),{pid,chunks}=await f.prepare(r);
  assert.equal((await model.recover(f.provider,f.source,r.drawId)).nextAction,'waitSeed');
  await rejected(()=>f.source.connect(f.other).supplySeed(r.drawId,ethers.ZeroHash));
  await rejected(()=>f.source.processShort(r.drawId,0,chunks[0]));
  await sent(f.source.supplySeed(r.drawId,ethers.ZeroHash));await rejected(()=>f.source.supplySeed(r.drawId,id('again')));
  await rejected(()=>f.source.finishShort(r.drawId));await rejected(()=>f.source.processShort(r.drawId,1,chunks[1]));
  await rejected(()=>f.source.processShort(r.drawId,0,chunks[0].slice(1)));
  await sent(f.source.processShort(r.drawId,0,chunks[0]));await rejected(()=>f.source.processShort(r.drawId,0,chunks[0]));
  await rejected(()=>f.source.supersede(pid));await rejected(()=>f.source.seal(pid));
  const recovered=await model.recover(f.provider,f.source,r.drawId);assert.equal(recovered.state.nextChunk,1n);
  for(let i=Number(recovered.state.nextChunk);i<recovered.chunks.length;i++)await sent(f.source.connect(f.third).processShort(r.drawId,i,recovered.chunks[i]));
  assert.equal((await f.source.shortResult(r.drawId)).resultHash,recovered.expected.resultHash);
  assert.equal((await model.recover(f.provider,f.source,r.drawId)).nextAction,'finishShort');
  await sent(f.source.connect(f.third).finishShort(r.drawId));
  assert.equal((await model.recover(f.provider,f.source,r.drawId)).nextAction,'terminal');
});
test('failed vault finalization preserves seed/progress/reserve; same result retries atomically',async()=>{
  const f=await fixture(),r=await f.request(),{chunks}=await f.prepare(r);await sent(f.source.supplySeed(r.drawId,id('failure seed')));
  await processAll(f,r,chunks);const before=(await f.source.settlements(r.drawId)).toArray(true),result=await f.source.shortResult(r.drawId);
  await sent(f.quote.blockRecipient('0x000000000000000000000000000000000000dEaD'));
  await sent(f.quote.burn(f.vault.target,1));await rejected(()=>f.source.finishShort(r.drawId));
  assert.deepEqual((await f.source.settlements(r.drawId)).toArray(true),before);assert.equal(await f.source.pendingDatasetDraw(),r.drawId);
  assert.equal(await f.vault.reserved(f.quote.target),101n);assert.equal((await f.source.queryFilter(f.source.filters.AttemptsConsumed())).length,0);
  await sent(f.quote.mint(f.vault.target,1));await sent(f.source.connect(f.other).finishShort(r.drawId));
  assert.equal((await f.source.shortResult(r.drawId)).resultHash,result.resultHash);
});
test('no winners is terminal, releases budget, consumes once; next draw has fresh state after six hours',async()=>{
  const rules={version:1,pNumerator:1,pDenominator:4294967295,hNumerator:4294967295,hDenominator:1};
  const f=await fixture(participants(1,1),rules),r=await f.request(),{chunks}=await f.prepare(r);
  await sent(f.source.supplySeed(r.drawId,ethers.ZeroHash));await processAll(f,r,chunks);
  assert.equal((await f.source.shortResult(r.drawId)).winners.length,0);await sent(f.source.finishShort(r.drawId));
  assert.equal(await f.vault.freeShort(),10000n);assert.equal(await f.vault.claimable(f.quote.target),0n);
  const logs=await f.source.queryFilter(f.source.filters.AttemptsConsumed());assert.equal(logs[0].args.outcome,0n);
  await rejected(()=>f.source.begin(id('too soon'),r));await advance();const next=await f.request(),prepared=await f.prepare(next);
  assert.equal((await f.source.settlements(next.drawId)).processed,0n);await rejected(()=>f.source.processShort(r.drawId,0,chunks[0]));
  await sent(f.source.supplySeed(next.drawId,ethers.ZeroHash));await processAll(f,next,prepared.chunks);await sent(f.source.finishShort(next.drawId));
  assert.equal((await f.source.queryFilter(f.source.filters.AttemptsConsumed())).length,2);
});
test('old epoch settles before new rules, credits survive transition and failed claim',async()=>{
  const f=await fixture(participants(5,10),nearCertainRules);
  await sent(f.source.announce(normalRules,[1],1));await advance();await sent(f.source.activate());await rpc('evm_mine');
  const r=await f.request(1),{chunks}=await f.prepare(r);await sent(f.source.supplySeed(r.drawId,id('old rules')));await processAll(f,r,chunks);
  const old=await f.source.shortResult(r.drawId);assert.equal(old.winners.length,3);await sent(f.source.finishShort(r.drawId));
  const credit=await f.vault.claimable(f.quote.target);assert(credit>0n);assert.equal(await f.source.drainingShortEpoch(),0n);
  await sent(f.quote.blockRecipient(old.winners[0]));await rejected(()=>f.vault.claim(r.drawId,old.winners[0]));
  assert.equal(await f.vault.reward(r.drawId,old.winners[0]),old.amounts[0]);
  await advance();const next=await f.request(2),{pid,chunks:newChunks}=await f.prepare(next);
  assert.equal((await f.source.datasetBasket(pid)).length,1);await sent(f.source.supplySeed(next.drawId,id('new rules')));await processAll(f,next,newChunks);
  await sent(f.source.finishShort(next.drawId));assert(await f.vault.claimable(f.quote.target)>=credit);
  await sent(f.quote.blockRecipient(ethers.ZeroAddress));
  await sent(f.vault.claim(r.drawId,old.winners[0]));assert.equal(await f.quote.balanceOf(old.winners[0]),old.amounts[0]);
});
test('reorg rolls back terminal and progress; replacement executor finishes the same seed',async()=>{
  const f=await fixture(),r=await f.request(),{chunks}=await f.prepare(r);
  await sent(f.source.supplySeed(r.drawId,id('reorg')));await sent(f.source.processShort(r.drawId,0,chunks[0]));
  const checkpoint=await rpc('evm_snapshot');
  for(let i=1;i<chunks.length;i++)await sent(f.source.processShort(r.drawId,i,chunks[i]));
  const result=await f.source.shortResult(r.drawId);await sent(f.source.finishShort(r.drawId));await rpc('evm_revert',[checkpoint]);
  const recovered=await model.recover(f.provider,f.source,r.drawId);assert.equal(recovered.state.nextChunk,1n);
  await rejected(()=>f.source.finishShort(r.drawId));
  for(let i=1;i<recovered.chunks.length;i++)await sent(f.source.connect(f.third).processShort(r.drawId,i,recovered.chunks[i]));
  await sent(f.source.finishShort(r.drawId));assert.equal((await f.source.shortResult(r.drawId)).resultHash,result.resultHash);
});
test('terminal rejects reentrancy from external finalize dependency',async()=>{
  await rpc('hardhat_reset');const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1}),admin=await provider.getSigner();
  const deploy=async(name,args=[])=>{const a=compiled[name],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,admin).deploy(...args);await c.waitForDeployment();return c;};
  const vault=await deploy('SettlementReentrantVault'),registry=await deploy('ParticipantRegistry');
  const source=await deploy('ShortSettlementFixture',[vault.target,registry.target,id('guard'),3600,nearCertainRules,weights]);
  await sent(vault.bind(source.target));await advance();const b=await provider.getBlock('latest'),ps=participants(5,1),drawId=id('guard draw'),pid=id('guard proposal');
  await sent(source.begin(pid,{drawId,campaignId:1,rulesEpoch:1,cutoffBlockNumber:b.number,cutoffBlockHash:b.hash,snapshotHash:id('guard snapshot'),expectedRoot:dataset.rootFor(ps),expectedCount:5,expectedAttempts:5,budget:101}));
  await sent(source.publish(pid,ps));await sent(source.seal(pid));await sent(source.supplySeed(drawId,ethers.ZeroHash));
  await sent(source.processShort(drawId,0,ps));await sent(source.finishShort(drawId));assert.equal(await vault.callbackRejected(),true);
  assert.equal((await source.queryFilter(source.filters.AttemptsConsumed())).length,1);
});
test('fixture remains under EIP-170 runtime limit',()=>{assert(compiled.ShortSettlementFixture.evm.deployedBytecode.object.length/2<=24576);});
