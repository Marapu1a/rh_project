const fs=require('node:fs'),{ethers}=require('ethers');
const {runDrandDelivery,validateJob,abi}=require('./drand-delivery-worker.cjs');
const {runWatch}=require('./local-rpc-watch.cjs');
async function main(){
 const args=process.argv.slice(2),o={};
 for(let i=0;i<args.length;i++){
  const k=args[i];if(k==='--watch'){if(o.watch)throw Error('Duplicate watch');o.watch=true;continue;}
  if(!['--job','--state','--rpc','--executor'].includes(k)||args[i+1]==null||o[k.slice(2)]!==undefined)throw Error('Use --job FILE --state FILE --rpc LOOPBACK [--executor INDEX] [--watch]');
  o[k.slice(2)]=args[++i];
 }
 for(const k of ['job','state','rpc'])if(!o[k])throw Error('Missing --'+k);
 const url=new URL(o.rpc);if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password)throw Error('Loopback HTTP only');
 const index=o.executor??'0';if(!/^\d+$/.test(index)||!Number.isSafeInteger(Number(index)))throw Error('Invalid executor index');
 const job=validateJob(JSON.parse(fs.readFileSync(o.job,'utf8'))),request=new ethers.FetchRequest(o.rpc);request.timeout=20000;
 const provider=new ethers.JsonRpcProvider(request,undefined,{cacheTimeout:-1}),stop=new AbortController(),interrupt=()=>stop.abort();
 process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
 try{let executor;const adapter=new ethers.Contract(job.adapter,abi,provider);
  const pass=async()=>{executor??=await provider.getSigner(Number(index));return runDrandDelivery({provider,adapter,executor,job,statePath:o.state,signal:stop.signal});};
  process.exitCode=await runWatch({pass,watch:!!o.watch,pollMs:job.pollSeconds*1000,signal:stop.signal,emit:r=>console.log(JSON.stringify(r))});
 }finally{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);provider.destroy();}
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({status:'error',message:e.message,code:e.code}));process.exitCode=1;});
module.exports={main};
