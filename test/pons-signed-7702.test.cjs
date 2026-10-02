const {test}=require('node:test'),assert=require('node:assert/strict');
const {verifyAuthorization,Signature}=require('ethers');
const fixture=require('../docs/evidence/PONS_SIGNED_7702_2026-10-02.json');
const B=require('../scripts/pons-batch-buy.cjs'),F=require('../scripts/pons-batch-funding.cjs');
const m=require('../docs/evidence/PONS_CHANNEL_RECEIPTS_2026-10-02.json').manifest;
for(const row of fixture.fork.steps)test(`signed local EIP7702 ${row.label} executes and preserves research gate`,()=>{
 const {tx,receipt}=row.steps[0];assert.equal(tx.type,'0x4');assert.equal(receipt.status,'0x1');
 assert.equal(tx.authorizationList.length,1);const a=tx.authorizationList[0];
 assert.equal(BigInt(a.chainId),4663n);assert.equal(BigInt(a.nonce),BigInt(tx.nonce)+1n);
 assert.equal(a.address.toLowerCase(),fixture.fork.executor.address);
 const signature=Signature.from({r:a.r,s:a.s,yParity:Number(BigInt(a.yParity))});
 assert.equal(verifyAuthorization({address:a.address,chainId:a.chainId,nonce:a.nonce},signature).toLowerCase(),tx.from.toLowerCase());
 const profile={weth:fixture.capture.out.eth.calls[0].to,router:fixture.capture.out.eth.funding.route.router,pool:'0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca'};
 const result=row.label==='USDG'?B.decode(m,tx,receipt):F.decode(m,profile,tx,receipt);
 assert.equal(result.status,'SHAPE_MATCH');assert.equal(result.admitted,false);assert.equal(result.eligibility,null);
 assert.equal(result.observedBuyQuoteRaw,row.label==='USDG'?'101000000':fixture.capture.out.eth.funding.minOut);
 assert.notEqual(verifyAuthorization({address:a.address,chainId:1,nonce:a.nonce},signature).toLowerCase(),tx.from.toLowerCase());
});
const steady=require('../docs/evidence/PONS_STEADY_7702_2026-10-02.json');
for(const row of steady.fork.steadyState)test(`delegated ${row.label} type2 buy without a new authorization`,()=>{
 const {tx,receipt}=row;assert.equal(tx.type,'0x2');assert.equal(receipt.status,'0x1');assert(!tx.authorizationList?.length);
 const profile={weth:steady.capture.out.eth.calls[0].to,router:steady.capture.out.eth.funding.route.router,pool:'0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca'};
 const r=row.label==='USDG'?B.decode(m,tx,receipt):F.decode(m,profile,tx,receipt);
 assert.equal(r.status,'SHAPE_MATCH');assert.equal(r.account,tx.from.toLowerCase());
 assert.equal(r.observedBuyQuoteRaw,row.label==='USDG'?'101000000':steady.capture.out.eth.funding.minOut);
 assert.equal(r.admitted,false);
});
