// Explicit local-fork coordinator. No public signer or deployment admission shortcut.
const {ethers}=require('ethers'),path=require('node:path');
const network=require('./runtime-network.cjs'),{withState}=require('./local-scheduler-state.cjs');
const {sendLocalTransaction,withTransactionBoundary}=require('./local-receipt.cjs');
const {runScheduler}=require('./local-promo-scheduler.cjs'),{runDrandDelivery}=require('./drand-delivery-worker.cjs');
const {inspect,ABI}=require('./pons-collector-manual.cjs'),V=require('./pons-v4-buy.cjs');
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
async function reconcilePending(state,save,provider,sender){
 const p=state.pending;if(!p)return null;
 if(!p.transactionHash)return {status:'blocked',reason:'unknownHash'};
 const r=await provider.getTransactionReceipt(p.transactionHash);if(!r)return {status:'blocked',reason:'pendingReceipt'};
 const tx=await provider.getTransaction(p.transactionHash),b=await provider.getBlock(r.blockNumber);
 if(!tx||!b||!same(b.hash,r.blockHash)||!same(r.hash,p.transactionHash)||!same(tx.hash,p.transactionHash)||tx.nonce!==p.nonce||!same(tx.from,sender)||!same(tx.to,p.target)||!same(tx.data,p.data)||BigInt(tx.value||0)!==BigInt(p.value||0)||![0,1].includes(r.status))return {status:'blocked',reason:'unconfirmedReceipt'};
 state.lastResolved={...p,status:r.status,blockNumber:r.blockNumber,blockHash:r.blockHash};delete state.pending;save(state);return null;
}
function validate(c){
 check(c.schema==='pons-rehearsal-automation-v1','Explicit Pons rehearsal config required');V.validate(c.manifest);
 check(c.lifecycle.schema==='attempt-lifecycle-v4'&&same(c.lifecycle.vault,c.vault),'Lifecycle binding mismatch');
 for(const k of ['collector','escrow','vault','executor'])check(ethers.isAddress(c[k]),'Invalid '+k);
 for(const k of ['collector','escrow'])check(/^0x[0-9a-f]{64}$/.test(c.codeHashes?.[k]||''),'Missing '+k+' runtime');
 for(const k of ['maxGasPrice','nativeFloor','gasLimit'])check(typeof c[k]==='string'&&/^[0-9]+$/.test(c[k]),'Invalid '+k);
 check(BigInt(c.maxGasPrice)>0n&&BigInt(c.gasLimit)>0n,'Invalid gas budget');
 check(Number.isInteger(c.maxTransactions)&&c.maxTransactions>0&&c.maxTransactions<=128,'Invalid transaction bound');
 check(Number.isInteger(c.pollSeconds)&&c.pollSeconds>=10&&c.pollSeconds<=3600,'Invalid poll interval');
 check(/^0x[0-9a-fA-F]{64}$/.test(c.instanceId),'Explicit Hardhat instance required');
 check(c.deliveryJob.adapter&&same(c.deliveryJob.short,c.lifecycle.source)&&same(c.deliveryJob.monthly,c.lifecycle.monthlySource),'RNG binding mismatch');
 check(c.campaignId==='1'&&Array.isArray(c.recipients)&&c.recipients.length===3&&same(c.recipients[0],c.vault)&&c.recipients.every(ethers.isAddress),'Funding policy required');
}
async function runPonsAutomation({provider,executor,config:c,rpcUrl,statePath,signal,drain=false,receiptTimeoutMs=30000},{onStep=()=>{},getBeacon}={}){
 validate(c);check(same(await executor.getAddress(),c.executor)&&executor.provider===provider,'Executor/provider mismatch');
 return network.withRobinhoodNetwork({provider,rpcUrl,mode:'robinhood-rehearsal'},async()=>{
  const meta=await provider.send('hardhat_metadata',[]);check(meta.instanceId===c.instanceId&&Number(meta.forkedNetwork?.chainId)===4663,'Wrong local Robinhood fork');
  const compiled=require('./compile.cjs').compile(),contract=(name,address)=>new ethers.Contract(address,compiled[name].abi,provider);
  const short=contract('RobinhoodShortController',c.lifecycle.source),monthly=contract('RobinhoodMonthlyController',c.lifecycle.monthlySource),vault=contract('DualControllerPromoVault',c.vault),adapter=contract('DrandRandomAdapter',c.deliveryJob.adapter),collector=new ethers.Contract(c.collector,ABI,provider);
  const schedulerConfig={schema:'robinhood-promo-scheduler-v1',manifest:c.manifest,lifecycle:c.lifecycle,cutoffMode:'LOCAL_HEAD',ponsRehearsal:true,buyPolicyMode:'unadmitted',campaignId:'1',shortBudgetMode:'FREE_SHORT',chunkSize:64};
  const file=path.resolve(statePath),identity={config:c,rpcUrl,sender:c.executor};
  return withState(file,identity,async(state,save)=>{
   const steps=[],results={},result=(status,reason)=>({status,reason,steps,results,publicSends:false});let sentCount=0;
   const wait=reason=>{throw Object.assign(Error(reason),{code:'LOCAL_BUDGET_WAIT',budget:{reason},workerWait:reason});};
   async function guard(request,action){
    check(!state.pending,'Unresolved intent');
    if(signal?.aborted)wait('stopped');if(sentCount>=c.maxTransactions)wait('transactionLimit');
    const m=await provider.send('hardhat_metadata',[]);check(m.instanceId===c.instanceId,'Fork instance changed');
    if(await provider.getTransactionCount(c.executor,'pending')>await provider.getTransactionCount(c.executor,'latest'))wait('pendingNonce');
    const price=(await provider.getFeeData()).gasPrice;if(price===null||price>BigInt(c.maxGasPrice))wait('gasPrice');
    if(BigInt(request.maxFeePerGas??request.gasPrice??price)>BigInt(c.maxGasPrice))wait('gasPrice');
    // Reserve conservative gas for both datasets, all possible claims and remaining RNG actions.
    let calls=20n+BigInt(state.payouts?.length||0);
    for(const [source,keys,isShort]of [[short,['activeProposal','pendingDatasetDraw'],true],[monthly,['activeMonth','pendingMonth'],false]]){
     const active=await source[keys[0]](),pending=await source[keys[1]]();
     if(active!==ethers.ZeroHash){const p=isShort?await short.datasetProposal(active):await monthly.month(active);calls+=BigInt(isShort?p.request.expectedCount:p.input.count)*2n+10n;}
     else if(pending!==ethers.ZeroHash){const p=isShort?await short.datasetProposal((await short.settlements(pending)).proposalId):await monthly.month(pending);calls+=BigInt(isShort?p.request.expectedCount:p.input.count)*2n+10n;}
    }
    if(action==='begin'||action==='beginMonth'){const parsed=(action==='begin'?short:monthly).interface.parseTransaction({data:request.data});calls+=2n*BigInt(action==='begin'?parsed.args[1].expectedCount:parsed.args[0].count)+10n;}
    if(await provider.getBalance(c.executor)<BigInt(c.nativeFloor)+calls*BigInt(c.gasLimit)*BigInt(c.maxGasPrice))wait('nativeFunding');
    if(request.gasLimit&&BigInt(request.gasLimit)>BigInt(c.gasLimit))wait('gasBound');
   }
   const boundary={preflight:guard,before:async(request,action)=>{await guard(request,action);check(!state.pending,'Unresolved intent');state.pending={action,target:request.to,data:request.data,value:String(request.value||0),from:c.executor};save(state);},sent:async tx=>{state.pending={...state.pending,transactionHash:tx.hash,nonce:tx.nonce};save(state);},confirmed:async r=>{
    check(state.pending&&same(r.hash,state.pending.transactionHash)&&same((await provider.getBlock(r.blockNumber))?.hash,r.blockHash),'Noncanonical receipt');
    const s={...state.pending,status:r.status,blockNumber:r.blockNumber,blockHash:r.blockHash};state.lastResolved=s;delete state.pending;save(state);steps.push(s);sentCount++;await onStep(s);
   }};
   const deliver={provider,adapter,executor,job:c.deliveryJob,statePath:file+'.rng',signal,receiptTimeoutMs};
   const schedule={provider,short,monthly,publisher:executor,executor,config:schedulerConfig,rpcUrl,statePath:file+'.scheduler',signal,receiptTimeoutMs};
   async function send(method,args=[]){const price=(await provider.getFeeData()).gasPrice;return sendLocalTransaction(method,args,{type:2,maxFeePerGas:price,maxPriorityFeePerGas:0},{signal,receiptTimeoutMs});}
   async function claims(){
    state.payouts??=[];
    const head=await provider.getBlock('latest');
    if(state.cursor)check(same((await provider.getBlock(state.cursor.number))?.hash,state.cursor.hash),'Payout cursor reorg; explicit recovery required');
    const from=state.cursor?state.cursor.number+1:c.manifest.anchor.number+1,to=Math.min(head.number,from+999);
    if(from<=to){const end=await provider.getBlock(to);
     for(const [source,kind]of [[short,0],[monthly,1]])for(const e of await source.queryFilter(source.filters.AttemptsConsumed(null,kind),from,to)){
      check(same((await provider.getBlock(e.blockNumber))?.hash,e.blockHash),'Payout event reorg');
      const r=kind===0?await short.shortResult(e.args.drawId):await monthly.month(e.args.drawId);check(same(r.resultHash,e.args.resultHash),'Payout result mismatch');
      const winners=kind===0?Array.from(r.winners):[r.winner];
      for(const winner of new Set(winners.filter(w=>w!==ethers.ZeroAddress).map(w=>w.toLowerCase())))if(!state.payouts.some(p=>same(p.draw,e.args.drawId)&&same(p.winner,winner)))state.payouts.push({draw:e.args.drawId,winner,blockNumber:e.blockNumber,blockHash:e.blockHash});
     }
     check(same((await provider.getBlock(to))?.hash,end.hash),'Payout scan changed');state.cursor={number:to,hash:end.hash};save(state);
    }
    for(const p of [...state.payouts]){
     check(same((await provider.getBlock(p.blockNumber))?.hash,p.blockHash),'Payout origin reorg');
     try{if(await vault.reward(p.draw,p.winner)>0n)await send(vault.connect(executor).claim,[p.draw,p.winner]);}
     catch(e){if(!e.definiteRejection)throw e;(results.claimFailures??=[]).push({draw:p.draw,winner:p.winner});continue;}
     state.payouts=state.payouts.filter(x=>x!==p);save(state);
    }
   }
   try{
    const unresolved=await reconcilePending(state,save,provider,c.executor);if(unresolved)return {...unresolved,steps,results,publicSends:false};
    if(state.lastResolved)check(same((await provider.getBlock(state.lastResolved.blockNumber))?.hash,state.lastResolved.blockHash),'Resolved transaction reorg; explicit recovery required');
    const child=await runDrandDelivery({...deliver,reconcileOnly:true});if(['blocked','error','stopped'].includes(child.status))return result(child.status,child.reason);
    for(const [address,digest]of [[c.vault,c.lifecycle.vaultCodeHash],[short.target,c.lifecycle.sourceCodeHash],[monthly.target,c.lifecycle.monthlySourceCodeHash],[adapter.target,c.deliveryJob.adapterCodeHash]])check(same(ethers.keccak256(await provider.getCode(address)),digest),'Obligation runtime changed');
    check(same(await short.randomProvider(),adapter.target)&&same(await monthly.randomProvider(),adapter.target),'RNG binding changed');
    return await withTransactionBoundary(boundary,async()=>{
     await claims();
     results.rng=await runDrandDelivery({...deliver,transactionGuard:async(request,action,before)=>{await guard(request,action);if(before)sentCount++;}},{...(getBeacon?{getBeacon}:{}),onStep:async s=>{steps.push(s);await onStep(s);}});
     if(['blocked','error','stopped'].includes(results.rng.status))return result(results.rng.status,results.rng.reason);
     results.settlement=await runScheduler({...schedule,allowNewJobs:false,obligationsOnly:drain},{maxTicks:16});
     if(state.pending)return result('blocked',state.pending.transactionHash?'pendingReceipt':'unknownHash');
     if(['error','blocked','stopped'].includes(results.settlement.status))return result(results.settlement.status,'settlement');
     await claims();
     if(!drain){
      try{
       for(const k of ['collector','escrow'])check(same(ethers.keccak256(await provider.getCode(c[k])),c.codeHashes[k]),'Funding runtime changed');
       check(same(await collector.promoVault(),c.vault)&&same(await collector.quoteToken(),c.manifest.quote)&&same(await collector.escrow(),c.escrow),'Funding binding changed');
       check(String(await collector.campaignId())===c.campaignId,'Campaign changed');const policy=await collector.policy(c.campaignId);
       check(policy.recipients.every((a,i)=>same(a,c.recipients[i]))&&policy.bps.every((n,i)=>n===BigInt([9000,500,500][i])),'Funding allocation changed');
       results.funding=[];
       for(const action of ['pull','sync','pay-prizes','pay-ops','pay-team','sweep','pull','pay-prizes','pay-ops','pay-team']){
        const a=(await inspect(provider,c.collector,c.executor)).actions[action];
        if(a?.status!=='ready'){results.funding.push({action,status:a?.status||'unavailable'});continue;}
        try{await send(collector.connect(executor)[a.method],a.args||[]);}catch(e){if(!e.definiteRejection)throw e;results.funding.push({action,status:'reverted'});}
       }
      }catch(e){if(state.pending||['LOCAL_BUDGET_WAIT','SCHEDULER_STORAGE_ERROR'].includes(e.code))throw e;results.fundingError=e.message;}
      if(!results.fundingError){results.scheduler=await runScheduler(schedule,{maxTicks:16});if(state.pending)return result('blocked',state.pending.transactionHash?'pendingReceipt':'unknownHash');if(['error','blocked','stopped'].includes(results.scheduler.status))return result(results.scheduler.status,'scheduler');}
     }
     await claims();return result('waiting',drain?'draining':'poll');
    });
   }catch(e){if(state.pending)return result('blocked',state.pending.transactionHash?'pendingReceipt':'unknownHash');if(e.code==='LOCAL_BUDGET_WAIT')return result(signal?.aborted?'stopped':'waiting',e.message);return {...result('error',e.code||'runtimeError'),error:e.message};}
  });
 });
}
module.exports={validate,reconcilePending,runPonsAutomation};
