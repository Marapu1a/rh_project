const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {hash}=require('../scripts/direct-buy.cjs');
const e=require('../research/infinity-source-audit/worker-fork-2026-09-27.json');
test('Infinity worker fork receipt chain reaches GENERAL and durable resolved state',()=>{
 assert.equal(e.success,true);assert.equal(e.worker.run.status,'complete');assert.equal(e.worker.again.status,'complete');assert.equal(e.worker.again.steps.length,0);
 assert.deepEqual(e.worker.run.steps.map(x=>x.action),['pull','pay']);
 const {checksum,...state}=e.worker.state;assert.equal(hash(state),checksum);assert(!state.pending);
 const tr=new ethers.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
 const low=x=>x.toLowerCase();
 for(const step of e.worker.run.steps){
  const t=e.transactions.find(t=>t.tx.hash===step.transactionHash);assert(t);assert.equal(t.receipt.status,'0x1');assert.equal(low(t.tx.to),low(e.worker.job.collector));
  const from=step.action==='pull'?e.source.vault:e.worker.job.collector,to=step.action==='pull'?e.worker.job.collector:e.worker.job.promo;
  const amount=t.receipt.logs.filter(l=>low(l.address)===low(e.launch.quote)).map(l=>{try{return tr.parseLog(l)}catch{return null}}).filter(x=>x?.name==='Transfer'&&low(x.args.from)===low(from)&&low(x.args.to)===low(to)).reduce((s,x)=>s+x.args.value,0n);
  assert.equal(amount,3000000n);
 }
 assert.equal(state.lastResolved.transactionHash,e.worker.run.steps.at(-1).transactionHash);
 assert.equal(e.worker.reserves.reduce((s,x)=>s+BigInt(x),0n)-e.collector.reserves.reduce((s,x)=>s+BigInt(x),0n),3000000n);
});
