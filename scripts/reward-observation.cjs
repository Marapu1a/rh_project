const {Interface}=require('ethers');
const abi=new Interface([
 'event DrawReserved(bytes32 indexed drawId,uint64 indexed campaignId,address indexed asset,uint256 budget)',
 'event RewardAssigned(bytes32 indexed drawId,address indexed winner,uint256 amount)',
 'event DrawFinalized(bytes32 indexed drawId,uint256 awarded,uint256 released)',
 'event RewardPaid(bytes32 indexed drawId,address indexed asset,address indexed winner,uint256 amount)',
 'function reward(bytes32,address) view returns(uint256)',
 'function draws(bytes32) view returns(address asset,uint64 campaignId,uint8 status,uint256 budget,uint256 awarded,uint256 paid)'
]);
const check=(v,m)=>{if(!v)throw Error('Reward observation: '+m);};
function projectRewards(blocks,vault){
 const draws=new Map(),rewards=new Map();
 for(const b of blocks)for(const {receipt} of b.transactions)for(const log of receipt.logs){
  if(log.address.toLowerCase()!==vault.toLowerCase())continue;
  let event;try{event=abi.parseLog(log);}catch{continue;}if(!event)continue;
  check(BigInt(receipt.status)===1n&&!log.removed,'invalid receipt');
  const a=event.args,id=a.drawId,source={transactionHash:receipt.transactionHash,blockNumber:Number(BigInt(b.number)),blockHash:b.hash,logIndex:Number(BigInt(log.logIndex))};
  if(event.name==='DrawReserved'){check(!draws.has(id),'duplicate reserve');draws.set(id,{drawId:id,asset:a.asset.toLowerCase(),budget:String(a.budget),campaignId:String(a.campaignId),status:'reserved',awarded:'0',paid:'0',source});continue;}
  const d=draws.get(id);check(d,'missing reserve');
  if(event.name==='RewardAssigned'){
   const key=id+a.winner.toLowerCase();check(d.status==='reserved'&&!rewards.has(key)&&a.amount>0n,'invalid assignment');
   rewards.set(key,{drawId:id,winner:a.winner.toLowerCase(),asset:d.asset,amountRaw:String(a.amount),status:'assigned',assignment:source,payment:null});
   d.awarded=String(BigInt(d.awarded)+a.amount);
  }else if(event.name==='DrawFinalized'){
   check(d.status==='reserved'&&a.awarded===BigInt(d.awarded)&&a.awarded+a.released===BigInt(d.budget),'invalid finalization');d.status='finalized';
  }else if(event.name==='RewardPaid'){
   const r=rewards.get(id+a.winner.toLowerCase());check(d.status==='finalized'&&r&&r.status==='assigned'&&a.amount===BigInt(r.amountRaw)&&a.asset.toLowerCase()===d.asset,'invalid payment');
   r.status='paid';r.payment=source;d.paid=String(BigInt(d.paid)+a.amount);
  }
 }
 for(const r of rewards.values())check(draws.get(r.drawId).status==='finalized','assignment not finalized');
 return {draws:[...draws.values()],rewards:[...rewards.values()]};
}
async function observeRewards({blocks,vault,rpc,blockTag}){
 const result=projectRewards(blocks,vault);
 const read=async(name,args)=>abi.decodeFunctionResult(name,await rpc('eth_call',[{to:vault,data:abi.encodeFunctionData(name,args)},blockTag]));
 for(const d of result.draws){const onchain=await read('draws',[d.drawId]);
  check(onchain.asset.toLowerCase()===d.asset&&String(onchain.campaignId)===d.campaignId&&String(onchain.budget)===d.budget&&String(onchain.awarded)===d.awarded&&String(onchain.paid)===d.paid&&Number(onchain.status)===(d.status==='finalized'?2:1),'draw storage mismatch');}
 for(const r of result.rewards){const [due]=await read('reward',[r.drawId,r.winner]);check(due===(r.status==='paid'?0n:BigInt(r.amountRaw)),'reward storage mismatch');}
 return {...result,blockTag};
}
module.exports={projectRewards,observeRewards,abi};
