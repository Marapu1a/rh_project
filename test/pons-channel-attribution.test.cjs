const {test}=require('node:test'),assert=require('node:assert/strict');
const {inspect}=require('../scripts/pons-channel-attribution.cjs');
const sample=require('../docs/evidence/PONS_CHANNEL_RECEIPTS_2026-10-02.json');
test('real indirect receipt distinguishes sender, intermediary and final recipient without granting admission',()=>{
 const r=sample.records.find(r=>r.tx.input.startsWith('0x97c26e7a')),v=inspect(sample.manifest,r.tx,r.receipt);
 assert.equal(v.events[0].curveCaller,r.tx.to);assert.equal(v.events[0].curveRecipient,r.tx.to);
 const quote=v.assetDeltas.find(x=>x.asset===sample.manifest.quote.toLowerCase()&&x.address===r.tx.from);
 assert.equal(quote.delta,'-75188569');
 const token=v.assetDeltas.find(x=>x.asset===sample.manifest.token.toLowerCase()&&x.address===r.tx.from);
 assert.equal(token.delta,'9446535379874987012615781');
 assert.equal(v.admitted,false);assert.equal(v.eligibility,null);
 assert.equal(v.directDecoder[0].status,'UNSUPPORTED_ROUTE');
});
test('gas sender is not substituted for quote source or token beneficiary in a routed receipt',()=>{
 const r=sample.records.find(r=>r.tx.input.startsWith('0x0a2b8f36')),v=inspect(sample.manifest,r.tx,r.receipt);
 assert(v.assetDeltas.every(x=>x.address!==r.tx.from));
 assert.equal(v.events.length,1);assert.notEqual(v.events[0].curveCaller,r.tx.from);
 assert.equal(v.eligibility,null);
});
test('attribution diagnostics reject substituted, removed and duplicated evidence',()=>{
 const r=sample.records[0];
 for(const mutate of [x=>x.transactionHash='0x'+'00'.repeat(32),x=>x.logs[0].removed=true,x=>x.logs.push({...x.logs[0]}),x=>x.from=sample.records[1].tx.from]){
  const receipt=structuredClone(r.receipt);mutate(receipt);assert.throws(()=>inspect(sample.manifest,r.tx,receipt));
 }
 assert.deepEqual(inspect(sample.manifest,r.tx,r.receipt),inspect(sample.manifest,r.tx,r.receipt));
 assert.throws(()=>inspect(sample.manifest,{...r.tx,hash:undefined},{...r.receipt,transactionHash:undefined}),/identity/);
});
test('incoming funding in a hypothetical atomic batch is not a curve refund',()=>{
 const fork=require('../docs/evidence/PONS_TERMINAL_FORK_2026-10-02.json');
 const row=fork.fork.steps.find(x=>x.label==='ETH'),last=row.steps.at(-1);
 const P=require('../scripts/pons-curve-buy.cjs'),receipt=structuredClone(last.receipt);
 // Deliberately synthetic counterexample, not a mined batch or a proposed adapter.
 const incoming=row.steps[2].receipt.logs.find(l=>l.address.toLowerCase()===sample.manifest.quote.toLowerCase()&&l.topics[0]===P.TRANSFER.getEvent('Transfer').topicHash&&P.TRANSFER.parseLog(l).args.to.toLowerCase()===last.tx.from);
 assert(incoming);receipt.logs.unshift({...incoming});
 assert.equal(P.decode(sample.manifest,last.tx,receipt)[0].reason,'UNEXPECTED_REFUND');
 // The safe diagnostic path rejects this artificial cross-transaction splice.
 assert.throws(()=>inspect(sample.manifest,last.tx,receipt),/identity/);
});
