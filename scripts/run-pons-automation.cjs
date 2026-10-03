// No key argument. The selected fork's unlocked signer is used only after instance verification.
const fs=require('node:fs'),{ethers}=require('ethers'),{runPonsAutomation,validate}=require('./pons-automation.cjs');
const {transactionLimit,delayMs,pause}=require('./pons-cadence.cjs');
async function main(){
 const args=process.argv.slice(2),options={},flags=new Set(['--watch','--drain']);
 for(let i=0;i<args.length;i++){const key=args[i];if(!['--config','--state','--rpc','--max-transactions',...flags].includes(key)||options[key]!==undefined)throw Error('Unknown/duplicate argument');options[key]=flags.has(key)?true:args[++i];if(options[key]===undefined)throw Error('Missing argument value');}
 for(const k of ['--config','--state','--rpc'])if(typeof options[k]!=='string')throw Error('Required --config FILE --state FILE --rpc LOOPBACK_URL');
 const url=new URL(options['--rpc']);if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password)throw Error('Loopback HTTP only');
 const config=JSON.parse(fs.readFileSync(options['--config'],'utf8'));validate(config);
 const maxTransactions=transactionLimit(config,options['--max-transactions']===undefined?undefined:Number(options['--max-transactions']));
 const provider=new ethers.JsonRpcProvider(url.href,undefined,{cacheTimeout:-1}),executor=new ethers.JsonRpcSigner(provider,config.executor),stop=new AbortController();
 const halt=()=>stop.abort();process.once('SIGINT',halt);process.once('SIGTERM',halt);
 try{do{const started=Date.now();const r=await runPonsAutomation({provider,executor,config,maxTransactions,rpcUrl:url.href,statePath:options['--state'],signal:stop.signal,drain:!!options['--drain']});const elapsedMs=Date.now()-started,nextDelayMs=delayMs(r,config.pollSeconds);console.log(JSON.stringify({...r,elapsedMs,nextDelayMs,confirmedTransactions:r.steps.filter(s=>s.transactionHash&&s.status!==0).length}));if(['blocked','error'].includes(r.status)){process.exitCode=1;break;}if(!options['--watch']||stop.signal.aborted)break;await pause(nextDelayMs,stop.signal);}while(!stop.signal.aborted);}finally{provider.destroy();process.removeListener('SIGINT',halt);process.removeListener('SIGTERM',halt);}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
