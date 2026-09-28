// Read-only bounded reference discovery; never a policy admission.
const fs=require('node:fs'),{ethers}=require('ethers'),I=require('./infinity-buy.cjs');
const {httpRpc,measuredRpc}=require('./public-rpc-qualification.cjs');
async function main(){
 const output=process.argv[2];if(!output||fs.existsSync(output))throw Error('New output path required');
 const url=process.env.RH_RPC_URL||'https://rpc.mainnet.chain.robinhood.com';
 const t=measuredRpc(httpRpc(url),{maxRequests:250}),rpc=t.rpc;
 const finalized=await rpc('eth_getBlockByNumber',['finalized',false]);
 const to=BigInt(finalized.number),from=to-10000n,logs=[];
 for(let start=from;start<=to;start+=1000n){
  const end=start+999n<to?start+999n:to;
  logs.push(...await rpc('eth_getLogs',[{address:I.PINS.manager[0],topics:[I.SWAP.getEvent('Swap').topicHash],fromBlock:ethers.toQuantity(start),toBlock:ethers.toQuantity(end)}]));
 }
 const candidates=[],hashes=[...new Set(logs.map(x=>x.transactionHash))];
 for(const h of hashes.slice(0,100)){
  const r=await rpc('eth_getTransactionReceipt',[h]);
  if(r.to?.toLowerCase()!==I.PINS.router[0])continue;
  const block=await rpc('eth_getBlockByNumber',[r.blockNumber,true]),tx=block.transactions.find(x=>x.hash===h);
  try{
   const a=I.CALL.parseTransaction({data:tx.input}).args,key=Array.from(a.key).map(x=>String(x));
   candidates.push({hash:h,blockNumber:r.blockNumber,key,usdg:key.slice(0,2).some(x=>x.toLowerCase()==='0x5fc5360d0400a0fd4f2af552add042d716f1d168')});
  }catch{ /* Unrecognized call is not a reference candidate. */ }
 }
 const out={observedAt:new Date().toISOString(),endpointOrigin:new URL(url).origin,fromBlock:String(from),toBlock:String(to),swapLogs:logs.length,uniqueTransactions:hashes.length,inspectedTransactions:Math.min(hashes.length,100),candidates,stats:t.stats,limitation:'Bounded discovery only, not exhaustive market search or BUY admission'};
 fs.writeFileSync(output,JSON.stringify(out,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(out));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
