// Read-only RNG timing observation. No signer, seed selection or authorization to freeze.
const fs=require('node:fs');
const CHAIN='04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3';
async function json(url,body){const r=await fetch(url,{signal:AbortSignal.timeout(15000),...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
async function observe(){
 const attempt=async fn=>{const startedAt=new Date().toISOString();try{const value=await fn();return {startedAt,finishedAt:new Date().toISOString(),value};}catch(e){return {startedAt,error:e.message};}};
 const rpcUrl=process.env.RH_RPC_URL||'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public';
 const rpc=async(method,params=[])=>{const j=await json(rpcUrl,{jsonrpc:'2.0',id:1,method,params});if(j.error)throw Error(j.error.message);return j.result;};
 const [chainId,latest,safe,finalized,info,beacon]=await Promise.all([
  attempt(()=>rpc('eth_chainId')), ...['latest','safe','finalized'].map(tag=>attempt(()=>rpc('eth_getBlockByNumber',[tag,false]).then(b=>b&&({number:b.number,hash:b.hash,timestamp:b.timestamp})))),
  attempt(()=>json('https://api.drand.sh/'+CHAIN+'/info')),attempt(()=>json('https://api.drand.sh/'+CHAIN+'/public/latest'))]);
 return {schema:'rng-timing-observation-v1',observedAt:new Date().toISOString(),rpcUrl,chainId,latest,safe,finalized,drand:{chainHash:CHAIN,info,beacon},limitation:'One RPC/HTTP snapshot, unverified beacon and non-atomic heads; not freshness enforcement, consensus proof, latency SLA or permission to freeze.'};
}
if(require.main===module){const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('New output path required');observe().then(r=>{fs.writeFileSync(out,JSON.stringify(r,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(r,null,2));}).catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={observe};
