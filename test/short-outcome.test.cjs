const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs');
const model=require('../scripts/short-outcome.cjs');
const {fixture,participants,normalRules,nearCertainRules,rpc,sent}=require('./fixtures/short-outcome.cjs');
const {replayAttempts}=require('../scripts/attempt-lifecycle.cjs');
const compiled=compile(),context=ethers.id('pure context');
function normalized(r){return {winners:Array.from(r.winners,x=>x.toLowerCase()),amounts:Array.from(r.amounts),prizeIndices:Array.from(r.prizeIndices),admittedCount:r.admittedCount,resultHash:r.resultHash};}
async function rejects(action){await assert.rejects(async()=>{const r=await action();if(r?.wait)await r.wait();});}

test('independent full-sort reference matches Solidity bounded selection across seeds, rules and populations',async()=>{
  const f=await fixture(compiled);
  for(const n of [0,1,3,10,50])for(const rules of [normalRules,nearCertainRules,{...normalRules,hNumerator:3,hDenominator:2}]){
    const ps=participants(n),prizes=[70n,30n,20n];
    for(let s=0;s<3;s++){
      const seed=ethers.id('seed '+s),expected=model.compute(context,seed,ps,rules,prizes);
      const actual=normalized(await f.source.calculate(context,seed,ps,rules,prizes));
      assert.deepEqual(actual,expected);
      assert.equal(actual.winners.length,Math.min(Number(actual.admittedCount),prizes.length));
      assert.equal(new Set(actual.winners).size,actual.winners.length);
      assert.equal(new Set(actual.prizeIndices).size,actual.prizeIndices.length);
      assert.ok(actual.amounts.every(p=>p>0n));assert.ok(actual.amounts.reduce((a,b)=>a+b,0n)<=120n);
    }
  }
});

test('admission threshold matches exact rational flooring at zero, fractions and uint128 boundaries',async()=>{
  const f=await fixture(compiled);
  for(const r of [normalRules,nearCertainRules,{...normalRules,pNumerator:1,pDenominator:4294967295,hNumerator:4294967295,hDenominator:1}]){
    for(const e of [0n,1n,2n,100n,(1n<<128n)-1n]){
      const actual=await f.source.probabilityThreshold(e,r);assert.equal(actual,model.threshold(e,r));
      assert.ok(actual>=0n&&actual<(1n<<256n));
    }
  }
  const ps=[{...participants(1)[0],lastAttempt:(1n<<128n)-1n}];
  const expected=model.compute(context,ethers.ZeroHash,ps,nearCertainRules,[ethers.MaxUint256]);
  assert.deepEqual(normalized(await f.source.calculate(context,ethers.ZeroHash,ps,nearCertainRules,[ethers.MaxUint256])),expected);
});

test('fewer admitted wallets receive a random subset, not a guaranteed largest prize',async()=>{
  const f=await fixture(compiled),ps=participants(1,1000000),prizes=[100n,10n,1n];
  let seed,expected;
  for(let i=0;i<100;i++){
    seed=ethers.id('subset '+i);expected=model.compute(context,seed,ps,nearCertainRules,prizes);
    if(expected.winners.length===1&&expected.prizeIndices[0]!==0n)break;
  }
  assert.equal(expected.winners.length,1);assert.notEqual(expected.prizeIndices[0],0n);
  assert.deepEqual(normalized(await f.source.calculate(context,seed,ps,nearCertainRules,prizes)),expected);
});

