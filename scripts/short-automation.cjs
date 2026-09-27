// Local Short automation. One process owns this signer and all four state files.
const path=require('node:path'),{ethers}=require('ethers');
const {withState}=require('./local-scheduler-state.cjs');
const {withTransactionBoundary,sendLocalTransaction,receiptOptions}=require('./local-receipt.cjs');
const funding=require('./infinity-worker.cjs'),rng=require('./drand-delivery-worker.cjs');
const {runScheduler,validateConfig}=require('./local-promo-scheduler.cjs');
const {verifyDualBindings}=require('./dual-bindings.cjs');
const {transactionCost}=require('./local-execution-budget.cjs');
const {retryableRead}=require('./local-rpc-watch.cjs');
const ACTIONS=['pull','pay','prove','deliver','begin','publish','seal','processShort','finishShort','closeEmpty','claim'];
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase(),zero=ethers.ZeroHash;
const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalize(x)])):typeof v==='string'&&/^0x[0-9a-fA-F]+$/.test(v)?v.toLowerCase():v;
function validateOps(o){
 check(o?.schema==='local-short-automation-v1','Explicit Short automation profile required');
 for(const k of ['maxGasPrice','reserveGasPrice','nativeFloor','extraFeePerTx'])check(typeof o[k]==='string'&&/^(0|[1-9][0-9]*)$/.test(o[k]),'Invalid '+k);
 check(BigInt(o.maxGasPrice)>0n&&BigInt(o.reserveGasPrice)>=BigInt(o.maxGasPrice),'Invalid gas prices');
 check(Number.isInteger(o.safetyBps)&&o.safetyBps>=10000&&o.safetyBps<=30000,'Invalid safety factor');
 for(const [k,max]of [['maxTransactions',128],['maxClaims',64],['scanBlocks',2000],['pollSeconds',86400]])check(Number.isInteger(o[k])&&o[k]>0&&o[k]<=max,'Invalid '+k);
 for(const a of ACTIONS)check(typeof o.gasUnits?.[a]==='string'&&/^[1-9][0-9]*$/.test(o.gasUnits[a]),'Missing gas bound '+a);
 return o;
}
async function runShortAutomation({provider,executor,collector,adapter,vault,short,monthly,fundingJob,deliveryJob,schedulerConfig,rpcUrl,statePath,ops,signal,receiptTimeoutMs=30000},{getBeacon,onStep=()=>{}}={}){
 ops=JSON.parse(JSON.stringify(validateOps(ops)));funding.validateJob(fundingJob);rng.validateJob(deliveryJob);receiptOptions(receiptTimeoutMs);
 const domain=validateConfig(schedulerConfig,rpcUrl),sender=await executor.getAddress();
 check(executor.provider===provider&&(await provider.getNetwork()).chainId===31337n,'Local signer/provider required');
 for(const c of [collector,adapter,vault,short,monthly])check(c.runner===provider||c.runner?.provider===provider,'Contract/provider mismatch');
 check(same(short.target,domain.source)&&same(monthly.target,domain.monthlySource)&&same(vault.target,domain.vault),'Draw bindings mismatch');
 check(same(collector.target,fundingJob.collector)&&same(fundingJob.promo,vault.target)&&same(fundingJob.token,schedulerConfig.manifest.token)&&same(fundingJob.quote,schedulerConfig.manifest.quote),'Funding bindings mismatch');
 check(same(adapter.target,deliveryJob.adapter)&&same(deliveryJob.short,short.target)&&same(deliveryJob.monthly,monthly.target),'RNG bindings mismatch');
 check(same(await short.publisher(),sender),'Signer must be Short publisher');
 await verifyDualBindings(provider,domain);
 check(same(await short.randomProvider(),adapter.target)&&same(await monthly.randomProvider(),adapter.target),'Provider mismatch');
 for(const [k,c]of [['adapter',adapter],['short',short],['monthly',monthly]])check(same(ethers.keccak256(await provider.getCode(c.target)),deliveryJob[k+'CodeHash']),'Runtime mismatch '+k);
 check(await adapter.PROFILE()===require('./drand-preflight.cjs').PROFILE,'Unsupported RNG');
 const files={main:path.resolve(statePath),funding:path.resolve(statePath)+'.funding',rng:path.resolve(statePath)+'.rng',scheduler:path.resolve(statePath)+'.scheduler'};
 const identity=normalize({schema:ops.schema,sender,fundingJob,deliveryJob,schedulerConfig,rpcUrl,ops,files});
 return withState(files.main,identity,async(state,save)=>{
  const results={},steps=[];let sentCount=0,claimsTried=0,discoveryReady=false,lane='startup';const attempted=new Set();
  const result=(status,reason,extra={})=>({status,...(reason?{reason}:{}),results,steps,queued:state.payouts?.length||0,...extra});
  const blocked=reason=>result('blocked',reason,{requiresReconciliation:true,pending:state.pending});
  const wait=reason=>{throw Object.assign(Error(reason),{code:'LOCAL_BUDGET_WAIT',workerWait:reason,budget:{reason}});};
  const fOptions={provider,collector,executor,job:fundingJob,statePath:files.funding,signal,receiptTimeoutMs};
  const rOptions={provider,adapter,executor,job:deliveryJob,statePath:files.rng,signal,receiptTimeoutMs,kinds:['short']};
  const sOptions={provider,short,monthly,publisher:executor,executor,config:schedulerConfig,rpcUrl,statePath:files.scheduler,signal,receiptTimeoutMs,kinds:['SHORT']};
  async function resolved(){
   const p=state.pending;if(!p)return null;if(!p.transactionHash)return blocked('unknownHash');
   const receipt=await provider.getTransactionReceipt(p.transactionHash);if(!receipt)return blocked('pendingReceipt');
   const b=await provider.getBlock(receipt.blockNumber),tx=await provider.getTransaction(p.transactionHash);
   if(!b||!same(b.hash,receipt.blockHash)||!same(receipt.hash,p.transactionHash)||![0,1].includes(receipt.status)||!tx||!same(tx.hash,p.transactionHash)||!same(tx.from,sender)||!same(tx.to,p.target)||!same(tx.data,p.data)||tx.nonce!==p.nonce)return blocked('unconfirmedReceipt');
   state.lastResolved={...p,status:receipt.status,blockHash:receipt.blockHash};delete state.pending;save(state);return null;
  }
  async function guard(request,action,commit=false){
   if(signal?.aborted)throw Object.assign(Error('Stopped'),{code:'LOCAL_EXECUTION_STOPPED'});
   check(ACTIONS.includes(action),'Unbudgeted operation');
   const target=['pull','pay'].includes(action)?collector:['prove','deliver'].includes(action)?adapter:action==='claim'?vault:short;
   check(same(request.to,target.target)&&target.interface.parseTransaction({data:request.data}).name===action,'Unexpected transaction target/action');
   check(!request.from||same(request.from,sender),'Unexpected transaction sender');
   if(sentCount>=ops.maxTransactions)wait('transactionLimit');
   const head=await provider.getBlock('latest'),price=(await provider.getFeeData()).gasPrice;
   if(price==null||price>BigInt(ops.maxGasPrice)||BigInt(request.maxFeePerGas??price)>BigInt(ops.maxGasPrice))wait('gasPrice');
   const bound=BigInt(ops.gasUnits[action]),units=BigInt(request.gasLimit??bound);
   if(units>bound||bound>head.gasLimit)wait('actionGasBound');
   if(await provider.getTransactionCount(sender,'pending')>await provider.getTransactionCount(sender,'latest'))wait('pendingSigner');
   let required=transactionCost(ops,units)+BigInt(ops.nativeFloor);
   if(action==='seal'){
    if(!discoveryReady)wait('payoutDiscovery');
    const parsed=short.interface.parseTransaction({data:request.data}),proposal=await short.datasetProposal(parsed.args[0]);
    const chunks=await short.datasetChunkCount(parsed.args[0]),policy=await short.shortEpochPolicy(proposal.request.rulesEpoch);
    const claims=BigInt(policy.weights.length+(state.payouts||[]).reduce((n,p)=>n+p.winners.length,0));
    required+=transactionCost(ops,ops.gasUnits.prove)+transactionCost(ops,ops.gasUnits.deliver)+chunks*transactionCost(ops,ops.gasUnits.processShort)+transactionCost(ops,ops.gasUnits.finishShort)+claims*transactionCost(ops,ops.gasUnits.claim);
    for(const a of ['prove','deliver','processShort','finishShort','claim'])if(BigInt(ops.gasUnits[a])>head.gasLimit)wait('blockGasBound');
   }
   state.lastBudget={action,required:String(required),balance:String(await provider.getBalance(sender)),reserveGasPrice:ops.reserveGasPrice};
   if(BigInt(state.lastBudget.balance)<required)wait('nativeFunding');
   if(!same((await provider.getBlock(head.number))?.hash,head.hash))wait('chainChanged');
   if(commit)sentCount++;
  }
  const boundary={preflight:guard,before:async(request,action)=>{
   await guard(request,action,true);check(!state.pending,'Unresolved intent');
   state.pending={lane,action,target:request.to,data:request.data,from:sender,stage:'broadcast'};save(state);
  },sent:async tx=>{state.pending={...state.pending,transactionHash:tx.hash,nonce:tx.nonce,stage:'confirm'};save(state);},confirmed:async receipt=>{
   check(same(receipt.hash,state.pending?.transactionHash),'Receipt mismatch');check(same((await provider.getBlock(receipt.blockNumber))?.hash,receipt.blockHash),'Receipt not canonical');
   const step={...state.pending,status:receipt.status,blockHash:receipt.blockHash};state.lastResolved=step;delete state.pending;save(state);steps.push(step);await onStep(step);
  }};
  async function discover(){
   const head=await provider.getBlock('latest');state.payouts??=[];
   if(state.payoutCursor)check(same((await provider.getBlock(state.payoutCursor.number))?.hash,state.payoutCursor.hash),'Payout cursor reorg; reconcile before continuing');
   const from=state.payoutCursor?state.payoutCursor.number+1:Number((await short.shortEpochPolicy(1)).firstBlock);
   if(from>head.number)return discoveryReady=true;const to=Math.min(head.number,from+ops.scanBlocks-1),end=await provider.getBlock(to);
   const events=await short.queryFilter(short.filters.AttemptsConsumed(null,0),from,to);
   for(const event of events){
    check(same((await provider.getBlock(event.blockNumber))?.hash,event.blockHash),'Noncanonical terminal event');
    const drawId=event.args.drawId,s=await short.settlements(drawId),r=await short.shortResult(drawId);
    check(s.phase===3n&&same(r.resultHash,event.args.resultHash),'Terminal result mismatch');
    if(!state.payouts.some(p=>p.drawId===drawId))state.payouts.push({drawId,resultHash:r.resultHash,blockNumber:event.blockNumber,blockHash:event.blockHash,winners:[...new Set(Array.from(r.winners,w=>w.toLowerCase()).filter(w=>w!==ethers.ZeroAddress))]});
   }
   check(same((await provider.getBlock(to))?.hash,end.hash),'Payout scan changed');state.payoutCursor={number:to,hash:end.hash};save(state);return discoveryReady=to===head.number;
  }
  async function payouts(){
   const queue=state.payouts||[];if(!queue.length)return;
   // Rotate failed recipients instead of letting one permanent revert starve later claims.
   const candidates=queue.flatMap(p=>p.winners.map(winner=>({p,winner}))),start=(state.claimCursor||0)%Math.max(1,candidates.length);
   for(let i=0;i<candidates.length&&claimsTried<ops.maxClaims;i++){
    const {p,winner}=candidates[(start+i)%candidates.length],key=p.drawId+winner;if(attempted.has(key))continue;attempted.add(key);claimsTried++;state.claimCursor=(start+i+1)%candidates.length;
    check(same((await provider.getBlock(p.blockNumber))?.hash,p.blockHash),'Payout origin reorg');
    check((await short.settlements(p.drawId)).phase===3n&&same((await short.shortResult(p.drawId)).resultHash,p.resultHash),'Payout result changed');
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
   lane='claims';let caughtUp=await discover();await payouts();
   lane='rng';results.rng=await rng.runDrandDelivery({...rOptions,transactionGuard:guard},{...(getBeacon?{getBeacon}:{}),onStep});if(childHalt(results.rng))return {...results.rng,haltedLane:lane,results,steps};
   lane='settlement';results.settlement=await withTransactionBoundary(boundary,()=>runScheduler({...sOptions,allowNewJobs:false},{maxTicks:16}));
   if(state.pending)return blocked(state.pending.transactionHash?'pendingReceipt':'unknownTransaction');if(childHalt(results.settlement))return result(results.settlement.status,'settlement',{retryableRpcRead:results.settlement.retryableRpcRead===true});
   lane='claims';caughtUp=await discover();await payouts();
   lane='funding';results.funding=await funding.runInfinityWorker({...fOptions,transactionGuard:guard},{onStep});
   if(results.funding.status==='blocked'||results.funding.status==='stopped')return {...results.funding,haltedLane:lane,results,steps};
   // A definite source error does not erase old debts or disable a funded draw.
   if(caughtUp){lane='draw';results.draw=await withTransactionBoundary(boundary,()=>runScheduler(sOptions,{maxTicks:16}));if(state.pending)return blocked(state.pending.transactionHash?'pendingReceipt':'unknownTransaction');if(childHalt(results.draw))return result(results.draw.status,'draw',{retryableRpcRead:results.draw.retryableRpcRead===true});}
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
module.exports={runShortAutomation,validateOps,ACTIONS};
