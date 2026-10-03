// Expected assignments come from raw vault events, not the API reward projection.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {Interface}=require('ethers');
const abi=new Interface(['event RewardAssigned(bytes32 indexed drawId,address indexed winner,uint256 amount)','event RewardPaid(bytes32 indexed drawId,address indexed asset,address indexed winner,uint256 amount)']);
function expectedRewards(blocks,vault){
 const rewards=new Map();
 for(const b of blocks)for(const tx of b.transactions)for(const l of tx.receipt?.logs||[]){
  if(l.address.toLowerCase()!==vault.toLowerCase())continue;
  let e;try{e=abi.parseLog(l);}catch{continue;}if(!e)continue;
  const key=e.args.drawId+e.args.winner.toLowerCase();
  if(e.name==='RewardAssigned'){assert(!rewards.has(key));rewards.set(key,{drawId:e.args.drawId,winner:e.args.winner.toLowerCase(),amountRaw:String(e.args.amount),status:'assigned'});}
  else{const r=rewards.get(key);assert(r);assert.equal(r.amountRaw,String(e.args.amount));assert.equal(r.status,'assigned');r.status='paid';}
 }
 return [...rewards.values()];
}
function assertRewards(view,expected){
 assert(view.rewards,'Missing reward projection');assert.equal(view.rewards.total,expected.length,'Missing or extra rewards');
 const pick=r=>({drawId:r.drawId,winner:r.winner,amountRaw:r.amountRaw,status:r.status});
 const sort=a=>a.map(pick).sort((a,b)=>(a.drawId+a.winner).localeCompare(b.drawId+b.winner));
 assert.deepEqual(sort(view.rewards.items),sort(expected));
}
function verify(report){
 const c=report.cycle,config=require('./shared-index-config.cjs').buildIndexConfigs(require('./pons-automation.cjs').schedulerConfigFor(c.automation.config)).indexConfig;
 const before=fs.readFileSync(config.indexer.statePath),state=JSON.parse(before),expected=expectedRewards(c.finalReplay.blocks,config.lifecycle.vault);
 const reader=require('./user-status-api.cjs').createReader(config);
 for(const w of c.finalLedger.wallets){const view=reader.read({wallet:w.wallet,now:Date.parse(state.index.observedAt),limit:100});assert.equal(view.status,'observed');assertRewards(view,expected.filter(r=>r.winner===w.wallet));}
 assert.deepEqual(fs.readFileSync(config.indexer.statePath),before);
 return {status:'PASSED',wallets:c.finalLedger.wallets.length,rewards:expected.length,source:'raw RewardAssigned/RewardPaid events; not an independent draw-math audit'};
}
module.exports={expectedRewards,assertRewards,verify};
if(require.main===module){const result=verify(JSON.parse(fs.readFileSync(process.argv[2])));console.log(JSON.stringify(result));}
