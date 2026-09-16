const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const hre=require('hardhat');
const {compile}=require('../scripts/compile.cjs');
const {domainFor,snapshotFor,replayAttempts}=require('../scripts/attempt-lifecycle.cjs');
const {hash}=require('../scripts/direct-buy.cjs');
const {participantsHash,verifySnapshotCommitments}=require('../scripts/short-outcome.cjs');
const compiled=compile(),id=ethers.id;
const rpc=(method,params=[])=>hre.network.provider.send(method,params);
const sent=async p=>(await p).wait();
async function rejects(p){await assert.rejects(async()=>sent(p()));}
async function fixture({quoteName='MockToken',binding='correct',weights=[7,5,3],min=2}={}){
  await rpc('hardhat_reset');
  const anchor=await rpc('eth_getBlockByNumber',['latest',false]);
  const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
  const admin=await provider.getSigner(),alice=await provider.getSigner(1);
  async function deploy(name,args=[]){const a=compiled[name],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,admin).deploy(...args);await c.waitForDeployment();return c;}
  const token=await deploy('MockToken'),quote=await deploy(quoteName),registry=await deploy('ParticipantRegistry');
  const other=await deploy('DrawControllerFixture');
  const predicted=ethers.getCreateAddress({from:await admin.getAddress(),nonce:await provider.getTransactionCount(await admin.getAddress())+1});
  const source=await deploy('ShortDrawCommitmentFixture',[binding==='missing'?await alice.getAddress():predicted,registry.target,id('instance'),weights,min,id('remaining fixture policy')]);
  const vault=await deploy('PromoVault',[token.target,quote.target,binding==='wrong'?other.target:source.target,100]);
  assert.equal(vault.target,predicted);
  await sent(registry.register());
  await sent(quote.mint(await admin.getAddress(),10000));
  await sent(quote.approve(vault.target,10000));
  const fund=(amount,destination=1)=>sent(vault.fundUSDG(amount,destination));
  async function request(overrides={}){const b=await rpc('eth_getBlockByNumber',['latest',false]);return {drawId:id('short'),campaignId:1,cutoffBlockNumber:Number(BigInt(b.number)),cutoffBlockHash:b.hash,attemptSnapshotHash:id('fixture snapshot assertion'),evmParticipantsHash:id('fixture EVM snapshot assertion'),expectedRulesHash:await source.shortRulesHash(),budget:101,...overrides};}
  return {anchor,provider,admin,alice,deploy,token,quote,registry,source,vault,fund,request};
}
async function state(f){return {
  pending:await f.source.pendingShortDrawId(),commitment:await f.source.shortCommitmentHash(id('short')),
  short:await f.vault.freeShort(),current:await f.vault.freeCurrent(),next:await f.vault.freeNext(),
  reserved:await f.vault.reserved(f.quote.target),claimable:await f.vault.claimable(f.quote.target),
  unrecognized:await f.vault.unrecognizedUSDG(),phase:await f.vault.generalFundingPhase(),
};}

test('atomic freeze commits the complete context, basket and actual SHORT reserve',async()=>{
  const f=await fixture();await f.fund(200);
  const r=await f.request(),receipt=await sent(f.source.freeze(r));
  const c=await f.source.shortCommitment(r.drawId),basket=await f.source.shortBasket(r.drawId);
  assert.deepEqual(Array.from(basket.prizes),[42n,30n,18n]);
  assert.equal(c.basketTotal,90n);assert.equal(c.remainder,11n);
  assert.equal(c.freezeBlock,BigInt(receipt.blockNumber));
  for(const key of Object.keys(r))assert.equal(String(c.request[key]),String(r[key]));
  const coder=ethers.AbiCoder.defaultAbiCoder();
  assert.equal(c.basketHash,ethers.keccak256(coder.encode(['uint256[]'],[basket.prizes])));
  const rules=ethers.keccak256(coder.encode(['bytes32','uint256[]','uint256','bytes32'],[id('SHORT_RULES_V1'),[7,5,3],2,id('remaining fixture policy')]));
  assert.equal(r.expectedRulesHash,rules);
  const tuple='tuple(tuple(bytes32,uint64,uint256,bytes32,bytes32,bytes32,bytes32,uint256),bytes32,uint256,uint256,uint256)';
  const digest=ethers.keccak256(coder.encode(['bytes32','uint256','address','bytes32','address','address','address',tuple],
    [id('SHORT_COMMITMENT_V2'),31337,f.source.target,id('instance'),f.registry.target,f.vault.target,f.quote.target,c]));
  assert.equal(await f.source.shortCommitmentHash(r.drawId),digest);
  assert.equal(await f.vault.freeShort(),99n);assert.equal(await f.vault.reserved(f.quote.target),101n);
  assert.equal((await f.vault.draws(r.drawId)).budget,101n);
  const events=receipt.logs.filter(l=>l.address===f.source.target).map(l=>f.source.interface.parseLog(l));
  assert.deepEqual(events.map(e=>e.name),['AttemptsFrozen','ShortDrawFrozen']);
  assert.equal(events[0].args.snapshotHash,r.attemptSnapshotHash);assert.equal(events[0].args.kind,0n);
  assert.equal(events[1].args.commitmentHash,digest);
  assert.equal(receipt.logs.at(-3).address,f.vault.target);
});

