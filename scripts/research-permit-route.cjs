// Read-only validation of the observed permit+swap counterexample. No decoder activation.
// node scripts/research-permit-route.cjs NEW_OUTPUT.json
const fs=require('node:fs'),{AbiCoder,keccak256}=require('ethers');
const {EXECUTE_ABI,SWAP_TYPE,TRANSFER_ABI}=require('./direct-buy.cjs');
const RPC='https://rpc.mainnet.chain.robinhood.com',ROUTER='0x8876789976decbfcbbbe364623c63652db8c0904';
const HASH='0xee46fd960864754f009c47d93668af0744091f9392b207012aa72f7336d650e2';
async function main(){
 const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('NEW output required');
 const e={schema:'permit-route-recon-v1',rpc:RPC,observedAt:new Date().toISOString(),reads:[]};
 async function rpc(method,params){
  if(!['eth_chainId','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getBlockByNumber','eth_getCode'].includes(method))throw Error('Read-only');
  await new Promise(r=>setTimeout(r,1300));const row={method,params};e.reads.push(row);
  const res=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:e.reads.length,method,params}),signal:AbortSignal.timeout(20000)});
  row.response=await res.json();if(!res.ok||row.response.error)throw Error(JSON.stringify(row.response));return row.response.result;
 }
 try{
  if(await rpc('eth_chainId',[])!=='0x1237')throw Error('Wrong chain');
  const tx=await rpc('eth_getTransactionByHash',[HASH]),receipt=await rpc('eth_getTransactionReceipt',[HASH]);
  const header=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]);
  if(tx.hash!==HASH||receipt.transactionHash!==HASH||tx.blockHash!==header.hash||receipt.blockHash!==header.hash||receipt.status!=='0x1'||tx.to.toLowerCase()!==ROUTER)throw Error('Provenance mismatch');
  let code;
  try{code=await rpc('eth_getCode',[ROUTER,receipt.blockNumber]);e.runtimeBlock=receipt.blockNumber;}
  catch(error){if(!error.message.includes('historical state'))throw error;e.historicalRuntimeUnavailable=error.message;const latest=await rpc('eth_getBlockByNumber',['latest',false]);e.runtimeBlock=latest.number;code=await rpc('eth_getCode',[ROUTER,latest.number]);}
  e.routerHash=keccak256(code);
  if(e.routerHash!=='0x2ce6aaaf9f4151f5e1cbf774668772f17f532ae11b15e9284fd0a072a8b0fbde')throw Error('Router changed');
  const c=AbiCoder.defaultAbiCoder(),call=EXECUTE_ABI.parseTransaction({data:tx.input});
  if(call.args.commands!=='0x0a10'||call.args.inputs.length!==2)throw Error('Wrong route');
  const permit=c.decode(['((address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline)','bytes'],call.args.inputs[0]);
  const [actions,params]=c.decode(['bytes','bytes[]'],call.args.inputs[1]),[swap]=c.decode([SWAP_TYPE],params[0]);
  e.observation={hash:HASH,block:receipt.blockNumber,canonical:true,commands:call.args.commands,actions,payer:tx.from,permitToken:permit[0].details.token,spender:permit[0].spender,permitAmount:String(permit[0].details.amount),currency0:swap[0][0],currency1:swap[0][1],zeroForOne:swap[1],inputToken:swap[1]?swap[0][0]:swap[0][1],outputToken:swap[1]?swap[0][1]:swap[0][0]};
  e.transfers=receipt.logs.filter(l=>l.topics[0]===TRANSFER_ABI.getEvent('Transfer').topicHash).map(l=>({token:l.address,...TRANSFER_ABI.parseLog(l).args.toObject()}));
  e.conclusion='Confirmed permit+swap receipt on reference router address, but token->native ETH, not USDG BUY. Runtime binding is only at runtimeBlock; no eligible route evidence.';
  e.source={file:'research/direct-buy/sources/contracts_base_Dispatcher.sol',hash:keccak256(fs.readFileSync('research/direct-buy/sources/contracts_base_Dispatcher.sol'))};
 }catch(error){e.error=error.message;process.exitCode=1;}
 finally{fs.writeFileSync(out,JSON.stringify(e,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n',{flag:'wx'});console.log(JSON.stringify({error:e.error,observation:e.observation,routerHash:e.routerHash}));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
