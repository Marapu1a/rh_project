const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs');
const model=require('../scripts/short-outcome.cjs');
const {participants,nearCertainRules}=require('./fixtures/short-outcome.cjs');
const {fixture,split,normalize,resultHash,recoverChunks,rpc,sent}=require('./fixtures/short-streaming.cjs');
const compiled=compile(),seed=ethers.id('stream study seed');
async function rejects(action){await assert.rejects(async()=>{const value=await action();if(value?.wait)await value.wait();});}
async function publish(f,ps,size=64){for(const chunk of split(ps,size))await sent(f.source.publish(chunk));}
async function start(f){await sent(f.source.connect(f.other).seal());await sent(f.source.supplySeed(seed));}
async function process(f,chunks){for(let i=0;i<chunks.length;i++)await sent(f.source.connect(i%2?f.third:f.other).process(i,chunks[i]));}
async function compare(f,ps,value=seed){const context=await f.source.context(),expected=model.compute(context,value,ps,f.rules,f.prizes),actual=await f.source.result();
  assert.deepEqual(normalize(actual),normalize(expected));
  assert.equal(actual.resultHash,resultHash(context,value,await f.source.root(),f.rules,f.prizes,expected));return expected;}

test('one frozen dataset/seed gives identical outcome and study hash for 1/7/64-wallet publication partitions',async()=>{
  const ps=participants(71),f=await fixture(compiled,ps);
  let checkpoint=await rpc('evm_snapshot'),first;
  for(const size of [1,7,64]){
    await publish(f,ps,size);assert.equal(await f.vault.reserved(f.quote.target),0n);
    await start(f);await process(f,split(ps,size));const expected=await compare(f,ps);
    const actual=await f.source.result();if(first)assert.deepEqual(actual.toArray(true),first.toArray(true));else first=actual;
    await sent(f.source.connect(f.third).finish());
    assert.equal(await f.vault.claimable(f.quote.target),expected.amounts.reduce((a,b)=>a+b,0n));
    assert.equal(await f.vault.reserved(f.quote.target),0n);
    assert.equal(await f.vault.freeShort()+await f.vault.claimable(f.quote.target),f.setup.budget);
    await rpc('evm_revert',[checkpoint]);checkpoint=await rpc('evm_snapshot');
  }
});

test('third parties reconstruct calldata from the chain and complete after original executor disappears',async()=>{
  const ps=participants(90),f=await fixture(compiled,ps,{rules:nearCertainRules});
  await publish(f,ps,40);await start(f);
  const recovered=await recoverChunks(f.provider,f.source);
  await sent(f.source.connect(f.other).process(0,recovered[0]));
  for(let i=1;i<recovered.length;i++)await sent(f.source.connect(f.third).process(i,recovered[i]));
  const expected=await compare(f,ps);await sent(f.source.connect(f.third).finish());
  await sent(f.vault.connect(f.other).claim(f.setup.drawId,expected.winners[0]));
  assert.equal(await f.quote.balanceOf(expected.winners[0]),expected.amounts[0]);
});

test('bad publication, cross-chunk duplicates and wrong root cannot freeze funds',async()=>{
  const ps=participants(3),f=await fixture(compiled,ps);
  for(const chunk of [[],participants(65),[ps[1],ps[0]],[{...ps[0],firstAttempt:0}],
    [{...ps[0],firstAttempt:3,lastAttempt:2}],[{...ps[0],wallet:f.vault.target}]])await rejects(()=>f.source.publish(chunk));
  await rejects(()=>f.source.connect(f.other).publish([ps[0]]));
  await sent(f.source.publish([ps[0]]));await rejects(()=>f.source.publish([ps[0]]));
  await rejects(()=>f.source.seal());assert.equal(await f.vault.reserved(f.quote.target),0n);
  await sent(f.source.publish(ps.slice(1)));await sent(f.source.seal());
  await rejects(()=>f.source.publish(ps));
  const g=await fixture(compiled,ps,{root:ethers.id('wrong root')});await publish(g,ps);
  await rejects(()=>g.source.seal());assert.equal(await g.vault.reserved(g.quote.target),0n);
});

