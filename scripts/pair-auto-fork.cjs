// Controlled local execution of the pinned V1 aggregator; no production admission.
const assert=require('node:assert/strict'),{ethers}=require('ethers');
const source=require('../research/pair-auto/source-evidence.json');
const {SWAP_ABI,TRANSFER_ABI,decodeTransaction}=require('./direct-buy.cjs');
async function run({e,cfg,provider,user,rpc}){
 assert.equal(await rpc('eth_chainId'),'0x7a69');
 const owner=await user.getAddress(),a=new ethers.Contract(source.address,source.abi,user);
 assert.equal(ethers.keccak256(await provider.getCode(a.target)),source.runtimeHash);
 assert.equal(await a.dependenciesConsistent(),true);
 const launch=new ethers.Contract(await a.launchpad(),[
  'function pairHook() view returns(address)',
  'function getLaunchPoolCount(address) view returns(uint256)',
  'function getLaunchPool(address,uint256) view returns((address quoteToken,uint16 weightBps,bytes32 poolId,uint256 positionId,uint256 initialProjectTokenAmount,int24 tickLower,int24 tickUpper,uint256 quoteUsdAtLaunchE8,address quotePriceFeed,uint8 quoteDecimals))'
 ],provider);
 const erc=['function balanceOf(address) view returns(uint256)','function approve(address,uint256) returns(bool)'];
 const quote=new ethers.Contract(await a.usdg(),erc,user);assert.equal(quote.target.toLowerCase(),cfg.quote.toLowerCase());
 const x=e.auto={aggregator:a.target,runtimeHash:source.runtimeHash,candidates:[],cases:[],limitation:'Local chain31337 with artificial USDG; real V1 pools/contracts, not a public UI purchase or production eligibility.'};
 const hook=await launch.pairHook(),manager=await a.poolManager();
 for(const tokenAddress of ['0xc71d692ff5323d818b425a9536301c5147ed3a6b','0x350cadde605e083f58d286e8b3a6b086685fa1ec']){
  e.stage='auto-pool-discovery';const count=Number(await launch.getLaunchPoolCount(tokenAddress));
  const c={token:tokenAddress,count,pools:[]};x.candidates.push(c);
  for(let i=0;i<count;i++)c.pools.push((await launch.getLaunchPool(tokenAddress,i)).toObject());
  if(count<2)continue;
  const token=new ethers.Contract(tokenAddress,erc,user);
  e.stage='auto-replay-setup';
  const integration=require('./pair-auto-replay-integration.cjs');
  const setup=await integration.prepare({provider,user,rpc,token:tokenAddress});
  const legs=c.pools.slice(0,2).map((p,i)=>{const currencies=[tokenAddress,p.quoteToken].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));const key=[...currencies,10000,200,hook];assert.equal(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address','address','uint24','int24','address'],key)),p.poolId);return [i,key,1000000n,0n];});
  await(await quote.approve(a.target,2000000n)).wait();
  for(const n of [1,2]){
   e.stage='auto-'+n+'-leg';const used=legs.slice(0,n),amount=BigInt(n)*1000000n;
   const deadline=(await provider.getBlock('latest')).timestamp+600;
   await(await quote.approve(a.target,amount)).wait();
   const beforeQ=await quote.balanceOf(owner),beforeT=await token.balanceOf(owner);
   const predicted=await a.buyExactInput.staticCall(tokenAddress,quote.target,owner,used,1n,deadline);
   assert(predicted>0n);
   await assert.rejects(a.buyExactInput.staticCall(tokenAddress,quote.target,owner,used,predicted+1n,deadline));
   await assert.rejects(a.buyExactInput.staticCall(tokenAddress,quote.target,owner,[used[0],used[0]],1n,deadline));
   assert.equal(await quote.balanceOf(owner),beforeQ);assert.equal(await token.balanceOf(owner),beforeT);
   const balances=await Promise.all([quote,token,...c.pools.slice(0,n).map(p=>new ethers.Contract(p.quoteToken,erc,provider))].map(t=>t.balanceOf(a.target)));
   const tx=await a.buyExactInput(tokenAddress,quote.target,owner,used,predicted*99n/100n,deadline,{gasLimit:4000000});await tx.wait();
   const receipt=await rpc('eth_getTransactionReceipt',[tx.hash]),transaction=await rpc('eth_getTransactionByHash',[tx.hash]);assert.equal(receipt.status,'0x1');
   const spent=beforeQ-await quote.balanceOf(owner),received=await token.balanceOf(owner)-beforeT;assert.equal(spent,amount);assert(received>0n);
   const events=receipt.logs.filter(l=>l.address.toLowerCase()===a.target.toLowerCase()).map(l=>{try{return a.interface.parseLog(l);}catch{return null;}}).filter(p=>p?.name==='AggregatedBuy');assert.equal(events.length,1);
   const ev=events[0].args;assert.equal(ev.payer,owner);assert.equal(ev.recipient,owner);assert.equal(ev.amountIn,spent);assert.equal(ev.amountOut,received);
   const swaps=receipt.logs.filter(l=>l.address.toLowerCase()===manager.toLowerCase()&&l.topics[0]===SWAP_ABI.getEvent('Swap').topicHash);assert.equal(swaps.length,n);
   const transfers=receipt.logs.filter(l=>l.topics[0]===TRANSFER_ABI.getEvent('Transfer').topicHash).map(l=>({token:l.address,...TRANSFER_ABI.parseLog(l).args.toObject()}));
   const delivery=transfers.filter(t=>t.token.toLowerCase()===tokenAddress&&t.to.toLowerCase()===owner.toLowerCase()).reduce((s,t)=>s+t.value,0n);assert.equal(delivery,received);
   assert.deepEqual(await Promise.all([quote,token,...c.pools.slice(0,n).map(p=>new ethers.Contract(p.quoteToken,erc,provider))].map(t=>t.balanceOf(a.target))),balances);
   const results=used.flatMap((leg,i)=>decodeTransaction({...cfg,token:tokenAddress,quote:c.pools[i].quoteToken,poolKey:leg[1],poolId:c.pools[i].poolId},transaction,receipt));
   assert.equal(results.length,n);assert(results.every(r=>r.reason==='NOT_DIRECT_ROUTER_CALL'));
   x.cases.push({legs:n,spent,received,predicted,event:ev.toObject(),transfers,transaction,receipt,decoderResults:results});
  }
  e.stage='auto-admission-scan-replay';
  x.integration=await integration.finish({rpc,setup,cases:x.cases});
  x.complete=true;return;
 }
 throw Error('No two-pool V1 reference candidate');
}
module.exports={run};
