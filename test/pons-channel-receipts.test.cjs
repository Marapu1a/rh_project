const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../scripts/pons-curve-buy.cjs');
const sample=require('../docs/evidence/PONS_CHANNEL_RECEIPTS_2026-10-02.json');

// Public receipt fixtures only: this deliberately does not claim manifest admission.
test('RDH real direct USDG receipt proves the spent amount and wallet',()=>{
 const row=sample.records.find(r=>r.tx.hash==='0x3a543a219f01a4d9110ee4ddb75445ecd1c99d42113c58b88e0345adb48f9db9');
 assert.equal(row.receipt.status,'0x1');assert.equal(row.receipt.transactionHash,row.tx.hash);
 const [buy]=P.decode(sample.manifest,row.tx,row.receipt);
 assert.equal(buy.status,'ELIGIBLE');assert.equal(buy.netQuoteDebitRaw,'102723285');
 assert.equal(buy.payer,row.tx.from);assert.equal(buy.recipient,row.tx.from);
 assert.equal(buy.refundQuoteRaw,'0');
});

test('RDH real indirect purchases remain visible but cannot silently gain direct admission',()=>{
 const rows=sample.records.filter(r=>r.tx.to!==sample.manifest.curve);assert.equal(rows.length,7);
 for(const row of rows){
  const decoded=P.decode(sample.manifest,row.tx,row.receipt);assert.equal(decoded.length,1);
  assert.equal(decoded[0].status,'UNSUPPORTED_ROUTE');assert.equal(decoded[0].reason,'NOT_DIRECT_CURVE_CALL');
  assert.equal(decoded[0].transactionHash,row.tx.hash);assert.equal(decoded[0].payer,null);
 }
});

test('real direct receipt cannot credit another sender or survive missing payment evidence',()=>{
 const row=sample.records.find(r=>r.tx.to===sample.manifest.curve);
 const wrong=P.decode(sample.manifest,{...row.tx,from:'0x1111111111111111111111111111111111111111'},row.receipt);
 assert.equal(wrong[0].status,'UNSUPPORTED_ROUTE');
 const receipt=structuredClone(row.receipt);
 receipt.logs=receipt.logs.filter(l=>l.address.toLowerCase()!==sample.manifest.quote.toLowerCase());
 assert.notEqual(P.decode(sample.manifest,row.tx,receipt)[0].status,'ELIGIBLE');
});
