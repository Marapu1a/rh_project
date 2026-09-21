const path=require('node:path');
const {withState}=require('./local-scheduler-state.cjs');
const {withTransactionBoundary}=require('./local-receipt.cjs');
const {runPrizeFlow,validatePrizeFlowJob}=require('./local-prize-flow.cjs');
const {runScheduler,validateConfig}=require('./local-promo-scheduler.cjs');
const {validateOps,checkExecutionBudget}=require('./local-execution-budget.cjs');
const {hash}=require('./direct-buy.cjs');
const check=(ok,message)=>{if(!ok)throw Error(message);};
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();

// One bounded pass, exclusive ownership of these local signers is an operating requirement.
async function runCoordinator({prize,scheduler,statePath,signal,receiptTimeoutMs=30000,ops},{onEvent=()=>{}}={}){
  if(ops){ops=JSON.parse(JSON.stringify(validateOps(ops)));receiptTimeoutMs=ops.settings.receiptTimeoutMs;}
  validatePrizeFlowJob(prize.job);validateConfig(scheduler.config,scheduler.rpcUrl);
  check(prize.provider===scheduler.provider,'Coordinator requires one shared provider');
  check(path.resolve(statePath)!==path.resolve(scheduler.statePath),'Separate coordinator/scheduler state files required');
  check(same(prize.job.active.vault,scheduler.config.lifecycle.vault)&&
    same(prize.job.token,scheduler.config.manifest.token)&&same(prize.job.quote,scheduler.config.manifest.quote),
    'Prize and draw deployment mismatch');
  const provider=prize.provider;
  check(prize.executor&&scheduler.executor,'Executors required');
  const signers=[prize.executor,scheduler.executor,scheduler.publisher].filter(Boolean);
  // A matching address/chainId does not bind reads and sends to the same RPC instance.
  for(const signer of signers)check(signer.provider===provider&&
    ['getAddress','estimateGas','sendTransaction'].every(k=>typeof signer[k]==='function'),
    'Signer must use coordinator provider and support transaction execution');
  for(const contract of [prize.router,scheduler.short,scheduler.monthly]){
    const runner=contract?.runner;
    check(runner===provider||runner?.provider===provider,'Contract must use coordinator provider');
  }
  check((await provider.getNetwork()).chainId===31337n,'Local chain 31337 only');
  const addresses=[...new Set(await Promise.all(signers.map(async s=>(await s.getAddress()).toLowerCase())))].sort();
  const legacyConfig={schema:'local-coordinator-v1',prize:prize.job,scheduler:scheduler.config,
    schedulerState:path.resolve(scheduler.statePath),addresses};
  let config=legacyConfig;
  if(ops){
    const {pollSeconds,maxGasPrice,...identity}=prize.job;
    config={...legacyConfig,schema:'local-coordinator-budget-v1',prize:identity,network:ops.network,
      roles:{prizeExecutor:await prize.executor.getAddress(),executor:await scheduler.executor.getAddress(),
        publisher:scheduler.publisher?await scheduler.publisher.getAddress():null}};
  }
  return withState(statePath,config,async(state,save)=>{
    const results={};let worker;
    const pendingResult=reason=>({status:'blocked',reason,requiresReconciliation:true,pending:state.pending,results});
    if(signal?.aborted)return {status:'stopped',results};
    if(state.pending){
      // Refill receipts must update the expense ledger in the same save that clears pending.
      // The generic prize/draw resolver cannot finalize them; executor integration is pending.
      if(state.pending.worker==='nativeRefill')return pendingResult('nativeRefillExecutorNotEnabled');
      if(!state.pending.transactionHash)return pendingResult('unknownHash');
      const receipt=await provider.getTransactionReceipt(state.pending.transactionHash);
      if(!receipt)return pendingResult('pendingReceipt');
      const block=await provider.getBlock(receipt.blockNumber);
      if(!block||block.hash!==receipt.blockHash||![0,1].includes(receipt.status))return pendingResult('unconfirmedReceipt');
      state.lastResolved={...state.pending,status:receipt.status,blockHash:receipt.blockHash};
      delete state.pending;save(state);
    }
    // Includes publisher, even when different from the funding/execution signer.
    for(const address of addresses)if(await provider.getTransactionCount(address,'pending')>
      await provider.getTransactionCount(address,'latest'))return {status:'blocked',reason:'pendingSigner',address,results};
    async function budget(request,action){
      if(signal?.aborted)throw Object.assign(Error('Stopped before intent'),{code:'LOCAL_EXECUTION_STOPPED'});
      check(ops.network.gasUnits[action]!==undefined,'Unbudgeted action');
      // Observed estimates can raise a model floor, never lower an existing obligation.
      // A low initial calibration must not permanently forbid finishing a frozen draw.
      const known=BigInt(state.gasObservations?.[action]||ops.network.gasUnits[action]);
      if(BigInt(request.gasLimit)>known)state.gasObservations={...state.gasObservations,[action]:String(request.gasLimit)};
      const effective={...ops,network:{...ops.network,gasUnits:{...ops.network.gasUnits,...state.gasObservations}}};
      const report=await checkExecutionBudget({ops:effective,provider,short:scheduler.short,monthly:scheduler.monthly,
        publisher:scheduler.publisher,executor:scheduler.executor,prizeExecutor:prize.executor,
        chunkSize:scheduler.config.chunkSize,request,action,worker});
      state.lastBudget=JSON.parse(JSON.stringify({...report,gasObservations:state.gasObservations||{}}));save(state);
      if(!report.ready)throw Object.assign(Error('Execution budget: '+report.reason),{code:'LOCAL_BUDGET_WAIT',budget:state.lastBudget});
    }
    const boundary={
      // Check model funding before RPC estimation (which may itself reject a broke signer).
      preflight:ops?async(request,action)=>budget({...request,gasLimit:BigInt(state.gasObservations?.[action]||ops.network.gasUnits[action])},action):undefined,
      before:async(request,action)=>{
        check(!state.pending,'Unresolved coordinator intent');
        if(signal?.aborted)throw Object.assign(Error('Stopped before intent'),{code:'LOCAL_EXECUTION_STOPPED'});
        if(ops){
          await budget(request,action);
          // Budget reads are asynchronous; abort before prepared persistence still cancels.
          if(signal?.aborted)throw Object.assign(Error('Stopped before intent'),{code:'LOCAL_EXECUTION_STOPPED'});
        }
        // Successful persistence commits this send attempt; later abort stops wait/next intents.
        state.pending={worker,action,target:request.to,data:request.data,stage:'broadcast',
          ...(ops?{executionPolicy:{networkHash:hash(ops.network),settings:ops.settings,gasObservations:state.gasObservations||{}}}:{})};save(state);
      },
      sent:async tx=>{state.pending={...state.pending,transactionHash:tx.hash,from:tx.from,nonce:tx.nonce,stage:'confirm'};save(state);},
      confirmed:async receipt=>{
        check(receipt.hash===state.pending?.transactionHash,'Receipt does not match coordinator intent');
        state.lastResolved={...state.pending,status:receipt.status,blockHash:receipt.blockHash};delete state.pending;save(state);
      }
    };
    try{
      for(worker of ops?['draw','prize']:['prize','draw']){
        if(signal?.aborted)return {status:'stopped',results};
        results[worker]=await withTransactionBoundary(boundary,()=>worker==='prize'
          ?runPrizeFlow({...prize,job:ops?{...prize.job,maxGasPrice:ops.settings.maxGasPrice}:prize.job,signal,receiptTimeoutMs})
          :runScheduler({...scheduler,signal,receiptTimeoutMs,prioritizeStarted:!!ops},{maxTicks:32}));
        if(state.pending){
          const r=results[worker],error=r.error||(r.haltedKind?r.results[r.haltedKind]:undefined);
          if(error){
            // State checksum must describe exactly the JSON persisted on disk: omit undefined fields.
            const details=Object.fromEntries(Object.entries({code:error.code,message:error.message,kind:r.haltedKind}).filter(([,v])=>v!==undefined));
            state.pending={...state.pending,...details};save(state);
          }
          return pendingResult('unknownTransaction');
        }
        if(results[worker].error?.code==='LOCAL_BUDGET_WAIT')results[worker]={...results[worker],status:'waiting',reason:'executionBudget',budget:state.lastBudget};
        await onEvent({worker,...results[worker]});
        if(['error','stopped'].includes(results[worker].status))return {status:results[worker].status,haltedWorker:worker,results};
        if(results[worker].reason==='pendingTransaction')return {status:'blocked',reason:'pendingSigner',results};
      }
      return {status:'complete',budgetMode:ops?ops.network.id:'unbudgetedLegacy',results};
    }catch(e){return {status:state.pending?'blocked':'error',requiresReconciliation:!!state.pending,pending:state.pending,
      haltedWorker:worker,error:{message:e.message,code:e.code,stage:e.stage,transactionHash:e.transactionHash},results};}
  },{legacyConfigs:ops?[legacyConfig]:[]});
}
module.exports={runCoordinator};