test('failed reserve rolls back donation recognition, phase, commitment and all freeze logs',async()=>{
  const f=await fixture();await sent(f.quote.mint(f.vault.target,199));
  const before=await state(f),r=await f.request({budget:101});
  // Explicit gas executes a reverted transaction rather than only estimateGas.
  await rejects(()=>f.source.freeze(r,{gasLimit:1500000}));
  assert.deepEqual(await state(f),before);
  assert.equal((await f.vault.draws(r.drawId)).budget,0n);
  assert.equal((await f.source.queryFilter(f.source.filters.AttemptsFrozen())).length,0);
  await sent(f.source.freeze(await f.request({budget:90})));
  assert.equal(await f.vault.unrecognizedUSDG(),0n);
  assert.equal(await f.vault.reserved(f.quote.target),90n);
  assert.equal((await f.vault.freeShort())+(await f.vault.freeCurrent())+(await f.vault.freeNext())+90n,199n);
});

test('malformed requests and stale/noncanonical cutoffs cannot create a reserve',async()=>{
  const f=await fixture();await f.fund(200);
  const before=await state(f);
  for(const override of [{drawId:ethers.ZeroHash},{campaignId:0},{attemptSnapshotHash:ethers.ZeroHash},{evmParticipantsHash:ethers.ZeroHash},
    {expectedRulesHash:id('wrong')},{budget:0},{budget:29},{cutoffBlockHash:ethers.ZeroHash},
    {cutoffBlockHash:id('other branch')},{cutoffBlockNumber:1000000}]){
    await rejects(async()=>f.source.freeze(await f.request(override)));
    assert.deepEqual(await state(f),before);
  }
  const r=await f.request();
  // Next mined block is the freeze block, not a completed cutoff.
  await rejects(()=>f.source.freeze({...r,cutoffBlockNumber:r.cutoffBlockNumber+1},{gasLimit:1500000}));
  await rpc('hardhat_mine',['0x101']);
  await rejects(()=>f.source.freeze(r));assert.deepEqual(await state(f),before);
});

test('one pending Short rejects duplicate and different draw IDs; late funding leaves freeze unchanged',async()=>{
  const f=await fixture();await f.fund(200);const r=await f.request();await sent(f.source.freeze(r));
  const digest=await f.source.shortCommitmentHash(r.drawId),c=await f.source.shortCommitment(r.drawId);
  await rejects(()=>f.source.freeze(r));await rejects(async()=>f.source.freeze(await f.request({drawId:id('second')})));
  await f.fund(100);await sent(f.quote.mint(f.vault.target,60));await sent(f.vault.syncUSDG());
  assert.equal(await f.source.shortCommitmentHash(r.drawId),digest);
  // Compare decoded values, not ethers Result proxy identity (Node 24).
  assert.deepEqual((await f.source.shortCommitment(r.drawId)).toArray(true),c.toArray(true));
  assert.equal(await f.vault.reserved(f.quote.target),101n);
  assert.equal(await f.vault.freeShort(),229n);
});

test('oldest EVM-available cutoff is accepted at age 256, with fixed rounding at minimum budget',async()=>{
  const f=await fixture();await f.fund(200);const r=await f.request({budget:30});
  await rpc('hardhat_mine',['0xff']);
  const receipt=await sent(f.source.freeze(r,{gasLimit:1500000}));
  assert.equal(receipt.blockNumber-r.cutoffBlockNumber,256);
  const b=await f.source.shortBasket(r.drawId);
  assert.deepEqual(Array.from(b.prizes),[14n,10n,6n]);assert.equal(b.remainder,0n);
});

test('old unpaid credits stay claimable and Monthly settlement does not alter pending Short',async()=>{
  const f=await fixture();await f.fund(500);
  await sent(f.source.prepareCredit(id('old'),await f.alice.getAddress(),50));
  await f.fund(100,3);await f.fund(100,2);
  await sent(f.source.startMonthly(id('monthly')));
  const r=await f.request();await sent(f.source.freeze(r));const c=await f.source.shortCommitment(r.drawId);
  await sent(f.vault.claim(id('old'),await f.alice.getAddress()));
  await sent(f.source.settleMonthly(id('monthly'),ethers.ZeroAddress));
  assert.equal(await f.quote.balanceOf(await f.alice.getAddress()),50n);
  assert.equal(await f.vault.claimable(f.quote.target),0n);
  assert.equal(await f.vault.reserved(f.quote.target),101n);
  assert.deepEqual((await f.source.shortCommitment(r.drawId)).toArray(true),c.toArray(true));
});