test('invalid ranges, unsorted/duplicate wallets, invalid rules and baskets fail in both implementations',async()=>{
  const f=await fixture(compiled),ps=participants(2),seed=ethers.id('invalid');
  for(const bad of [[ps[1],ps[0]],[ps[0],ps[0]],[{...ps[0],wallet:ethers.ZeroAddress}],
    [{...ps[0],firstAttempt:0}],[{...ps[0],firstAttempt:3,lastAttempt:2}]]){
    assert.throws(()=>model.participantsHash(bad));await rejects(()=>f.source.participantHash(bad));
  }
  for(const r of [{...normalRules,version:2},{...normalRules,pNumerator:0},{...normalRules,pNumerator:5},
    {...normalRules,hDenominator:0},{...normalRules,hNumerator:0},{...normalRules,pNumerator:4,pDenominator:10}]){
    assert.throws(()=>model.compute(context,seed,ps,r,[1]));await rejects(()=>f.source.calculate(context,seed,ps,r,[1]));
  }
  for(const prizes of [[],[0],Array(65).fill(1),[ethers.MaxUint256,1]]){
    assert.throws(()=>model.compute(context,seed,ps,normalRules,prizes));await rejects(()=>f.source.calculate(context,seed,ps,normalRules,prizes));
  }
  await rejects(()=>f.source.calculate(ethers.ZeroHash,seed,ps,normalRules,[1]));
});

test('both commitments derive from one snapshot; mismatched JSON/EVM payloads and count inconsistencies are detected',async()=>{
  const f=await fixture(compiled),ps=participants(3),draw=await f.freeze(ps);
  const both=model.verifySnapshotCommitments(draw.snapshot,draw.request);
  assert.equal(both.evmParticipantsHash,await f.source.participantHash(ps));
  assert.throws(()=>model.verifySnapshotCommitments(draw.snapshot,{...draw.request,evmParticipantsHash:model.participantsHash(participants(2))}));
  assert.throws(()=>model.verifySnapshotCommitments({...draw.snapshot,drawId:ethers.id('changed')},draw.request));
  const bad=structuredClone(draw.snapshot);bad.participants[0].count='999';assert.throws(()=>model.commitmentsForSnapshot(bad));
  const changed=ps.map((p,i)=>({...p,firstAttempt:BigInt(p.firstAttempt)+1n,lastAttempt:BigInt(p.lastAttempt)+1n}));
  assert.notEqual(model.participantsHash(changed),both.evmParticipantsHash);
});

test('seed/context/rules/basket domain changes are reflected in result commitment',async()=>{
  const ps=participants(10),seed=ethers.id('domain'),prizes=[7,3];
  const original=model.compute(context,seed,ps,normalRules,prizes).resultHash;
  for(const value of [model.compute(ethers.id('other draw'),seed,ps,normalRules,prizes),
    model.compute(context,ethers.id('other seed'),ps,normalRules,prizes),
    model.compute(context,seed,ps,{...normalRules,hNumerator:2},prizes),
    model.compute(context,seed,ps,normalRules,[3,7])])assert.notEqual(value.resultHash,original);
});

test('verified fixture settlement assigns basket prizes, preserves dust and allows a different future rules payload',async()=>{
  const f=await fixture(compiled),ps=participants(15,1000000),draw=await f.freeze(ps,nearCertainRules,[7,3],101n),seed=ethers.id('settle');
  const expected=model.compute(draw.context,seed,ps,draw.rules,draw.prizes);
  await sent(f.source.settle(draw.request.drawId,seed,ps));
  assert.equal(await f.vault.reserved(f.quote.target),0n);assert.equal(await f.vault.claimable(f.quote.target),100n);
  assert.equal(await f.vault.freeShort(),1n);assert.equal(await f.source.pendingShortDrawId(),ethers.ZeroHash);
  const terminal=(await f.source.queryFilter(f.source.filters.AttemptsConsumed()))[0];
  assert.equal(terminal.args.resultHash,expected.resultHash);assert.equal(terminal.args.outcome,1n);
  const before=await f.source.shortCommitment(draw.request.drawId),oldRules=await f.source.shortBasketRules(draw.request.drawId);
  const next=await f.freeze(participants(3),normalRules,[2,1],60n);
  assert.notEqual(next.request.expectedRulesHash,draw.request.expectedRulesHash);
  // Compare all decoded values without ethers Result proxy identity (Node 24).
  assert.deepEqual((await f.source.shortCommitment(draw.request.drawId)).toArray(true),before.toArray(true));
  assert.deepEqual((await f.source.shortBasketRules(draw.request.drawId)).toArray(true),oldRules.toArray(true));
  await sent(f.vault.claim(draw.request.drawId,expected.winners[0]));
  assert.equal(await f.quote.balanceOf(expected.winners[0]),expected.amounts[0]);
  assert.equal(await f.source.pendingShortDrawId(),next.request.drawId);
  await rejects(()=>f.source.settle(draw.request.drawId,seed,ps));
});

