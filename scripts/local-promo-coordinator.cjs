const path=require('node:path');
const {withState}=require('./local-scheduler-state.cjs');
const {withTransactionBoundary}=require('./local-receipt.cjs');
const {runPrizeFlow,validatePrizeFlowJob}=require('./local-prize-flow.cjs');
const {runScheduler,validateConfig}=require('./local-promo-scheduler.cjs');
const check=(ok,message)=>{if(!ok)throw Error(message);};
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();

// One bounded pass, exclusive ownership of these local signers is an operating requirement.
async function runCoordinator({prize,scheduler,statePath,signal,receiptTimeoutMs=30000},{onEvent=()=>{}}={}){
  validatePrizeFlowJob(prize.job);validateConfig(scheduler.config,scheduler.rpcUrl);
  check(prize.provider===scheduler.provider,'Coordinator requires one shared provider');
  check(path.resolve(statePath)!==path.resolve(scheduler.statePath),'Separate coordinator/scheduler state files required');
  check(same(prize.job.active.vault,scheduler.config.lifecycle.vault)&&
    same(prize.job.token,scheduler.config.manifest.token)&&same(prize.job.quote,scheduler.config.manifest.quote),
    'Prize and draw deployment mismatch');
  const provider=prize.provider;
  check((await provider.getNetwork()).chainId===31337n,'Local chain 31337 only');
  const signers=[prize.executor,scheduler.executor,scheduler.publisher].filter(Boolean);
  const addresses=[...new Set(await Promise.all(signers.map(async s=>(await s.getAddress()).toLowerCase())))].sort();
  check(prize.executor&&scheduler.executor,'Executors required');
  const config={schema:'local-coordinator-v1',prize:prize.job,scheduler:scheduler.config,
    schedulerState:path.resolve(scheduler.statePath),addresses};
  return withState(statePath,config,async(state,save)=>{
    const results={};let worker;
    const pendingResult=reason=>({status:'blocked',reason,requiresReconciliation:true,pending:state.pending,results});
    if(signal?.aborted)return {status:'stopped',results};
    if(state.pending){
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
    const boundary={
      before:async(request,action)=>{
        check(!state.pending,'Unresolved coordinator intent');
        if(signal?.aborted)throw Object.assign(Error('Stopped before intent'),{code:'LOCAL_EXECUTION_STOPPED'});
        state.pending={worker,action,target:request.to,data:request.data,stage:'broadcast'};save(state);
      },
      sent:async tx=>{state.pending={...state.pending,transactionHash:tx.hash,from:tx.from,nonce:tx.nonce,stage:'confirm'};save(state);},
      confirmed:async receipt=>{
        check(receipt.hash===state.pending?.transactionHash,'Receipt does not match coordinator intent');
        state.lastResolved={...state.pending,status:receipt.status,blockHash:receipt.blockHash};delete state.pending;save(state);
      }
    };
    try{
      for(worker of ['prize','draw']){
        if(signal?.aborted)return {status:'stopped',results};
        results[worker]=await withTransactionBoundary(boundary,()=>worker==='prize'
          ?runPrizeFlow({...prize,signal,receiptTimeoutMs})
          :runScheduler({...scheduler,signal,receiptTimeoutMs},{maxTicks:32}));
        if(state.pending){
          const r=results[worker],error=r.error||(r.haltedKind?r.results[r.haltedKind]:undefined);
          if(error){
            // State checksum must describe exactly the JSON persisted on disk: omit undefined fields.
            const details=Object.fromEntries(Object.entries({code:error.code,message:error.message,kind:r.haltedKind}).filter(([,v])=>v!==undefined));
            state.pending={...state.pending,...details};save(state);
          }
          return pendingResult('unknownTransaction');
        }
        await onEvent({worker,...results[worker]});
        if(['error','stopped'].includes(results[worker].status))return {status:results[worker].status,haltedWorker:worker,results};
        if(results[worker].reason==='pendingTransaction')return {status:'blocked',reason:'pendingSigner',results};
      }
      return {status:'complete',results};
    }catch(e){return {status:state.pending?'blocked':'error',requiresReconciliation:!!state.pending,pending:state.pending,
      haltedWorker:worker,error:{message:e.message,code:e.code,stage:e.stage,transactionHash:e.transactionHash},results};}
  });
}
module.exports={runCoordinator};
