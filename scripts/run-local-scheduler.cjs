const fs=require('node:fs'),{ethers}=require('ethers');
const {runScheduler,validateConfig}=require('./local-promo-scheduler.cjs');
async function main(){
  const args=process.argv.slice(2),o={};
  for(let i=0;i<args.length;i++){
    if(args[i]==='--watch'){o.watch=true;continue;}
    if(!['--config','--state','--rpc','--publisher','--executor'].includes(args[i])||args[i+1]==null)throw Error('Expected --config FILE --state FILE --rpc LOOPBACK [--publisher INDEX] [--executor INDEX] [--watch]');
    o[args[i].slice(2)]=args[++i];
  }
  if(!o.config||!o.state||!o.rpc)throw Error('Missing config/state/rpc');
  const config=JSON.parse(fs.readFileSync(o.config,'utf8'));validateConfig(config,o.rpc);
  const provider=new ethers.JsonRpcProvider(o.rpc,undefined,{cacheTimeout:-1});
  const stop=new AbortController(),interrupt=()=>stop.abort();process.once('SIGINT',interrupt);
  try{
    const compiled=JSON.parse(fs.readFileSync('artifacts/compiled.json','utf8'));
    const short=new ethers.Contract(config.lifecycle.source,compiled.LocalShortController.abi,provider);
    const monthly=new ethers.Contract(config.lifecycle.monthlySource,compiled.LocalMonthlyController.abi,provider);
    async function signer(index){if(index==null)return undefined;if(!/^\d+$/.test(index)||!Number.isSafeInteger(Number(index)))throw Error('Invalid account');return provider.getSigner(Number(index));}
    const publisher=await signer(o.publisher),executor=await signer(o.executor??'0');
    do{
      const result=await runScheduler({provider,short,monthly,config,rpcUrl:o.rpc,statePath:o.state,publisher,executor,signal:stop.signal},
        {onTick:r=>console.log(JSON.stringify(r))});
      if(result.status==='error'){process.exitCode=1;break;}
      if(!o.watch||result.status==='stopped')break;
      await new Promise(resolve=>setTimeout(resolve,10000));
    }while(!stop.signal.aborted);
  }finally{process.removeListener('SIGINT',interrupt);provider.destroy();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main};
