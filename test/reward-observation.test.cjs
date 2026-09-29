const {test}=require('node:test'),assert=require('node:assert/strict'),{id}=require('ethers');
const {abi,projectRewards,observeRewards}=require('../scripts/reward-observation.cjs');
const vault='0x'+'11'.repeat(20),winner='0x'+'22'.repeat(20),asset='0x'+'33'.repeat(20),draw=id('draw');
function block(events){return [{number:1,hash:id('block'),transactions:[{receipt:{status:'0x1',transactionHash:id('tx'),logs:events.map(([name,args],i)=>({address:vault,...abi.encodeEventLog(abi.getEvent(name),args),logIndex:i,removed:false}))}}]}];}
const events=[['DrawReserved',[draw,1,asset,100]],['RewardAssigned',[draw,winner,70]],['DrawFinalized',[draw,70,30]]];
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
