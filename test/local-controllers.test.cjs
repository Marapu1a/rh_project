const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs');
const {fixture,sent,advance}=require('./fixtures/local-controllers.cjs');
const replay=require('../scripts/short-settlement.cjs'),outcome=require('../scripts/short-outcome.cjs');
const {normalRules}=require('./fixtures/short-outcome.cjs');
const compiled=compile();
async function conserved(f){
  assert.equal(await f.quote.balanceOf(f.vault.target),await f.vault.freeShort()+await f.vault.freeCurrent()+await f.vault.freeNext()
    +await f.vault.reserved(f.quote.target)+await f.vault.claimable(f.quote.target)+await f.vault.unrecognizedUSDG());
}
async function reject(tx){await assert.rejects(async()=>sent(tx()));}

test('local skeleton: async Short and Monthly, independent recovery, claim failure, unpaid debt and next Short cycle',async()=>{
  const f=await fixture(compiled);await f.fundExecution();await advance(30*86400+1);
  for(const c of [f.short,f.monthly,f.vault])assert((await f.provider.getCode(c.target)).length/2-1<=24576);
  const s=await f.prepare('first'),m=await f.prepare('monthly','MONTHLY');
  await sent(f.short.connect(f.executor).seal(s.proposalId));await sent(f.monthly.connect(f.executor).sealMonth(m.drawId));
  const key=await f.short.drawRequest(s.drawId),mk=await f.monthly.drawRequest(m.drawId);
  assert.notEqual(key,mk);assert.equal(await f.vault.reserved(f.quote.target),1101n);
  assert.equal(await f.random.contexts(key),(await f.short.datasetProposal(s.proposalId)).context);
  await reject(()=>f.short.connect(f.executor).fulfill(key,ethers.ZeroHash));
  await sent(f.random.deliver(key,ethers.ZeroHash));await sent(f.random.deliver(mk,ethers.ZeroHash));
  await reject(()=>f.random.deliver(key,ethers.id('replacement')));
  await reject(()=>f.short.finishShort(s.drawId));
  await sent(f.short.processShort(s.drawId,0,s.data.slice(0,8)));
  // A fresh executor reconstructs calldata, seed and progress from the chain.
  const recovered=await replay.recover(f.provider,f.short,s.drawId);
  assert.equal(recovered.state.nextChunk,1n);assert.equal(recovered.nextAction,'processShort');
  for(let i=1;i<recovered.chunks.length;i++)await sent(f.short.connect(f.executor).processShort(s.drawId,i,recovered.chunks[i]));
  assert.equal((await f.short.shortResult(s.drawId)).resultHash,recovered.expected.resultHash);
  const finish=await sent(f.short.connect(f.executor).finishShort(s.drawId));
  assert(finish.logs.some(l=>{try{return f.short.interface.parseLog(l)?.name==='AttemptsConsumed';}catch{return false;}}));
  await reject(()=>f.short.finishShort(s.drawId));
  assert.equal(await f.monthly.pendingMonth(),m.drawId);
  const month=await f.monthly.month(m.drawId),expected=outcome.compute(month.context,ethers.ZeroHash,m.data,normalRules,[month.budget]);
  for(let i=0;i<m.data.length;i+=8)await sent(f.monthly.connect(f.executor).processMonth(m.drawId,i/8,m.data.slice(i,i+8)));
  await sent(f.monthly.connect(f.executor).finishMonth(m.drawId));
  assert.equal((await f.monthly.month(m.drawId)).winner.toLowerCase(),expected.winners[0]||ethers.ZeroAddress);
  const result=await f.short.shortResult(s.drawId);assert(result.winners.length>0);
  const winner=result.winners[0],debt=result.amounts[0];assert(debt>0n);
  await sent(f.quote.blockRecipient(winner));await reject(()=>f.vault.claim(s.drawId,winner));
  assert.equal(await f.vault.reward(s.drawId,winner),debt);await conserved(f);
  await advance();
  const nextData=s.data.map(p=>({...p,firstAttempt:6n,lastAttempt:10n}));
  const s2=await f.prepare('second','SHORT',nextData);
  await sent(f.short.connect(f.executor).seal(s2.proposalId));
  assert.equal(await f.vault.reward(s.drawId,winner),debt);
  await sent(f.random.deliver(await f.short.drawRequest(s2.drawId),ethers.id('second seed')));
  for(let i=0;i<s2.data.length;i+=8)await sent(f.short.connect(f.executor).processShort(s2.drawId,i/8,s2.data.slice(i,i+8)));
  await sent(f.short.connect(f.executor).finishShort(s2.drawId));
  await sent(f.quote.blockRecipient(ethers.ZeroAddress));
  const before=await f.quote.balanceOf(winner);await sent(f.vault.connect(f.executor).claim(s.drawId,winner));
  assert.equal(await f.quote.balanceOf(winner),before+debt);assert.equal(await f.vault.reward(s.drawId,winner),0n);
  assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);await conserved(f);
  console.log('Local deployed runtime bytes:',Object.fromEntries(['LocalShortController','LocalMonthlyController','DualControllerPromoVault']
    .map(n=>[n,compiled[n].evm.deployedBytecode.object.length/2])));
});

test('both controllers: missing funds/readiness/request failure never freeze; async callback guard and one-shot binding',async()=>{
  const f=await fixture(compiled);await advance(30*86400+1);
  const s=await f.prepare('failure short'),m=await f.prepare('failure monthly','MONTHLY');
  const cases=[[f.short,s.drawId,()=>f.short.seal(s.proposalId)],[f.monthly,m.drawId,()=>f.monthly.sealMonth(m.drawId)]];
  for(const [, ,seal] of cases)await reject(seal);
  await f.fundExecution();await sent(f.random.setReady(false));for(const [,,seal] of cases)await reject(seal);
  await sent(f.random.setReady(true));await sent(f.random.setFailure(true));
  for(const [c,draw,seal] of cases){await reject(seal);assert.equal(await c.drawRequest(draw),0n);}
  assert.equal(await f.random.nextId(),0n);assert.equal(await f.vault.reserved(f.quote.target),0n);
  assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash);
  await sent(f.random.setFailure(false));await sent(f.random.setSynchronous(true));
  for(const [c,draw,seal] of cases){
    await sent(seal());assert.equal(await f.random.callbackSucceeded(),false);
    const key=await c.drawRequest(draw);assert.equal((await c.requests(key)).delivered,false);
    await reject(seal);await reject(()=>c.fulfill(key,ethers.ZeroHash));
    await sent(f.random.deliver(key,ethers.ZeroHash));assert.equal((await c.requests(key)).delivered,true);
    await reject(()=>f.random.deliver(key,ethers.ZeroHash));
  }
  await conserved(f);
});

test('publisher cannot be bypassed; governor cannot inject randomness or reset a frozen draw',async()=>{
  const f=await fixture(compiled);await f.fundExecution();await advance();
  const s=await f.prepare('permissions');
  await reject(()=>f.short.connect(f.executor).supersede(s.proposalId));
  await reject(()=>f.short.connect(f.executor).publish(s.proposalId,s.data));
  await reject(()=>f.monthly.connect(f.executor).supersedeMonth(ethers.id('unknown')));
  await sent(f.short.seal(s.proposalId));await reject(()=>f.short.supersede(s.proposalId));
  const key=await f.short.drawRequest(s.drawId);
  await reject(()=>f.short.fulfill(key,ethers.ZeroHash));
  for(const c of [f.short,f.monthly])for(const method of ['setProvider','reset','cancel','seed','withdraw','attack'])
    assert.equal(c.interface.getFunction(method),null);
  await conserved(f);
});
