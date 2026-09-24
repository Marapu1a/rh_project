const {transientRpc,retryableRead}=require('./local-rpc-watch.cjs');
const {ethers}=require('ethers');
const {scan}=require('./replay-direct-buy.cjs');
const {hash,validateManifest,buyPolicyHistory}=require('./direct-buy.cjs');
const {domainFor,replayAttempts}=require('./attempt-lifecycle.cjs');
const {verifyDualBindings}=require('./dual-bindings.cjs');
const sd=require('./short-dataset.cjs'),md=require('./monthly-dataset.cjs');
const sw=require('./local-short-executor.cjs'),mw=require('./local-monthly-executor.cjs');
const {drawIdFor}=require('./draw-id.cjs');
const {withState}=require('./local-scheduler-state.cjs');
const {sendLocalTransaction,receiptOptions}=require('./local-receipt.cjs');
const check=(ok,msg)=>{if(!ok)throw Error(msg);},zero=ethers.ZeroHash;
const {resolveBuyPolicy}=require('./buy-policy-runtime.cjs');
const wait=reason=>({status:'waiting',reason});
function validateConfig(c,rpcUrl){
  check(c.schema==='local-promo-scheduler-v1'&&c.cutoffMode==='LOCAL_HEAD','Explicit local scheduler config required');
  validateManifest(c.manifest);check(String(c.manifest.chainId)==='31337'&&c.lifecycle.schema==='attempt-lifecycle-v4','Local v4 only');
  if(c.buyPolicy)check(c.buyPolicy.genesisHash===hash(c.manifest)&&String(c.buyPolicy.chainId)===String(c.manifest.chainId)&&c.buyPolicy.instanceId===c.lifecycle.instanceId,'BUY policy binding mismatch');
  check(BigInt(c.campaignId)>0n&&BigInt(c.shortBudget)>0n,'Invalid campaign/budget');
  check(Number.isInteger(c.chunkSize)&&c.chunkSize>0&&c.chunkSize<=64,'Invalid chunk size');
  const url=new URL(rpcUrl);
  check(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&!url.username&&!url.password,'Loopback HTTP RPC only');
  return domainFor(c.manifest,c.lifecycle);
}
async function pendingSigner(provider,signers){
  for(const signer of signers.filter(Boolean)){
    const address=await signer.getAddress();
    if(await provider.getTransactionCount(address,'pending')>await provider.getTransactionCount(address,'latest'))return true;
  }
  return false;
}
const ruleObject=r=>Object.fromEntries(['version','pNumerator','pDenominator','hNumerator','hDenominator'].map(k=>[k,Number(r[k])]));
async function tickKind(kind,o,state,save){
  const {provider,config,publisher,executor,signal}=o,isShort=kind==='SHORT',source=isShort?o.short:o.monthly;
  if(signal?.aborted)return {status:'stopped'};
  // Execution state is live; finalized is only the admission/dataset cutoff.
  const head=await provider.getBlock('latest'),at={blockTag:head.number};
  const active=await source[isShort?'activeProposal':'activeMonth'](at);
  const pending=await source[isShort?'pendingDatasetDraw':'pendingMonth'](at);
  const current=await source[isShort?'currentShortEpoch':'currentMonthlyEpoch'](at);
  const draining=await source[isShort?'drainingShortEpoch':'drainingMonthlyEpoch'](at);
  let selected;
  for(const entry of state.jobs[kind]){
    if(entry.retired)continue;
    if(config.buyPolicy){
      const artifact=entry.empty||entry.job.artifact;
      const snapshot=artifact.snapshot||artifact;
      const cutoff=snapshot.cutoff.blockNumber;
      const historical=await resolveBuyPolicy(config,(m,p)=>provider.send(m,p),cutoff);
      check(cutoff<=historical.admission.checkpoint.number,'Stored job cutoff is not finalized');
      const expected=hash(buyPolicyHistory(historical.manifest).at(cutoff));
      check(snapshot.domain.buyManifestHash===expected,'Stored job BUY policy mismatch');
    }
    if(entry.empty){
      if(BigInt(entry.empty.epoch)===draining){selected=entry;break;}
      continue;
    }
    const job=entry.job;(isShort?sw.validateJob:mw.validateMonthlyJob)(job);
    const p=isShort?await source.datasetProposal(job.proposalId,at):await source.month(job.artifact.request.drawId,at);
    const phase=isShort?p.status:p.phase;
    // A surviving cutoff does not authorize replaying a previously observed begin/freeze.
    check(phase!==0n||!entry.started,'Previously started job disappeared; explicit reorg recovery required');
    const terminal=isShort?phase===4n&&(await source.settlements(job.artifact.request.drawId,at)).phase===3n:phase===5n;
    if(terminal&&entry.terminalChecked){
      const checked=await provider.getBlock(entry.terminalChecked.number);
      if(checked?.hash===entry.terminalChecked.hash)continue;
    }
    if(phase===(isShort?3n:6n))continue;
    if(!terminal)delete entry.terminalChecked;
    if(phase!==0n){entry.started=true;save(state);}
    selected=entry;break;
  }
  if(selected){
    const a=selected.empty||selected.job.artifact;
    const cutoff=selected.empty?a.cutoff:a.snapshot.cutoff;
    const anchor=await provider.getBlock(Number(cutoff.blockNumber));
    if(!anchor||anchor.hash!==cutoff.blockHash||head.number+1-Number(cutoff.blockNumber)>256){
      // Expiration matters only before begin. An anchored on-chain proposal may finish later.
      const begun=selected.empty?false:(isShort?
        (await source.datasetProposal(selected.job.proposalId,at)).status!==0n:
        (await source.month(a.request.drawId,at)).phase!==0n);
      if(!begun){
        check(!selected.started,'Previously started job disappeared; explicit reorg recovery required');
        if(await pendingSigner(provider,[publisher,executor]))return wait('pendingTransaction');
        check(active===zero&&pending===zero,'Other on-chain job requires recovery');
        selected.retired='unsubmitted cutoff changed/expired';save(state);
        return {status:'progress',action:'retireUnsubmitted'};
      }
    }
    if(selected.empty){
      if(!publisher||(await publisher.getAddress()).toLowerCase()!==(await source.publisher()).toLowerCase())return wait('publisher');
      if(active!==zero||pending!==zero)return wait('otherDraw');
      // Rebuild from public history rather than trusting an empty assertion from disk.
      const historical=await resolveBuyPolicy(config,(m,p)=>provider.send(m,p),cutoff.blockNumber);
      const blocks=(await scan(historical.manifest,o.rpcUrl,cutoff.blockNumber,config.lifecycle)).blocks;
      const rebuilt=(isShort?sd:md).buildFromHistory({...selected.input,manifest:historical.manifest,blocks});
      check(hash(rebuilt)===hash(selected.empty),'Empty epoch differs from replay');
      const price=(await provider.getFeeData()).gasPrice;
      if(price==null||price>await source.maxGasPrice())return wait('gasPrice');
      if(await pendingSigner(provider,[publisher,executor]))return wait('pendingTransaction');
      if(BigInt(head.number+1)<BigInt(cutoff.blockNumber)+await source.cutoffDelayBlocks())return wait('cutoffDelay');
      if(signal?.aborted)return {status:'stopped'};
      const receipt=await sendLocalTransaction(source.connect(publisher).closeEmpty,[cutoff.blockNumber,cutoff.blockHash,a.snapshotHash],
        {type:2,maxFeePerGas:price,maxPriorityFeePerGas:0},{signal,receiptTimeoutMs:o.receiptTimeoutMs});
      return {status:'progress',action:'closeEmpty',transactionHash:receipt.hash};
    }
    const result=await (isShort?sw.stepShort:mw.stepMonthly)({provider,source,publisher,executor,job:selected.job,signal,receiptTimeoutMs:o.receiptTimeoutMs});
    if(result.status==='progress'){selected.started=true;save(state);}
    if(result.status==='terminal'){
      const checked=await provider.getBlock('latest');selected.terminalChecked={number:checked.number,hash:checked.hash};save(state);
    }
    return result;
  }
  if(active!==zero||pending!==zero)return wait('missingJob');
  const resolved=await resolveBuyPolicy(config,(m,p)=>provider.send(m,p));
  const buyManifest=resolved.manifest;
  const last=await source[isShort?'lastShortTerminalAt':'lastMonthAt'](at);
  const interval=await source[isShort?'SHORT_INTERVAL':'monthlyInterval'](at);
  if(BigInt(head.timestamp)<last+interval)return wait('schedule');
  if(!publisher||(await publisher.getAddress()).toLowerCase()!==(await source.publisher(at)).toLowerCase())return wait('publisher');
  if(await pendingSigner(provider,[publisher,executor]))return wait('pendingTransaction');
  const epoch=draining||current;
  const policy=await source[isShort?'shortEpochPolicy':'monthlyEpochPolicy'](epoch,at);
  const currentPolicy=await source[isShort?'shortEpochPolicy':'monthlyEpochPolicy'](current,at);
  if(BigInt(head.number)<currentPolicy.firstBlock)return wait('epochBoundary');
  const cutoffHead=resolved.admission?await provider.getBlock(resolved.admission.checkpoint.number):head;
  const blocks=(await scan(buyManifest,o.rpcUrl,cutoffHead.number,config.lifecycle)).blocks;
  const ledger=replayAttempts(buyManifest,config.lifecycle,blocks);
  check(ledger.head.hash===cutoffHead.hash,'Chain changed during scheduler scan');
  const epochs=isShort?ledger.shortRules:ledger.monthlyRules;
  if(BigInt(epochs.drainingEpoch||epochs.currentEpoch)!==epoch)return wait('finalizedPolicyBoundary');
  const open=ledger.wallets.some(w=>w[kind].byEpoch.some(e=>BigInt(e.epoch)===epoch&&BigInt(e.open)>0n));
  if(!open&&!draining)return wait('empty');
  const identity=hash({config:state.configHash,kind,cutoff:cutoffHead.hash,epoch:String(epoch)});
  const drawId=drawIdFor(kind,identity);
  const input={manifest:buyManifest,lifecycle:config.lifecycle,rules:ruleObject(policy.outcome),
    ...(isShort?{weights:Array.from(policy.weights,String),minimumUnit:String(policy.minimumUnit)}:{}),
    request:isShort?{drawId,campaignId:config.campaignId,rulesEpoch:String(epoch),cutoffBlockNumber:cutoffHead.number,cutoffBlockHash:cutoffHead.hash,budget:config.shortBudget}:
      {drawId,campaign:config.campaignId,rulesEpoch:String(epoch),cutoff:cutoffHead.number,cutoffHash:cutoffHead.hash}};
  if(isShort&&open)check(BigInt(config.shortBudget)<=await source.maxBudget(at),'Configured Short budget exceeds controller limit');
  const artifact=(isShort?sd:md).buildFromHistory({...input,blocks});
  const entry=artifact.schema.includes('empty-epoch')?{empty:artifact,input}:
    {job:isShort?sw.makeJob(artifact,ethers.id('scheduler proposal '+identity),config.chunkSize):mw.makeMonthlyJob(artifact,config.chunkSize)};
  state.jobs[kind].push(entry);save(state); // Durable artifact precedes all broadcasts.
  return {status:'progress',action:'saveJob',...(entry.job?{drawId}:{epoch:String(epoch)})};
}
async function runScheduler(options,{maxTicks=32,onTick=()=>{}}={}){
  receiptOptions(options.receiptTimeoutMs??30000);
  check(Number.isInteger(maxTicks)&&maxTicks>0&&maxTicks<=1000,'Invalid tick limit');
  const domain=validateConfig(options.config,options.rpcUrl);
  check((await options.provider.getNetwork()).chainId===31337n,'Local chain 31337 only');
  check(options.short.target.toLowerCase()===domain.source&&options.monthly.target.toLowerCase()===domain.monthlySource,'Wrong scheduler controllers');
  await verifyDualBindings(options.provider,domain);await sd.verifyEpochGenesis(options.provider,domain.source,domain);
  return withState(options.statePath,options.config,async(state,save)=>{
    let results;
    for(let i=0;i<maxTicks;i++){
      results={};
      let kinds=['SHORT','MONTHLY'];
      if(options.prioritizeStarted){
        const ranks=[];
        for(const [kind,source] of [['SHORT',options.short],['MONTHLY',options.monthly]]){
          const s=kind==='SHORT',pending=await source[s?'pendingDatasetDraw':'pendingMonth']();
          const active=await source[s?'activeProposal':'activeMonth']();
          ranks.push({kind,rank:pending!==zero?2:active!==zero?1:0});
        }
        kinds=ranks.sort((a,b)=>b.rank-a.rank).map(r=>r.kind);
      }
      for(const kind of kinds){
        try{results[kind]=await tickKind(kind,options,state,save);}
        catch(e){if(e.code==='SCHEDULER_STORAGE_ERROR')throw e;
          if(e.code==='LOCAL_BUDGET_WAIT'&&e.stage==='estimate'){
            results[kind]={status:'waiting',reason:'executionBudget',budget:e.budget};continue;
          }
          results[kind]=e.code==='LOCAL_EXECUTION_STOPPED'?{status:'stopped',code:e.code,stage:e.stage,transactionHash:e.transactionHash}:
          {status:'error',message:e.shortMessage||e.message,code:e.code,stage:e.stage,transactionHash:e.transactionHash,transientRpc:transientRpc(e),retryableRpcRead:retryableRead(e)};
          // Unknown send/receipt and unclassified RPC errors stop ALL subsequent kinds/ticks.
          if(!e.definiteRejection&&(e.stage||e.code)){
            await onTick(results);
            return {status:results[kind].status,results,haltedKind:kind,
              requiresReconciliation:['broadcast','confirm'].includes(e.stage)};
          }
        }
        if(results[kind].status==='stopped'){await onTick(results);return {status:'stopped',results};}
      }
      await onTick(results);
      if(options.signal?.aborted)return {status:'stopped',results};
      if(!Object.values(results).some(r=>r.status==='progress'))return {status:Object.values(results).some(r=>r.status==='error')?'error':'waiting',results};
    }
    return {status:'yielded',results};
  });
}
module.exports={runScheduler,validateConfig};
