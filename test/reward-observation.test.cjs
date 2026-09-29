const {test}=require('node:test'),assert=require('node:assert/strict'),{id}=require('ethers');
const {abi,projectRewards,observeRewards}=require('../scripts/reward-observation.cjs');
const vault='0x'+'11'.repeat(20),winner='0x'+'22'.repeat(20),asset='0x'+'33'.repeat(20),draw=id('draw');
function block(events){return [{number:1,hash:id('block'),transactions:[{receipt:{status:'0x1',transactionHash:id('tx'),logs:events.map(([name,args],i)=>({address:vault,...abi.encodeEventLog(abi.getEvent(name),args),logIndex:i,removed:false}))}}]}];}
const events=[['DrawReserved',[draw,1,asset,100]],['RewardAssigned',[draw,winner,70]],['DrawFinalized',[draw,70,30]]];
test('120 draws / 1200 rewards: idle zero calls, late payment two, reorg and audit rebuild',async()=>{
 const all=[];
 for(let n=0;n<120;n++){
  const d=id('load '+n);all.push(['DrawReserved',[d,1,asset,1000]]);
  for(let w=1;w<=10;w++)all.push(['RewardAssigned',[d,'0x'+w.toString(16).padStart(40,'0'),70]]);
  all.push(['DrawFinalized',[d,700,300]]);
 }
 let blocks=block(all),calls=0,expected;
 const rpc=async(method,params)=>{
  assert.equal(method,'eth_call');calls++;const c=abi.parseTransaction({data:params[0].data});
  const d=expected.draws.find(d=>d.drawId===c.args[0]);
  if(c.name==='draws')return abi.encodeFunctionResult('draws',[d.asset,d.campaignId,2,d.budget,d.awarded,d.paid]);
  const r=expected.rewards.find(r=>r.drawId===c.args[0]&&r.winner===c.args[1].toLowerCase());
  return abi.encodeFunctionResult('reward',[r.status==='paid'?0:r.amountRaw]);
 };
 expected=projectRewards(blocks,vault);let saved=await observeRewards({blocks,vault,rpc,blockTag:'0x1'});assert.equal(calls,1320);
 calls=0;saved=await observeRewards({blocks,vault,rpc,blockTag:'0x1',previous:JSON.parse(JSON.stringify(saved))});assert.equal(calls,0);
 const empty={number:2,hash:id('empty extension'),transactions:[]};
 await observeRewards({blocks:[...blocks,empty],vault,rpc,blockTag:'0x2',previous:saved});assert.equal(calls,0);
 const tail=block([['RewardPaid',[id('load 0'),asset,'0x'+'1'.padStart(40,'0'),70]]])[0];tail.number=2;tail.hash=id('paid branch');blocks=[...blocks,tail];
 expected=projectRewards(blocks,vault);calls=0;const before=JSON.stringify(saved);
 await assert.rejects(observeRewards({blocks,vault,rpc:async()=>{throw Error('outage');},blockTag:'0x2',previous:saved}),/outage/);assert.equal(JSON.stringify(saved),before);
 saved=await observeRewards({blocks,vault,rpc,blockTag:'0x2',previous:saved});assert.equal(calls,2);assert.deepEqual(saved.rewards,expected.rewards);
 calls=0;await observeRewards({blocks,vault,rpc,blockTag:'0x2',previous:saved,fullAudit:true});assert.equal(calls,1320);
 blocks=[blocks[0],{...tail,hash:id('replacement'),transactions:[]}];expected=projectRewards(blocks,vault);calls=0;
 saved=await observeRewards({blocks,vault,rpc,blockTag:'0x2',previous:saved});assert.equal(calls,1320);assert.equal(saved.verification.mode,'full');assert(saved.rewards.every(r=>r.status==='assigned'));
});
test('assignment, payment and removed payment have distinct observable states',()=>{
 const before=projectRewards(block(events),vault);assert.equal(before.rewards[0].status,'assigned');
 const paid=[...events,['RewardPaid',[draw,asset,winner,70]]];assert.equal(projectRewards(block(paid),vault).rewards[0].status,'paid');
 assert.deepEqual(projectRewards(block(events),vault),before);
 assert.throws(()=>projectRewards(block([...paid,paid.at(-1)]),vault),/invalid payment/);
 assert.throws(()=>projectRewards(block([...events,['RewardPaid',[draw,asset,winner,69]]]),vault),/invalid payment/);
 assert.throws(()=>projectRewards(block(events.slice(0,2)),vault),/not finalized/);
 assert.equal(projectRewards(block([['DrawReserved',[draw,1,asset,100]],['DrawFinalized',[draw,0,100]]]),vault).rewards.length,0);
});
test('storage is checked at the exact snapshot; zero debt alone is not proof of payment',async()=>{
 const calls=[];
 const rpc=async(m,p)=>{calls.push([m,p]);const c=abi.parseTransaction({data:p[0].data});return c.name==='draws'?abi.encodeFunctionResult('draws',[asset,1,2,100,70,0]):abi.encodeFunctionResult('reward',[70]);};
 await observeRewards({blocks:block(events),vault,rpc,blockTag:'0x1'});assert(calls.every(([m,p])=>m==='eth_call'&&p[1]==='0x1'));
 await assert.rejects(observeRewards({blocks:block(events),vault,blockTag:'0x1',rpc:async(m,p)=>abi.parseTransaction({data:p[0].data}).name==='draws'?abi.encodeFunctionResult('draws',[asset,1,2,100,70,0]):abi.encodeFunctionResult('reward',[0])}),/reward storage mismatch/);
 const foreign=block(events);foreign[0].transactions[0].receipt.logs.forEach(l=>l.address=winner);assert.equal(projectRewards(foreign,vault).rewards.length,0);
});
