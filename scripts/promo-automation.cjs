const network=require('./runtime-network.cjs'),refill=require('./promo-native-refill.cjs');
// Local Short/Monthly automation. One process owns this signer and all four state files.
const path=require('node:path'),{ethers}=require('ethers');
const {withState}=require('./local-scheduler-state.cjs');
const {withTransactionBoundary,sendLocalTransaction,receiptOptions}=require('./local-receipt.cjs');
const funding=require('./infinity-worker.cjs'),rng=require('./drand-delivery-worker.cjs');
const {runScheduler,validateConfig}=require('./local-promo-scheduler.cjs');
const {verifyDualBindings}=require('./dual-bindings.cjs');
const {transactionCost}=require('./local-execution-budget.cjs');
const {retryableRead}=require('./local-rpc-watch.cjs');
const ACTIONS=['pull','pay','prove','deliver','begin','publish','seal','processShort','finishShort','closeEmpty','claim'];
const MONTHLY_ACTIONS=['beginMonth','publishMonth','sealMonth','processMonth','finishMonth'];
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase(),zero=ethers.ZeroHash;
const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalize(x)])):typeof v==='string'&&/^0x[0-9a-fA-F]+$/.test(v)?v.toLowerCase():v;
function validateOps(o){
 check((network.isRobinhood()?[network.schema('local-promo-automation-v1')]:['local-short-automation-v1','local-promo-automation-v1']).includes(o?.schema),'Explicit automation profile required');
 for(const k of ['maxGasPrice','reserveGasPrice','nativeFloor','extraFeePerTx'])check(typeof o[k]==='string'&&/^(0|[1-9][0-9]*)$/.test(o[k]),'Invalid '+k);
 check(BigInt(o.maxGasPrice)>0n&&BigInt(o.reserveGasPrice)>=BigInt(o.maxGasPrice),'Invalid gas prices');
 check(Number.isInteger(o.safetyBps)&&o.safetyBps>=10000&&o.safetyBps<=30000,'Invalid safety factor');
 for(const [k,max]of [['maxTransactions',128],['maxClaims',64],['scanBlocks',2000],['pollSeconds',86400]])check(Number.isInteger(o[k])&&o[k]>0&&o[k]<=max,'Invalid '+k);
 for(const a of [...ACTIONS,...(o.schema===network.schema('local-promo-automation-v1')?MONTHLY_ACTIONS:[])])check(typeof o.gasUnits?.[a]==='string'&&/^[1-9][0-9]*$/.test(o.gasUnits[a]),'Missing gas bound '+a);
 return o;
}
function validateBudgetCompatibility(ops,fundingJob,deliveryJob){
 for(const [name,job,actions]of [['fundingJob',fundingJob,['pull','pay']],['deliveryJob',deliveryJob,['prove','deliver']]]){
  check(BigInt(ops.nativeFloor)>=BigInt(job.nativeFloor),'ops.nativeFloor must cover '+name+'.nativeFloor');
  for(const action of actions)check(BigInt(ops.gasUnits[action])>=BigInt(job.gasUnits[action]),'ops.gasUnits.'+action+' must cover '+name+'.gasUnits.'+action);
 }
}
async function prepareRuntime({provider,executor,collector,adapter,vault,short,monthly,fundingJob,deliveryJob,schedulerConfig,rpcUrl,statePath,ops,deploymentProfile,nativeRefill,receiptTimeoutMs=30000,deferContractChecks=false}){
 ops=JSON.parse(JSON.stringify(validateOps(ops)));funding.validateJob(fundingJob);rng.validateJob(deliveryJob);receiptOptions(receiptTimeoutMs);
 validateBudgetCompatibility(ops,fundingJob,deliveryJob);
 if(schedulerConfig.cutoffMode==='FINALIZED_CHECKPOINT')check(typeof ops.gasUnits?.checkpointCutoff==='string'&&/^[1-9][0-9]*$/.test(ops.gasUnits.checkpointCutoff),'Missing gas bound checkpointCutoff');
 if(deploymentProfile)require('./deployment-admission.cjs').validateDeploymentProfile(deploymentProfile,{fundingJob,deliveryJob,schedulerConfig});
 const dual=ops.schema===network.schema('local-promo-automation-v1');
 const domain=validateConfig(schedulerConfig,rpcUrl),sender=await executor.getAddress();
 if(deploymentProfile)check(same(deploymentProfile.executor,sender),'Deployment profile signer mismatch');
 check(executor.provider===provider,'Signer/provider required');network.checkChain((await provider.getNetwork()).chainId);
 for(const c of [collector,adapter,vault,short,monthly])check(c.runner===provider||c.runner?.provider===provider,'Contract/provider mismatch');
 check(same(short.target,domain.source)&&same(monthly.target,domain.monthlySource)&&same(vault.target,domain.vault),'Draw bindings mismatch');
 check(same(collector.target,fundingJob.collector)&&same(fundingJob.promo,vault.target)&&same(fundingJob.token,schedulerConfig.manifest.token)&&same(fundingJob.quote,schedulerConfig.manifest.quote),'Funding bindings mismatch');
 check(same(adapter.target,deliveryJob.adapter)&&same(deliveryJob.short,short.target)&&same(deliveryJob.monthly,monthly.target),'RNG bindings mismatch');
 if(!deferContractChecks){
 check(same(await short.publisher(),sender),'Signer must be Short publisher');
 if(dual)check(same(await monthly.publisher(),sender),'Signer must be Monthly publisher');
 await verifyDualBindings(provider,domain);
 check(same(await short.randomProvider(),adapter.target)&&same(await monthly.randomProvider(),adapter.target),'Provider mismatch');
 for(const [k,c]of [['adapter',adapter],['short',short],['monthly',monthly]])check(same(ethers.keccak256(await provider.getCode(c.target)),deliveryJob[k+'CodeHash']),'Runtime mismatch '+k);
 check(await adapter.PROFILE()===require('./drand-preflight.cjs').PROFILE,'Unsupported RNG');
 }
 refill.validate(nativeRefill,sender,[collector.target,adapter.target,vault.target,short.target,monthly.target,fundingJob.source,fundingJob.token,fundingJob.quote,domain.registry].filter(Boolean),fundingJob.recipients);
 const files={main:path.resolve(statePath),funding:path.resolve(statePath)+'.funding',rng:path.resolve(statePath)+'.rng',scheduler:path.resolve(statePath)+'.scheduler'};
 const identity=normalize({schema:ops.schema,sender,fundingJob,deliveryJob,schedulerConfig,rpcUrl:network.rpcIdentity(rpcUrl),ops,files,...(nativeRefill?{nativeRefill}:{}),...(deploymentProfile?{deploymentProfile}: {})});
 return {ops,dual,domain,sender,files,identity};
}
async function runPromoAutomation({provider,executor,collector,adapter,vault,short,monthly,fundingJob,deliveryJob,schedulerConfig,rpcUrl,statePath,ops,deploymentProfile,nativeRefill,refillSigner,signal,drain=false,receiptTimeoutMs=30000},{getBeacon,onStep=()=>{}}={}){
 const prepared=await prepareRuntime({provider,executor,collector,adapter,vault,short,monthly,fundingJob,deliveryJob,schedulerConfig,rpcUrl,statePath,ops,deploymentProfile,nativeRefill,receiptTimeoutMs,deferContractChecks:network.isRobinhood()});
 const {dual,domain,sender,files,identity}=prepared;ops=prepared.ops;
 return withState(files.main,identity,async(state,save)=>{
  if(state.handoff)return {status:'blocked',reason:'runtimeRetired',successor:state.handoff.target};
  const isolated=network.isRobinhood();if(isolated)check(deploymentProfile?.scope==='public-launch','Public profile required');
  let obligationsOnly=isolated&&drain,refillAttempted=false;
  const results={},steps=[];let sentCount=0,claimsTried=0,discoveryReady=false,lane='startup';const attempted=new Set();
  const result=(status,reason,extra={})=>({status,...(reason?{reason}:{}),results,steps,queued:state.payouts?.length||0,...extra});
  const blocked=reason=>result('blocked',reason,{requiresReconciliation:true,pending:state.pending});
  const wait=reason=>{throw Object.assign(Error(reason),{code:'LOCAL_BUDGET_WAIT',workerWait:reason,budget:{reason}});};
  const fOptions={provider,collector,executor,job:fundingJob,statePath:files.funding,signal,receiptTimeoutMs};
  const rOptions={provider,adapter,executor,job:deliveryJob,statePath:files.rng,signal,receiptTimeoutMs,kinds:dual?['short','monthly']:['short']};
  const sOptions={provider,short,monthly,publisher:executor,executor,config:schedulerConfig,rpcUrl,statePath:files.scheduler,signal,receiptTimeoutMs,kinds:dual?['SHORT','MONTHLY']:['SHORT'],prioritizeStarted:true};
  async function resolved(){
   const p=state.pending;if(!p)return null;if(p.worker==='promoNativeRefill'){const r=await refill.reconcile({provider,state,save});results.refill=r;return r.status==='blocked'?blocked(r.reason):null;}if(!p.transactionHash)return blocked('unknownHash');
   const receipt=await provider.getTransactionReceipt(p.transactionHash);if(!receipt)return blocked('pendingReceipt');
   const b=await provider.getBlock(receipt.blockNumber),tx=await provider.getTransaction(p.transactionHash);
   if(!b||!same(b.hash,receipt.blockHash)||!same(receipt.hash,p.transactionHash)||![0,1].includes(receipt.status)||!tx||!same(tx.hash,p.transactionHash)||!same(tx.from,sender)||!same(tx.to,p.target)||!same(tx.data,p.data)||tx.nonce!==p.nonce)return blocked('unconfirmedReceipt');
   state.lastResolved={...p,status:receipt.status,blockHash:receipt.blockHash};delete state.pending;save(state);return null;
  }
  async function recoveryCheck(){
   const r=await require('./obligation-admission.cjs').inspectObligations(provider,deploymentProfile,{fundingJob,deliveryJob,schedulerConfig});
   state.lastObligationAdmission=r;save(state);return r;
  }
  async function fullCheck(){
   const r=network.executionAdmission(await require('./deployment-admission.cjs').inspectDeployment(provider,deploymentProfile,{fundingJob,deliveryJob,schedulerConfig}));
   if(r.detail)r.detail='Deployment observation unavailable; verify endpoint and pins';
   if(r.status==='matched'){
    try{await new ethers.Contract(collector.target,['function sync()'],provider).sync.staticCall();}
    catch(e){r.status='blocked';r.reasons.push('sourceHealthUnavailable');r.retryableRpcRead=retryableRead(e);}
   }
   state.lastDeploymentAdmission=r;save(state);return r;
  }
  async function guard(request,action,commit=false){
   if(signal?.aborted)throw Object.assign(Error('Stopped'),{code:'LOCAL_EXECUTION_STOPPED'});
   check([...ACTIONS,...(dual?MONTHLY_ACTIONS:[]),...(schedulerConfig.cutoffMode==='FINALIZED_CHECKPOINT'?['checkpointCutoff']:[])].includes(action),'Unbudgeted operation');
   const target=['pull','pay'].includes(action)?collector:['prove','deliver'].includes(action)?adapter:action==='claim'?vault:(MONTHLY_ACTIONS.includes(action)||(dual&&['closeEmpty','checkpointCutoff'].includes(action)&&same(request.to,monthly.target)))?monthly:short;
   check(same(request.to,target.target)&&target.interface.parseTransaction({data:request.data}).name===action,'Unexpected transaction target/action');
   check(!request.from||same(request.from,sender),'Unexpected transaction sender');
   if(isolated){
    const admission=await recoveryCheck();if(admission.status!=='matched')wait(admission.retryableRpcRead?'rpcUnavailable':'obligationAdmission');
    if(!require('./obligation-admission.cjs').OBLIGATION_ACTIONS.has(action)){
     if(drain||obligationsOnly)wait('obligationsOnly');
     const full=await fullCheck();if(full.status!=='matched'){obligationsOnly=true;if(results.admission)results.admission={...results.admission,mode:'obligations-only',full};wait('deploymentAdmission');}
    }
   }

   if(sentCount>=ops.maxTransactions)wait('transactionLimit');
   const head=await provider.getBlock('latest'),price=(await provider.getFeeData()).gasPrice;
   if(price==null||price>BigInt(ops.maxGasPrice)||BigInt(request.maxFeePerGas??price)>BigInt(ops.maxGasPrice))wait('gasPrice');
   const bound=BigInt(ops.gasUnits[action]),units=BigInt(request.gasLimit??bound);
   if(units>bound||bound>head.gasLimit)wait('actionGasBound');
   if(await provider.getTransactionCount(sender,'pending')>await provider.getTransactionCount(sender,'latest'))wait('pendingSigner');
   let required=transactionCost(ops,units)+BigInt(ops.nativeFloor);
   if(deploymentProfile&&['checkpointCutoff','begin','beginMonth','seal','sealMonth'].includes(action)){
    const admission=network.executionAdmission(await require('./deployment-admission.cjs').inspectDeployment(provider,deploymentProfile,{fundingJob,deliveryJob,schedulerConfig}));
    state.lastDeploymentAdmission=admission;save(state);if(admission.status!=='matched')wait('deploymentAdmission');
   }
   if(action==='seal'||action==='sealMonth'){
    if(!discoveryReady)wait('payoutDiscovery');
    const id=target.interface.parseTransaction({data:request.data}).args[0];
    required+=await remaining(action==='seal'?'SHORT':'MONTHLY',id,true,head);
    // A second freeze must not spend the gas already needed by either pending draw.
    for(const [kind,c,method] of [['SHORT',short,'pendingDatasetDraw'],...(dual?[['MONTHLY',monthly,'pendingMonth']]:[])]){
     const pending=await c[method]();if(pending!==zero)required+=await remaining(kind,pending,false,head);
    }
    required+=BigInt((state.payouts||[]).reduce((n,p)=>n+p.winners.length,0))*transactionCost(ops,ops.gasUnits.claim);
   }
   let committed=BigInt(ops.nativeFloor);
   if(nativeRefill){
    for(const [kind,c,method]of [['SHORT',short,'pendingDatasetDraw'],...(dual?[['MONTHLY',monthly,'pendingMonth']]:[])]){
     const pending=await c[method]();if(pending!==zero)committed+=await remaining(kind,pending,false,head);
    }
    committed+=BigInt((state.payouts||[]).reduce((n,p)=>n+p.winners.length,0))*transactionCost(ops,ops.gasUnits.claim);
    if(!require('./obligation-admission.cjs').OBLIGATION_ACTIONS.has(action)&&!['seal','sealMonth'].includes(action))required+=committed-BigInt(ops.nativeFloor);
   }
   state.lastBudget={action,required:String(required),balance:String(await provider.getBalance(sender)),reserveGasPrice:ops.reserveGasPrice};
   if(BigInt(state.lastBudget.balance)<required){
    if(nativeRefill&&!refillAttempted){
     if(!discoveryReady)wait('payoutDiscovery');
     const balance=BigInt(state.lastBudget.balance),need=committed>balance?committed:required;
     refillAttempted=true;
     results.refill=await refill.execute({provider,signer:refillSigner,config:nativeRefill,sender,ops,required:need,state,save,signal,receiptTimeoutMs});
     if(results.refill.status==='confirmed'){sentCount++;const step={action:'transferNative',...results.refill};steps.push(step);await onStep(step);return guard(request,action,commit);}
     if(signal?.aborted)throw Object.assign(Error('Stopped'),{code:'LOCAL_EXECUTION_STOPPED'});
     if(state.pending)wait('pendingRefill');
    }
    wait('nativeFunding');
   }
   if(!same((await provider.getBlock(head.number))?.hash,head.hash))wait('chainChanged');
   if(commit&&deploymentProfile&&(action==='seal'||action==='sealMonth')){
    const timing=await require('./drand-preflight.cjs').drandPreflight(provider,target);state.lastTimingAdmission=timing;save(state);
    if(timing?.status!=='observedHealthy')wait('deploymentTiming');
   }
   if(commit)sentCount++;
  }
  async function remaining(kind,id,fresh,head){
   const counts={prove:0n,deliver:0n,claim:0n};let waiting;
   if(kind==='SHORT'){
    const st=fresh?null:await short.settlements(id),pid=fresh?id:st.proposalId;
    const proposal=await short.datasetProposal(pid),policy=await short.shortEpochPolicy(proposal.request.rulesEpoch);
    counts.processShort=await short.datasetChunkCount(pid)-(st?.nextChunk??0n);counts.finishShort=1n;counts.claim=BigInt(policy.weights.length);
    waiting=fresh||st.phase===1n;
   }else{
    const m=await monthly.month(id);counts.processMonth=await monthly.monthChunkCount(id)-m.nextChunk;counts.finishMonth=1n;counts.claim=1n;waiting=fresh||m.phase===3n;
   }
   // Conservatively reserve both operations while waiting for seed, including already proven requests.
   if(waiting){counts.prove=1n;counts.deliver=1n;}
   let total=0n;for(const [a,n] of Object.entries(counts)){if(!n)continue;if(BigInt(ops.gasUnits[a])>head.gasLimit)wait('blockGasBound');total+=n*transactionCost(ops,ops.gasUnits[a]);}return total;
  }
  async function terminal(kind,id){
   if(kind==='MONTHLY'){const m=await monthly.month(id);check(m.phase===5n,'Monthly result not terminal');return {resultHash:m.resultHash,winners:[m.winner]};}
   check((await short.settlements(id)).phase===3n,'Short result not terminal');return short.shortResult(id);
  }
  const boundary={preflight:guard,before:async(request,action)=>{
   await guard(request,action,true);check(!state.pending,'Unresolved intent');
   state.pending={lane,action,target:request.to,data:request.data,from:sender,stage:'broadcast'};save(state);
  },sent:async tx=>{state.pending={...state.pending,transactionHash:tx.hash,nonce:tx.nonce,stage:'confirm'};save(state);},confirmed:async receipt=>{
   check(same(receipt.hash,state.pending?.transactionHash),'Receipt mismatch');check(same((await provider.getBlock(receipt.blockNumber))?.hash,receipt.blockHash),'Receipt not canonical');
   const step={...state.pending,status:receipt.status,blockHash:receipt.blockHash};state.lastResolved=step;delete state.pending;save(state);steps.push(step);await onStep(step);
  }};
  async function discover(){
   const head=await provider.getBlock('latest');state.payouts??=[];let ready=true;
   for(const [kind,c,key] of [['SHORT',short,'payoutCursor'],...(dual?[['MONTHLY',monthly,'monthlyPayoutCursor']]:[])]){
    const cursor=state[key];if(cursor)check(same((await provider.getBlock(cursor.number))?.hash,cursor.hash),'Payout cursor reorg; reconcile before continuing');
    const first=await c[kind==='SHORT'?'shortEpochPolicy':'monthlyEpochPolicy'](1);
    const from=cursor?cursor.number+1:Number(first.firstBlock);if(from>head.number)continue;
    const to=Math.min(head.number,from+ops.scanBlocks-1),end=await provider.getBlock(to);
    const events=await c.queryFilter(c.filters.AttemptsConsumed(null,kind==='SHORT'?0:1),from,to);
    for(const event of events){
     check(same((await provider.getBlock(event.blockNumber))?.hash,event.blockHash),'Noncanonical terminal event');
     const drawId=event.args.drawId,r=await terminal(kind,drawId);check(same(r.resultHash,event.args.resultHash),'Terminal result mismatch');
     if(!state.payouts.some(p=>(p.kind||'SHORT')===kind&&p.drawId===drawId))state.payouts.push({kind,drawId,resultHash:r.resultHash,blockNumber:event.blockNumber,blockHash:event.blockHash,winners:[...new Set(Array.from(r.winners,w=>w.toLowerCase()).filter(w=>w!==ethers.ZeroAddress))]});
    }
    check(same((await provider.getBlock(to))?.hash,end.hash),'Payout scan changed');state[key]={number:to,hash:end.hash};save(state);ready&&=to===head.number;
   }
   return discoveryReady=ready;
  }
  async function payouts(){
   const queue=state.payouts||[];if(!queue.length)return;
   // Rotate failed recipients instead of letting one permanent revert starve later claims.
   const candidates=queue.flatMap(p=>p.winners.map(winner=>({p,winner}))),start=(state.claimCursor||0)%Math.max(1,candidates.length);
   for(let i=0;i<candidates.length&&claimsTried<ops.maxClaims;i++){
    const {p,winner}=candidates[(start+i)%candidates.length],key=p.drawId+winner;if(attempted.has(key))continue;attempted.add(key);claimsTried++;state.claimCursor=(start+i+1)%candidates.length;
    check(same((await provider.getBlock(p.blockNumber))?.hash,p.blockHash),'Payout origin reorg');
    check(same((await terminal(p.kind||'SHORT',p.drawId)).resultHash,p.resultHash),'Payout result changed');
    if(await vault.reward(p.drawId,winner)===0n){p.winners=p.winners.filter(w=>w!==winner);save(state);continue;}
    const price=(await provider.getFeeData()).gasPrice;if(price==null)wait('gasPrice');
    try{await withTransactionBoundary(boundary,()=>sendLocalTransaction(vault.connect(executor).claim,[p.drawId,winner],{from:sender,type:2,maxFeePerGas:price,maxPriorityFeePerGas:0},{signal,receiptTimeoutMs}));}
    catch(e){if(!e.definiteRejection)throw e;(results.claimFailures??=[]).push({drawId:p.drawId,winner,reason:'claimRejected'});}
    if(await vault.reward(p.drawId,winner)===0n)p.winners=p.winners.filter(w=>w!==winner);save(state);
   }
   state.payouts=queue.filter(p=>p.winners.length);save(state);
  }
  const childHalt=r=>r.status==='blocked'||r.status==='stopped'||r.status==='error';
  try{
   if(signal?.aborted)return result('stopped');
   const own=await resolved();if(own)return own;
   // Reconciliation-only calls cannot send or depend on source liveness.
   for(const [name,fn,o]of [['funding',funding.runInfinityWorker,fOptions],['rng',rng.runDrandDelivery,rOptions]]){
    const r=await fn({...o,reconcileOnly:true});if(childHalt(r))return {...r,haltedLane:name,results,steps};
   }
   if(isolated){
    const admission=await recoveryCheck();
    if(admission.status!=='matched')return result(admission.retryableRpcRead?'waiting':'blocked',admission.retryableRpcRead?'rpcUnavailable':'obligationAdmission',{admission});
    const full=await fullCheck();obligationsOnly=drain||full.status!=='matched';
    results.admission={mode:obligationsOnly?'obligations-only':'normal',obligations:admission,full};
   }
   lane='claims';let caughtUp=await discover();await payouts();
   lane='rng';results.rng=await rng.runDrandDelivery({...rOptions,transactionGuard:guard},{...(getBeacon?{getBeacon}:{}),onStep});if(state.pending)return blocked(state.pending.transactionHash?'pendingReceipt':'unknownHash');if(childHalt(results.rng))return {...results.rng,haltedLane:lane,results,steps};
   lane='settlement';results.settlement=await withTransactionBoundary(boundary,()=>runScheduler({...sOptions,allowNewJobs:false,obligationsOnly},{maxTicks:16}));
   if(state.pending)return blocked(state.pending.transactionHash?'pendingReceipt':'unknownTransaction');if(childHalt(results.settlement))return result(results.settlement.status,'settlement',{retryableRpcRead:results.settlement.retryableRpcRead===true});
   lane='claims';caughtUp=await discover();await payouts();
   if(isolated&&obligationsOnly){results.funding={status:'waiting',reason:'obligationsOnly'};results.draw={status:'waiting',reason:'obligationsOnly'};return result('waiting','obligationsOnly');}
   lane='funding';results.funding=await funding.runInfinityWorker({...fOptions,transactionGuard:guard},{onStep});
   if(state.pending)return blocked(state.pending.transactionHash?'pendingReceipt':'unknownHash');
   if(results.funding.status==='blocked'||results.funding.status==='stopped')return {...results.funding,haltedLane:lane,results,steps};
   // A definite source error does not erase old debts or disable a funded draw.
   if(caughtUp&&deploymentProfile&&!drain){const admission=network.executionAdmission(await require('./deployment-admission.cjs').inspectDeployment(provider,deploymentProfile,{fundingJob,deliveryJob,schedulerConfig}));state.lastDeploymentAdmission=admission;save(state);if(admission.status!=='matched'){results.draw={status:'waiting',reason:'deploymentAdmission',admission};return result('waiting','deploymentAdmission');}}
   if(caughtUp){lane='draw';results.draw=await withTransactionBoundary(boundary,()=>runScheduler({...sOptions,allowNewJobs:!drain,obligationsOnly},{maxTicks:16}));if(state.pending)return blocked(state.pending.transactionHash?'pendingReceipt':'unknownTransaction');if(childHalt(results.draw))return result(results.draw.status,'draw',{retryableRpcRead:results.draw.retryableRpcRead===true});}
   else results.draw={status:'waiting',reason:'payoutDiscovery'};
   return result(results.funding.status==='error'||results.funding.status==='degraded'||results.claimFailures?.length?'degraded':'waiting');
  }catch(e){
   if(state.pending)return {...blocked(state.pending.transactionHash&&e.code==='LOCAL_RECEIPT_TIMEOUT'?'pendingReceipt':'unknownTransaction'),retryableRpcRead:false};
   if(e.workerWait||e.cause?.workerWait)return result('waiting',e.workerWait||e.cause.workerWait);
   if(signal?.aborted||e.code==='LOCAL_EXECUTION_STOPPED')return result('stopped');
   return result('error',undefined,{retryableRpcRead:retryableRead(e),error:{message:e.message,code:e.code},haltedLane:lane});
  }
 });
}
module.exports={runShortAutomation:runPromoAutomation,runPromoAutomation,validateOps,validateBudgetCompatibility,ACTIONS,MONTHLY_ACTIONS,prepareRuntime,normalize};
