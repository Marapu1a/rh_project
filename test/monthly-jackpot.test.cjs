const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs'),{fixture,rpc,sent,advance,monthlyRoot}=require('./fixtures/dual-controller.cjs');
const {participants,normalRules}=require('./fixtures/short-outcome.cjs'),model=require('../scripts/monthly-outcome.cjs');
const {drawIdFor}=require('../scripts/draw-id.cjs');
const compiled=compile(),id=ethers.id,U=1n<<256n,Q=1n<<128n;
async function prepare(f,ps,label,size=1){
 const b=await f.provider.getBlock('latest'),drawId=drawIdFor('MONTHLY',id(label));
 await sent(f.monthly.beginMonth({drawId,snapshotHash:id(label+' snapshot'),root:monthlyRoot(ps),campaign:1,rulesEpoch:1,cutoff:b.number,cutoffHash:b.hash,count:ps.length,attempts:ps.reduce((n,p)=>n+p.lastAttempt-p.firstAttempt+1n,0n)}));
 for(let i=0;i<ps.length;i+=size)await sent(f.monthly.publishMonth(drawId,ps.slice(i,i+size)));
 await sent(f.monthly.sealMonth(drawId));return drawId;
}
function seedFor(m,payout){for(let i=0;i<1000;i++){const s=id('fixed test vector '+i);if(model.pays(m.context,s)===payout)return s;}throw Error('No test seed');}
async function conservation(f){assert.equal(await f.quote.balanceOf(f.vault.target),await f.vault.freeShort()+await f.vault.freeCurrent()+await f.vault.freeNext()+await f.vault.reserved(f.quote.target)+await f.vault.claimable(f.quote.target)+await f.vault.unrecognizedUSDG());}
test('V2 integer weights and 512-bit ticket match independent BigInt boundaries and vectors',async()=>{
 const f=await fixture(compiled),c=await f.deploy('MonthlyOutcomeFixture');
 assert.equal(await c.rulesHash(model.RULES),model.rulesHash(model.RULES));
 for(const e of [1n,2n,5n,10n,100n,Q-1n]){const w=await c.weight(e);assert.equal(w,model.weight(e));assert(w*(e+1n)<=Q*e&&(w+1n)*(e+1n)>Q*e);}
 await assert.rejects(c.weight(0));await assert.rejects(c.weight(Q));
 for(const total of [1n,Q/2n,Q,3n*Q,U-1n])for(const h of [0n,1n,U/2n,U-2n,U-1n,BigInt(id('sample '+total))]){
  const point=await c.ticket(h,total);assert.equal(point,h*total/U);assert(point<total);
 }
 for(let i=0;i<32;i++){const context=id('context '+i),seed=id('seed '+i);assert.equal(await c.pays(context,seed),model.pays(context,seed));}
 await assert.rejects(c.rulesHash({...model.RULES,pNumerator:2}));assert.throws(()=>model.rulesHash({...model.RULES,hNumerator:2}));
});
test('V2 pays one weighted winner, resumes chunks, preserves credits; rollover keeps all Current/Next',async()=>{
 const f=await fixture(compiled,{real:true,monthlyRules:model.RULES}),ps=participants(4,1).map((p,i)=>({...p,lastAttempt:BigInt([1,2,10,100][i])}));
 await assert.rejects(f.monthly.announce(normalRules));await assert.rejects(f.monthly.announce({...model.RULES,pNumerator:1}));
 await advance();const draw=await prepare(f,ps,'weighted'),m=await f.monthly.month(draw),seed=seedFor(m,true);
 assert.equal(m.totalWeight,ps.reduce((n,p)=>n+model.weight(p.lastAttempt),0n));
 const expected=model.expectedResult({context:m.context,root:m.root,budget:m.budget,seed},{rules:model.RULES,snapshot:{participants:ps}});
 await sent(f.monthly.supplySeed(draw,seed));await assert.rejects(f.monthly.supplySeed(draw,seed));
 await assert.rejects(f.monthly.finishMonth(draw));await assert.rejects(f.monthly.processMonth(draw,1,[ps[1]]));
 await sent(f.monthly.processMonth(draw,0,[ps[0]]));await assert.rejects(f.monthly.processMonth(draw,0,[ps[0]]));
 const resumed=f.monthly.connect(f.other);for(let i=1;i<ps.length;i++)await sent(resumed.processMonth(draw,i,[ps[i]]));
 assert.equal((await resumed.month(draw)).winner.toLowerCase(),expected.winner);
 await sent(f.vault.fundUSDG(23,2));await sent(f.quote.blockRecipient('0x000000000000000000000000000000000000dEaD'));await sent(f.quote.burn(f.vault.target,1));
 const clock=await f.monthly.lastMonthAt();await assert.rejects(f.monthly.finishMonth(draw));
 assert.equal(await f.monthly.pendingMonth(),draw);assert.equal(await f.monthly.lastMonthAt(),clock);assert.equal(await f.vault.reward(draw,expected.winner),0n);
 await sent(f.quote.mint(f.vault.target,1));await sent(resumed.finishMonth(draw));
 const result=await f.monthly.month(draw);assert.equal(result.resultHash,expected.resultHash);assert.equal(result.admitted,4n);assert.equal(result.processedWeight,result.totalWeight);
 assert.equal(await f.vault.reward(draw,expected.winner),1000n);assert.equal(await f.vault.freeCurrent(),123n);assert.equal(await f.vault.freeNext(),0n);
 await assert.rejects(f.monthly.finishMonth(draw));await assert.rejects(prepare(f,ps,'too early'));
 await sent(f.vault.fundUSDG(100,3));await advance();const next=await prepare(f,ps,'rollover',4),nm=await f.monthly.month(next);
 await sent(f.monthly.supplySeed(next,seedFor(nm,false)));await sent(f.monthly.processMonth(next,0,ps));await sent(f.monthly.finishMonth(next));
 const no=await f.monthly.month(next);assert.equal(no.winner,ethers.ZeroAddress);assert.equal(no.resultHash,model.expectedResult(no,{rules:model.RULES,snapshot:{participants:ps}}).resultHash);
 assert.equal(await f.vault.freeCurrent(),123n);assert.equal(await f.vault.freeNext(),100n);assert.equal(await f.vault.reward(draw,expected.winner),1000n);
 await assert.rejects(prepare(f,ps,'rollover'));await sent(f.vault.claim(draw,expected.winner));await conservation(f);
});
test('one participant receives the full jackpot whenever global gate pays, no personal admission',async()=>{
 const f=await fixture(compiled,{real:true,monthlyRules:model.RULES}),ps=participants(1,1);await advance();
 const d=await prepare(f,ps,'single'),m=await f.monthly.month(d);await sent(f.monthly.supplySeed(d,seedFor(m,true)));
 await sent(f.monthly.processMonth(d,0,ps));await sent(f.monthly.finishMonth(d));assert.equal(await f.vault.reward(d,ps[0].wallet),1000n);await conservation(f);
});
test('V2 weighted outcome is identical for different publication chunk partitions',async()=>{
 const f=await fixture(compiled,{real:true,monthlyRules:model.RULES}),ps=participants(7);await advance();
 const checkpoint=await rpc('evm_snapshot');let previous;
 for(const size of [1,7]){
  const d=await prepare(f,ps,'partition',size),m=await f.monthly.month(d),seed=seedFor(m,true);
  await sent(f.monthly.supplySeed(d,seed));
  for(let i=0;i<ps.length;i+=size)await sent(f.monthly.processMonth(d,i/size,ps.slice(i,i+size)));
  await sent(f.monthly.finishMonth(d));const result=await f.monthly.month(d);
  assert.equal(result.resultHash,model.expectedResult(result,{rules:model.RULES,snapshot:{participants:ps}}).resultHash);
  if(previous)assert.equal(result.resultHash,previous);else{previous=result.resultHash;await rpc('evm_revert',[checkpoint]);}
 }
});
test('V2 automatic datasets and worker result survive disk reload and consume monthly attempts',async t=>{
 const f=await require('./fixtures/local-scheduler.cjs').setup(t,compiled,{monthlyRules:model.RULES});
 const {runScheduler}=require('../scripts/local-promo-scheduler.cjs');
 await sent(f.registry.register());await f.buy(f.admin,100);await advance();
 let r=await runScheduler(f.options);assert.notEqual(r.status,'error',JSON.stringify(r));
 const state=f.readState(),job=state.jobs.MONTHLY[0].job,d=job.artifact.request.drawId;
 assert.equal(Number(job.artifact.rules.version),2);assert.equal(job.artifact.snapshot.rulesHash,model.rulesHash(model.RULES));
 await f.buy(f.admin,100); // New attempts after freeze must survive settlement.
 const m=await f.monthly.month(d);await sent(f.random.deliver(await f.monthly.drawRequest(d),seedFor(m,true)));
 r=await runScheduler({...f.options});assert.notEqual(r.status,'error',JSON.stringify(r));
 const result=await f.monthly.month(d),expected=model.expectedResult(result,job.artifact);
 assert.equal(result.phase,5n);assert.equal(result.resultHash,expected.resultHash);assert.equal(await f.vault.reward(d,expected.winner),result.budget);
 const ledger=await f.ledger();assert(ledger.draws.some(draw=>draw.drawId===d&&draw.status==='CONSUMED'));
 const wallet=ledger.wallets.find(w=>w.wallet===(f.admin.address).toLowerCase());assert.equal(wallet.MONTHLY.consumedTotal,'1');assert.equal(wallet.MONTHLY.open,'1');assert.equal(wallet.SHORT.consumedTotal,'0');
 const before=await f.provider.getTransactionCount(await f.executor.getAddress());r=await runScheduler({...f.options});assert.notEqual(r.status,'error',JSON.stringify(r));
 assert.equal(await f.provider.getTransactionCount(await f.executor.getAddress()),before);
});
