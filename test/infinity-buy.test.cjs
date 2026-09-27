const {test}=require('node:test'),assert=require('node:assert/strict');
const {ethers}=require('ethers'),I=require('../scripts/infinity-buy.cjs');
const {decodeTransaction,replay,hash,validateManifest}=require('../scripts/direct-buy.cjs');
const saved=require('../research/infinity-source-audit/worker-fork-2026-09-27.json');
const original=saved.transactions.find(x=>x.label.startsWith('BUY 100'));
function fixture(){
 const pair=structuredClone(original),n=Number(BigInt(pair.tx.blockNumber));
 const m={schema:I.SCHEMA,routeVersion:I.ID,eligibility:'automatic-buy-v1',quoteBasis:'wallet-net-debit-v1',chainId:31337,token:saved.launch.token,quote:saved.launch.quote,registry:saved.collector.promo,settlement:'0x4f922d5b15e6691e0469663e4f5c4177f23c5faf',poolKey:saved.poolKey,poolId:saved.poolId,quoteDecimals:6,entryThresholdRaw:'100000000',anchor:{number:n-1,hash:ethers.id('test anchor')},codeHashes:{}};
 for(const [k,[a,h]]of Object.entries(I.PINS)){m[k]=a;m.codeHashes[k]=h;}
 for(const k of ['token','quote','registry','settlement'])m.codeHashes[k]=ethers.id('fixture '+k);
 const b={number:n,hash:pair.tx.blockHash,parentHash:m.anchor.hash,timestamp:1,transactions:[pair]};
 return {m,pair,b};
}
test('Infinity saved BUY counts wallet debit including fees without registration, repeat blocks idempotent',()=>{
 const {m,pair,b}=fixture();validateManifest(m);const d=decodeTransaction(m,pair.tx,pair.receipt)[0];assert.equal(d.status,'ELIGIBLE');assert.equal(d.netQuoteDebitRaw,'103300000');
 const ledger=replay(m,[b]);assert.equal(ledger.wallets[0].entriesMinted,'1');assert.equal(ledger.wallets[0].carryRaw,'3300000');assert.deepEqual(ledger.registrations,[]);assert.equal(hash(replay(m,[b,b])),hash(ledger));
});
test('Infinity refunds reduce debit; inputMaximum is not ticket volume',()=>{
 const {m,pair}=fixture(),a=Array.from(I.CALL.parseTransaction({data:pair.tx.input}).args);a[3]=110000000n;pair.tx.input=I.CALL.encodeFunctionData('executeExactInput',a);
 for(const index of [0,1])pair.receipt.logs[index].data=ethers.AbiCoder.defaultAbiCoder().encode(['uint256'],[110000000n]);
 const refund={...pair.receipt.logs[0],...I.TRANSFER.encodeEventLog(I.TRANSFER.getEvent('Transfer'),[m.settlement,pair.tx.from,6700000n]),logIndex:'0xa'};pair.receipt.logs.push(refund);
 const d=decodeTransaction(m,pair.tx,pair.receipt)[0];assert.equal(d.status,'ELIGIBLE');assert.equal(d.netQuoteDebitRaw,'103300000');assert.equal(d.refundQuoteRaw,'6700000');
});
test('Infinity rejects altered recipient, payment, refund, selector, route and multiple swaps',()=>{
 const changes=[f=>{const a=Array.from(I.CALL.parseTransaction({data:f.pair.tx.input}).args);a[6]=f.m.registry;f.pair.tx.input=I.CALL.encodeFunctionData('executeExactInput',a);},f=>{f.pair.receipt.logs[0].data=ethers.ZeroHash;},f=>{f.pair.tx.to=f.m.registry;},f=>{f.pair.tx.input='0x12345678';},f=>{f.pair.receipt.logs.push({...f.pair.receipt.logs[2],logIndex:'0xa'});},f=>{f.pair.receipt.logs[9].topics[2]=ethers.zeroPadValue(f.m.registry,32);}];
 for(const change of changes){const f=fixture();change(f);assert(decodeTransaction(f.m,f.pair.tx,f.pair.receipt).every(d=>d.status!=='ELIGIBLE'));}
});
test('Infinity SELL and plain transfers mint nothing; foreign schema cannot enable automatic eligibility',()=>{
 const {m}=fixture(),sell=saved.transactions.find(x=>x.label.startsWith('SELL all'));
 assert.equal(decodeTransaction(m,sell.tx,sell.receipt)[0].reason,'SELL');assert.deepEqual(decodeTransaction(m,original.tx,{...original.receipt,logs:[original.receipt.logs[0]]}),[]);
 assert.throws(()=>validateManifest({...m,quoteBasis:'pool-input'}));assert.throws(()=>validateManifest({...m,schema:'direct-buy-v2'}));
});
