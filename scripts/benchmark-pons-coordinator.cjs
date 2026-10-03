// Test-only comparison on identical local fork state. No public transactions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {hash}=require('./direct-buy.cjs'),cache=require('./verified-draw-cache.cjs');
const {runPonsAutomation}=require('./pons-automation.cjs');
const json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v,2);
async function compare({options,cycle,shortId,monthId,rpc,directory,invariant}){
 const {provider}=options,{short,monthly,vault}=cycle;
 const output={schema:'pons-coordinator-comparison-v1',status:'RUNNING',runs:[],scope:'Real Pons coordinator, existing small BUY-derived frozen datasets, local fork, real drand. Not a high-cardinality or production throughput measurement.'};
 const file=path.join(directory,'coordinator-comparison.json'),save=()=>fs.writeFileSync(file,json(output));save();
 const clear=()=>{for(const k of ['SHORT','MONTHLY'])cache.clear(provider,k);};
 const baseline=await invariant(),baseNonce=await provider.getTransactionCount(options.config.executor);
 const source=JSON.parse(fs.readFileSync(options.statePath+'.scheduler'));
 output.participants=Object.fromEntries(['SHORT','MONTHLY'].map(k=>[k,source.jobs[k].filter(e=>e.job).map(e=>e.job.artifact.snapshot.participants.length)]));
 let expected;
 for(const limit of [2,8,32]){
  const snapshot=await rpc('evm_snapshot');clear();
  const dir=fs.mkdtempSync(path.join(path.resolve(directory),'limit-'+limit+'-'));
  const statePath=path.join(dir,'automation.json'),config={...options.config,maxTransactions:limit};
  // Isolated experimental journal identity changes ONLY the transaction budget.
  // Original journals stay intact; each run starts on the same chain snapshot.
  for(const suffix of ['', '.scheduler','.rng'])if(fs.existsSync(options.statePath+suffix)){
   const state=JSON.parse(fs.readFileSync(options.statePath+suffix));assert(!state.pending,'Quiescent benchmark required');
   const {checksum,...payload}=state;assert.equal(checksum,hash(payload),'Invalid source journal');
   if(!suffix){delete state.checksum;state.configHash=hash({config,rpcUrl:options.rpcUrl,sender:config.executor});state.checksum=hash(state);}
   fs.writeFileSync(statePath+suffix,json(state));
  }
  const run={limit,passes:[],directory:dir,baseline,baseNonce};output.runs.push(run);save();
  const o={...options,config,statePath,drain:true};
  async function pass(extra={},hooks={}){
   const counts={},originals={};for(const k of ['call','getTransaction','getLogs','getBlock','getCode']){
    originals[k]=provider[k];counts[k]=0;provider[k]=function(...args){counts[k]++;return originals[k].apply(this,args);};
   }
   const write=fs.writeFileSync,open=fs.openSync,close=fs.closeSync,sync=fs.fsyncSync,descriptors=new Map(),writesByFile={};let writes=0,bytes=0,writeMs=0,syncMs=0;
   const trackedPath=p=>typeof p==='string'&&p.startsWith(statePath)&&p.endsWith('.tmp');
   fs.openSync=function(p,...args){const fd=open.call(this,p,...args);if(trackedPath(p))descriptors.set(fd,p);return fd;};
   fs.closeSync=function(fd){try{return close.call(this,fd);}finally{descriptors.delete(fd);}};
   fs.fsyncSync=function(fd){const t=performance.now();try{return sync.call(this,fd);}finally{if(descriptors.has(fd))syncMs+=performance.now()-t;}};
   fs.writeFileSync=function(target,data,...rest){const tracked=descriptors.get(target)||(trackedPath(target)?target:null);const t=performance.now();try{return write.call(this,target,data,...rest);}finally{if(tracked){writes++;const label=path.basename(tracked);writesByFile[label]=(writesByFile[label]||0)+1;bytes+=Buffer.byteLength(data);writeMs+=performance.now()-t;}}};
   const start=performance.now();let r;
   try{r=await runPonsAutomation({...o,...extra},hooks);}
   finally{fs.writeFileSync=write;fs.openSync=open;fs.closeSync=close;fs.fsyncSync=sync;for(const k of Object.keys(originals))provider[k]=originals[k];}
   assert(!['error','blocked'].includes(r.status),json(r));assert(r.steps.length<=limit);
   run.passes.push({ms:performance.now()-start,counts,writes,writesByFile,bytes,writeMs,syncMs,result:r});save();return r;
  }
  try{
   // Stop immediately after one confirmed transaction, then resume from disk
   // with no publication proof retained in memory. This is not a process-kill test.
   const stop=new AbortController();const stopped=await pass({signal:stop.signal},{onStep:()=>stop.abort()});
   assert.equal(stopped.status,'stopped');assert.equal(stopped.steps.length,1);clear();
   const pausedNonce=await provider.getTransactionCount(config.executor),pausedBalance=await invariant();
   const paused=await pass({signal:stop.signal});assert.equal(paused.status,'stopped');assert.equal(paused.steps.length,0);
   assert.equal(await provider.getTransactionCount(config.executor),pausedNonce);assert.deepEqual(await invariant(),pausedBalance);
   for(let i=0;i<32;i++){
    await pass();
    if((await short.settlements(shortId)).phase===3n&&(await monthly.month(monthId)).phase===5n&&await vault.claimable(options.config.manifest.quote)===0n)break;
   }
   const s=await short.settlements(shortId),m=await monthly.month(monthId);
   assert.equal(s.phase,3n);assert.equal(m.phase,5n);assert.equal(await vault.reserved(config.manifest.quote),0n);
   assert.equal(await vault.claimable(config.manifest.quote),0n);
   run.final={accounting:await invariant(),shortHash:(await short.shortResult(shortId)).resultHash,monthlyHash:m.resultHash,nonce:await provider.getTransactionCount(config.executor)};
   const steps=run.passes.flatMap(p=>p.result.steps),hashes=steps.map(s=>s.transactionHash);
   assert(hashes.every(Boolean));assert.equal(new Set(hashes).size,hashes.length);assert.equal(run.final.nonce-baseNonce,steps.length);
   if(expected)assert.deepEqual(run.final,expected,'Budget changes affected outcome');else expected=run.final;
   const idle=await pass();assert.equal(idle.steps.length,0);assert.equal(await provider.getTransactionCount(config.executor),run.final.nonce);
   assert.deepEqual(await invariant(),run.final.accounting);
   run.sends=steps.length;run.activeMs=run.passes.reduce((n,p)=>n+p.ms,0);
   run.status='PASSED';save();console.log('COORDINATOR limit='+limit+' passes='+run.passes.length+' sends='+run.sends+' ms='+Math.round(run.activeMs));
  }catch(e){run.status='FAILED';run.error=e.stack;output.status='FAILED';save();throw e;}
  finally{assert(await rpc('evm_revert',[snapshot]));clear();}
  assert.deepEqual(await invariant(),baseline);assert.equal(await provider.getTransactionCount(config.executor),baseNonce);
 }
 output.status='PASSED';save();return output;
}
module.exports={compare};
