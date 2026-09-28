const fs=require('node:fs'),{ethers}=require('ethers');
const {runRobinhoodAutomation}=require('./robinhood-automation.cjs');
const {runWatch}=require('./local-rpc-watch.cjs');
async function main(){
 const o={};for(let i=2;i<process.argv.length;i++){
  const k=process.argv[i];if(['--watch','--drain'].includes(k)){if(o[k])throw Error('Duplicate option');o[k]=true;continue;}
  if(!['--config','--state','--rpc','--mode'].includes(k)||!process.argv[i+1]||o[k])throw Error('Invalid option');o[k]=process.argv[++i];
 }
 for(const k of ['--config','--state','--rpc'])if(!o[k])throw Error('Missing '+k);
 const mode=o['--mode']??'inspect';if(!['inspect','rehearsal'].includes(mode))throw Error('Only inspect or local rehearsal modes exist');
 const url=new URL(o['--rpc']),loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.username||url.password||!(mode==='rehearsal'?url.protocol==='http:'&&loopback:url.protocol==='https:'||url.protocol==='http:'&&loopback))throw Error('Invalid RPC transport for mode');
 const config=JSON.parse(fs.readFileSync(o['--config'],'utf8')),artifacts=JSON.parse(fs.readFileSync('artifacts/compiled.json','utf8'));
 if(config.deploymentProfile?.scope!=='public-launch'||config.deploymentProfile.chainId!=='4663')throw Error('Pinned Robinhood deployment required');
 const request=new ethers.FetchRequest(o['--rpc']);request.timeout=20000;
 const provider=new ethers.JsonRpcProvider(request,undefined,{cacheTimeout:-1}),stop=new AbortController(),interrupt=()=>stop.abort();
 process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
 try{
  // No secret is loaded and no public signer is constructed in inspect mode.
  const executor=mode==='inspect'?new ethers.VoidSigner(config.deploymentProfile.executor,provider):await provider.getSigner(config.deploymentProfile.executor);
  const contract=(name,artifact)=>new ethers.Contract(config.deploymentProfile.pins[name][0],artifacts[artifact].abi,provider);
  const options={...config,provider,executor,collector:contract('collector','InfinityCollector'),adapter:contract('adapter','DrandRandomAdapter'),vault:contract('vault','DualControllerPromoVault'),short:contract('short','RobinhoodShortController'),monthly:contract('monthly','RobinhoodMonthlyController'),rpcUrl:o['--rpc'],statePath:o['--state'],mode:'robinhood-'+mode,drain:!!o['--drain'],signal:stop.signal};
  process.exitCode=await runWatch({pass:()=>runRobinhoodAutomation(options),watch:!!o['--watch'],pollMs:config.ops.pollSeconds*1000,signal:stop.signal,emit:r=>console.log(JSON.stringify(r))});
 }finally{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);provider.destroy();}
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({status:'error',reason:'Robinhood runtime configuration or transport failure',code:e.code}));process.exitCode=1;});
module.exports={main};
