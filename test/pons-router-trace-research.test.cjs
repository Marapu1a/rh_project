const {test}=require('node:test'),assert=require('node:assert/strict');
const {inspect}=require('../scripts/pons-router-trace-research.cjs');
const sample=name=>structuredClone(require('./fixtures/pons-router-research/'+name+'.json'));
test('captured ETH and USDG routes bind terminal call to receipt without granting eligibility',()=>{
 for(const name of ['eth','usdg']){const r=inspect(sample(name));assert.equal(r.admitted,false);assert.equal(r.eligibility,null);assert.equal(r.funding,name.toUpperCase());}
 const usd=inspect(sample('usdg'));assert.equal(usd.observedWalletQuoteDebitRaw,'200000000');assert.equal(usd.curveQuoteRaw,'198000000');
 assert.equal(inspect(sample('eth')).observedWalletQuoteDebitRaw,null);
});
test('research rejects wrong sender, calldata, payment and receipt identity',()=>{
 for(const mutate of [f=>f.trace.from=f.tx.to,f=>f.trace.input='0x12345678',f=>f.trace.value='0x1',f=>f.receipt.transactionHash='0x'+'11'.repeat(32)]){
  const f=sample('eth');mutate(f);assert.throws(()=>inspect(f));
 }
});
test('research rejects missing/duplicated/tampered logs and failed nested execution',()=>{
 function withLog(n){if(n.logs?.length)return n;for(const c of n.calls||[]){const x=withLog(c);if(x)return x;}}
 for(const mutate of [n=>n.logs.pop(),n=>n.logs.push(n.logs[0]),n=>n.logs[0].data='0x',n=>n.error='execution reverted',n=>n.logs[0].address='0x'+'11'.repeat(20)]){
  const f=sample('eth');mutate(withLog(f.trace));assert.throws(()=>inspect(f));
 }
});
