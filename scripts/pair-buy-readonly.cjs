const fs=require('node:fs'),{keccak256,AbiCoder}=require('ethers');
const {decodeTransaction,SWAP_ABI,EXECUTE_ABI,SWAP_TYPE}=require('./direct-buy.cjs');
async function main(){
 const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('New evidence path required');
 const m={...require('../research/direct-buy/evidence.json').manifest,chainId:4663};
 const e={observedAt:new Date().toISOString(),scope:'existing public pool decoder probe, no registration/entry eligibility claim',manifest:m,reads:[],decoded:[]};
 const allowed=new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getCode','eth_getLogs','eth_getTransactionByHash','eth_getTransactionReceipt']);let id=0;
 async function rpc(method,params=[]){if(!allowed.has(method))throw Error('read-only');
  const row={method,params};e.reads.push(row);
  const r=await fetch('https://rpc.mainnet.chain.robinhood.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal:AbortSignal.timeout(20000)});
  row.response=await r.json();if(row.response.error)throw Error(JSON.stringify(row.response.error));return row.response.result;
 }
 try{
  if(await rpc('eth_chainId')!=='0x1237')throw Error('Wrong network');
  e.block=await rpc('eth_blockNumber');e.header=await rpc('eth_getBlockByNumber',[e.block,false]);e.codeHashes={};
  for(const name of ['router','manager','token','quote','hook'])e.codeHashes[name]=keccak256(await rpc('eth_getCode',[m[name],e.block]));
  const logs=await rpc('eth_getLogs',[{address:m.manager,topics:[SWAP_ABI.getEvent('Swap').topicHash,m.poolId],fromBlock:'0x'+(BigInt(e.block)-20000n).toString(16),toBlock:e.block}]);
  e.matchedLogs=logs.length;
  for(const hash of [...new Set(logs.map(l=>l.transactionHash))].slice(-12)){
   const tx=await rpc('eth_getTransactionByHash',[hash]),receipt=await rpc('eth_getTransactionReceipt',[hash]);
   e.decoded.push(...decodeTransaction(m,tx,receipt));
  }
  // The old manifest token may be fork-only: inspect a separate bounded public sample.
  const recent=await rpc('eth_getLogs',[{address:m.manager,topics:[SWAP_ABI.getEvent('Swap').topicHash],fromBlock:'0x'+(BigInt(e.block)-500n).toString(16),toBlock:e.block}]);
  e.recentSwapLogs=recent.length;e.publicSample=[];const coder=AbiCoder.defaultAbiCoder();
  for(const hash of [...new Set(recent.map(l=>l.transactionHash))].slice(-12)){
   const tx=await rpc('eth_getTransactionByHash',[hash]),receipt=await rpc('eth_getTransactionReceipt',[hash]);
   const sample={hash,to:tx?.to,selector:tx?.input?.slice(0,10)};e.publicSample.push(sample);
   try{
    if(tx.to?.toLowerCase()!==m.router.toLowerCase())throw Error('NOT_DIRECT_ROUTER_CALL');
    const parsed=EXECUTE_ABI.parseTransaction({data:tx.input});
    if(parsed.args.commands!=='0x10'||parsed.args.inputs.length!==1)throw Error('COMMAND_SEQUENCE');
    const [actions,params]=coder.decode(['bytes','bytes[]'],parsed.args.inputs[0]);
    if(actions!=='0x060b0e')throw Error('ACTION_SEQUENCE');
    const [spec]=coder.decode([SWAP_TYPE],params[0]),key=Array.from(spec[0],v=>typeof v==='bigint'?v.toString():v);
    if(!key.slice(0,2).some(a=>a.toLowerCase()===m.quote.toLowerCase()))throw Error('NOT_USDG_POOL');
    const candidate={...m,poolKey:key,hook:key[4],token:key.slice(0,2).find(a=>a.toLowerCase()!==m.quote.toLowerCase()),poolId:keccak256(coder.encode(['address','address','uint24','int24','address'],key))};
    sample.candidate=candidate;sample.decoded=decodeTransaction(candidate,tx,receipt);
   }catch(error){sample.reason=error.message;}
  }
  e.anchorStable=(await rpc('eth_getBlockByNumber',[e.block,false])).hash===e.header.hash;
 }catch(error){e.error=error.message;}
 finally{fs.writeFileSync(out,JSON.stringify(e,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,error:e.error,logs:e.matchedLogs,decoded:e.decoded,hashes:e.codeHashes}));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
