const {waitLocalReceipt,receiptOptions}=require('./local-receipt.cjs');
// Local-only, single-job executor. The chain is the progress journal.
const {ethers}=require('ethers');
const dataset=require('./short-dataset.cjs'),settlement=require('./short-settlement.cjs');
const {hash}=require('./direct-buy.cjs');
const {verifyDualBindings}=require('./dual-bindings.cjs');
const check=(ok,message)=>{if(!ok)throw Error(message);};
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
function makeJob(artifact,proposalId,chunkSize=64){
  const job={schema:'local-short-job-v1',proposalId,chunkSize,artifact};
  job.commitment=hash(job);validateJob(job);return job;
}
function validateJob(job){
  const {commitment,...payload}=job;
  check(job.schema==='local-short-job-v1'&&hash(payload)===commitment,'Job checksum mismatch');
  check(ethers.isHexString(job.proposalId,32)&&job.proposalId!==ethers.ZeroHash,'Invalid proposal identity');
  check(Number.isInteger(job.chunkSize)&&job.chunkSize>0&&job.chunkSize<=64,'Invalid chunk size');
  const a=job.artifact,r=a.request,s=a.snapshot;
  check(a.schema==='short-dataset-artifact-v1'&&s.kind==='SHORT'&&s.domain.schema==='attempt-lifecycle-v4','Expected v4 Short artifact');
  require('./draw-id.cjs').validateDrawId(r.drawId,'SHORT');
  check(hash(s)===r.snapshotHash&&s.drawId===r.drawId&&String(s.rulesEpoch)===String(r.rulesEpoch)
    &&String(s.cutoff.blockNumber)===String(r.cutoffBlockNumber)&&s.cutoff.blockHash===r.cutoffBlockHash,'Snapshot metadata mismatch');
  check(s.participants.length>0&&s.participants.length===Number(r.expectedCount)
    &&dataset.rootFor(s.participants)===r.expectedRoot,'Artifact participants mismatch');
  check(s.participants.every(p=>BigInt(p.count)===BigInt(p.lastAttempt)-BigInt(p.firstAttempt)+1n)
    &&s.participants.reduce((n,p)=>n+BigInt(p.count),0n)===BigInt(r.expectedAttempts),'Artifact attempts mismatch');
  check(dataset.rulesHash(a.rules,a.weights,a.minimumUnit)===s.rulesHash,'Artifact rules mismatch');
  return a;
}

