const {test}=require('node:test'),assert=require('node:assert/strict');
const {hash,replay}=require('../scripts/direct-buy.cjs'),{buildFromHistory}=require('../scripts/short-dataset.cjs');
const e=require('../research/infinity-source-audit/entries-fork-2026-09-27.json');
test('saved Infinity fork reproduces automatic net-debit entries and scheduler dataset',()=>{
 assert.equal(e.success,true);const i=e.entries,input=i.replayInput,ledger=replay(input.manifest,input.blocks);
 assert.equal(i.policyStatus.mode,'admitted');assert.deepEqual(ledger.registrations,[]);
 assert.equal(ledger.wallets.length,1);assert.equal(ledger.wallets[0].entriesMinted,'2');assert.equal(ledger.wallets[0].carryRaw,'6600000');
 const buys=ledger.decisions.filter(d=>d.status==='ELIGIBLE');assert.equal(buys.length,2);
 for(const d of buys){assert.equal(d.netQuoteDebitRaw,'103300000');assert.equal(d.refundQuoteRaw,'6700000');}
 assert.equal(hash(buildFromHistory(input)),hash(i.artifact));assert.equal(i.artifact.request.expectedAttempts,'2');
 assert.equal(hash(replay(input.manifest,[...input.blocks,...input.blocks])),hash(ledger));
 assert(i.runs.some(r=>r.results.SHORT.action==='begin'));assert(i.runs.some(r=>r.results.SHORT.action==='publish'));
});
test('Infinity saved history rejects provenance corruption and registration cannot fabricate entries',()=>{
 const input=e.entries.replayInput,copy=structuredClone(input.blocks),buy=copy.flatMap(b=>b.transactions).find(x=>x.tx.hash===e.entries.buyLedger.decisions.find(d=>d.status==='ELIGIBLE').transactionHash);
 buy.receipt.from=e.entries.config.manifest.registry;assert.throws(()=>replay(input.manifest,copy),/sender/);
 const changed=structuredClone(input.manifest);changed.versions[0].manifest.eligibility='registered';assert.throws(()=>replay(changed,input.blocks),/eligibility/);
});
