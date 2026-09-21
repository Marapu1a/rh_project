const fs=require('node:fs'),{ethers}=require('ethers');
const {runCoordinator}=require('./local-promo-coordinator.cjs');
async function main(){
  const args=process.argv.slice(2),o={};
  for(let i=0;i<args.length;i++){
    if(args[i]==='--watch'){o.watch=true;continue;}
    if(!['--job','--config','--state','--scheduler-state','--rpc','--publisher','--executor','--ops','--native-refill','--refill-signer'].includes(args[i])||args[i+1]==null)
      throw Error('Expected --job FILE --config FILE --state FILE --scheduler-state FILE --rpc LOOPBACK [--ops FILE] [--native-refill FILE --refill-signer INDEX] [--publisher INDEX] [--executor INDEX] [--watch]');
    o[args[i].slice(2)]=args[++i];
  }
  for(const k of ['job','config','state','scheduler-state','rpc'])if(!o[k])throw Error('Missing --'+k);
  const url=new URL(o.rpc);
  if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password)throw Error('Loopback HTTP RPC only');
  const job=JSON.parse(fs.readFileSync(o.job,'utf8')),config=JSON.parse(fs.readFileSync(o.config,'utf8'));
  const ops=o.ops?JSON.parse(fs.readFileSync(o.ops,'utf8')):undefined;
  const artifacts=JSON.parse(fs.readFileSync('artifacts/compiled.json','utf8'));
  const provider=new ethers.JsonRpcProvider(o.rpc,undefined,{cacheTimeout:-1}),stop=new AbortController();
  const interrupt=()=>stop.abort();process.once('SIGINT',interrupt);
  try{
    async function signer(index){if(index==null)return undefined;if(!/^\d+$/.test(index)||!Number.isSafeInteger(Number(index)))throw Error('Invalid account');return provider.getSigner(Number(index));}
    const executor=await signer(o.executor??'0'),publisher=await signer(o.publisher);
    if(!!o['native-refill']!==(o['refill-signer']!=null))throw Error('Provide both --native-refill and --refill-signer');
    const nativeRefill=o['native-refill']?{...JSON.parse(fs.readFileSync(o['native-refill'],'utf8')),signer:await signer(o['refill-signer'])}:undefined;
    const contract=(address,name)=>new ethers.Contract(address,artifacts[name].abi,provider);
    const options={statePath:o.state,signal:stop.signal,ops,nativeRefill,
      prize:{provider,job,router:contract(job.router,'FeeRouter'),executor},
      scheduler:{provider,config,rpcUrl:o.rpc,statePath:o['scheduler-state'],publisher,executor,
        short:contract(config.lifecycle.source,'LocalShortController'),monthly:contract(config.lifecycle.monthlySource,'LocalMonthlyController')}};
    do{
      const result=await runCoordinator(options);console.log(JSON.stringify(result));
      if(['blocked','error'].includes(result.status)){process.exitCode=1;break;}
      if(!o.watch||result.status==='stopped')break;
      await new Promise(resolve=>{
        const done=()=>{clearTimeout(timer);stop.signal.removeEventListener('abort',done);resolve();};
        const timer=setTimeout(done,(ops?ops.settings.pollSeconds:job.pollSeconds)*1000);stop.signal.addEventListener('abort',done,{once:true});if(stop.signal.aborted)done();
      });
    }while(!stop.signal.aborted);
  }finally{process.removeListener('SIGINT',interrupt);provider.destroy();}
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({status:'error',message:e.message,code:e.code}));process.exitCode=1;});
module.exports={main};
