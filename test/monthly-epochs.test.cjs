const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs'),{fixture,rpc,sent,advance}=require('./fixtures/dual-controller.cjs');
const {participants,normalRules}=require('./fixtures/short-outcome.cjs'),model=require('../scripts/short-outcome.cjs');
const dataset=require('../scripts/monthly-dataset.cjs'),{drawIdFor}=require('../scripts/draw-id.cjs');
const compiled=compile(),id=ethers.id,nextRules={...normalRules,pNumerator:1,pDenominator:2};
const reject=async fn=>assert.rejects(async()=>sent(fn()));
async function setup(){const f=await fixture(compiled,{real:true,interval:100,notice:10});f.ps=participants(4,1);
  f.request=async(label,epoch=1)=>{const b=await f.provider.getBlock('latest');return {drawId:drawIdFor('MONTHLY',id(label)),snapshotHash:id(label+' snapshot'),
    root:dataset.rootFor(f.ps),campaign:1,rulesEpoch:epoch,cutoff:b.number,cutoffHash:b.hash,count:4,attempts:4};};
  f.prepare=async r=>{await sent(f.monthly.beginMonth(r));await sent(f.monthly.publishMonth(r.drawId,f.ps));};
  return f;
}

test('Monthly notice, fixed interval, immutable announcement, bounded transition and old-first after 256 blocks',async()=>{
  const f=await setup();await reject(()=>f.monthly.connect(f.other).announce(nextRules));
  await sent(f.monthly.announce(nextRules));const p=await f.monthly.monthlyEpochPolicy(2);
  await reject(()=>f.monthly.announce(normalRules));assert.equal((await f.monthly.monthlyEpochPolicy(2)).hash,p.hash);
  await reject(()=>f.monthly.activate());await advance(11);await reject(()=>f.monthly.activate());await advance(101);
  const receipt=await sent(f.monthly.connect(f.other).activate());assert.equal((await f.monthly.monthlyEpochPolicy(2)).firstBlock,BigInt(receipt.blockNumber+1));
  await reject(()=>f.monthly.activate());await reject(()=>f.monthly.announce(normalRules));
  await rpc('hardhat_mine',['0x12c']);const wrong=await f.request('wrong epoch',2);await reject(()=>f.monthly.beginMonth(wrong));
  const old=await f.request('old after delay');await f.prepare(old);assert.equal((await f.monthly.month(old.drawId)).input.rulesEpoch,1n);
  assert.equal((await f.monthly.monthlyEpochPolicy(1)).hash,model.rulesHash(normalRules));
  for(const name of ['setInterval','setMonthlyInterval','setRules','cancelAnnouncement'])assert.equal(f.monthly.interface.getFunction(name),null);
});

test('Monthly activation blocked during Publishing/Ready/pending; supersede never clears a frozen draw',async()=>{
  const f=await setup();await sent(f.monthly.announce(nextRules));await advance(101);
  const r=await f.request('busy');await sent(f.monthly.beginMonth(r));await reject(()=>f.monthly.activate());
  await sent(f.monthly.publishMonth(r.drawId,f.ps));await reject(()=>f.monthly.activate());
  await sent(f.monthly.supersedeMonth(r.drawId));await sent(f.monthly.activate());await rpc('evm_mine');
  const old=await f.request('old');await f.prepare(old);await sent(f.monthly.sealMonth(old.drawId));
  await reject(()=>f.monthly.supersedeMonth(old.drawId));await reject(()=>f.monthly.closeEmpty(old.cutoff,old.cutoffHash,id('empty')));
  await reject(()=>f.monthly.activate());assert.equal(await f.monthly.drainingMonthlyEpoch(),1n);
});

