// Bounded read-only research: no signer, no transaction submission.
const fs=require('node:fs'),E=require('ethers'),{FAB,CUR}=require('./integrations/pons-v2.cjs'),V=require('./pons-v4-buy.cjs');
async function main(){
 const file=process.argv[2];if(!file||fs.existsSync(file))throw Error('New report path required');
 const tokens=['0xdEe52F2ab639b6942B0d0F0565400b93b7a0fbe5','0xeDBf91223639800BCd5756815CAf908Df3b890bE'];
 const api={observedAt:new Date().toISOString(),rows:[]};
 for(const token of tokens)for(const endpoint of ['creator-fees','trades']){
  const url=`https://www.ponsfamily.com/api/pons-v2-market/${token}/${endpoint}`;
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`Pons API ${response.status}: ${url}`);
  api.rows.push({url,body:await response.json()});
 }
 const provider=new E.JsonRpcProvider('https://rpc.mainnet.chain.robinhood.com',undefined,{cacheTimeout:-1,batchMaxCount:1});
 const out={observedAt:new Date().toISOString(),publicSends:false,status:'RUNNING',tokens:[],api};const save=()=>fs.writeFileSync(file,JSON.stringify(out,(_,v)=>typeof v==='bigint'?String(v):v,2));
 try{
  const block=await provider.getBlock('latest');out.block={number:block.number,hash:block.hash};const at={blockTag:block.number};
  const factory=new E.Contract('0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e',FAB,provider),hookAddress=await factory.memeHook(at),escrowAddress=await factory.feeEscrow(at);
  out.factory=factory.target;out.hook=hookAddress;out.escrow=escrowAddress;
  const hook=new E.Contract(hookAddress,['function launches(bytes32) view returns(bool registered,bool memecoinIsCurrency0,address memecoin,address quoteToken,address creator,address buybackCreatorRecipient,address protocolFeeRecipient,uint16 creatorTaxBps,uint16 protocolFeeShareBps,uint16 buybackBurnBps,uint16 hookFeeBps,uint16 maxInternalPriceImpactBps,bool buybackEnabled)','function pendingFees(bytes32,address) view returns(uint256)','function pendingCreatorTax(bytes32,address) view returns(uint256)'],provider);
  const escrow=new E.Contract(escrowAddress,['function balanceOf(address) view returns(uint256)','function balanceOfToken(address,address) view returns(uint256)'],provider);
  for(const token of tokens){
   const r=await factory.getLaunchedToken(token,at),p=await factory.getLaunchFeePolicy(token,at),curve=new E.Contract(r.curve,CUR,provider);
   const key=[...[token,r.pairToken].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1),String(r.poolFee),String(r.tickSpacing),hookAddress],id=V.poolId(key);
   const row={token,launch:r.toObject(),feePolicy:{protocolFeeRecipient:p[0],protocolFeeShareBps:p[1],buybackBurnBps:p[2],hookFeeBps:p[3],maxInternalPriceImpactBps:p[4]},curveFeeBps:await curve.feeBps(at),curveCreatorTaxBps:await curve.creatorTaxBps(at),poolKey:key,poolId:id,hookLaunch:(await hook.launches(id,at)).toObject(),pending:[],transactions:[]};out.tokens.push(row);
   for(const currency of [token,r.pairToken])row.pending.push({currency,fee:await hook.pendingFees(id,currency,at),tax:await hook.pendingCreatorTax(id,currency,at)});
   row.claimable=r.pairToken===E.ZeroAddress?await escrow.balanceOf(r.creatorFeeRecipient,at):await escrow.balanceOfToken(r.creatorFeeRecipient,r.pairToken,at);save();
   const trades=api.rows.find(x=>x.url.includes(token)&&x.url.endsWith('/trades')).body.trades;
   row.sample={source:'Pons API latest 50 indexed trades, first 12 unique hashes; not all market activity',listed:trades.length};
   for(const hash of [...new Set(trades.map(x=>x.transactionHash))].slice(0,12)){
    const tx=await provider.send('eth_getTransactionByHash',[hash]),receipt=await provider.send('eth_getTransactionReceipt',[hash]);if(!tx||!receipt)throw Error('Missing receipt');
    const swaps=receipt.logs.filter(l=>l.address.toLowerCase()===V.PINS.manager[0]&&l.topics[0]===V.SWAP.getEvent('Swap').topicHash).map(l=>({address:l.address,...V.SWAP.parseLog(l).args.toObject()}));
    const fees=receipt.logs.filter(l=>l.address.toLowerCase()===hookAddress.toLowerCase()&&l.topics[0]===V.FEE.getEvent('HookFeeCollected').topicHash).map(l=>({...V.FEE.parseLog(l).args.toObject()}));
    row.transactions.push({tx,receipt,swaps,fees,targetSwaps:swaps.filter(x=>x.id.toLowerCase()===id).length,targetFees:fees.filter(x=>x.poolId.toLowerCase()===id).length});save();
   }
   console.log(token,'phase',String(r.phase),'registered',row.hookLaunch.registered,'sample',row.transactions.length,'target swaps',row.transactions.reduce((n,x)=>n+x.targetSwaps,0),'hook events',row.transactions.reduce((n,x)=>n+x.targetFees,0));
  }
  out.status='READS_COMPLETE';
 }catch(e){out.status='FAILED';out.error=e.shortMessage||e.message;process.exitCode=1;}
 finally{save();provider.destroy();console.log(out.status,out.error||'');}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
