const fs=require('node:fs');
const {keccak256}=require('ethers');
const AUTO=require('./pair-auto-buy.cjs');
const PONS_PROFILES=require('./pons-profiles.cjs');
const {replay,canonical,hash,validateManifest,buyPolicyHistory,routeDependencies}=require('./direct-buy.cjs');

// Independent reader: fetch whole blocks and every receipt, not an operator BUY list.
async function scan(input,rpcUrl,toBlock,lifecycle=null){
  let sequence=0;
  async function rpc(method,params=[]){
    const response=await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++sequence,method,params}),signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Object.assign(Error('RPC HTTP '+response.status),{code:'RPC_HTTP_ERROR',statusCode:response.status});
    const data=await response.json();if(data.error||data.result==null)throw Error('RPC cannot supply '+method);return data.result;
  }
  return scanWithRpc(input,rpc,toBlock,lifecycle);
}
async function scanWithRpc(input,rpc,toBlock,lifecycle=null,{fromBlock}={}){
  const manifest=buyPolicyHistory(input).genesis;
  const pons=PONS_PROFILES.get(manifest.schema),batch=pons?.FIELDS.includes('batchExecutor');
  const curveBuyTopic=batch?require('./pons-curve-buy.cjs').EVENTS.getEvent('CurveBuy').topicHash:null;
  const poolSwapTopic=batch&&manifest.manager?require('./pons-v4-buy.cjs').SWAP.getEvent('Swap').topicHash:null;
  if(BigInt(await rpc('eth_chainId'))!==BigInt(manifest.chainId))throw Error('Wrong RPC chain');
  const tag=n=>'0x'+BigInt(n).toString(16);
  const anchor=await rpc('eth_getBlockByNumber',[tag(manifest.anchor.number),false]);
  if(anchor.hash.toLowerCase()!==manifest.anchor.hash.toLowerCase())throw Error('Anchor is not canonical');
  if(BigInt(toBlock)<=BigInt(manifest.anchor.number))throw Error('Empty range');
  const first=fromBlock===undefined?BigInt(manifest.anchor.number)+1n:BigInt(fromBlock);
  if(first<=BigInt(manifest.anchor.number)||first>BigInt(toBlock))throw Error('Invalid scan range');
  const head=await rpc('eth_getBlockByNumber',[tag(toBlock),false]);
  for(const dependency of routeDependencies(input,toBlock)){
    const code=await rpc('eth_getCode',[dependency.address,tag(toBlock)]);
    if(code==='0x'||keccak256(code)!==dependency.codeHash)throw Error('Unexpected BUY adapter dependency runtime');
  }
  for(const field of pons?pons.FIELDS:['router','manager','hook','token','quote','registry',...(manifest.schema==='direct-buy-infinity-v1'?['settlement']:[])]){
    const code=await rpc('eth_getCode',[manifest[field],tag(toBlock)]);
    if(code==='0x'||keccak256(code)!==manifest.codeHashes[field])throw Error('Unexpected '+field+' runtime; review deployment binding');
  }
  if(lifecycle){
    const code=await rpc('eth_getCode',[lifecycle.source,tag(toBlock)]);
    if(code==='0x'||keccak256(code)!==lifecycle.sourceCodeHash.toLowerCase())throw Error('Unexpected lifecycle source runtime');
    if(['attempt-lifecycle-v3','attempt-lifecycle-v4'].includes(lifecycle.schema))for(const [address,digest] of [[lifecycle.monthlySource,lifecycle.monthlySourceCodeHash],[lifecycle.vault,lifecycle.vaultCodeHash]]){
      const code=await rpc('eth_getCode',[address,tag(toBlock)]);
      if(code==='0x'||keccak256(code)!==digest.toLowerCase())throw Error('Unexpected dual lifecycle runtime');
    }
  }
  const blocks=[];
  // An incremental caller must join its canonical prefix and replay the result.
  for(let n=first;n<=BigInt(toBlock);n++){
    const block=await rpc('eth_getBlockByNumber',[tag(n),true]);
    const transactions=[],batchAccounts={};
    if(batch){const code=await rpc('eth_getCode',[manifest.batchExecutor,tag(n-1n)]);if(keccak256(code)!==manifest.codeHashes.batchExecutor)throw Error('Unexpected parent executor runtime');}
    if(pons)await pons.validateBindings(manifest,rpc,tag(n));
    if(pons)for(const field of pons.FIELDS){
      const code=await rpc('eth_getCode',[manifest[field],tag(n)]);
      if(code==='0x'||keccak256(code)!==manifest.codeHashes[field])throw Error('Unexpected historical Pons '+field+' runtime');
    }
    if(manifest.schema==='direct-buy-infinity-v1')for(const field of ['router','manager','hook','token','quote','settlement']){
      const code=await rpc('eth_getCode',[manifest[field],tag(n)]);
      if(code==='0x'||keccak256(code)!==manifest.codeHashes[field])throw Error('Unexpected historical Infinity '+field+' runtime');
    }
    for(const tx of block.transactions){
      if(tx.to?.toLowerCase()===AUTO.ADDRESS&&routeDependencies(input,n).some(d=>d.address===AUTO.ADDRESS)){
        const code=await rpc('eth_getCode',[AUTO.ADDRESS,tag(n)]);
        if(code==='0x'||keccak256(code)!==AUTO.CODE_HASH)throw Error('Unexpected historical AUTO runtime');
      }
      const receipt=await rpc('eth_getTransactionReceipt',[tx.hash]);
      // Keep all receipts. Only a target venue candidate needs account delegation
      // evidence; unrelated self-calls must not require historical account state.
      const candidate=batch&&receipt.logs.some(l=>
        l.address.toLowerCase()===manifest.curve.toLowerCase()&&l.topics[0]===curveBuyTopic||
        manifest.manager&&l.address.toLowerCase()===manifest.manager.toLowerCase()&&l.topics[0]===poolSwapTopic&&l.topics[1]?.toLowerCase()===manifest.poolId.toLowerCase());
      if(candidate&&tx.to&&tx.from.toLowerCase()===tx.to.toLowerCase()){const payer=tx.from.toLowerCase();if(!batchAccounts[payer])batchAccounts[payer]={parentHash:block.parentHash,code:await rpc('eth_getCode',[payer,tag(n-1n)])};}
      transactions.push({tx,receipt});
    }
    blocks.push({number:block.number,hash:block.hash,parentHash:block.parentHash,timestamp:block.timestamp,transactions,...(batch?{batchAccounts}:{})});
  }
  if((await rpc('eth_getBlockByNumber',[tag(toBlock),false])).hash!==head.hash)throw Error('Chain changed during scan; retry canonical range');
  return {manifest:input,blocks};
}
async function main(){
  const args=process.argv.slice(2),options={};
  const allowed=new Set(['--evidence','--manifest','--rpc','--to-block','--output','--verify']);
  for(let i=0;i<args.length;i+=2){if(!allowed.has(args[i])||!args[i+1]||options[args[i]])throw Error('Invalid/duplicate option');options[args[i]]=args[i+1];}
  let input,policyStatus={mode:'unadmitted',reason:'Offline evidence; no source admission'};
  if(options['--evidence']){
    if(options['--rpc']||options['--manifest']||options['--to-block'])throw Error('Choose saved evidence or independent RPC scan');
    input=JSON.parse(fs.readFileSync(options['--evidence'],'utf8'));
  }else{
    if(!options['--rpc']||!options['--manifest']||!options['--to-block'])throw Error('Supply --evidence FILE or --manifest FILE --rpc URL --to-block N');
    const saved=JSON.parse(fs.readFileSync(options['--manifest'],'utf8'));
    const {JsonRpcProvider}=require('ethers'),provider=new JsonRpcProvider(options['--rpc']);
    let resolved;try{resolved=await require('./buy-policy-runtime.cjs').resolveBuyPolicy(saved.manifest?saved:{manifest:saved},(m,p)=>provider.send(m,p),Number(options['--to-block']));}finally{provider.destroy();}
    policyStatus=resolved.policyStatus;
    input=await scan(resolved.manifest,options['--rpc'],options['--to-block']);
  }
  const ledger=replay(input.manifest,input.blocks);
  const result={ledger,ledgerHash:hash(ledger),policyStatus};
  if(options['--verify']){
    const claimed=JSON.parse(fs.readFileSync(options['--verify'],'utf8'));
    if(claimed.ledgerHash!==result.ledgerHash||canonical(claimed.ledger)!==canonical(ledger))throw Error('Published ledger differs from independently replayed history');
  }
  if(options['--output'])fs.writeFileSync(options['--output'],canonical(result)+'\n');
  console.log(JSON.stringify({policyStatus,candidates:ledger.decisions.length,wallets:ledger.wallets,ledgerHash:result.ledgerHash,finality:ledger.finality},null,2));
}
module.exports={scan,scanWithRpc};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