test('Monthly old policy determines result, failed settlement rolls back draining/clock and credits survive next policy',async()=>{
  for(const win of [false,true]){
    const f=await setup();await sent(f.monthly.announce(nextRules));await advance(101);await sent(f.monthly.activate());await rpc('hardhat_mine',['0x12c']);
    const wrong=await f.request('wrong',2);await reject(()=>f.monthly.beginMonth(wrong));
    const r=await f.request('old policy');await f.prepare(r);await sent(f.monthly.sealMonth(r.drawId));
    const m=await f.monthly.month(r.drawId);let seed,out;
    for(let i=0;i<1000;i++){seed=id('policy seed '+i);out=model.compute(m.context,seed,f.ps,normalRules,[m.budget]);
      if(Boolean(out.winners.length)===win&&JSON.stringify(out.winners)!==JSON.stringify(model.compute(m.context,seed,f.ps,nextRules,[m.budget]).winners))break;}
    assert.equal(Boolean(out.winners.length),win);
    assert.notDeepEqual(out.winners,model.compute(m.context,seed,f.ps,nextRules,[m.budget]).winners);
    await sent(f.monthly.supplySeed(r.drawId,seed));await sent(f.monthly.processMonth(r.drawId,0,f.ps));
    assert.equal((await f.monthly.month(r.drawId)).winner.toLowerCase(),out.winners[0]||ethers.ZeroAddress);
    const clock=await f.monthly.lastMonthAt();await sent(f.quote.blockRecipient('0x000000000000000000000000000000000000dEaD'));
    await sent(f.quote.burn(f.vault.target,1));await reject(()=>f.monthly.finishMonth(r.drawId));
    assert.equal(await f.monthly.drainingMonthlyEpoch(),1n);assert.equal(await f.monthly.lastMonthAt(),clock);assert.equal(await f.monthly.pendingMonth(),r.drawId);
    await sent(f.quote.mint(f.vault.target,1));await sent(f.monthly.connect(f.other).finishMonth(r.drawId));
    assert.equal(await f.monthly.drainingMonthlyEpoch(),0n);assert.equal(await f.monthly.monthlyInterval(),100n);
    await reject(()=>f.monthly.finishMonth(r.drawId));const early=await f.request('new early',2);await reject(()=>f.monthly.beginMonth(early));
    if(win)await sent(f.vault.fundUSDG(100,3));await advance(101);const n=await f.request('new rules',2);await f.prepare(n);await sent(f.monthly.sealMonth(n.drawId));
    const event=(await f.monthly.queryFilter(f.monthly.filters.AttemptsFrozen(n.drawId)))[0];assert.equal(event.args.rulesHash,model.rulesHash(nextRules));
    // An announcement during pending is allowed, activation is not. Draw policy stays 2.
    await sent(f.monthly.announce(normalRules));await advance(11);await reject(()=>f.monthly.activate());
    if(win){assert.equal(await f.vault.reward(r.drawId,out.winners[0]),1000n);await sent(f.vault.claim(r.drawId,out.winners[0]));}
    assert.equal((await f.monthly.month(n.drawId)).input.rulesEpoch,2n);
  }
});

test('Monthly empty assertion preserves clock, funds and attempts; new rules ready immediately and reorg restores transition',async()=>{
  const f=await setup();await sent(f.monthly.announce(nextRules));await advance(101);const checkpoint=await rpc('evm_snapshot');
  await sent(f.monthly.activate());await rpc('hardhat_mine',['0x12c']);const r=await f.request('empty',2);
  const clock=await f.monthly.lastMonthAt(),block=await f.monthly.lastMonthBlock(),balance=await f.quote.balanceOf(f.vault.target);
  await reject(()=>f.monthly.connect(f.other).closeEmpty(r.cutoff,r.cutoffHash,id('empty')));
  await reject(()=>f.monthly.closeEmpty(r.cutoff,ethers.ZeroHash,id('empty')));
  await sent(f.monthly.closeEmpty(r.cutoff,r.cutoffHash,id('empty assertion')));
  assert.equal(await f.monthly.lastMonthAt(),clock);assert.equal(await f.monthly.lastMonthBlock(),block);
  assert.equal(await f.quote.balanceOf(f.vault.target),balance);assert.equal(await f.vault.reserved(f.quote.target),0n);
  assert.equal((await f.monthly.queryFilter(f.monthly.filters.AttemptsConsumed())).length,0);
  await reject(()=>f.monthly.closeEmpty(r.cutoff,r.cutoffHash,id('repeat')));await f.prepare(await f.request('immediate new',2));
  await sent(f.monthly.announce(normalRules));await rpc('evm_revert',[checkpoint]);
  assert.equal(await f.monthly.currentMonthlyEpoch(),1n);assert.equal(await f.monthly.announcedMonthlyEpoch(),2n);assert.equal(await f.monthly.activeMonth(),ethers.ZeroHash);
});

