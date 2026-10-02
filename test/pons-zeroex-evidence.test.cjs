const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('ethers');
const {inspect}=require('../scripts/pons-zeroex-evidence.cjs'),C=require('../scripts/pons-curve-buy.cjs'),V=require('../scripts/pons-v4-buy.cjs');
const evidence=require('../docs/evidence/PONS_ZEROEX_EXECUTION_2026-10-02.json');
test('three executed 0x captures reproduce balances and recipient without admitting routes',()=>{
 assert.equal(evidence.publicSends,false);assert.equal(evidence.scenarios.length,3);
 for(const r of evidence.scenarios){const a=inspect(r);assert.deepEqual(a,r.analysis);assert.equal(a.admission,'NOT_IMPLEMENTED');assert.equal(a.walletDebitRaw,'101000000');assert.equal(a.refundToPayerRaw,'0');assert.equal(a.recipient,r.body.taker.toLowerCase());assert.equal(r.withoutApproval.code,'CALL_EXCEPTION');assert.equal(r.runtimeHashes[r.decoded.target],evidence.source.runtimeHash);assert.equal(r.runtimeHashes[evidence.allowanceHolderSource.address.toLowerCase()],evidence.allowanceHolderSource.runtimeHash);}
});
test('curve event names the intermediary; service fee is distinct from venue payment',()=>{
 const r=evidence.scenarios[0],a=inspect(r);assert.equal(a.curves.length,1);const event=a.curves[0];assert.equal(event.buyer,a.settler);assert.equal(event.recipient,a.settler);assert.notEqual(event.recipient,a.recipient);
 assert.equal(event.quoteIn,'100848500');assert.equal(BigInt(a.walletDebitRaw)-BigInt(event.quoteIn),151500n);
 const verdict=C.decode({chainId:4663,curve:event.curve},r.execution.tx,r.execution.receipt);assert.equal(verdict[0].status,'UNSUPPORTED_ROUTE');
});
test('graduated token is bought through split non-Pons markets; no target-pool entry',()=>{
 const r=evidence.scenarios[2],a=inspect(r),v=r.venue;assert.equal(v.phase,'2');assert.equal(a.targetPoolSwaps,0);assert.equal(a.swaps.length,1);assert.equal(a.swaps[0].amount0,'-58103360');
 const assets=[v.token,v.quote].sort((x,y)=>BigInt(x)<BigInt(y)?-1:1);
 assert.equal(a.swaps[0].poolId,V.poolId([...assets,'10000','100',E.ZeroAddress]));assert.notEqual(a.swaps[0].poolId,a.expectedPoolId);
 assert.deepEqual(V.decodePool({chainId:4663,manager:V.PINS.manager[0],poolId:a.expectedPoolId},r.execution.tx,r.execution.receipt),[]);
 assert(a.actionSelectors.includes('0x8d68a156'));assert(a.actionSelectors.includes('0xaf72634f'));
});
test('diagnostics reject mixed receipts, removed logs, changed taker and inconsistent balances',()=>{
 for(const mutate of [r=>r.execution.receipt.transactionHash=E.ZeroHash,r=>r.execution.receipt.logs[0].removed=true,r=>r.execution.receipt.logs.push({...r.execution.receipt.logs[0]}),r=>r.body.taker=E.ZeroAddress,r=>r.after.sell='0',r=>r.response.quote.transaction.data='0x']){
  const r=structuredClone(evidence.scenarios[0]);mutate(r);assert.throws(()=>inspect(r));
 }
});
