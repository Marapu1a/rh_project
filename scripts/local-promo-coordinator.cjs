const path=require('node:path');
const {withState}=require('./local-scheduler-state.cjs');
const {withTransactionBoundary}=require('./local-receipt.cjs');
const {runPrizeFlow,validatePrizeFlowJob}=require('./local-prize-flow.cjs');
const {runScheduler,validateConfig}=require('./local-promo-scheduler.cjs');
const {validateOps,checkExecutionBudget,collectExecutionObligations}=require('./local-execution-budget.cjs');
const {hash}=require('./direct-buy.cjs');
const {reconcileNativeRefill,executeNativeRefill}=require('./local-native-refill-executor.cjs');
const {buildCoordinatorIdentity}=require('./local-coordinator-identity.cjs');
const check=(ok,message)=>{if(!ok)throw Error(message);};
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();

// One bounded pass, exclusive ownership of these local signers is an operating requirement.
async function runCoordinator({prize,scheduler,statePath,signal,receiptTimeoutMs=30000,ops,nativeRefill},{onEvent=()=>{}}={}){
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
  check(same(scheduler.short.target,scheduler.config.lifecycle.source)&&same(scheduler.monthly.target,scheduler.config.lifecycle.monthlySource),'Controller deployment mismatch');
  const roles={prizeExecutor:await prize.executor.getAddress(),executor:await scheduler.executor.getAddress(),
    publisher:scheduler.publisher?await scheduler.publisher.getAddress():null};
  if(nativeRefill){
    const {signer,source}=nativeRefill;
    check(signer?.provider===provider&&['getAddress','estimateGas','sendTransaction'].every(k=>typeof signer[k]==='function'),'Refill signer/provider mismatch');
    check(same(await signer.getAddress(),source?.address),'Refill source signer mismatch');
  }
  const {config,legacyConfig,budgetConfig,refillInput,addresses}=buildCoordinatorIdentity({prizeJob:prize.job,
    schedulerConfig:scheduler.config,schedulerState:scheduler.statePath,roles,ops,nativeRefill});
  return withState(statePath,config,async(state,save)=>{
    const results={};let worker,refillRequest;
    const pendingResult=reason=>({status:'blocked',reason,requiresReconciliation:true,pending:state.pending,results});
    if(signal?.aborted)return {status:'stopped',results};
    if(state.pending){
      if(state.pending.worker==='nativeRefill'){
        const recovery=await reconcileNativeRefill({provider,state,save});
        if(state.pending)return pendingResult(recovery.reason);
        if(nativeRefill)return state.nativeRefillHalt?recovery:{status:'progress',reason:'nativeRefillRecovered',results:{nativeRefill:recovery}};
      }
    }
    if(state.pending){
      if(!state.pending.transactionHash)return pendingResult('unknownHash');
      const receipt=await provider.getTransactionReceipt(state.pending.transactionHash);
      if(!receipt)return pendingResult('pendingReceipt');
      const block=await provider.getBlock(receipt.blockNumber);
      if(!block||block.hash!==receipt.blockHash||![0,1].includes(receipt.status))return pendingResult('unconfirmedReceipt');
      state.lastResolved={...state.pending,status:receipt.status,blockHash:receipt.blockHash};
      delete state.pending;save(state);
    }
    if(state.nativeRefillHalt)return {status:'blocked',reason:'broadcastPolicyMismatch',requiresReconciliation:false,requiresOperatorAction:true,results};
    // Includes publisher, even when different from the funding/execution signer.
    for(const address of addresses)if(await provider.getTransactionCount(address,'pending')>
      await provider.getTransactionCount(address,'latest'))return {status:'blocked',reason:'pendingSigner',address,results};
    async function fund(report,allowedTiers){
      const result=await executeNativeRefill({provider,signer:nativeRefill.signer,state,save,signal,allowedTiers,
        input:{...refillInput,gasObservations:state.gasObservations||{},obligationsAnchor:report.anchor,
          committedObligations:report.committedObligations,candidateObligations:report.candidateObligations}});
      results.nativeRefill=result;
      if(result.status==='ready')return null;
      if(result.status==='confirmed'||result.status==='reverted')return {status:'progress',reason:'nativeRefill',results};
      const operator=!!state.nativeRefillHalt||['historyDomainMismatch','missingFundingTarget'].includes(result.reason);
      return {status:state.pending||operator?'blocked':result.status==='stopped'?'stopped':'waiting',reason:result.reason,
        requiresReconciliation:!!state.pending,requiresOperatorAction:operator,results};
    }
    async function collectCommitted(){
      const head=await provider.getBlock('latest');
      const report=await collectExecutionObligations({provider,short:scheduler.short,monthly:scheduler.monthly,
        publisher:scheduler.publisher,executor:scheduler.executor,chunkSize:scheduler.config.chunkSize,head,
        request:{to:scheduler.short.target},worker:'prize',action:'collect'});
      return {...report,anchor:{number:String(head.number),hash:head.hash,timestamp:String(head.timestamp)}};
    }
    if(nativeRefill){const result=await fund(await collectCommitted(),['committed']);if(result)return result;}
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
      if(nativeRefill&&report.reason==='nativeFunding')refillRequest=report;
      if(!report.ready)throw Object.assign(Error('Execution budget: '+report.reason),{code:nativeRefill&&report.reason==='nativeFunding'?'LOCAL_REFILL_REQUIRED':'LOCAL_BUDGET_WAIT',budget:state.lastBudget});
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
        if(refillRequest&&!state.pending){
          const report=refillRequest;refillRequest=undefined;
          const result=await fund(report,report.committedObligations.length?['committed']:['committed','candidate']);
          if(result)return result;
          results[worker]={status:'waiting',reason:'committedWorkFirst'};
        }
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
      if(nativeRefill){const report=await collectCommitted();if(!report.committedObligations.length){const result=await fund(report,['buffer']);if(result)return result;}}
      return {status:'complete',budgetMode:ops?ops.network.id:'unbudgetedLegacy',results};
    }catch(e){return {status:state.pending?'blocked':'error',requiresReconciliation:!!state.pending,pending:state.pending,
      haltedWorker:worker,error:{message:e.message,code:e.code,stage:e.stage,transactionHash:e.transactionHash},results};}
  },{legacyConfigs:nativeRefill?[legacyConfig,budgetConfig]:ops?[legacyConfig]:[],
    validateMigration:nativeRefill?stored=>{
      const history=stored.nativeRefillHistory;
      if(Object.hasOwn(stored,'nativeRefillHistory')){
        check(history?.domainHash===config.nativeRefill.domainHash,'Refill history domain incompatible with configuration');
        check(history.pending===false,'Resolve pending refill history before migration');
      }
    }:undefined});
}
module.exports={runCoordinator};