test('v4 RPC publication binds genesis and per-draw old policy after activation; calldata/context reproduce exactly',async()=>{
  const f=await setup(),{domainFor,snapshotFor}=require('../scripts/attempt-lifecycle.cjs'),{hash}=require('../scripts/direct-buy.cjs');
  const {verifyDualBindings}=require('../scripts/dual-bindings.cjs');
  const g=await f.monthly.monthlyEpochPolicy(1),s=await f.short.shortEpochPolicy(1);
  const manifest={chainId:'31337',registry:f.registry.target,quote:f.quote.target,token:f.token.target};
  const config={schema:'attempt-lifecycle-v4',source:f.short.target,sourceCodeHash:ethers.keccak256(await f.provider.getCode(f.short.target)),
    instanceId:await f.short.datasetInstance(),monthlySource:f.monthly.target,monthlySourceCodeHash:ethers.keccak256(await f.provider.getCode(f.monthly.target)),
    monthlyInstanceId:await f.monthly.monthlyInstance(),vault:f.vault.target,vaultCodeHash:ethers.keccak256(await f.provider.getCode(f.vault.target)),
    shortRules:{rulesHash:s.hash,noticeSeconds:String(await f.short.shortRulesNotice()),startedAt:String(await f.short.shortRulesStartedAt()),firstBlock:String(s.firstBlock)},
    monthlyPolicy:{rulesHash:g.hash,interval:'100',startedAt:String(await f.monthly.monthlyStartedAt())},monthlyRules:{noticeSeconds:'10',firstBlock:String(g.firstBlock)}};
  const domain=domainFor(manifest,config);await verifyDualBindings(f.provider,domain);
  await assert.rejects(()=>verifyDualBindings(f.provider,{...domain,monthlyRulesGenesisHash:id('false')}),/genesis/);
  await sent(f.monthly.announce(nextRules));await advance(101);await sent(f.monthly.activate());await rpc('evm_mine');
  const request=await f.request('verified epoch'),snapshot=snapshotFor(domain,request.drawId,'MONTHLY',{blockNumber:request.cutoff,blockHash:request.cutoffHash},g.hash,
    f.ps.map(p=>({wallet:p.wallet.toLowerCase(),count:'1',firstAttempt:'1',lastAttempt:'1'})),1);
  request.snapshotHash=hash(snapshot);const artifact={schema:'monthly-dataset-artifact-v1',snapshot,request,rules:normalRules};
  await f.prepare(request);const ready=await dataset.verifyPublication(f.provider,f.monthly,artifact);assert.equal(ready.status,'READY');assert.equal(ready.context,null);
  await assert.rejects(()=>dataset.verifyPublication(f.provider,f.monthly,{...artifact,snapshot:{...snapshot,domain:{...domain,shortRulesGenesisHash:id('wrong short genesis')}}}),/genesis/);
  await assert.rejects(()=>dataset.verifyPublication(f.provider,f.monthly,{...artifact,rules:nextRules}),/rules/);
  await sent(f.monthly.sealMonth(request.drawId));const sealed=await dataset.verifyPublication(f.provider,f.monthly,artifact);
  assert.equal(sealed.context,(await f.monthly.month(request.drawId)).context);assert.equal(sealed.publications.length,1);
  await sent(f.monthly.supplySeed(request.drawId,ethers.ZeroHash));await sent(f.monthly.processMonth(request.drawId,0,f.ps));await sent(f.monthly.finishMonth(request.drawId));
  assert.equal((await dataset.verifyPublication(f.provider,f.monthly,artifact)).context,sealed.context);
});
