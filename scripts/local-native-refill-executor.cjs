const {planNativeRefill,refillDomainHash}=require('./local-native-refill.cjs');
const {stageNativeRefill,recordNativeRefillHash,finalizeNativeRefill}=require('./local-native-refill-state.cjs');
const {waitLocalReceipt}=require('./local-receipt.cjs');
const check=(ok,message)=>{if(!ok)throw Error(message);};
const blockData=b=>({number:String(b.number),hash:b.hash,timestamp:String(b.timestamp)});
const txData=t=>({chainId:String(t.chainId),from:t.from,to:t.to,value:String(t.value),nonce:String(t.nonce),data:t.data,hash:t.hash});
// Caller owns the coordinator lock. Save before advancing memory.
function commit(state,save,next){save(next);for(const key of Object.keys(state))delete state[key];Object.assign(state,next);}
async function reconcileNativeRefill({provider,state,save}){
 check((await provider.getNetwork()).chainId===31337n,'Local chain 31337 only');
 const p=state.pending;check(p?.worker==='nativeRefill','No refill pending');
 if(!p.transactionHash)return {status:'blocked',reason:'unknownHash',requiresReconciliation:true};
 const receipt=await provider.getTransactionReceipt(p.transactionHash);
 if(!receipt)return {status:'blocked',reason:'pendingReceipt',requiresReconciliation:true};
 const [transaction,block,anchor]=await Promise.all([provider.getTransaction(p.transactionHash),provider.getBlock(receipt.blockNumber),provider.getBlock(Number(p.anchor.number))]);
 if(!transaction||!block||block.hash!==receipt.blockHash||anchor?.hash!==p.anchor.hash)
  return {status:'blocked',reason:'unconfirmedReceipt',requiresReconciliation:true};
 const next=finalizeNativeRefill(state,{transaction:txData(transaction),block:blockData(block),receipt:{
  hash:receipt.hash,status:receipt.status,blockHash:receipt.blockHash,blockNumber:String(receipt.blockNumber),
  gasUsed:String(receipt.gasUsed),gasPrice:String(receipt.gasPrice)}});
 commit(state,save,next);return {status:receipt.status===1?'confirmed':'reverted',transactionHash:receipt.hash};
}
// One bounded transfer. Obligations are supplied by a trusted caller, not inferred here.
async function executeNativeRefill({provider,signer,state,save,input,signal}){
 check(signer?.provider===provider&&typeof signer.sendTransaction==='function','Refill signer/provider mismatch');
 check((await provider.getNetwork()).chainId===31337n,'Local chain 31337 only');
 check(input.source.kind==='BOOTSTRAP_NATIVE'&&input.ops.network.feeModel==='LOCAL_EIP1559','Only bootstrap plain local native supported');
 check((await signer.getAddress()).toLowerCase()===input.source.address.toLowerCase(),'Refill source signer mismatch');
 const domain=refillDomainHash(input);
 if(state.pending){
  if(state.pending.worker!=='nativeRefill')return {status:'blocked',reason:'otherPending'};
  check(state.pending.domainHash===domain,'Pending refill domain mismatch');
  return reconcileNativeRefill({provider,state,save});
 }
 if(signal?.aborted)return {status:'stopped'};
 const source=input.source.address.toLowerCase();
 const latestNonce=await provider.getTransactionCount(source,'latest'),pendingNonce=await provider.getTransactionCount(source,'pending');
 if(latestNonce!==pendingNonce)return {status:'blocked',reason:'pendingSourceNonce'};
 const head=await provider.getBlock('latest'),anchor=blockData(head),balances={};
 for(const address of new Set([source,...input.policy.targets.map(t=>t.address.toLowerCase())]))balances[address]=String(await provider.getBalance(address,head.number));
 const fee=await provider.getFeeData(),price=fee.maxFeePerGas;
 check(price!==null&&price>0n,'Missing fee quote');
 const history=state.nativeRefillHistory||{domainHash:domain,pending:false,windowStart:String(BigInt(anchor.timestamp)/BigInt(input.policy.periodSeconds)*BigInt(input.policy.periodSeconds)),spent:'0',lastAttemptAt:null,lastSuccessAt:null,lastNonce:null};
 const snapshot={...input,anchor,head:anchor,balances,gasPrice:String(price)};
 const plan=planNativeRefill({...snapshot,history});if(plan.status!=='needsRefill')return plan;
 const request={chainId:31337,to:plan.transfer.to,value:BigInt(plan.transfer.value),data:'0x',nonce:latestNonce,type:2,maxPriorityFeePerGas:0n,maxFeePerGas:price};
 const estimate=await signer.estimateGas(request),limit=BigInt(input.source.transferGas);
 if(estimate>limit||limit>head.gasLimit)return {status:'blocked',reason:'transferGasBound'};
 request.gasLimit=limit;
 const recheck=await provider.getBlock('latest');
 if(recheck.hash!==head.hash||await provider.getTransactionCount(source,'pending')!==latestNonce)return {status:'blocked',reason:'staleSnapshot'};
 if(signal?.aborted)return {status:'stopped'};
 const staged=stageNativeRefill({...state,nativeRefillHistory:history},snapshot,String(latestNonce));
 commit(state,save,staged);
 try{
  const tx=await signer.sendTransaction(request);
  commit(state,save,recordNativeRefillHash(state,txData(tx)));
  try{await waitLocalReceipt(tx,{signal,receiptTimeoutMs:input.ops.settings.receiptTimeoutMs});}catch(error){
   if(error.code==='TRANSACTION_REPLACED'||error.receipt?.hash!==tx.hash||error.receipt.status!==0)return {status:'blocked',reason:'receiptUnknown',requiresReconciliation:true};
  }
  return await reconcileNativeRefill({provider,state,save});
 }catch(error){return {status:'blocked',reason:'sendOrPersistenceUnknown',requiresReconciliation:true,error:{message:error.message,code:error.code}};}
}
module.exports={executeNativeRefill,reconcileNativeRefill};
