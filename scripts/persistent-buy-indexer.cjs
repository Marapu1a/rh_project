// Durable evidence cache. The existing scanner and replay remain authoritative.
const fs=require('node:fs');
const {hash,replay}=require('./direct-buy.cjs');
const {scanWithRpc}=require('./replay-direct-buy.cjs');
const {resolveBuyPolicy}=require('./buy-policy-runtime.cjs');
const {withState}=require('./local-scheduler-state.cjs');
const tag=n=>'0x'+BigInt(n).toString(16);
const check=(v,m)=>{if(!v)throw Error(m);};
async function indexOnce({config,rpc,statePath,batchSize=100,reorgLimit=128}){
 check(Number.isInteger(batchSize)&&batchSize>0&&batchSize<=1000,'Invalid index batch');
 check(Number.isInteger(reorgLimit)&&reorgLimit>=0&&reorgLimit<=10000,'Invalid reorg limit');
 return withState(statePath,{kind:'persistent-buy-indexer-v1',config},async(state,save)=>{
  try{
   const m=config.manifest,anchor=Number(m.anchor.number);
   check(BigInt(await rpc('eth_chainId',[]))===BigInt(m.chainId),'Wrong RPC chain');
   const finalized=await rpc('eth_getBlockByNumber',['finalized',false]);
   const target=Number(BigInt(finalized.number));check(Number.isSafeInteger(target)&&target>=anchor,'Finalized head before anchor');
   const a=await rpc('eth_getBlockByNumber',[tag(anchor),false]);check(a.hash.toLowerCase()===m.anchor.hash.toLowerCase(),'Anchor is not canonical');
   const prior=state.index||{blocks:[],cache:{},head:anchor};
   check(target>=prior.head,'Finalized head regressed; wait for consistent RPC');
   let keep=prior.blocks.length,removed=0;
   while(keep){
    const b=prior.blocks[keep-1],current=await rpc('eth_getBlockByNumber',[tag(b.number),false]);
    if(current.hash.toLowerCase()===b.hash.toLowerCase())break;
    check(removed<reorgLimit,'Reorg exceeds configured limit; independent review required');
    keep--;removed++;
   }
   const base=keep?Number(BigInt(prior.blocks[keep-1].number)):anchor;
   const end=Math.min(target,base+batchSize),cache={};
   for(const [key,row] of Object.entries(prior.cache))if(row.height<=base)cache[key]=row;
   let height=anchor,cacheHits=0;
   const read=async(method,params=[])=>{
    let cacheable=false;
    if(method==='eth_getBlockByNumber'&&params[1]===true){height=Number(BigInt(params[0]));cacheable=true;}
    else if(method==='eth_getCode'){height=Number(BigInt(params[1]));cacheable=true;}
    else if(method==='eth_getTransactionReceipt')cacheable=true;
    const key=hash({method,params});
    if(cacheable&&cache[key]){cacheHits++;return structuredClone(cache[key].value);}
    const value=await rpc(method,params);check(value!=null,'Missing indexer RPC result');
    if(cacheable)cache[key]={height,value:structuredClone(value)};
    return value;
   };
   const resolved=await resolveBuyPolicy(config,rpc,end);
   const input=end>anchor?await scanWithRpc(resolved.manifest,read,end,config.lifecycle):{manifest:resolved.manifest,blocks:[]};
   const ledger=end>anchor?replay(input.manifest,input.blocks):null;
   check((await rpc('eth_getBlockByNumber',[finalized.number,false])).hash===finalized.hash,'Finalized branch changed during indexing');
   // Publish evidence and derived ledger together; failure leaves the last good snapshot intact.
   state.index={head:end,blocks:input.blocks,cache,manifest:input.manifest,ledger,ledgerHash:ledger?hash(ledger):null,policyStatus:resolved.policyStatus};
   state.status={state:end===target?'caughtUp':'catchingUp',processedBlock:end,targetBlock:target,removedBlocks:removed,cacheHits,updatedAt:new Date().toISOString()};
   save(state);return state.status;
  }catch(e){
   if(e.code==='SCHEDULER_STORAGE_ERROR')throw e;
   state.status={state:'waiting',processedBlock:state.index?.head??Number(config.manifest.anchor.number),reason:'Read or validation failed; last good snapshot retained',updatedAt:new Date().toISOString()};
   save(state);throw e;
  }
 });
}
async function main(){
 const [configFile,statePath,mode='once']=process.argv.slice(2);
 check(configFile&&statePath&&['once','watch'].includes(mode),'Usage: CONFIG STATE [once|watch], RH_RPC_URL required');
 check(process.env.RH_RPC_URL,'RH_RPC_URL required');
 const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
 const rpc=require('./public-rpc-qualification.cjs').httpRpc(process.env.RH_RPC_URL);
 let stopping=false;process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
 do{try{console.log(JSON.stringify(await indexOnce({config,rpc,statePath})));}catch{console.error('Indexer waiting: RPC, policy, state or branch validation failed');if(mode==='once'){process.exitCode=1;return;}}
 if(mode==='once'||stopping)break;await new Promise(r=>setTimeout(r,10000));
 }while(!stopping);
}
module.exports={indexOnce};
if(require.main===module)main().catch(()=>{console.error('Indexer configuration failure');process.exitCode=1;});
