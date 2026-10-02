const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AbiCoder}=require('ethers');
const B=require('../scripts/pons-batch-buy.cjs');
const P=require('../scripts/pons-curve-buy.cjs');
const f=require('../docs/evidence/PONS_METAMASK_MODEL_2026-10-02.json');
const m={...require('../docs/evidence/PONS_CHANNEL_RECEIPTS_2026-10-02.json').manifest,curve:f.capture.out.details.curve,token:f.capture.out.details.token};
const sample=()=>structuredClone(f.fork.steps[0].steps[0]);
function changeCalls(s,fn,mode=B.MODE){
 const outer=B.EXEC.decodeFunctionData('execute',s.tx.input);
 const [decoded]=AbiCoder.defaultAbiCoder().decode(B.TYPES,outer.executionCalldata);
 const calls=decoded.map(c=>[c.target,c.value,c.callData]);fn(calls);
 s.tx.input=B.EXEC.encodeFunctionData('execute',[mode,AbiCoder.defaultAbiCoder().encode(B.TYPES,[calls])]);
}
test('USDG batch shape identifies account and amount without granting eligibility',()=>{
 const s=sample(),r=B.decode(m,s.tx,s.receipt);
 assert.equal(r.status,'SHAPE_MATCH');assert.equal(r.observedBuyQuoteRaw,'101000000');
 assert.equal(r.account,f.capture.out.account.toLowerCase());assert.equal(r.admitted,false);assert.equal(r.eligibility,null);
 assert.equal(P.decode(m,s.tx,s.receipt)[0].status,'UNSUPPORTED_ROUTE');
 assert.deepEqual(s,sample(),'original canonical evidence must not be mutated');
});
test('ETH funding is explicitly unsupported, not mistaken for a refund',()=>{
 const s=f.fork.steps[1].steps[0];assert.equal(B.decode(m,s.tx,s.receipt).reason,'UNSUPPORTED_CALL_SEQUENCE');
});
for(const [name,mutate] of [
 ['wrong recipient',s=>changeCalls(s,c=>{const a=P.CALL.decodeFunctionData('buy',c[1][2]);c[1][2]=P.CALL.encodeFunctionData('buy',[a.quoteIn,a.minTokensOut,m.factory]);})],
 ['unlimited approval',s=>changeCalls(s,c=>c[0][2]=B.APPROVE.encodeFunctionData('approve',[m.curve,2n**256n-1n]))],
 ['extra call',s=>changeCalls(s,c=>c.push(c[1]))],
 ['try mode',s=>changeCalls(s,()=>{},'0x0101'+'00'.repeat(30))],
 ['relayer',s=>{s.tx.from=m.factory;s.receipt.from=m.factory;}],
 ['revert',s=>s.receipt.status='0x0'],
 ['foreign receipt',s=>s.receipt.transactionHash='0x'+'12'.repeat(32)],
 ['removed log',s=>s.receipt.logs[0].removed=true],
 ['duplicate log',s=>s.receipt.logs.push(s.receipt.logs[0])],
 ['extra quote debit',s=>{const l=s.receipt.logs.find(l=>l.address.toLowerCase()===m.quote.toLowerCase()&&l.topics[0]===P.TRANSFER.getEvent('Transfer').topicHash);s.receipt.logs.push({...l,logIndex:'0x100'});}],
 ['unsolicited funding',s=>{const l=s.receipt.logs[0],v=P.TRANSFER.encodeEventLog(P.TRANSFER.getEvent('Transfer'),[m.factory,s.tx.from,1n]);s.receipt.logs.push({...l,address:m.quote,topics:v.topics,data:v.data,logIndex:'0x100'});}],
 ['trailing calldata',s=>s.tx.input+='00']
])test('rejects '+name,()=>{const s=sample();mutate(s);const r=B.decode(m,s.tx,s.receipt);assert.equal(r.status,'REJECTED');assert.equal(r.admitted,false);assert.equal(r.eligibility,null);});