test('settlement rejects replacement participant sets and finalize failure leaves everything frozen',async()=>{
  const f=await fixture(compiled),ps=participants(10),draw=await f.freeze(ps),seed=ethers.id('atomic');
  await rejects(()=>f.source.settle(draw.request.drawId,seed,ps.slice(1)));
  const changed=ps.map(p=>({...p,lastAttempt:p.lastAttempt+1n}));await rejects(()=>f.source.settle(draw.request.drawId,seed,changed));
  // MockToken blocks address(0) by default; enable its test-only burn path.
  await sent(f.quote.blockRecipient('0x000000000000000000000000000000000000dEaD'));
  await sent(f.quote.burn(f.vault.target,1));
  await rejects(()=>f.source.settle(draw.request.drawId,seed,ps,{gasLimit:8000000}));
  assert.equal(await f.source.pendingShortDrawId(),draw.request.drawId);
  assert.equal(await f.vault.reserved(f.quote.target),draw.request.budget);
  assert.equal((await f.source.queryFilter(f.source.filters.AttemptsConsumed())).length,0);
  await sent(f.quote.mint(f.vault.target,1));await sent(f.source.settle(draw.request.drawId,seed,ps));
  const expected=model.compute(draw.context,seed,ps,draw.rules,draw.prizes);
  assert.equal((await f.source.queryFilter(f.source.filters.AttemptsConsumed()))[0].args.resultHash,expected.resultHash);
});

test('nonempty participant set can have no winners; all frozen budget is released without zero rewards',async()=>{
  const f=await fixture(compiled),ps=participants(2),draw=await f.freeze(ps);
  let seed,expected;
  for(let i=0;i<100;i++){seed=ethers.id('no winners '+i);expected=model.compute(draw.context,seed,ps,draw.rules,draw.prizes);if(!expected.winners.length)break;}
  assert.equal(expected.winners.length,0);await sent(f.source.settle(draw.request.drawId,seed,ps));
  assert.equal(await f.vault.freeShort(),draw.request.budget);assert.equal(await f.vault.claimable(f.quote.target),0n);
  assert.equal((await f.source.queryFilter(f.source.filters.AttemptsConsumed()))[0].args.outcome,0n);
});

test('actual empty receipt history replays freeze and verified test terminal with both commitments',async()=>{
  const f=await fixture(compiled),draw=await f.freeze([]),seed=ethers.id('empty');
  await sent(f.source.settle(draw.request.drawId,seed,[]));
  const blocks=[],latest=BigInt(await rpc('eth_blockNumber'));
  for(let n=BigInt(f.anchor.number)+1n;n<=latest;n++){
    const b=await rpc('eth_getBlockByNumber',['0x'+n.toString(16),true]),transactions=[];
    for(const tx of b.transactions)transactions.push({tx,receipt:await rpc('eth_getTransactionReceipt',[tx.hash])});
    blocks.push({number:b.number,hash:b.hash,parentHash:b.parentHash,timestamp:b.timestamp,transactions});
  }
  const ledger=replayAttempts(f.manifest,f.config,blocks),record=ledger.draws[0];
  assert.equal(record.status,'CONSUMED');assert.equal(record.terminal.outcome,'NO_WINNER');
  model.verifySnapshotCommitments(record.snapshot,draw.request);
  assert.equal(record.terminal.resultHash,model.compute(draw.context,seed,[],draw.rules,draw.prizes).resultHash);
});
