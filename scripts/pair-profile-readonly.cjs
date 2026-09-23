// Public read-only snapshot. Never runs a signer, estimate, deployment or send method.
const fs=require('node:fs'),path=require('node:path');
const {id,keccak256,Interface}=require('ethers');
const old=JSON.parse(fs.readFileSync('research/pair-source-audit/manifest.json','utf8'));
const allowed=new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getCode','eth_getStorageAt','eth_call','eth_gasPrice','eth_maxPriorityFeePerGas','eth_getTransactionByHash','eth_getTransactionReceipt']);
async function main(){
 const out=process.argv[2];if(!out)throw Error('Supply a NEW output JSON path');
 if(fs.existsSync(out))throw Error('Refusing to overwrite evidence');
 const evidence={observedAt:new Date().toISOString(),rpc:'https://rpc.mainnet.chain.robinhood.com',scope:'public read-only candidate, not selected production deployment',reads:[],http:[],contracts:{}};
 let seq=0;
 async function read(method,params=[]){
  if(!allowed.has(method))throw Error('Non-read RPC rejected');
  const row={method,params};evidence.reads.push(row);
  try{const response=await fetch(evidence.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++seq,method,params}),signal:AbortSignal.timeout(12000)});
   row.httpStatus=response.status;row.response=await response.json();return row.response.result;
  }catch(e){row.error=e.message;return undefined;}
 }
 async function http(url){const row={url};evidence.http.push(row);try{
  const r=await fetch(url,{signal:AbortSignal.timeout(12000)});row.status=r.status;row.body=await r.text();
 }catch(e){row.error=e.message;}}
 try{
  await Promise.all(['/api/quote-assets/launch-readiness','/api/launches/native-fee-v2-readiness','/api/v5-v2/native-fee/consumer-live','/api/v5-v2/standard-route/consumer-live'].map(p=>http('https://pair.fund'+p)));
  evidence.chain=await read('eth_chainId');
  if(evidence.chain!=='0x1237')throw Error('Chain 4663 unavailable or mismatched');
  evidence.block=await read('eth_blockNumber');if(!evidence.block)throw Error('No block');
  evidence.header=await read('eth_getBlockByNumber',[evidence.block,false]);
  await Promise.all(['safe','finalized'].map(tag=>read('eth_getBlockByNumber',[tag,false])));
  evidence.gasPrice=await read('eth_gasPrice');evidence.priorityFee=await read('eth_maxPriorityFeePerGas');
  const targets={...Object.fromEntries(Object.entries(old.contracts).map(([k,v])=>[k,v.address])),
   launchpad:'0x8660a7f019c7943b0b0a91b8e39aff3b6db6ae62',router:'0x8876789976decbfcbbbe364623c63652db8c0904',historicalVault:'0xd1adef92714bfa5e0f59dd48479bcf9a5ee77c01'};
  for(const [name,address] of Object.entries(targets)){
   const code=await read('eth_getCode',[address,evidence.block]);
   const row=evidence.contracts[name]={address,codeHash:code?keccak256(code):null,codeBytes:code?(code.length-2)/2:null,
    previousHash:old.contracts[name]?.runtimeCodeHash,getters:{}};
   for(const sig of (name==='launchpad'?['launchV2Coordinator()','activeLaunchV2ModeRegistry()','launchV2ModeRegistry()']:['coordinator()','vaultFactory()','modeRegistry()','epoch()','projectToken()'])){
    row.getters[sig]=await read('eth_call',[{to:address,data:id(sig).slice(0,10)},evidence.block]);
   }
  }
  evidence.implementation=await read('eth_getStorageAt',[targets.launchpad,'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',evidence.block]);
  const modeAbi=new Interface(['function currentHandler(uint32) view returns(address,uint256,bool)']);
  evidence.handlers={};
  for(const mode of [1,2,3]){
   const raw=await read('eth_call',[{to:targets.registry,data:modeAbi.encodeFunctionData('currentHandler',[mode])},evidence.block]);
   if(raw)try{evidence.handlers[mode]=Array.from(modeAbi.decodeFunctionResult('currentHandler',raw),v=>typeof v==='bigint'?v.toString():v);}catch{}
  }
  const coord=evidence.contracts.launchpad.getters['launchV2Coordinator()'];
  if(coord){const address='0x'+coord.slice(-40),code=await read('eth_getCode',[address,evidence.block]);
   evidence.launchCoordinator={address,codeHash:code?keccak256(code):null};
   await http('https://sourcify.dev/server/v2/contract/4663/'+address+'?fields=match,runtimeBytecode,abi');
  }
  const txUrl='https://robinhoodchain.blockscout.com/api/v2/addresses/'+targets.router+'/transactions?filter=to';
  await http(txUrl);
  const listing=evidence.http.find(r=>r.url===txUrl);
  try{
   const items=JSON.parse(listing.body).items||[];
   evidence.routerTransactionCandidates=items.slice(0,3).map(t=>t.hash);
   for(const hash of evidence.routerTransactionCandidates){await read('eth_getTransactionByHash',[hash]);await read('eth_getTransactionReceipt',[hash]);}
  }catch(e){evidence.routerListingError=e.message;}
  // Bounded real transactions from the pinned latest block; do not relabel fork tx as public.
  const block=await read('eth_getBlockByNumber',[evidence.block,true]);
  evidence.sampleTransactions=(block?.transactions||[]).filter(t=>typeof t==='object').slice(0,8);
  for(const tx of evidence.sampleTransactions)await read('eth_getTransactionReceipt',[tx.hash]);
  const end=await read('eth_getBlockByNumber',[evidence.block,false]);evidence.anchorStable=!!end&&end.hash===evidence.header?.hash;
 }catch(e){evidence.error=e.message;}
 finally{fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,chain:evidence.chain,block:evidence.block,error:evidence.error,contracts:evidence.contracts,gasPrice:evidence.gasPrice,anchorStable:evidence.anchorStable,http:evidence.http.map(({url,status,error})=>({url,status,error}))}));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
