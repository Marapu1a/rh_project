// No key argument. The selected fork's unlocked signer is used only after instance verification.
const fs=require('node:fs'),{ethers}=require('ethers'),{runPonsAutomation,validate}=require('./pons-automation.cjs');
async function main(){
 const args=process.argv.slice(2),options={},flags=new Set(['--watch','--drain']);
 for(let i=0;i<args.length;i++){const key=args[i];if(!['--config','--state','--rpc',...flags].includes(key)||options[key]!==undefined)throw Error('Unknown/duplicate argument');options[key]=flags.has(key)?true:args[++i];}
 for(const k of ['--config','--state','--rpc'])if(typeof options[k]!=='string')throw Error('Required --config FILE --state FILE --rpc LOOPBACK_URL');
 const url=new URL(options['--rpc']);if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password)throw Error('Loopback HTTP only');
 const config=JSON.parse(fs.readFileSync(options['--config'],'utf8'));validate(config);
 const provider=new ethers.JsonRpcProvider(url.href,undefined,{cacheTimeout:-1}),executor=new ethers.JsonRpcSigner(provider,config.executor),stop=new AbortController();
 const halt=()=>stop.abort();process.once('SIGINT',halt);process.once('SIGTERM',halt);
 try{do{const r=await runPonsAutomation({provider,executor,config,rpcUrl:url.href,statePath:options['--state'],signal:stop.signal,drain:!!options['--drain']});console.log(JSON.stringify(r));if(['blocked','error'].includes(r.status)){process.exitCode=1;break;}if(!options['--watch']||stop.signal.aborted)break;await new Promise(resolve=>{const done=()=>{clearTimeout(timer);stop.signal.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,config.pollSeconds*1000);stop.signal.addEventListener('abort',done,{once:true});});}while(!stop.signal.aborted);}finally{provider.destroy();process.removeListener('SIGINT',halt);process.removeListener('SIGTERM',halt);}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