test('already used vault ID fails atomically even with no pending Short',async()=>{
  const f=await fixture();await f.fund(500);await sent(f.source.prepareCredit(id('short'),await f.alice.getAddress(),50));
  const before=await state(f);await rejects(async()=>f.source.freeze(await f.request()));assert.deepEqual(await state(f),before);
});

test('immutable vault binding rejects missing code and a different authorized controller',async()=>{
  for(const binding of ['missing','wrong']){
    const f=await fixture({binding});await f.fund(200);
    await rejects(async()=>f.source.freeze(await f.request()));assert.equal(await f.vault.reserved(f.quote.target),0n);
  }
});

test('real vault balanceOf callback observes the exact controller reentrancy guard error',async()=>{
  const f=await fixture({quoteName:'ShortBalanceCallbackToken'});await f.fund(200);
  const r=await f.request();await sent(f.quote.setProbe(f.source.target,f.source.interface.encodeFunctionData('freeze',[r])));
  await sent(f.source.freeze(r));
  await sent(f.quote.setProbe(ethers.ZeroAddress,'0x'));
  assert.equal(await f.vault.reserved(f.quote.target),101n);
  assert.equal((await f.source.queryFilter(f.source.filters.AttemptsFrozen())).length,1);
});

test('configuration rejects invalid templates and bounds work without selecting a production template',async()=>{
  for(const options of [{weights:[]},{weights:[0]},{weights:[ethers.MaxUint256,1]},{min:0},
    {weights:[1,1],min:ethers.MaxUint256},{weights:Array(65).fill(1)}])await assert.rejects(()=>fixture(options));
  const f=await fixture({weights:Array(64).fill(1),min:1});await f.fund(200);
  await sent(f.source.freeze(await f.request({budget:127})));
  const b=await f.source.shortBasket(id('short'));assert.equal(b.total+b.remainder,127n);assert.equal(b.remainder,63n);
  assert.ok(b.prizes.every(p=>p===1n));
});

test('actual atomic freeze replays as FROZEN; a local reorg removes both ledger freeze and reserve',async()=>{
  const f=await fixture();await f.fund(200);
  // No market or eligibility policy is simulated: empty snapshot tests receipt integration only.
  const manifest=structuredClone(require('../research/direct-buy/evidence.json').manifest);
  manifest.registry=f.registry.target;manifest.anchor={number:f.anchor.number,hash:f.anchor.hash};
  manifest.codeHashes.registry=ethers.keccak256(await f.provider.getCode(f.registry.target));
  const config={schema:'attempt-lifecycle-v1',instanceId:await f.source.instanceId(),source:f.source.target,sourceCodeHash:ethers.keccak256(await f.provider.getCode(f.source.target))};
  const r=await f.request();
  r.attemptSnapshotHash=hash(snapshotFor(domainFor(manifest,config),r.drawId,'SHORT',
    {blockNumber:r.cutoffBlockNumber,blockHash:r.cutoffBlockHash},r.expectedRulesHash,[]));
  r.evmParticipantsHash=participantsHash([]);
  const checkpoint=await rpc('evm_snapshot');await sent(f.source.freeze(r));
  async function replay(){const blocks=[],latest=BigInt(await rpc('eth_blockNumber'));
    for(let n=BigInt(f.anchor.number)+1n;n<=latest;n++){
      const b=await rpc('eth_getBlockByNumber',['0x'+n.toString(16),true]),transactions=[];
      for(const tx of b.transactions)transactions.push({tx,receipt:await rpc('eth_getTransactionReceipt',[tx.hash])});
      blocks.push({number:b.number,hash:b.hash,parentHash:b.parentHash,timestamp:b.timestamp,transactions});
    }
    return replayAttempts(manifest,config,blocks);
  }
  const ledger=await replay();assert.equal(ledger.draws[0].status,'FROZEN');assert.equal(ledger.draws[0].totalAttempts,'0');
  verifySnapshotCommitments(ledger.draws[0].snapshot,r);
  assert.equal(await f.vault.reserved(f.quote.target),101n);
  await rpc('evm_revert',[checkpoint]);await rpc('evm_mine');
  const replacement=await replay();assert.equal(replacement.draws.length,0);assert.equal(replacement.pending.SHORT,null);
  assert.equal(await f.vault.reserved(f.quote.target),0n);assert.equal(await f.source.pendingShortDrawId(),ethers.ZeroHash);
  await sent(f.source.freeze(r));
  const replayed=await replay();
  assert.deepEqual(replayed.domain,ledger.domain);
  assert.equal(replayed.draws[0].status,'FROZEN');
  assert.equal((await f.source.shortCommitment(r.drawId)).request.attemptSnapshotHash,r.attemptSnapshotHash);
  assert.equal(await f.vault.reserved(f.quote.target),101n);
});