test('ordered progress rejects omission/replay/replacement and premature finalization without losing the reserve',async()=>{
  const ps=participants(7),f=await fixture(compiled,ps);await publish(f,ps,3);
  await sent(f.source.seal());await rejects(()=>f.source.process(0,ps.slice(0,3)));await sent(f.source.supplySeed(seed));
  await rejects(()=>f.source.supplySeed(ethers.ZeroHash));
  const chunks=split(ps,3);
  await rejects(()=>f.source.process(1,chunks[1]));await rejects(()=>f.source.process(0,chunks[1]));
  await sent(f.source.connect(f.other).process(0,chunks[0]));
  await rejects(()=>f.source.process(0,chunks[0]));await rejects(()=>f.source.finish());
  assert.equal(await f.source.processed(),3n);assert.equal(await f.vault.reserved(f.quote.target),f.setup.budget);
  await sent(f.source.process(1,chunks[1]));await sent(f.source.process(2,chunks[2]));await compare(f,ps);
  await sent(f.source.finish());await rejects(()=>f.source.finish());await rejects(()=>f.source.process(3,[]));
});

test('anchored cutoff survives a long preparation, but incomplete/unfunded preparation reserves nothing',async()=>{
  const ps=participants(5),f=await fixture(compiled,ps,{fund:false});await publish(f,ps);
  await rpc('hardhat_mine',['0x12c']);await rejects(()=>f.source.seal());
  assert.equal(await f.source.phase(),1n);assert.equal(await f.vault.reserved(f.quote.target),0n);
  await sent(f.vault.fundUSDG(f.setup.budget,1));await start(f);await process(f,split(ps,64));await compare(f,ps);await sent(f.source.finish());
});

test('finalize failure retains complete progress/seed/reserve, and recovery does not reroll',async()=>{
  const ps=participants(12),f=await fixture(compiled,ps);await publish(f,ps);await start(f);await process(f,split(ps,64));
  const before=await f.source.result();
  await sent(f.quote.blockRecipient('0x000000000000000000000000000000000000dEaD'));await sent(f.quote.burn(f.vault.target,1));
  await rejects(()=>f.source.finish({gasLimit:5000000}));
  assert.equal(await f.source.phase(),3n);assert.deepEqual((await f.source.result()).toArray(true),before.toArray(true));
  assert.equal((await f.source.queryFilter(f.source.filters.AttemptsConsumed())).length,0);
  await sent(f.quote.mint(f.vault.target,1));await sent(f.source.connect(f.other).finish());
  assert.equal((await f.source.queryFilter(f.source.filters.AttemptsConsumed())).length,1);
});

test('empty mathematical dataset and zero seed are well-defined; reorg rolls back only orphaned progress',async()=>{
  const f=await fixture(compiled,[]);await sent(f.source.seal());await sent(f.source.supplySeed(ethers.ZeroHash));
  await compare(f,[],ethers.ZeroHash);await sent(f.source.finish());assert.equal(await f.vault.freeShort(),f.setup.budget);
  const ps=participants(8),g=await fixture(compiled,ps);await publish(g,ps,4);await start(g);
  await sent(g.source.process(0,ps.slice(0,4)));const checkpoint=await rpc('evm_snapshot');
  await sent(g.source.process(1,ps.slice(4)));await sent(g.source.finish());
  await rpc('evm_revert',[checkpoint]);assert.equal(await g.source.nextChunk(),1n);assert.equal(await g.source.seed(),seed);
  await rejects(()=>g.source.finish());await sent(g.source.connect(g.third).process(1,ps.slice(4)));await compare(g,ps);await sent(g.source.finish());
});
