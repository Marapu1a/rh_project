// Pure transitions for the existing coordinator state. Caller must save the returned state atomically.
// No RPC, signing, sends or independent lock/journal. Evidence must come from a verified local-chain adapter.
const {ethers}=require('ethers');
const {hash}=require('./direct-buy.cjs');
const {planNativeRefill}=require('./local-native-refill.cjs');
const check=(ok,message)=>{if(!ok)throw Error(message);};
const uint=(v,name)=>{check(typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v),'Invalid '+name);return BigInt(v);};
const digest=v=>{check(ethers.isHexString(v,32)&&v!==ethers.ZeroHash,'Invalid hash');return v.toLowerCase();};
const addr=v=>{check(ethers.isAddress(v),'Invalid address');return v.toLowerCase();};
function pendingFor(state){
 const p=state.pending,h=state.nativeRefillHistory;
 check(p?.worker==='nativeRefill'&&p.action==='transferNative','No pending refill');
 check(h?.pending===true&&h.domainHash===p.domainHash,'Pending history mismatch');return p;
}
function stageNativeRefill(state,input,nonce){
 check(!state.pending,'Resolve existing coordinator pending');
 check(!state.nativeRefillHalt,'Refill policy violation requires reconciliation');
 const h=state.nativeRefillHistory;check(h&&h.pending===false,'Explicit resolved refill history required');
 check(!Object.hasOwn(input,'history'),'History comes from coordinator state');
 check(input.ops.network.feeModel==='LOCAL_EIP1559','Only local plain EVM receipt accounting supported');
 const n=uint(nonce,'nonce');check(h.lastNonce==null||n>uint(h.lastNonce,'last nonce'),'Stale source nonce');
 const plan=planNativeRefill({...input,history:h});check(plan.status==='needsRefill','No refill to stage: '+plan.reason);
 check(uint(input.gasPrice,'fee ceiling')>0n&&BigInt(input.gasPrice)<=BigInt(input.ops.settings.maxGasPrice),'Invalid fee ceiling');
 const next=structuredClone(state);
 next.nativeRefillHistory.pending=true;
 next.pending={worker:'nativeRefill',action:'transferNative',stage:'prepared',domainHash:plan.domainHash,
  decisionKey:plan.decisionKey,settingsHash:plan.settingsHash,anchor:plan.anchor,nonce,
  ...plan.transfer,periodSeconds:input.policy.periodSeconds,maxPerPeriod:input.policy.maxPerPeriod,
  historyHash:hash(h),feeEnvelope:{type:2,gasLimit:input.source.transferGas,maxFeePerGas:input.gasPrice,maxPriorityFeePerGas:'0'}};
 return next;
}
function verifyTransaction(p,tx){
 check(tx.chainId==='31337'&&tx.data==='0x','Not a local plain native transfer');
 check(addr(tx.from)===p.from&&addr(tx.to)===p.to&&uint(tx.value,'tx value')===BigInt(p.value)
  &&uint(tx.nonce,'tx nonce')===BigInt(p.nonce),'Transaction does not match refill intent');
 return digest(tx.hash);
}
function policyMismatch(p,tx){
 const expected=p.feeEnvelope;
 return !expected||tx.type!==expected.type||['gasLimit','maxFeePerGas','maxPriorityFeePerGas'].some(k=>tx[k]!==expected[k]);
}
function recordNativeRefillHash(state,transaction){
 const p=pendingFor(state),transactionHash=verifyTransaction(p,transaction);
 check(!p.transactionHash||p.transactionHash===transactionHash,'Refill hash replacement requires reconciliation');
 const next=structuredClone(state);next.pending.transactionHash=transactionHash;next.pending.stage=(p.stage==='broadcastPolicyMismatch'||policyMismatch(p,transaction))?'broadcastPolicyMismatch':'broadcast';return next;
}
function finalizeNativeRefill(state,{transaction,receipt,block}){
 const p=pendingFor(state),h=state.nativeRefillHistory;
 check(['broadcast','broadcastPolicyMismatch'].includes(p.stage)&&p.transactionHash,'Unknown refill hash');
 check(hash({...h,pending:false})===p.historyHash,'History changed while refill pending');
 const txHash=verifyTransaction(p,transaction);check(txHash===p.transactionHash&&digest(receipt.hash)===txHash,'Receipt for different transaction');
 check(receipt.status===0||receipt.status===1,'Receipt not mined');
 const number=uint(block.number,'block number'),time=uint(block.timestamp,'block time');
 check(digest(block.hash)===digest(receipt.blockHash)&&number===uint(receipt.blockNumber,'receipt block'),'Receipt block mismatch');
 check(number>=BigInt(p.anchor.number)&&time>=BigInt(p.anchor.timestamp),'Receipt precedes intent');
 check(h.lastAttemptAt===null||time>=uint(h.lastAttemptAt,'last attempt'),'Out of order attempt');
 const period=uint(p.periodSeconds,'period');check(period>0n,'Zero period');
 const window=time/period*period,oldWindow=uint(h.windowStart,'history window');check(oldWindow<=window&&oldWindow%period===0n,'Invalid history window');
 const fee=uint(receipt.gasUsed,'receipt gas')*uint(receipt.gasPrice,'receipt price');
 const debit=fee+(receipt.status===1?BigInt(p.value):0n);
 const spent=(oldWindow===window?uint(h.spent,'spent'):0n)+debit;
 const next=structuredClone(state);
 next.nativeRefillHistory={...h,pending:false,windowStart:String(window),spent:String(spent),lastAttemptAt:String(time),
  lastSuccessAt:receipt.status===1?String(time):(h.lastSuccessAt??null),lastNonce:p.nonce};
 next.lastResolved={...p,status:receipt.status,blockNumber:String(number),blockHash:block.hash,fee:String(fee),actualDebit:String(debit),
  budgetExceeded:debit>BigInt(p.maxSourceDebit)||spent>BigInt(p.maxPerPeriod)};
 if(p.stage==='broadcastPolicyMismatch'||policyMismatch(p,transaction)){
  next.nativeRefillHalt={reason:'broadcastPolicyMismatch',transactionHash:txHash,expected:p.feeEnvelope||null,
   observed:{type:transaction.type??null,gasLimit:transaction.gasLimit??null,maxFeePerGas:transaction.maxFeePerGas??null,maxPriorityFeePerGas:transaction.maxPriorityFeePerGas??null}};
  next.lastResolved.policyMismatch=true;
 }
 delete next.pending;return next;
}
module.exports={stageNativeRefill,recordNativeRefillHash,finalizeNativeRefill};
