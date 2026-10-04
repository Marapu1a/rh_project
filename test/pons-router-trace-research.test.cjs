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

test('recovered calldata rejects split routes, options, wrong funding and noncanonical tails',()=>{
 const {ABI}=require('../scripts/pons-router-calldata-research.cjs');
 for(const mutate of [a=>a[0].push(a[0][0]),a=>a[0][1][7]='0x',a=>a[0][0][8]='0x'+'11'.repeat(20),a=>a[2]+=1n,a=>a[3]=0n,a=>a[0][0][3]='0x'+'11'.repeat(20)]){
  const f=sample('eth'),a=ABI.decodeFunctionData('swap',f.tx.input).toArray(true);mutate(a);f.tx.input=ABI.encodeFunctionData('swap',a);f.trace.input=f.tx.input;assert.throws(()=>inspect(f));
 }
 const f=sample('eth');f.tx.input+='00';f.trace.input=f.tx.input;assert.throws(()=>inspect(f),/Noncanonical/);
});

test('matching receipt/trace cannot hide unknown execution module or extra refund',()=>{
 const f=sample('eth');f.trace.calls[0].to='0x'+'11'.repeat(20);assert.throws(()=>inspect(f),/module/);
 const g=sample('usdg'),P=require('../scripts/pons-curve-buy.cjs');
 const encoded=P.TRANSFER.encodeEventLog(P.TRANSFER.getEvent('Transfer'),[g.tx.to,g.tx.from,1]);
 const original=g.receipt.logs.find(l=>l.address.toLowerCase()===g.manifest.quote.toLowerCase()&&l.topics[0]===P.TRANSFER.getEvent('Transfer').topicHash);
 g.receipt.logs.push({...original,...encoded,logIndex:'0xffff'});
 function quoteFrame(n){if(n.logs?.some(l=>l.address.toLowerCase()===g.manifest.quote.toLowerCase()))return n;for(const c of n.calls||[]){const found=quoteFrame(c);if(found)return found;}}
 const frame=quoteFrame(g.trace);frame.logs.push({address:original.address,...encoded,index:'0xffff',position:'0x0'});
 assert.throws(()=>inspect(g),/Refund\/extra/);
});
