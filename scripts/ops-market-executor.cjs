// Runs only inside the automation main lock. One source signer shared with native refill.
const {ethers}=require('ethers'),network=require('./runtime-network.cjs'),market=require('./ops-market-quote.cjs');
const {waitLocalReceipt}=require('./local-receipt.cjs');
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const erc=new ethers.Interface(['function approve(address,uint256) returns(bool)','function allowance(address,address) view returns(uint256)','event Transfer(address indexed from,address indexed to,uint256 value)']);
const permit=new ethers.Interface(['function approve(address,address,uint160,uint48)']);
const weth=new ethers.Interface(['event Withdrawal(address indexed src,uint256 wad)']);
function validate(c){
 if(c==null)return;
 for(const k of ['amountRaw','maxUsdPerPeriod','periodSeconds','cooldownSeconds','allowanceSeconds','maxGasUnits','maxGasPrice','nativeFloor','extraFeeWei','maxNativeFeesPerPeriod'])check(typeof c[k]==='string'&&/^(0|[1-9][0-9]*)$/.test(c[k]),'Invalid swap '+k);
 check(BigInt(c.amountRaw)>1n&&BigInt(c.amountRaw)<(1n<<127n)&&BigInt(c.maxUsdPerPeriod)>=BigInt(c.amountRaw)&&BigInt(c.periodSeconds)>0n&&BigInt(c.maxGasUnits)>0n&&BigInt(c.maxGasPrice)>0n,'Invalid swap bounds');
 check(BigInt(c.allowanceSeconds)>BigInt(c.deadlineSeconds||0)+BigInt(c.cooldownSeconds)&&BigInt(c.allowanceSeconds)<=86400n,'Permit expiry must cover next quote after cooldown');
 for(const k of ['slippageBps','maxImpactBps'])check(Number.isInteger(c[k])&&c[k]>=0&&c[k]<=1000,'Invalid swap '+k);
 for(const k of ['maxAgeSeconds','deadlineSeconds'])check(Number.isInteger(c[k])&&c[k]>0&&c[k]<=600,'Invalid swap '+k);
 check(typeof c.localFork==='boolean','Explicit swap fork mode required');
}
function commit(state,save,next){save(next);for(const k of Object.keys(state))delete state[k];Object.assign(state,next);}
async function reconcile({provider,state,save}){
 const p=state.pending;check(p?.worker==='opsMarket','Missing ops intent');network.checkChain((await provider.getNetwork()).chainId);
 if(!p.transactionHash)return {status:'blocked',reason:'unknownHash'};
 const r=await provider.getTransactionReceipt(p.transactionHash);if(!r)return {status:'blocked',reason:'pendingReceipt'};
 const tx=await provider.getTransaction(p.transactionHash),b=await provider.getBlock(r.blockNumber),anchor=await provider.getBlock(p.anchor.number);
 if(!b||!same(b.hash,r.blockHash)||!same(anchor?.hash,p.anchor.hash)||!tx||!same(r.hash,p.transactionHash)||![0,1].includes(r.status))return {status:'blocked',reason:'unconfirmedReceipt'};
 check(same(tx.from,p.from)&&same(tx.to,p.to)&&same(tx.data,p.data)&&String(tx.value)==='0'&&tx.nonce===p.nonce&&String(tx.chainId)===p.chainId&&same(tx.hash,p.transactionHash),'Ops transaction differs from intent');
 const fee=r.gasUsed*r.gasPrice,next=structuredClone(state),old=state.opsSwapHistory||{spent:'0',fees:'0',windowStart:'0',lastAttemptAt:null};
 const window=BigInt(b.timestamp)/BigInt(p.periodSeconds)*BigInt(p.periodSeconds);check(window>=BigInt(old.windowStart)&&b.number>=p.anchor.number&&b.timestamp>=p.anchor.timestamp,'Invalid ops history');
 let output=0n,debit=0n,burn=0n;
 if(p.action==='swap'&&r.status===1){
  for(const log of r.logs){
   if(same(log.address,p.quote)){try{const x=erc.parseLog(log);if(x?.name==='Transfer'&&same(x.args.from,p.from))debit+=x.args.value;}catch{}}
   if(same(log.address,p.weth)){try{const x=erc.parseLog(log);if(x?.name==='Transfer'&&same(x.args.from,p.to)&&same(x.args.to,ethers.ZeroAddress))burn+=x.args.value;}catch{}try{const x=weth.parseLog(log);if(x?.name==='Withdrawal'&&same(x.args.src,p.to))output+=x.args.wad;}catch{}}
  }
  if(output===0n)output=burn;else if(burn!==0n&&burn!==output)next.opsSwapHalt='WETH unwrap logs disagree';
  if(debit!==BigInt(p.amountRaw)||output<BigInt(p.minOut))next.opsSwapHalt='Swap receipt amount mismatch';
 }
 // Charge the planned input on confirmed swap even if logs mismatch; never reset the cap on an anomaly.
 const spent=(BigInt(old.windowStart)===window?BigInt(old.spent):0n)+(p.action==='swap'&&r.status===1?BigInt(p.amountRaw):0n);
 next.opsSwapHistory={windowStart:String(window),spent:String(spent),fees:String(BigInt(old.fees)+fee),lastAttemptAt:String(b.timestamp),lastNonce:p.nonce,periodFees:String((BigInt(old.windowStart)===window?BigInt(old.periodFees||'0'):0n)+fee)};
 if(tx.type!==2||String(tx.gasLimit)!==p.gasLimit||String(tx.maxFeePerGas)!==p.maxFeePerGas||tx.maxPriorityFeePerGas!==0n||fee>BigInt(p.maxFee)||spent>BigInt(p.maxUsdPerPeriod)||BigInt(next.opsSwapHistory.periodFees)>BigInt(p.maxNativeFeesPerPeriod))next.opsSwapHalt='Ops fee or spending envelope mismatch';
 // Definite revert is not an excuse to burn seed ETH in an automatic retry loop.
 if(r.status===0)next.opsSwapHalt='Ops transaction reverted; inspect before further swaps';
 next.lastOpsSwap={...p,status:r.status,blockHash:r.blockHash,blockNumber:r.blockNumber,fee:String(fee),usdDebit:String(debit),nativeOutput:String(output)};
 delete next.pending;commit(state,save,next);return {status:r.status===1?'confirmed':'reverted',action:p.action,transactionHash:r.hash,nativeOutput:String(output)};
}
async function execute({provider,signer,config,source,ops,state,save,signal,receiptTimeoutMs}){
 validate(config);check(!state.pending,'Resolve existing intent before ops');if(state.opsSwapHalt)return {status:'waiting',reason:'opsSwapHalt'};
 check(signer?.provider===provider&&same(await signer.getAddress(),source),'Ops signer/provider mismatch');network.checkChain((await provider.getNetwork()).chainId);await network.beforeSend();
 const c={...config,maxGasPrice:String(BigInt(config.maxGasPrice)<BigInt(ops.maxGasPrice)?BigInt(config.maxGasPrice):BigInt(ops.maxGasPrice))};
 const head=await provider.getBlock('latest'),h=state.opsSwapHistory,window=BigInt(head.timestamp)/BigInt(c.periodSeconds)*BigInt(c.periodSeconds);
 if(h){check(window>=BigInt(h.windowStart)&&head.timestamp>=Number(h.lastAttemptAt),'Ops clock moved backwards');if(BigInt(head.timestamp)-BigInt(h.lastAttemptAt)<BigInt(c.cooldownSeconds))return {status:'waiting',reason:'opsSwapCooldown'};}
 if((h&&BigInt(h.windowStart)===window?BigInt(h.spent):0n)+BigInt(c.amountRaw)>BigInt(c.maxUsdPerPeriod))return {status:'waiting',reason:'opsSwapPeriodLimit'};
 const q=await market.prepareSwap(provider,{...c,source});if(!['prepared'].includes(q.status)&&q.reason!=='allowanceRequired')return q;
 let action='swap',request=q.transaction;
 if(q.reason==='allowanceRequired'){
  const amount=BigInt(c.amountRaw),p=market.profile.pins;
  const allowance=new ethers.Contract(p.quote[0],erc,provider);const current=await allowance.allowance(source,p.permit2[0],{blockTag:q.observation.blockNumber});
  if(current<amount){action='approveUSDG';request={from:source,to:p.quote[0],value:'0x0',data:erc.encodeFunctionData('approve',[p.permit2[0],amount])};}
  else{action='approvePermit2';request={from:source,to:p.permit2[0],value:'0x0',data:permit.encodeFunctionData('approve',[p.quote[0],p.router[0],amount,q.observation.timestamp+Number(c.allowanceSeconds)])};}
 }
 const price=(await provider.getFeeData()).maxFeePerGas;if(price==null||price<=0n||price>BigInt(c.maxGasPrice))return {status:'waiting',reason:'gasPrice'};
 const maxFee=BigInt(c.maxGasUnits)*price+BigInt(c.extraFeeWei);
 if((h&&BigInt(h.windowStart)===window?BigInt(h.periodFees||'0'):0n)+maxFee>BigInt(c.maxNativeFeesPerPeriod))return {status:'waiting',reason:'opsSwapFeeLimit'};
 if(await provider.getBalance(source)<maxFee+BigInt(c.nativeFloor))return {status:'waiting',reason:'sourceNeedsETH'};
 const nonce=await provider.getTransactionCount(source,'latest');if(nonce!==await provider.getTransactionCount(source,'pending')||h?.lastNonce!=null&&nonce<=h.lastNonce)return {status:'waiting',reason:'pendingRefillSigner'};
 const txRequest={...request,chainId:Number(network.current().chainId),nonce,type:2,gasLimit:BigInt(c.maxGasUnits),maxFeePerGas:price,maxPriorityFeePerGas:0n};
 const estimated=await signer.estimateGas(txRequest);if(estimated>txRequest.gasLimit||txRequest.gasLimit>head.gasLimit)return {status:'waiting',reason:'opsGasBound'};
 const latest=await provider.getBlock('latest');
 if(!same((await provider.getBlock(q.observation.blockNumber))?.hash,q.observation.blockHash)||latest.timestamp>=q.deadline||Math.floor(Date.now()/1000)>=q.deadline||Math.floor(Date.now()/1000)-q.observation.timestamp>c.maxAgeSeconds||await provider.getTransactionCount(source,'pending')!==nonce)return {status:'waiting',reason:'staleQuote'};
 if(signal?.aborted)return {status:'stopped'};await network.beforeSend();
 const next=structuredClone(state);next.pending={worker:'opsMarket',action,chainId:String(txRequest.chainId),from:source,to:txRequest.to,data:txRequest.data,nonce,gasLimit:String(txRequest.gasLimit),maxFeePerGas:String(price),maxFee:String(maxFee),maxNativeFeesPerPeriod:c.maxNativeFeesPerPeriod,anchor:{number:latest.number,hash:latest.hash,timestamp:latest.timestamp},periodSeconds:c.periodSeconds,maxUsdPerPeriod:c.maxUsdPerPeriod,amountRaw:c.amountRaw,minOut:q.minOut,quote:market.profile.pins.quote[0],weth:market.profile.pins.weth[0]};
 commit(state,save,next);const tx=await signer.sendTransaction(txRequest),sent=structuredClone(state);sent.pending.transactionHash=tx.hash;commit(state,save,sent);
 try{await waitLocalReceipt(tx,{signal,receiptTimeoutMs});}catch(e){if(e.code==='TRANSACTION_REPLACED'||e.receipt?.hash!==tx.hash||e.receipt?.status!==0)throw e;}
 return reconcile({provider,state,save});
}
module.exports={validate,execute,reconcile};
