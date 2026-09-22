// Read-only diagnostic. Never acquires/removes locks, saves state, obtains a signer or sends.
const fs=require('node:fs'),path=require('node:path'),{ethers}=require('ethers');
const {hash}=require('./direct-buy.cjs');
const {inspectLock}=require('./local-scheduler-state.cjs');
const {refillDomainHash}=require('./local-native-refill.cjs');
const {recordNativeRefillHash,finalizeNativeRefill}=require('./local-native-refill-state.cjs');
const check=(ok,message)=>{if(!ok)throw Error(message);};
const uint=v=>typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v);
const digest=v=>ethers.isHexString(v,32)&&v!==ethers.ZeroHash;
const txData=t=>({chainId:String(t.chainId),from:t.from,to:t.to,value:String(t.value),nonce:String(t.nonce),data:t.data,hash:t.hash,type:t.type,
 gasLimit:String(t.gasLimit),maxFeePerGas:t.maxFeePerGas==null?null:String(t.maxFeePerGas),maxPriorityFeePerGas:t.maxPriorityFeePerGas==null?null:String(t.maxPriorityFeePerGas)});
const actions={
 noPending:'No refill pending. This is not full coordinator readiness.',
 pendingReceipt:'Wait for the original transaction receipt and inspect again. Do not resend.',
 recoverableReceipt:'Use normal coordinator receipt recovery after exclusive ownership is established. Do not resend.',
 manualTransactionSearchRequired:'Search for the original transaction using independent evidence. Nonce alone never authorizes retry.',
 policyMismatch:'Operator review of signer fee policy is required. Do not reset the halt or resend.',
 evidenceConflict:'Resolve conflicting journal/config/chain evidence before execution.',
 invalidState:'Restore or investigate journal/config integrity without resetting funding history.',
 rpcUnavailable:'Restore RPC access and inspect again; the send outcome remains unresolved.',
 snapshotChanged:'State or lock changed during inspection. Inspect again; this report is not an execution permit.',
 unsupportedPending:'Use the owning worker recovery procedure; this inspector handles native refill only.'
};
async function inspectNativeRefill({statePath,expected,provider}){
 const file=path.resolve(statePath),lock=inspectLock(file+'.lock');
 const report={schema:'local-native-refill-inspection-v1',statePath:file,lock,readOnly:true};let bytes;
 function finish(status,detail){
  if(bytes!==undefined){try{if(fs.readFileSync(file,'utf8')!==bytes||hash(inspectLock(file+'.lock'))!==hash(lock))status='snapshotChanged';}
   catch{status='snapshotChanged';}}
  if(status==='snapshotChanged')delete report.projectedAccounting;
  const ownershipUnresolved=lock.exists!==false;
  return {...report,status,...(detail?{detail}:{}),ownershipUnresolved,nextAction:actions[status],
   ...(ownershipUnresolved?{lockAction:'Establish exclusive ownership independently; lock PID does not authorize deletion.'}:{}),
   exitCode:ownershipUnresolved?1:['noPending','recoverableReceipt'].includes(status)?0:status==='pendingReceipt'?2:1};
 }
 let state,domain,p;
 try{
  check(digest(expected.configHash),'Expected configHash required');domain=refillDomainHash(expected.refill);
  check(expected.refill.source.kind==='BOOTSTRAP_NATIVE'&&expected.refill.ops.network.feeModel==='LOCAL_EIP1559','Only local plain bootstrap inspection supported');
  bytes=fs.readFileSync(file,'utf8');const {checksum,...stored}=JSON.parse(bytes);state=stored;
  check(hash(state)===checksum&&state.schema==='local-scheduler-state-v1','Checksum/schema mismatch');
  check(state.configHash===expected.configHash,'Configuration mismatch');
  check(Array.isArray(state.jobs?.SHORT)&&Array.isArray(state.jobs?.MONTHLY),'Invalid job state');
  report.configHash=state.configHash;report.domainHash=domain;report.stateDigest=hash(state);
  const h=state.nativeRefillHistory;p=state.pending;
  if(Object.hasOwn(state,'nativeRefillHistory')){
   check(h&&h.domainHash===domain&&typeof h.pending==='boolean','History domain/state mismatch');
   check(uint(h.windowStart)&&uint(h.spent)&&BigInt(h.windowStart)%BigInt(expected.refill.policy.periodSeconds)===0n,'Invalid history expense window');
   check(h.lastAttemptAt===null||uint(h.lastAttemptAt),'Invalid last attempt');
   for(const k of ['lastNonce','lastSuccessAt'])check(h[k]==null||uint(h[k]),'Invalid '+k);
   check(h.pending===(p?.worker==='nativeRefill'),'Orphaned funding history');report.history=h;
  }
  if(p?.worker==='nativeRefill'){
   check(h?.pending===true&&p.domainHash===domain&&p.action==='transferNative','Pending domain/history mismatch');
   check(hash({...h,pending:false})===p.historyHash,'History changed under pending');
   check(p.from===expected.refill.source.address.toLowerCase()&&ethers.isAddress(p.to),'Pending source/destination mismatch');
   check(expected.refill.policy.targets.some(t=>t.address.toLowerCase()===p.to),'Unknown funding destination');
   check(uint(p.value)&&uint(p.nonce)&&uint(p.maxSourceDebit)&&uint(p.gasReserve),'Malformed pending values');
   check(p.periodSeconds===expected.refill.policy.periodSeconds&&p.maxPerPeriod===expected.refill.policy.maxPerPeriod,'Pending policy mismatch');
   check(uint(p.anchor?.number)&&BigInt(p.anchor.number)<=BigInt(Number.MAX_SAFE_INTEGER)&&uint(p.anchor.timestamp)&&digest(p.anchor.hash),'Invalid anchor');
   check(['prepared','broadcast','broadcastPolicyMismatch'].includes(p.stage),'Unknown pending stage');
   if(p.transactionHash)check(digest(p.transactionHash)&&p.stage!=='prepared','Invalid known hash stage');
  }
  report.pending=p||null;report.halt=state.nativeRefillHalt||null;
 }catch(e){return finish('invalidState',e.message);}
 if(p&&p.worker!=='nativeRefill')return finish('unsupportedPending');
 if(!p)return finish(state.nativeRefillHalt?'policyMismatch':'noPending');
 try{
  if((await provider.getNetwork()).chainId!==31337n)return finish('evidenceConflict','RPC chain differs from local profile');
 }catch(e){return finish(p.transactionHash?'rpcUnavailable':'manualTransactionSearchRequired',e.message);}
 try{
  const [latest,pending]=await Promise.all([provider.getTransactionCount(p.from,'latest'),provider.getTransactionCount(p.from,'pending')]);
  report.sourceNonce={latest:String(latest),pending:String(pending),isRetryProof:false};
 }catch(e){report.sourceNonce={available:false,error:e.message,isRetryProof:false};}
 if(!p.transactionHash)return finish('manualTransactionSearchRequired');
 let receipt,transaction,block,anchor;
 try{
  [transaction,receipt,anchor]=await Promise.all([provider.getTransaction(p.transactionHash),provider.getTransactionReceipt(p.transactionHash),provider.getBlock(Number(p.anchor.number))]);
  if(receipt)block=await provider.getBlock(receipt.blockNumber);
 }catch(e){return finish('rpcUnavailable',e.message);}
 try{
  check(anchor?.hash===p.anchor.hash,'Intent anchor conflicts with RPC');
  if(!transaction){check(!receipt,'Receipt without transaction');return finish(p.stage==='broadcastPolicyMismatch'||state.nativeRefillHalt?'policyMismatch':'pendingReceipt','Hash not currently found; this does not prove absence of broadcast');}
  const tx=txData(transaction),bound=recordNativeRefillHash(state,tx);
  report.transaction=tx;
  if(!receipt)return finish(bound.pending.stage==='broadcastPolicyMismatch'?'policyMismatch':'pendingReceipt');
  check(block&&block.hash===receipt.blockHash,'Receipt block conflicts with RPC');
  const projected=finalizeNativeRefill(state,{transaction:tx,receipt:{hash:receipt.hash,status:receipt.status,blockHash:receipt.blockHash,
   blockNumber:String(receipt.blockNumber),gasUsed:String(receipt.gasUsed),gasPrice:String(receipt.gasPrice)},
   block:{number:String(block.number),hash:block.hash,timestamp:String(block.timestamp)}});
  report.receipt={hash:receipt.hash,status:receipt.status,blockHash:receipt.blockHash,blockNumber:String(receipt.blockNumber)};
  report.projectedAccounting={persisted:false,fee:projected.lastResolved.fee,actualDebit:projected.lastResolved.actualDebit,
   spent:projected.nativeRefillHistory.spent,budgetExceeded:projected.lastResolved.budgetExceeded};
  return finish(projected.nativeRefillHalt?'policyMismatch':'recoverableReceipt');
 }catch(e){return finish('evidenceConflict',e.message);}
}
module.exports={inspectNativeRefill};
