// Observation only. This file never authorizes sends, clears intents or retries work.
const path=require('node:path'),{withState}=require('./local-scheduler-state.cjs');
const {hash}=require('./direct-buy.cjs');
const hints={
 opsFunding:'Continue the durable operations funding stages on the next pass.',
 opsSwapCooldown:'Wait for the configured operations cooldown.',
 opsSwapPeriodLimit:'Wait for the next USDG spending period or use externally supplied ETH.',
 opsSwapFeeLimit:'Wait for the next operations gas budget period or use externally supplied ETH.',
 insufficientUSDG:'Fund the operations wallet with USDG or ETH; collector credit is not wallet balance.',
 staleQuote:'Read a fresh market quote before sending.',
 priceImpact:'Wait for sufficient market depth or review the bounded batch size.',
 insufficientLiquidity:'Wait for liquidity; prize assets remain untouched.',

 expensiveGas:'Wait for gas to fall below the configured ceiling.',
 executorNeedsETH:'Wait for bounded refill or an external ETH top-up.',
 sourceNeedsETH:'Top up the separate operational ETH source.',
 refillPeriodLimit:'Wait for the next spending window.',
 refillAttemptLimit:'Review the configured per-transfer cap; it cannot cover transfer gas.',
 refillCooldown:'Wait for the configured cooldown to expire.',
 rpcUnavailable:'Retry reads with bounded backoff; reconcile any known send first.',
 sourceReadUnavailable:'Wait for revenue source reads to recover; funded obligations may continue.',
 beaconUnavailable:'Wait for the required drand beacon to become available; do not select another round.',
 receiptPending:'Reconcile the same transaction hash; do not resend.',
 signerPending:'Wait for the existing signer transaction to resolve; do not replace it automatically.',
 chainObservationChanged:'Re-read the chain before deciding on another action.',
 executionReadiness:'Wait for controller readiness; check its gas ceiling and native balance requirements.',
 reconciliationRequired:'Inspect the existing intent and chain evidence before resuming.',
 configurationRequired:'Review the configuration or deployment admission.',
 newWorkRestricted:'Restore the admitted revenue/deployment profile; old obligations may continue.',
 refillHalt:'Review the recorded refill policy mismatch before further refills.',
 operationFailed:'Inspect the failed lane; no automatic reset is authorized.'
};
function classify(report){
 if(report.status==='stopped')return null;
 const reasons=new Set();let attention=false;
 function visit(r,failure=false){
  if(!r||typeof r!=='object')return;
  if(Array.isArray(r)){for(const entry of r)visit(entry,failure);return;}
  const unavailable=['sourceReadUnavailable','beaconUnavailable'].includes(r.reason);
  if(unavailable)reasons.add(r.reason);
  if((failure||r.status==='rejected')&&!unavailable){attention=true;reasons.add('operationFailed');}
  if(r.retryableRpcRead===true)reasons.add('rpcUnavailable');
  const names={opsFunding:'opsFunding',opsSwapCooldown:'opsSwapCooldown',opsSwapPeriodLimit:'opsSwapPeriodLimit',opsSwapFeeLimit:'opsSwapFeeLimit',opsSwapHalt:'reconciliationRequired',sourceNeedsETH:'sourceNeedsETH',insufficientUSDG:'insufficientUSDG',staleQuote:'staleQuote',priceImpact:'priceImpact',insufficientLiquidity:'insufficientLiquidity',gasPrice:'expensiveGas',nativeFunding:'executorNeedsETH',refillCooldown:'refillCooldown',refillHalt:'refillHalt',rpcUnavailable:'rpcUnavailable',unknownHash:'reconciliationRequired',unknownTransaction:'reconciliationRequired',unconfirmedReceipt:'reconciliationRequired',pendingReceipt:'receiptPending',refillAccountCode:'configurationRequired',refillGasBound:'configurationRequired',actionGasBound:'configurationRequired',blockGasBound:'configurationRequired',obligationAdmission:'configurationRequired',deploymentAdmission:'configurationRequired',publicExecutionDisabled:'configurationRequired'};
  if(names[r.reason])reasons.add(names[r.reason]);
  if(['pendingSigner','pendingRefillSigner'].includes(r.reason))reasons.add('signerPending');
  if(['chainChanged','refillSnapshotChanged'].includes(r.reason))reasons.add('chainObservationChanged');
  if(r.reason==='executionReadiness')reasons.add('executionReadiness');
  if(r.reason==='pendingReceipt'&&!r.pending?.transactionHash){attention=true;reasons.add('reconciliationRequired');}
  if(r.reason==='refillBudget')reasons.add(r.constraint==='sourceBalance'?'sourceNeedsETH':r.constraint==='periodCap'?'refillPeriodLimit':r.constraint==='attemptCap'?'refillAttemptLimit':'executorNeedsETH');
  if((r.status==='error'||r.status==='blocked')&&!r.retryableRpcRead&&r.reason!=='pendingReceipt'){
   attention=true;if(!names[r.reason])reasons.add('operationFailed');
  }
  if(r.requiresOperatorAction)attention=true;
  for(const [key,child]of Object.entries(r.results||{}))visit(child,key==='claimFailures');
  visit(r.failures,true);visit(r.claimFailures,true);visit(r.requests);
  if(r.reason==='executionBudget')visit(r.budget);
 }
 visit(report);
 if(report.results?.admission?.full?.status==='blocked')reasons.add(report.results.admission.full.retryableRpcRead?'rpcUnavailable':'newWorkRestricted');
 // A precise refill constraint is more useful than the accompanying generic balance wait.
 if([...reasons].some(r=>['sourceNeedsETH','refillPeriodLimit','refillAttemptLimit','refillCooldown','refillHalt'].includes(r)))reasons.delete('executorNeedsETH');
 if([...reasons].some(r=>['reconciliationRequired','configurationRequired','refillAttemptLimit','refillHalt'].includes(r)))attention=true;
 return {state:attention?'attention':reasons.size?'waiting':'clear',reasons:[...reasons].sort()};
}
async function observePromoStatus(statePath,report,{now=()=>new Date().toISOString()}={}){
 const observed=classify(report);if(!observed)return {};
 const runtime=path.resolve(statePath),file=runtime+'.status';
 return withState(file,{worker:'promo-operational-status-v1',runtime},async(state,save)=>{
  const previous=state.observation,changed=JSON.stringify(previous)!==JSON.stringify(observed);
  let event;
  if(changed){
   state.observation=observed;
   if(previous||observed.state!=='clear'){
    const sequence=(state.sequence||0)+1;state.sequence=sequence;
    event={id:hash({runtime,sequence}),sequence,type:observed.state==='clear'?'recovered':previous&&previous.state!=='clear'?'changed':observed.state==='attention'?'attention':'waiting',at:now(),previous:previous||null,current:observed};
    state.events=[...(state.events||[]),event].slice(-32);
   }
   save(state);
  }
  return {operational:{...observed,resumeWhen:observed.reasons.map(reason=>({reason,message:hints[reason]})),...(event?{event}:{})}};
 });
}
module.exports={classify,observePromoStatus};
