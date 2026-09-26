// Saved fork consistency; not independent authentication of public-chain history.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {hash,replay}=require('../scripts/direct-buy.cjs');
const e=require('../research/native-launch/buy-admission-2026-09-26.json');
test('new native TOKEN uses existing admitted direct route; registration cannot backdate tickets',()=>{
 assert.equal(e.success,true);const a=e.buyAdmission,m=a.setup.manifest;
 assert.equal(m.token.toLowerCase(),e.bootstrap.token.toLowerCase());assert.equal(m.poolId,e.binding.poolId);
 assert.equal(m.routeVersion,'rh-ur-10-060b0e-v1');assert.equal(hash(m),a.setup.trust.genesisHash);
 const ledger=replay(a.raw.manifest,a.raw.blocks);assert.equal(hash(ledger),a.ledgerHash);
 assert.equal(ledger.decisions.length,2);
 const before=ledger.decisions.find(d=>d.transactionHash===a.buyHashes.before),after=ledger.decisions.find(d=>d.transactionHash===a.buyHashes.after);
 assert.equal(before.reason,'NOT_REGISTERED_AT_SWAP');assert.equal(before.entriesMinted,'0');
 assert.equal(after.status,'ELIGIBLE');assert.equal(after.grossQuoteRaw,'100000000');assert.equal(after.entriesMinted,'1');
 assert.equal(ledger.wallets.length,1);assert.equal(ledger.wallets[0].entriesMinted,'1');assert.equal(ledger.wallets[0].carryRaw,'0');
 for(const h of Object.values(a.buyHashes)){
  const recorded=e.transactions.find(t=>t.transaction.hash===h);
  const scanned=a.raw.blocks.flatMap(b=>b.transactions).find(t=>t.tx.hash===h);
  assert.deepEqual(scanned.receipt,recorded.receipt);assert.deepEqual(scanned.tx,recorded.transaction);
 }
});
test('native replay is idempotent and historical cutoff excludes later registration',()=>{
 const a=e.buyAdmission,blocks=a.raw.blocks,first=blocks.findIndex(b=>b.transactions.some(t=>t.tx.hash===a.buyHashes.before));
 const earlier=replay(a.raw.manifest,blocks.slice(0,first+1));
 assert.equal(earlier.decisions.length,1);assert.equal(earlier.decisions[0].reason,'NOT_REGISTERED_AT_SWAP');
 assert.equal(hash(replay(a.raw.manifest,[...blocks,structuredClone(blocks.at(-1))])),a.ledgerHash);
});
