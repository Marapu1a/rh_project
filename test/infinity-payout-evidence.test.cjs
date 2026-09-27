const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const e=require('../research/infinity-source-audit/payout-fork-2026-09-27.json');
const {hash}=require('../scripts/direct-buy.cjs'),{buildFromHistory}=require('../scripts/short-dataset.cjs'),{replayAttempts}=require('../scripts/attempt-lifecycle.cjs');
test('saved Infinity fees fund the same draw vault and conserve actual USDG through claim',()=>{
 assert.equal(e.success,true);const p=e.payout,hook=new ethers.Interface(require('../research/infinity-source-audit/hook.json').abi);
 const fees=e.transactions.flatMap(t=>t.receipt.logs).filter(l=>l.address.toLowerCase()===e.pins.hook.address.toLowerCase()).map(l=>{try{return hook.parseLog(l);}catch{return null;}}).filter(x=>x?.name==='ModeFeeAccrued');
 assert.equal(fees.length,4);assert(fees.every(x=>x.args[2].toLowerCase()===e.source.vault.toLowerCase()));
 const total=fees.reduce((s,x)=>s+x.args[3],0n);assert.equal(total,BigInt(p.funding.total));assert.equal(total,BigInt(p.balance)+BigInt(p.paid));
 assert.equal(p.reserves.reduce((s,x)=>s+BigInt(x),0n),BigInt(p.balance));assert.equal(p.reserved,'0');assert.equal(p.claimable,'0');
 assert.equal(p.reserves[1],p.funding.reserves[1]);assert.equal(p.reserves[2],p.funding.reserves[2]);
 const transfer=new ethers.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
 for(const claim of p.claims){assert(BigInt(claim.amount)>0n);const tx=p.finalReplay.blocks.flatMap(b=>b.transactions).find(t=>t.tx.hash===claim.transactionHash);assert(tx);
  const logs=tx.receipt.logs.filter(l=>l.address.toLowerCase()===e.launch.quote.toLowerCase()).map(l=>{try{return transfer.parseLog(l);}catch{return null;}}).filter(Boolean);
  assert(logs.some(l=>l.args.from.toLowerCase()===p.funding.job.promo.toLowerCase()&&l.args.to.toLowerCase()===claim.winner.toLowerCase()&&l.args.value===BigInt(claim.amount)));
 }
 assert.equal(p.funding.again.steps.length,0);assert.equal(p.delivery.again.steps.length,0);
});
test('saved full replay consumes Short attempts but retains Monthly and binds the stored drand round',()=>{
 const p=e.payout,x=p.finalReplay,ledger=replayAttempts(x.manifest,x.lifecycle,x.blocks);assert.equal(hash(ledger),hash(x.ledger));
 assert.equal(ledger.wallets[0].SHORT.consumedTotal,'2');assert.equal(ledger.wallets[0].SHORT.open,'0');assert.equal(ledger.wallets[0].MONTHLY.open,'2');
 assert.equal(hash(buildFromHistory(e.entries.replayInput)),hash(e.entries.artifact));assert.equal(e.entries.artifact.request.drawId,p.drawId);
 assert.equal(String(p.delivery.beacon.round),p.delivery.request.round);assert.deepEqual(p.delivery.run.steps.map(s=>s.action),['prove','deliver']);
 assert(e.entries.runs.some(r=>r.results.SHORT.action==='seal'));assert(e.entries.runs.some(r=>r.results.SHORT.action==='finishShort'));
 assert(p.assumptions.some(s=>s.includes('constructor-only')));
});
