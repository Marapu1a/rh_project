const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../scripts/pons-batch-funding.cjs'),P=require('../scripts/pons-curve-buy.cjs');
const fixture=require('../docs/evidence/PONS_METAMASK_MODEL_2026-10-02.json');
const m=require('../docs/evidence/PONS_CHANNEL_RECEIPTS_2026-10-02.json').manifest;
const profile={weth:fixture.capture.out.eth.calls[0].to,router:fixture.capture.out.eth.funding.route.router,pool:'0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca'};
const sample=()=>structuredClone(fixture.fork.steps[1].steps[0]);
test('funding surplus is separated from BUY amount without changing original receipt',()=>{
 const s=sample(),r=F.decode(m,profile,s.tx,s.receipt);
 assert.equal(r.status,'SHAPE_MATCH');assert.equal(r.fundingQuoteRaw,'2728530');assert.equal(r.observedBuyQuoteRaw,'2701245');assert.equal(r.unspentFundingQuoteRaw,'27285');assert.equal(r.admitted,false);assert.equal(r.eligibility,null);assert.deepEqual(s,sample());
});
for(const [name,mutate]of [
 ['wrong funding pool',(s,p)=>p.pool=m.factory],
 ['wrong router',(s,p)=>p.router=m.factory],
 ['extra funding',s=>s.receipt.logs.push({...s.receipt.logs[2],logIndex:'0x100'})],
 ['missing WETH payment',s=>s.receipt.logs.splice(4,1)],
 ['funding after BUY',s=>s.receipt.logs[2].logIndex='0x100'],
 ['short funding',s=>s.receipt.logs[2].data='0x'+'0'.repeat(63)+'1'],
 ['removed log',s=>s.receipt.logs[2].removed=true],
 ['refund event',s=>{const v=P.EVENTS.encodeEventLog(P.EVENTS.getEvent('CurveBuyRefunded'),[s.tx.from,1n]);s.receipt.logs.push({...s.receipt.logs[9],topics:v.topics,data:v.data,logIndex:'0x100'});}],
 ['foreign receipt',s=>s.receipt.blockHash='0x'+'00'.repeat(32)],
 ['revert',s=>s.receipt.status='0x0'],
 ['noncanonical envelope',s=>s.tx.input+='00']
])test('rejects '+name,()=>{const s=sample(),p={...profile};mutate(s,p);const r=F.decode(m,p,s.tx,s.receipt);assert.equal(r.status,'REJECTED');assert.equal(r.admitted,false);});