async function stepShort({provider,source,job,publisher,executor,gasPrice,signal,receiptTimeoutMs=30000}){
  receiptOptions(receiptTimeoutMs);
  const a=validateJob(job),r=a.request,domain=a.snapshot.domain;
  check((await provider.getNetwork()).chainId===31337n&&BigInt(domain.chainId)===31337n,'Local chain 31337 only');
  check(same(source.target,domain.source),'Wrong controller');
  await verifyDualBindings(provider,domain);
  await dataset.verifyEpochGenesis(provider,source.target,domain);
  const cutoff=await provider.getBlock(Number(r.cutoffBlockNumber));
  check(cutoff&&same(cutoff.hash,r.cutoffBlockHash),'Cutoff no longer canonical; do not replace frozen job');
  const policy=await source.shortEpochPolicy(r.rulesEpoch);
  check(policy.hash===a.snapshot.rulesHash,'On-chain policy mismatch');
  const p=await source.datasetProposal(job.proposalId);
  const wait=reason=>({status:'waiting',reason,drawId:r.drawId});
  async function send(signer,method,args){
    if(!signer)return wait(method==='begin'||method==='publish'?'publisher':'executor');
    if(price>await source.maxGasPrice())return wait('gasPrice');
    const address=await signer.getAddress();
    // No replacement transaction/nonce guessing after an ambiguous send.
    if(await provider.getTransactionCount(address,'pending')>await provider.getTransactionCount(address,'latest'))return wait('pendingTransaction');
    // Typed transactions retain an explicit chainId in Hardhat's raw RPC history.
    // price is a conservative fee cap; actual effective price may be lower.
    if(signal?.aborted)return {status:'stopped'};
    const tx=await source.connect(signer)[method](...args,{type:2,maxFeePerGas:price,maxPriorityFeePerGas:0});
    const receipt=await waitLocalReceipt(tx,{signal,receiptTimeoutMs});
    check(receipt&&receipt.status===1,'Transaction not confirmed');
    return {status:'progress',action:method,drawId:r.drawId,transactionHash:receipt.hash};
  }
  const price=gasPrice==null?(await provider.getFeeData()).gasPrice:BigInt(gasPrice);
  check(price!=null&&price>=0n,'Missing gas price');
  const ps=a.snapshot.participants.map(({wallet,firstAttempt,lastAttempt})=>({wallet,firstAttempt,lastAttempt}));
  if(p.status===3n)throw Error('Proposal superseded; explicit new job required');
  if(p.status!==0n){
    for(const key of Object.keys(r))check(same(p.request[key],r[key]),'Existing proposal differs: '+key);
    check(p.rulesHash===a.snapshot.rulesHash,'Existing proposal rules differ');
  }
  if(p.status===0n||p.status===1n){
    if(!publisher||!same(await publisher.getAddress(),await source.publisher()))return wait('publisher');
    if(p.status===0n){
      if(await source.activeProposal()!==ethers.ZeroHash||await source.pendingDatasetDraw()!==ethers.ZeroHash)return wait('otherDraw');
      const head=await provider.getBlock('latest');
      check(head.number+1-Number(r.cutoffBlockNumber)<=256,'Cutoff expired before begin; rebuild unfrozen job');
      if(BigInt(head.timestamp)<await source.lastShortTerminalAt()+await source.SHORT_INTERVAL())return wait('schedule');
      if(BigInt(head.number+1)<BigInt(r.cutoffBlockNumber)+await source.cutoffDelayBlocks())return wait('cutoffDelay');
      return send(publisher,'begin',[job.proposalId,r]);
    }
    const count=Number(p.count);
    check(count<ps.length&&p.root===dataset.rootFor(ps.slice(0,count)),'Published prefix differs');
    check(p.totalAttempts===a.snapshot.participants.slice(0,count).reduce((n,x)=>n+BigInt(x.count),0n),'Published attempts differ');
    return send(publisher,'publish',[job.proposalId,ps.slice(count,count+job.chunkSize)]);
  }
  await dataset.verifyPublication(provider,source,job.proposalId,a);
  if(p.status===2n){
    if(!executor)return wait('executor');
    if(!await source.executionReady({gasPrice:price}))return wait('executionReadiness');
    // Simulate the actual reserve, including recognition of direct USDG funding.
    try{await source.connect(executor).seal.staticCall(job.proposalId,{gasPrice:price});}
    catch(error){
      if(error.data===ethers.id('InsufficientAvailable()').slice(0,10))return wait('prizeFunding');
      throw error;
    }
    return send(executor,'seal',[job.proposalId]);
  }
  check(p.status===4n,'Unknown proposal phase');
  const recovered=await settlement.recover(provider,source,r.drawId);
  if(recovered.nextAction==='waitSeed')return wait('seed');
  if(recovered.nextAction==='terminal'){
    check((await source.shortResult(r.drawId)).resultHash===recovered.expected.resultHash,'Independent result mismatch');
    return {status:'terminal',drawId:r.drawId,resultHash:recovered.expected.resultHash};
  }
  if(recovered.nextAction==='processShort')return send(executor,'processShort',[r.drawId,recovered.state.nextChunk,recovered.chunks[Number(recovered.state.nextChunk)]]);
  check((await source.shortResult(r.drawId)).resultHash===recovered.expected.resultHash,'Independent result mismatch');
  return send(executor,'finishShort',[r.drawId]);
}

async function runShort(options,{maxSteps=128,onStep=()=>{},signal}={}){
  check(Number.isInteger(maxSteps)&&maxSteps>0&&maxSteps<=10000,'Invalid step limit');
  for(let i=0;i<maxSteps;i++){
    if(signal?.aborted)return {status:'stopped'};
    let result;
    try{result=await stepShort({...options,signal:signal??options.signal});}
    catch(error){
      if(error.code!=='LOCAL_EXECUTION_STOPPED')throw error;
      result={status:'stopped',transactionHash:error.transactionHash};
    }
    await onStep(result);
    if(result.status!=='progress')return result;
  }
  return {status:'yielded',reason:'stepLimit'};
}
module.exports={makeJob,validateJob,stepShort,runShort};
