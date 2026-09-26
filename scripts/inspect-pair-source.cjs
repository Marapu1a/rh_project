// Observer only: no keys, signer, transaction sends, state migration or auto-enrollment.
const fs=require('node:fs'),{ethers}=require('ethers');
const {inspectSource,validateManifest}=require('./pair-source-health.cjs');
async function main(){
 const args=process.argv.slice(2),o={};
 for(let i=0;i<args.length;i++){
  const k=args[i];if(!['--manifest','--expected-hash','--rpc','--poll-seconds','--watch'].includes(k)||Object.hasOwn(o,k))throw Error('Invalid/duplicate argument');
  if(k==='--watch')o[k]=true;else{if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing argument');o[k]=args[++i];}
 }
 if(!o['--manifest']||!o['--expected-hash']||!o['--rpc'])throw Error('Use --manifest FILE --expected-hash HASH --rpc URL [--watch --poll-seconds 300]');
 const url=new URL(o['--rpc']);if(!['http:','https:'].includes(url.protocol))throw Error('HTTP(S) RPC required');
 const seconds=Number(o['--poll-seconds']||300);if(!Number.isInteger(seconds)||seconds<10||seconds>86400||o['--poll-seconds']&&!o['--watch'])throw Error('Invalid poll interval');
 const manifest=JSON.parse(fs.readFileSync(o['--manifest'],'utf8'));validateManifest(manifest,o['--expected-hash']);
 // Disable cache so final anchor verification really reads again.
 const request=new ethers.FetchRequest(url.href);request.timeout=15000;
 const provider=new ethers.JsonRpcProvider(request,undefined,{cacheTimeout:-1,batchMaxCount:1});
 const stop=new AbortController(),abort=()=>stop.abort();process.once('SIGINT',abort);process.once('SIGTERM',abort);
 try{
  do{
   const r=await inspectSource({provider,manifest,expectedHash:o['--expected-hash']});
   console.log(JSON.stringify(r,(_,v)=>typeof v==='bigint'?v.toString():v));
   if(!o['--watch']){process.exitCode=r.status==='match'?0:r.status==='changed'?1:2;break;}
   if(!stop.signal.aborted)await new Promise(resolve=>{const done=()=>{clearTimeout(timer);stop.signal.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,seconds*1000);stop.signal.addEventListener('abort',done,{once:true});});
  }while(!stop.signal.aborted);
 }finally{provider.destroy();process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort);}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=2;});
