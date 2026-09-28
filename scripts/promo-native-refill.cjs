// Bounded bootstrap ETH funding under the automation's existing main lock/journal.
const {ethers}=require('ethers'),network=require('./runtime-network.cjs');
const {transactionCost}=require('./local-execution-budget.cjs');
const {waitLocalReceipt}=require('./local-receipt.cjs');
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
function validate(config,sender,protectedAddresses){
 if(config==null)return;
 check(config.kind==='BOOTSTRAP_NATIVE'&&ethers.isAddress(config.source)&&config.source!==ethers.ZeroAddress,'Explicit bootstrap ETH source required');
 check(![sender,...protectedAddresses].some(a=>same(a,config.source)),'Refill source must be separate from execution and custody');
 for(const k of ['minimumBalance','transferGas','maxPerRefill','maxPerPeriod','periodSeconds','cooldownSeconds'])check(typeof config[k]==='string'&&/^(0|[1-9][0-9]*)$/.test(config[k]),'Invalid refill '+k);
 check(BigInt(config.transferGas)>=21000n&&BigInt(config.maxPerRefill)>0n&&BigInt(config.maxPerPeriod)>0n&&BigInt(config.periodSeconds)>0n,'Invalid refill bounds');
}
function commit(state,save,next){save(next);for(const key of Object.keys(state))delete state[key];Object.assign(state,next);}
async function reconcile({provider,state,save}){
 const p=state.pending;check(p?.worker==='promoNativeRefill','Missing refill intent');
 network.checkChain((await provider.getNetwork()).chainId);
 if(!p.transactionHash)return {status:'blocked',reason:'unknownHash'};
 const r=await provider.getTransactionReceipt(p.transactionHash);if(!r)return {status:'blocked',reason:'pendingReceipt'};
 const tx=await provider.getTransaction(p.transactionHash),b=await provider.getBlock(r.blockNumber),anchor=await provider.getBlock(p.anchor.number);
 if(!tx||!b||!same(b.hash,r.blockHash)||!same(anchor?.hash,p.anchor.hash)||!same(r.hash,p.transactionHash)||![0,1].includes(r.status))return {status:'blocked',reason:'unconfirmedReceipt'};
 check(String(tx.chainId)===p.chainId&&same(tx.from,p.from)&&same(tx.to,p.to)&&String(tx.value)===p.value&&tx.data==='0x'&&tx.nonce===p.nonce&&same(tx.hash,p.transactionHash),'Refill transaction differs from intent');
 const mismatch=tx.type!==2||String(tx.gasLimit)!==p.gasLimit||String(tx.maxFeePerGas)!==p.maxFeePerGas||String(tx.maxPriorityFeePerGas)!=='0';
 const fee=r.gasUsed*r.gasPrice,debit=fee+(r.status===1?BigInt(p.value):0n),window=BigInt(b.timestamp)/BigInt(p.periodSeconds)*BigInt(p.periodSeconds);
 const h=state.refillHistory;check(h&&BigInt(h.windowStart)<=window&&b.number>=p.anchor.number&&b.timestamp>=p.anchor.timestamp,'Invalid refill history');
 const spent=(BigInt(h.windowStart)===window?BigInt(h.spent):0n)+debit;
 const next=structuredClone(state);
 next.refillHistory={windowStart:String(window),spent:String(spent),lastAttemptAt:String(b.timestamp),lastNonce:p.nonce};
 next.lastRefill={...p,status:r.status,blockHash:r.blockHash,blockNumber:r.blockNumber,fee:String(fee),actualDebit:String(debit)};
 if(mismatch||debit>BigInt(p.maxDebit)||spent>BigInt(p.maxPerPeriod))next.refillHalt='Refill fee envelope or spend cap exceeded';
 delete next.pending;commit(state,save,next);return {status:r.status===1?'confirmed':'reverted',transactionHash:r.hash};
}
async function execute({provider,signer,config,sender,ops,required,state,save,signal,receiptTimeoutMs}){
 check(!state.pending,'Resolve existing intent before refill');
 if(state.refillHalt)return {status:'waiting',reason:'refillHalt'};
 check(signer?.provider===provider&&same(await signer.getAddress(),config.source),'Refill signer/provider mismatch');
 network.checkChain((await provider.getNetwork()).chainId);
 await network.beforeSend();
 const head=await provider.getBlock('latest'),price=(await provider.getFeeData()).maxFeePerGas;
 if(price==null||price<=0n||price>BigInt(ops.maxGasPrice))return {status:'waiting',reason:'gasPrice'};
 // Plain EOA transfer only: no arbitrary calls or contract receive hooks.
 if(await provider.getCode(config.source,head.number)!=='0x'||await provider.getCode(sender,head.number)!=='0x')return {status:'waiting',reason:'refillAccountCode'};
 const balance=await provider.getBalance(sender,head.number),sourceBalance=await provider.getBalance(config.source,head.number);
 if(balance>=required)return {status:'ready'};
 const now=BigInt(head.timestamp),period=BigInt(config.periodSeconds),window=now/period*period;
 const h=state.refillHistory||{windowStart:String(window),spent:'0',lastAttemptAt:null,lastNonce:null};
 check(BigInt(h.windowStart)<=window&&(h.lastAttemptAt==null||BigInt(h.lastAttemptAt)<=now),'Refill clock moved backwards');
 if(h.lastAttemptAt!=null&&now-BigInt(h.lastAttemptAt)<BigInt(config.cooldownSeconds))return {status:'waiting',reason:'refillCooldown'};
 const gas=transactionCost(ops,config.transferGas),min=(...v)=>v.reduce((a,b)=>a<b?a:b);
 const available=min(BigInt(config.maxPerRefill),BigInt(config.maxPerPeriod)-(BigInt(h.windowStart)===window?BigInt(h.spent):0n),sourceBalance-BigInt(config.minimumBalance));
 if(available<=gas){
  const constraint=sourceBalance-BigInt(config.minimumBalance)===available?'sourceBalance':BigInt(config.maxPerPeriod)-(BigInt(h.windowStart)===window?BigInt(h.spent):0n)===available?'periodCap':'attemptCap';
  return {status:'waiting',reason:'refillBudget',constraint};
 }
 const value=min(required-balance,available-gas),nonce=await provider.getTransactionCount(config.source,'latest');
 if(nonce!==await provider.getTransactionCount(config.source,'pending')||h.lastNonce!=null&&nonce<=h.lastNonce)return {status:'waiting',reason:'pendingRefillSigner'};
 const request={chainId:Number(network.current().chainId),from:config.source,to:sender,value,data:'0x',nonce,type:2,gasLimit:BigInt(config.transferGas),maxFeePerGas:price,maxPriorityFeePerGas:0n};
 const estimated=await signer.estimateGas(request);
 if(estimated>request.gasLimit||request.gasLimit>head.gasLimit)return {status:'waiting',reason:'refillGasBound'};
 if((await provider.getBlock('latest')).hash!==head.hash||await provider.getTransactionCount(config.source,'pending')!==nonce)return {status:'waiting',reason:'refillSnapshotChanged'};
 if(signal?.aborted)return {status:'stopped',reason:'stopped'};
 await network.beforeSend();
 const next=structuredClone(state);next.refillHistory=h;
 next.pending={worker:'promoNativeRefill',action:'transferNative',chainId:String(request.chainId),from:config.source,to:sender,value:String(value),nonce,gasLimit:String(request.gasLimit),maxFeePerGas:String(price),maxDebit:String(value+gas),maxPerPeriod:config.maxPerPeriod,periodSeconds:config.periodSeconds,anchor:{number:head.number,hash:head.hash,timestamp:head.timestamp}};
 commit(state,save,next);
 // Any error after this durable point keeps the intent. Never guess whether send succeeded.
 const tx=await signer.sendTransaction(request);const broadcast=structuredClone(state);broadcast.pending.transactionHash=tx.hash;commit(state,save,broadcast);
 try{await waitLocalReceipt(tx,{signal,receiptTimeoutMs});}catch(e){if(e.code==='TRANSACTION_REPLACED'||e.receipt?.hash!==tx.hash||e.receipt?.status!==0)throw e;}
 return reconcile({provider,state,save});
}
module.exports={validate,reconcile,execute};
