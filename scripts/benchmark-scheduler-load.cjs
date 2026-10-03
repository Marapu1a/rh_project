// Local synthetic load: the shared scheduler + real Pons journal/gas modules.
// This is NOT runPonsAutomation, BUY admission, public RPC or production RNG.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {withState}=require('./local-scheduler-state.cjs'),{runScheduler}=require('./local-promo-scheduler.cjs');
const {withTransactionBoundary,sendLocalTransaction}=require('./local-receipt.cjs');
const {createBoundary,reconcilePending}=require('./pons-transaction-journal.cjs'),{createGasBudget}=require('./pons-gas-budget.cjs');
const {hash}=require('./direct-buy.cjs'),cache=require('./verified-draw-cache.cjs');
const json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n';
const clear=p=>{for(const k of ['SHORT','MONTHLY'])cache.clear(p,k);};
async function boundedPass({provider,signer,contracts,config,statePath,signal,onStep=()=>{}}){
 assert.equal(config.schema,'synthetic-scheduler-load-v1');assert.equal((await provider.getNetwork()).chainId,31337n);
 const url=new URL(config.rpcUrl);assert.equal(url.protocol,'http:');assert(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
 assert.equal((await provider.send('hardhat_metadata',[])).instanceId,config.instanceId);assert.equal(await signer.getAddress(),config.sender);
 assert.equal(signer.provider,provider);assert([2,8,32].includes(config.limit));
 const {short,monthly,vault}=contracts;
 return withState(statePath,config,async(state,save)=>{
  const steps=[],notifications=[],gas=createGasBudget({provider,sender:config.sender,maxGasLimit:'3000000',state,save,notifications});
  const unresolved=await reconcilePending(state,save,provider,config.sender);assert(!unresolved,json(unresolved));
  if(state.lastResolved)assert.equal((await provider.getBlock(state.lastResolved.blockNumber)).hash,state.lastResolved.blockHash);
  const wait=reason=>{throw Object.assign(Error(reason),{code:'LOCAL_BUDGET_WAIT',workerWait:reason,budget:{reason}});};
  const guard=async(request,action)=>{
   if(signal?.aborted)wait('stopped');if(steps.length>=config.limit)wait('transactionLimit');
   assert(!state.pending);assert.equal((await provider.send('hardhat_metadata',[])).instanceId,config.instanceId);
   if(await provider.getTransactionCount(config.sender,'pending')>await provider.getTransactionCount(config.sender,'latest'))wait('pendingNonce');
   const price=(await provider.getFeeData()).gasPrice;if(price===null||price>10n**10n)wait('gasPrice');
   await gas.check(request,action,price);
  };
  const boundary={...createBoundary({state,save,provider,sender:config.sender,guard,onConfirmed:async s=>{
   const step={action:s.action,transactionHash:s.transactionHash,nonce:s.nonce,blockNumber:s.blockNumber};steps.push(step);await onStep(step);
  }}),gasLimit:gas.gasLimit,estimateFailed:gas.estimateFailed};
  try{return await withTransactionBoundary(boundary,async()=>{
   const scheduler=await runScheduler({provider,short,monthly,publisher:signer,executor:signer,config:config.scheduler,rpcUrl:config.rpcUrl,statePath:statePath+'.scheduler',signal,allowNewJobs:false,obligationsOnly:true},{maxTicks:16});
   assert(!state.pending,'Unresolved send');assert(!['error','blocked'].includes(scheduler.status),json(scheduler));
   if(signal?.aborted||scheduler.status==='stopped')return {status:'stopped',steps,scheduler};
   // Bounded fixture payout loop. Pons' event scanner/funding/RNG loop is not measured here.
   for(const kind of ['SHORT','MONTHLY']){
    const id=config.draws[kind],s=kind==='SHORT';const state=await (s?short.settlements(id):monthly.month(id));
    if(state.phase!==(s?3n:5n))continue;
    const winners=s?Array.from((await short.shortResult(id)).winners):[state.winner];
    for(const winner of new Set(winners.filter(w=>w!==ethers.ZeroAddress)))if(await vault.reward(id,winner)>0n){
     const price=(await provider.getFeeData()).gasPrice;
     await sendLocalTransaction(vault.connect(signer).claim,[id,winner],{type:2,maxFeePerGas:price,maxPriorityFeePerGas:0},{});
    }
   }
   return {status:'waiting',steps,scheduler};
  });}catch(e){if(e.code==='LOCAL_BUDGET_WAIT'&&!state.pending)return {status:signal?.aborted?'stopped':'waiting',reason:e.message,steps};throw e;}
 });
}
async function measured(options){
 const counts={},originals={},p=options.provider;
 for(const k of ['call','getTransaction','getLogs','getCode','getBlock']){originals[k]=p[k];counts[k]=0;p[k]=function(...a){counts[k]++;return originals[k].apply(this,a);};}
 const rename=fs.renameSync,writes={};fs.renameSync=function(from,to){if(to.startsWith(options.statePath))writes[path.basename(to)]=(writes[path.basename(to)]||0)+1;return rename.apply(this,arguments);};
 const start=performance.now();let result;
 try{result=await boundedPass(options);}finally{fs.renameSync=rename;for(const k of Object.keys(originals))p[k]=originals[k];}
 return {ms:performance.now()-start,counts,writes,result,rss:process.memoryUsage().rss};
}
async function child(file){
 const {config,statePath,historyFault}=JSON.parse(fs.readFileSync(file)),provider=new ethers.JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1});
 try{
  const c=require('./compile.cjs').compile(),contract=(name,a)=>new ethers.Contract(a,c[name].abi,provider),l=config.scheduler.lifecycle;
  const contracts={short:contract('LocalShortController',l.source),monthly:contract('LocalMonthlyController',l.monthlySource),vault:contract('DualControllerPromoVault',l.vault)};
  const options={provider,signer:new ethers.JsonRpcSigner(provider,config.sender),contracts,config,statePath};
  if(historyFault){
   let transactionReads=0;const hits=[],sends=[],originalTx=provider.getTransaction.bind(provider),originalLogs=provider.getLogs.bind(provider),originalSend=provider.send.bind(provider);
   const hashes=new Set(historyFault.hashes.map(h=>h.toLowerCase())),addresses=new Set([l.source,l.monthlySource].map(a=>a.toLowerCase()));
   provider.send=async(method,params)=>{if(['eth_sendTransaction','eth_sendRawTransaction'].includes(method))sends.push(method);return originalSend(method,params);};
   provider.getTransaction=async h=>{
    transactionReads++;
    if(historyFault.mode!=='logs-empty'&&hashes.has(h.toLowerCase())){
     hits.push({method:'getTransaction',hash:h});
     if(historyFault.mode==='tx-null')return null;
     if(historyFault.mode==='tx-error')throw Object.assign(Error('Injected historical transaction unavailable'),{code:'SERVER_ERROR'});
     if(historyFault.mode==='tx-corrupt'){const tx=await originalTx(h);return {...tx,data:'0xdeadbeef'};}
     throw Error('Unknown history fault');
    }
    return originalTx(h);
   };
   provider.getLogs=async filter=>{
    if(historyFault.mode==='logs-empty'&&addresses.has(String(filter.address).toLowerCase())){hits.push({method:'getLogs'});return [];}
    return originalLogs(filter);
   };
   const start=performance.now();let error;
   try{await measured(options);}catch(e){error=e.message;}
   assert(error,'Unavailable history must prevent successful pass');assert(hits.length,'Fault was not exercised');assert.equal(sends.length,0,'No broadcast during history outage');
   const expectedErrors={'tx-error':/Injected historical transaction unavailable/,'tx-null':/Publication transaction unavailable/,'logs-empty':/Published participants differ from replay/,'tx-corrupt':/Unsupported publication transport/};
   assert.match(error,expectedErrors[historyFault.mode]);
   console.log(json({mode:historyFault.mode,transactionReads,ms:performance.now()-start,hits,sends,error:error.slice(0,2000)}));
  }else console.log(json(await measured(options)));
 }finally{provider.destroy();}
}
async function main(){
 const historyOutage=process.argv.includes('--history-outage');
 const n=Number(process.argv[2]||10000);assert([100,10000].includes(n));
 const root=path.resolve('.local/logs');fs.mkdirSync(root,{recursive:true});const out=fs.mkdtempSync(path.join(root,'scheduler-load-'+n+'-'));
 const report={schema:'joint-scheduler-load-v1',n,status:'RUNNING',startedAt:new Date().toISOString(),scope:'Synthetic local chain31337, common scheduler and Pons journal/gas modules; mock RNG/USDG; not the outer Pons coordinator or BUY pipeline.',profiles:[],passes:[],historyOutage:historyOutage?[]:undefined};
 const save=()=>fs.writeFileSync(path.join(out,'report.json'),json(report));save();console.log('REPORT '+out);
 const cleanups=[];let f;
 try{
  const mo=require('./monthly-outcome.cjs'),sd=require('./short-dataset.cjs'),md=require('./monthly-dataset.cjs'),sw=require('./local-short-executor.cjs'),mw=require('./local-monthly-executor.cjs');
  const {normalRules}=require('../test/fixtures/short-outcome.cjs'),{rpc,sent,advance}=require('../test/fixtures/local-controllers.cjs');
  f=await require('../test/fixtures/local-scheduler.cjs').setup({after:fn=>cleanups.push(fn)},require('./compile.cjs').compile(),{monthlyRules:mo.RULES,weights:[7,5,4,3,2,2,1,1,1,1]});
  const {provider,admin:signer,short,monthly,vault,quote}=f,contracts={short,monthly,vault};
  const scheduler={...f.config,chunkSize:64,shortBudget:'1000'},domain=require('./attempt-lifecycle.cjs').domainFor(scheduler.manifest,scheduler.lifecycle);
  const ps=Array.from({length:n},(_,i)=>({wallet:ethers.id('scheduler load participant '+i).slice(0,42),firstAttempt:'1',lastAttempt:String(i%20+1),count:String(i%20+1)})).sort((a,b)=>a.wallet.localeCompare(b.wallet));
  const attempts=ps.reduce((a,p)=>a+BigInt(p.count),0n),jobs={},draws={},publications={SHORT:[],MONTHLY:[]};report.attempts=attempts;report.chunks=Math.ceil(n/64);
  await advance(30*86400+1);const setupStart=performance.now();
  for(const kind of ['SHORT','MONTHLY']){
   const s=kind==='SHORT',c=s?short:monthly,b=await provider.getBlock('latest'),id=require('./draw-id.cjs').drawIdFor(kind,ethers.id('scheduler load '+n+kind)),pid=ethers.id('load proposal '+kind);
   const policy=await c[s?'shortEpochPolicy':'monthlyEpochPolicy'](1);
   const snapshot={schema:'attempt-snapshot-v4',domain,kind,drawId:id,rulesEpoch:'1',cutoff:{blockNumber:b.number,blockHash:b.hash},rulesHash:policy.hash,participants:ps};
   const request=s?{drawId:id,campaignId:1,rulesEpoch:1,cutoffBlockNumber:b.number,cutoffBlockHash:b.hash,snapshotHash:hash(snapshot),expectedRoot:sd.rootFor(ps),expectedCount:n,expectedAttempts:String(attempts),budget:'1000'}:
    {drawId:id,campaign:1,rulesEpoch:1,cutoff:b.number,cutoffHash:b.hash,snapshotHash:hash(snapshot),root:md.rootFor(ps),count:n,attempts:String(attempts)};
   const artifact={schema:s?'short-dataset-artifact-v1':'monthly-dataset-artifact-v1',snapshot,request,rules:s?normalRules:mo.RULES,...(s?{weights:[7,5,4,3,2,2,1,1,1,1],minimumUnit:1}:{})};
   const job=s?sw.makeJob(artifact,pid):mw.makeMonthlyJob(artifact);jobs[kind]=[{started:true,job}];draws[kind]=id;
   await sent(s?c.begin(pid,request):c.beginMonth(request));
   for(let i=0;i<n;i+=64){const receipt=await sent(s?c.publish(pid,ps.slice(i,i+64)):c.publishMonth(id,ps.slice(i,i+64)));publications[kind].push(receipt.hash);}
   await sent(s?c.seal(pid):c.sealMonth(id));
   await sent(f.random.deliver(await c.drawRequest(id),ethers.id('fixed scheduler load seed')));console.log('PREPARED '+kind);
  }
  report.preparationMs=performance.now()-setupStart;
  const accounting=async()=>{const parts=await Promise.all([vault.freeShort(),vault.freeCurrent(),vault.freeNext(),vault.reserved(quote.target),vault.claimable(quote.target),vault.unrecognizedUSDG()]);const balance=await quote.balanceOf(vault.target);assert.equal(parts.reduce((a,b)=>a+b,0n),balance);return {balance,parts};};
  const progress=async()=>({SHORT:String((await short.settlements(draws.SHORT)).nextChunk),MONTHLY:String((await monthly.month(draws.MONTHLY)).nextChunk)});
  const base={schema:'synthetic-scheduler-load-v1',scheduler,draws,rpcUrl:f.options.rpcUrl,sender:await signer.getAddress(),instanceId:(await rpc('hardhat_metadata')).instanceId};
  const init=async(prefix)=>withState(prefix+'.scheduler',scheduler,async(state,write)=>{state.jobs=structuredClone(jobs);write(state);});
  report.before=await accounting();
  // Cold, one-pass limit probes on identical chain state; no conclusion about steady-state speed.
  for(const limit of (historyOutage?[]:[2,8,32])){
   const snapshot=await rpc('evm_snapshot'),statePath=path.join(out,'probe-'+limit+'.json');await init(statePath);clear(provider);
   try{const row=await measured({provider,signer,contracts,config:{...base,limit},statePath});report.profiles.push({limit,...row,progress:await progress()});assert(row.result.steps.length>0&&row.result.steps.length<=limit);if(n===10000)assert.equal(row.result.steps.length,limit);save();}
   finally{assert(await rpc('evm_revert',[snapshot]));clear(provider);}
  }
  const config={...base,limit:8},statePath=path.join(out,'automation.json');await init(statePath);
  const options={provider,signer,contracts,config,statePath},configFile=path.join(out,'config.json');fs.writeFileSync(configFile,json({config,statePath}));
  report.schedulerBytes=fs.statSync(statePath+'.scheduler').size;report.startNonce=await provider.getTransactionCount(config.sender);
  let stopped=false;const backup={main:null,scheduler:null};
  for(let i=0;i<Math.ceil(n/64)*2+20;i++){
   let row;
   if(!stopped&&i===(n===100?(historyOutage?0:1):3)){
    const stop=new AbortController();row=await measured({...options,signal:stop.signal,onStep:()=>stop.abort()});
    assert.equal(row.result.status,'stopped');assert.equal(row.result.steps.length,1);report.passes.push({...row,progress:await progress(),stage:'stop'});
    const nonce=await provider.getTransactionCount(config.sender),at=await progress(),funds=await accounting();
    const paused=await measured({...options,signal:stop.signal});assert.equal(paused.result.steps.length,0);assert.equal(paused.result.status,'stopped');
    assert.equal(await provider.getTransactionCount(config.sender),nonce);assert.deepEqual(await progress(),at);assert.deepEqual(await accounting(),funds);
    report.pause={...paused,progress:at,accounting:funds};clear(provider);
    backup.main=fs.readFileSync(statePath);backup.scheduler=fs.readFileSync(statePath+'.scheduler');
    fs.writeFileSync(path.join(out,'early-main.json'),backup.main);fs.writeFileSync(path.join(out,'early-scheduler.json'),backup.scheduler);
    const exec=require('node:util').promisify(require('node:child_process').execFile),start=performance.now();
    if(historyOutage){
     assert.notEqual((await short.settlements(draws.SHORT)).phase,3n);assert.notEqual((await monthly.month(draws.MONTHLY)).phase,5n);
     for(const mode of ['tx-error','tx-null','logs-empty','tx-corrupt']){
      const faultFile=path.join(out,'fault-'+mode+'.json');
      // Missing last calldata exercises a partially read prefix; other faults fail early.
      const hashes=Object.values(publications).map(xs=>mode==='tx-null'?xs.at(-1):xs[0]);
      fs.writeFileSync(faultFile,json({config,statePath,historyFault:{mode,hashes}}));
      const failure=await exec(process.execPath,[__filename,'--pass',faultFile],{timeout:180000,maxBuffer:4*1024*1024});
      const evidence=JSON.parse(failure.stdout);assert.equal(evidence.sends.length,0);
      assert.equal(await provider.getTransactionCount(config.sender),nonce);assert.deepEqual(await progress(),at);assert.deepEqual(await accounting(),funds);
      assert.deepEqual(fs.readFileSync(statePath),backup.main);assert.deepEqual(fs.readFileSync(statePath+'.scheduler'),backup.scheduler);
      report.historyOutage.push({...evidence,nonce,progress:at,accounting:funds,journalsUnchanged:true});save();console.log('HISTORY BLOCKED '+mode);
     }
    }
    const healthyStart=performance.now();
    const childResult=await exec(process.execPath,[__filename,'--pass',configFile],{timeout:180000,maxBuffer:4*1024*1024});
    row=JSON.parse(childResult.stdout);row.childWallMs=performance.now()-healthyStart;row.restartSequenceMs=performance.now()-start;row.stage='fresh-process';stopped=true;
   }else row=await measured(options);
   assert(row.result.steps.length>0,'No progress before completion');report.passes.push({...row,progress:await progress()});save();
   console.log('PASS '+report.passes.length+' '+JSON.stringify(report.passes.at(-1).progress)+' '+Math.round(row.ms)+'ms');
   if((await short.settlements(draws.SHORT)).phase===3n&&(await monthly.month(draws.MONTHLY)).phase===5n&&await vault.claimable(quote.target)===0n)break;
  }
  assert(stopped);assert.equal((await short.settlements(draws.SHORT)).phase,3n);assert.equal((await monthly.month(draws.MONTHLY)).phase,5n);
  const sp=await short.datasetProposal(jobs.SHORT[0].job.proposalId),seed=(await short.settlements(draws.SHORT)).seed;
  const expectedShort=require('./short-settlement.cjs').compute(sp.context,seed,ps,normalRules,Array.from(await short.datasetBasket(jobs.SHORT[0].job.proposalId)));
  assert.equal((await short.shortResult(draws.SHORT)).resultHash,expectedShort.resultHash);
  const month=await monthly.month(draws.MONTHLY),expectedMonth=mo.expectedResult(month,jobs.MONTHLY[0].job.artifact);assert.equal(month.resultHash,expectedMonth.resultHash);
  report.expected={short:expectedShort,monthly:expectedMonth};
  const payouts=new Map();const credit=(w,a)=>{if(w!==ethers.ZeroAddress)payouts.set(w.toLowerCase(),(payouts.get(w.toLowerCase())||0n)+BigInt(a));};
  expectedShort.winners.forEach((w,i)=>credit(w,expectedShort.amounts[i]));credit(expectedMonth.winner,month.budget);
  report.payouts=[];for(const [wallet,amount]of payouts){const balance=await quote.balanceOf(wallet);assert.equal(balance,amount,'Winner balance must match independent models');report.payouts.push({wallet,amount,balance});}
  for(const [id,winners]of [[draws.SHORT,expectedShort.winners],[draws.MONTHLY,[expectedMonth.winner]]])for(const w of winners)if(w!==ethers.ZeroAddress)assert.equal(await vault.reward(id,w),0n);
  report.after=await accounting();assert.equal(report.after.parts[3],0n);assert.equal(report.after.parts[4],0n);
  assert.equal(report.before.balance-report.after.balance,[...payouts.values()].reduce((a,b)=>a+b,0n));
  const nonce=await provider.getTransactionCount(config.sender),steps=report.passes.flatMap(r=>r.result.steps);
  assert.equal(nonce-report.startNonce,steps.length);assert.equal(new Set(steps.map(s=>s.transactionHash)).size,steps.length);
  const idle=await measured(options);assert.equal(idle.result.steps.length,0);report.idle=idle;
  // Restore old files with the chain already paid. Preserve newer journals alongside them.
  for(const [suffix,data]of [['',backup.main],['.scheduler',backup.scheduler]]){fs.copyFileSync(statePath+suffix,statePath+suffix+'.completed');fs.writeFileSync(statePath+suffix,data);}
  clear(provider);report.restore=[];
  for(let i=0;i<2;i++){const r=await measured(options);assert.equal(r.result.steps.length,0);report.restore.push(r);}
  assert.equal(await provider.getTransactionCount(config.sender),nonce);assert.deepEqual(await accounting(),report.after);
  report.transactions=steps.length;report.executionMs=report.passes.reduce((a,p)=>a+p.ms,0);report.status='PASSED';
 }catch(e){report.status='FAILED';report.error=e.stack;throw e;}
 finally{report.finishedAt=new Date().toISOString();save();for(const fn of cleanups)await fn();f?.provider.destroy();}
 console.log('PASSED '+out);
}
if(require.main===module)(process.argv[2]==='--pass'?child(process.argv[3]):main()).catch(e=>{console.error(e);process.exitCode=1;});
