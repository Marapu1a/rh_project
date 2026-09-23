const fs=require('node:fs'),{Interface,AbiCoder,keccak256}=require('ethers');
const {decodeTransaction,SWAP_ABI}=require('./direct-buy.cjs');
async function main(){
 const [input,out]=process.argv.slice(2);if(!input||!out||fs.existsSync(out))throw Error('Input discovery JSON and NEW output required');
 const discovery=JSON.parse(fs.readFileSync(input,'utf8')),base=require('../research/direct-buy/evidence.json').manifest;
 const candidates=discovery.candidates.filter(c=>!c.error&&c.modeId==='1');
 const e={observedAt:new Date().toISOString(),input,block:discovery.block,header:discovery.header,reads:[],samples:[]};let seq=0;
 const allowed=new Set(['eth_chainId','eth_getBlockByNumber','eth_getLogs','eth_getCode','eth_call','eth_getTransactionByHash','eth_getTransactionReceipt']);
 async function read(method,params=[]){if(!allowed.has(method))throw Error('read only');
  const row={method,params};e.reads.push(row);
  const response=await fetch(discovery.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++seq,method,params}),signal:AbortSignal.timeout(20000)});
  row.response=await response.json();if(row.response.error)throw Error(JSON.stringify(row.response.error));return row.response.result;
 }
 try{
  if(await read('eth_chainId')!=='0x1237')throw Error('Wrong chain');
  const from='0x'+candidates.reduce((min,c)=>BigInt(c.launch.blockNumber)<min?BigInt(c.launch.blockNumber):min,BigInt(e.block)).toString(16);
  const logs=await read('eth_getLogs',[{address:base.manager,fromBlock:from,toBlock:e.block,topics:[SWAP_ABI.getEvent('Swap').topicHash,candidates.map(c=>c.launch.poolId)]}]);
  e.activity=candidates.map(c=>({project:c.projectToken,vault:c.launch.vault,poolId:c.launch.poolId,positions:c.positions.length,swapLogs:logs.filter(l=>l.topics[1]===c.launch.poolId).length}));
  // Prefer swaps after launch, not a launch-only developer purchase. Activity may be old.
  const later=c=>logs.filter(l=>l.topics[1]===c.launch.poolId&&l.transactionHash!==c.launch.transactionHash).length;
  candidates.sort((a,b)=>later(b)-later(a)||(a.positions.length!==1)-(b.positions.length!==1));
  const selected=candidates.find(c=>e.activity.find(a=>a.project===c.projectToken).swapLogs>0);
  if(!selected)throw Error('No public swaps in inspected candidates');e.selected=selected;
  const token=selected.projectToken,quote=discovery.quote;
  const poolKey=[...[token,quote].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1),'10000','200',base.hook];
  if(keccak256(AbiCoder.defaultAbiCoder().encode(['address','address','uint24','int24','address'],poolKey))!==selected.launch.poolId)throw Error('Pool key mismatch');
  // Decoder projection only: never inherit the fork-only registry, anchor or token code hash.
  const manifest={chainId:4663,router:base.router,manager:base.manager,hook:base.hook,
   token,quote,poolKey,poolId:selected.launch.poolId};
  e.decoderConfig=manifest;e.codeHashes={};
  for(const name of ['router','manager','token','quote','hook'])e.codeHashes[name]=keccak256(await read('eth_getCode',[manifest[name],e.block]));
  const position=selected.positions.find(p=>p.data[2]===manifest.poolId);e.position=position;
  const ownerAbi=new Interface(['function ownerOf(uint256) view returns(address)']);
  e.positionOwner=ownerAbi.decodeFunctionResult('ownerOf',await read('eth_call',[{to:selected.positionManager,data:ownerAbi.encodeFunctionData('ownerOf',[position.id])},e.block]))[0];
  const ownLogs=logs.filter(l=>l.topics[1]===manifest.poolId);e.swapCount=ownLogs.length;
  const hashes=[...new Set(ownLogs.map(l=>l.transactionHash))];
  for(const hash of [...new Set([...hashes.slice(0,3),...hashes.slice(-12)])]){
   const tx=await read('eth_getTransactionByHash',[hash]),receipt=await read('eth_getTransactionReceipt',[hash]);
   const header=await read('eth_getBlockByNumber',[receipt.blockNumber,false]);
   e.samples.push({hash,canonical:header.hash===receipt.blockHash,to:tx.to,block:receipt.blockNumber,decoded:decodeTransaction(manifest,tx,receipt),gasUsed:receipt.gasUsed,effectiveGasPrice:receipt.effectiveGasPrice});
  }
  e.vaultLogs=await read('eth_getLogs',[{address:selected.launch.vault,fromBlock:selected.launch.blockNumber,toBlock:e.block}]);
  e.source={url:'https://sourcify.dev/server/v2/contract/4663/'+selected.launch.vault+'?fields=all'};
  const response=await fetch(e.source.url,{signal:AbortSignal.timeout(20000)});e.source.status=response.status;e.source.body=await response.text();
  e.anchorStable=(await read('eth_getBlockByNumber',[e.block,false])).hash===e.header.hash;
 }catch(error){e.error=error.message;process.exitCode=1;}
 finally{fs.writeFileSync(out,JSON.stringify(e,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,error:e.error,activity:e.activity,selected:e.selected?.projectToken,samples:e.samples}));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
