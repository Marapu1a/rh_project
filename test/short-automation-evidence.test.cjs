const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const e=require('../research/infinity-source-audit/automation-fork-2026-09-27.json'),{replayAttempts}=require('../scripts/attempt-lifecycle.cjs'),{hash}=require('../scripts/direct-buy.cjs');
test('continuous Infinity Short executor performs all sends including fixed-winner claim and conserves fees',()=>{
 assert.equal(e.success,true);const x=e.automation;
 assert.deepEqual(x.events.map(s=>s.action),['pull','pay','begin','publish','seal','prove','deliver','processShort','finishShort','claim']);
 assert(BigInt(x.paid)>0n);assert.equal(BigInt(x.total),BigInt(x.paid)+BigInt(x.balance));assert.equal(x.reserves.reduce((a,b)=>a+BigInt(b),0n),BigInt(x.balance));
 const hook=new ethers.Interface(require('../research/infinity-source-audit/hook.json').abi);
 const fees=e.transactions.flatMap(t=>t.receipt.logs).filter(l=>l.address.toLowerCase()===e.pins.hook.address.toLowerCase()).map(l=>{try{return hook.parseLog(l);}catch{return null;}}).filter(l=>l?.name==='ModeFeeAccrued');
 assert.equal(fees.reduce((s,l)=>s+l.args[3],0n),BigInt(x.total));
 const claim=x.events.find(s=>s.action==='claim'),tx=x.finalReplay.blocks.flatMap(b=>b.transactions).find(t=>t.tx.hash===claim.transactionHash);assert(tx);
 const transfer=new ethers.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
 assert(tx.receipt.logs.filter(l=>l.address.toLowerCase()===e.launch.quote.toLowerCase()).some(l=>{try{const p=transfer.parseLog(l);return p.args.from.toLowerCase()===x.config.fundingJob.promo.toLowerCase()&&p.args.to.toLowerCase()===x.winner.toLowerCase()&&p.args.value===BigInt(x.paid);}catch{return false;}}));
 assert.equal(x.state.payouts.length,0);assert(!x.state.pending);assert.equal(x.again.steps.length,0);
});
test('continuous Short evidence replays consumption while Monthly attempts stay open',()=>{
 const x=e.automation,r=x.finalReplay,ledger=replayAttempts(r.manifest,r.lifecycle,r.blocks);assert.equal(hash(ledger),hash(r.ledger));
 assert.equal(ledger.wallets[0].SHORT.consumedTotal,'2');assert.equal(ledger.wallets[0].MONTHLY.open,'2');
 assert(!x.events.some(s=>s.action.includes('Month')));assert(x.runs.length>1);
});
