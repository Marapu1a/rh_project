const {ethers}=require('ethers');
const {withState}=require('./local-scheduler-state.cjs');
const {sendLocalTransaction,withTransactionBoundary,receiptOptions}=require('./local-receipt.cjs');
const {retryableRead,transientRpc}=require('./local-rpc-watch.cjs');
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const check=(v,m)=>{if(!v)throw Error(m);};
const address=a=>ethers.isAddress(a)&&a!==ethers.ZeroAddress;
const abi=[...['projectToken','quoteToken','promoVault','source'].map(k=>`function ${k}() view returns(address)`),
 'function sourceFingerprint() view returns(bytes32)','function campaignId() view returns(uint64)',
 'function policy(uint64) view returns(tuple(uint64 endsAt,address[3] recipients,uint16[3] bps))',
 'function accounted() view returns(uint256)','function credit(address) view returns(uint256)',
 'function pull() returns(uint256)','function pay(address)',
 'error SourceDrift()','error BalanceDeficit()'];
function validateJob(j){
 check(j.schema==='local-infinity-worker-v1'&&String(j.chainId)==='31337','Local chain31337 worker only');
 for(const k of ['collector','token','quote','promo','source'])check(address(j[k]),'Invalid '+k);
 for(const k of ['collectorCodeHash','sourceFingerprint'])check(/^0x[0-9a-fA-F]{64}$/.test(j[k]),'Invalid '+k);
 check(Number.isSafeInteger(j.anchor?.number)&&j.anchor.number>=0&&/^0x[0-9a-fA-F]{64}$/.test(j.anchor.hash),'Invalid deployment anchor');
 check(BigInt(j.campaignId)>0n&&BigInt(j.maxGasPrice)>0n&&BigInt(j.nativeFloor)>=0n,'Invalid limits');
 check(Array.isArray(j.recipients)&&j.recipients.length===3&&j.recipients.every(ethers.isAddress)&&same(j.recipients[0],j.promo),'Invalid recipients');
 check(Array.isArray(j.bps)&&j.bps.length===3&&j.bps.every(n=>Number.isInteger(n)&&n>=0&&n<=10000)&&j.bps.reduce((a,b)=>a+b,0)===10000,'Invalid bps');
 check(Array.isArray(j.legacy)&&j.legacy.length<=8,'At most eight legacy witnesses');
 for(const x of j.legacy)check(address(x.recipient)&&BigInt(x.campaignId)>0n&&BigInt(x.campaignId)<BigInt(j.campaignId)&&Number.isInteger(x.slot)&&x.slot>=0&&x.slot<3,'Invalid legacy witness');
 check(Number.isInteger(j.pollSeconds)&&j.pollSeconds>=60&&j.pollSeconds<=86400,'Invalid poll interval');
 for(const a of ['pull','pay'])check(BigInt(j.gasUnits?.[a])>0n,'Missing gas estimate floor');
 return j;
}
async function runInfinityWorker({provider,collector,executor,job,statePath,signal,receiptTimeoutMs=30000},{onStep=()=>{}}={}){
 job=JSON.parse(JSON.stringify(validateJob(job)));receiptOptions(receiptTimeoutMs);
 check(executor?.provider===provider,'Signer/provider mismatch');
 check(collector.runner===provider||collector.runner?.provider===provider,'Contract/provider mismatch');
 check(same(collector.target,job.collector),'Collector mismatch');
 check((await provider.getNetwork()).chainId===31337n,'Local chain31337 only');
 const sender=await executor.getAddress();
 const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalize(x)])):typeof v==='string'&&/^0x[0-9a-fA-F]+$/.test(v)?v.toLowerCase():v;
 return withState(statePath,normalize({worker:'infinity-v1',job,sender}),async(state,save)=>{
  const steps=[],failures=[];
  const result=(status,reason,extra={})=>({status,...(reason?{reason}:{}),steps,failures,...extra});
  const blocked=reason=>result('blocked',reason,{requiresReconciliation:true,pending:state.pending});
  const wait=reason=>{throw Object.assign(Error(reason),{workerWait:reason});};
  try{
   if(signal?.aborted)return result('stopped','aborted');
   if((await provider.getBlock(job.anchor.number))?.hash!==job.anchor.hash)throw Error('Deployment anchor mismatch');
   if(state.pending){
    if(!state.pending.transactionHash)return blocked('unknownHash');
    const r=await provider.getTransactionReceipt(state.pending.transactionHash);if(!r)return blocked('pendingReceipt');
    const b=await provider.getBlock(r.blockNumber),tx=await provider.getTransaction(state.pending.transactionHash);
    if(!b||b.hash!==r.blockHash||r.hash!==state.pending.transactionHash||![0,1].includes(r.status)||!tx||tx.hash!==state.pending.transactionHash||tx.nonce!==state.pending.nonce||!same(tx.from,sender)||!same(tx.to,state.pending.target)||!same(tx.data,state.pending.data))return blocked('unconfirmedReceipt');
    state.lastResolved={...state.pending,status:r.status,blockHash:r.blockHash};delete state.pending;save(state);
   }
   const head=await provider.getBlock('latest'),at={blockTag:head.number};
   check(ethers.keccak256(await provider.getCode(job.collector,head.number))===job.collectorCodeHash.toLowerCase(),'Collector runtime mismatch');
   for(const [getter,key]of [['projectToken','token'],['quoteToken','quote'],['promoVault','promo'],['source','source']])check(same(await collector[getter](at),job[key]),'Collector '+getter+' mismatch');
   check(same(await collector.sourceFingerprint(at),job.sourceFingerprint),'Pinned source fingerprint mismatch');
   check(await collector.campaignId(at)===BigInt(job.campaignId),'Campaign mismatch');
   const p=await collector.policy(job.campaignId,at);
   check(p.recipients.every((x,i)=>same(x,job.recipients[i]))&&p.bps.every((x,i)=>x===BigInt(job.bps[i])),'Campaign policy mismatch');
   const recipients=[...job.recipients.filter(address)];
   for(const x of job.legacy){const old=await collector.policy(x.campaignId,at);check(same(old.recipients[x.slot],x.recipient)&&(x.slot===0||old.bps[x.slot]>0n),'Legacy witness mismatch');recipients.push(x.recipient);}
   const quote=new ethers.Contract(job.quote,['function balanceOf(address) view returns(uint256)'],provider);
   async function solvency(){check(await quote.balanceOf(job.collector)>=await collector.accounted(),'Collector balance deficit');}
   async function budget(request,action){
    if(signal?.aborted)throw Object.assign(Error('Aborted'),{code:'LOCAL_EXECUTION_STOPPED'});
    const price=(await provider.getFeeData()).gasPrice;if(price==null||price>BigInt(job.maxGasPrice))wait('gasPrice');
    const units=BigInt(request.gasLimit??job.gasUnits[action]);
    const required=units*BigInt(request.maxFeePerGas??price)+BigInt(job.nativeFloor);
    if(await provider.getBalance(sender)<required)wait('nativeFunding');
    if(await provider.getTransactionCount(sender,'pending')>await provider.getTransactionCount(sender,'latest'))wait('pendingSigner');
    if((await provider.getBlock(head.number))?.hash!==head.hash)wait('chainChanged');
    if(await collector.campaignId()!==BigInt(job.campaignId))wait('campaignChanged');
   }
   const boundary={preflight:budget,before:async(request,action)=>{
    await budget(request,action);check(!state.pending,'Unresolved intent');
    state.pending={worker:'infinity',action,target:request.to,data:request.data,from:sender,stage:'broadcast'};save(state);
   },sent:async tx=>{state.pending={...state.pending,transactionHash:tx.hash,nonce:tx.nonce,stage:'confirm'};save(state);},confirmed:async r=>{
    check(r.hash===state.pending?.transactionHash,'Receipt mismatch');const block=await provider.getBlock(r.blockNumber);check(block?.hash===r.blockHash,'Receipt not canonical');
    state.lastResolved={...state.pending,status:r.status,blockHash:r.blockHash};delete state.pending;save(state);
   }};
   async function send(action,args){
    const price=(await provider.getFeeData()).gasPrice;if(price==null||price>BigInt(job.maxGasPrice))wait('gasPrice');
    const receipt=await withTransactionBoundary(boundary,()=>sendLocalTransaction(collector.connect(executor)[action],args,
     {from:sender,type:2,maxFeePerGas:price,maxPriorityFeePerGas:0},{signal,receiptTimeoutMs}));
    const step={action,args,transactionHash:receipt.hash};steps.push(step);await onStep(step);
   }
   await solvency();
   // Static pull performs the exact contract checks, including external policy drift.
   // Do not broadcast an empty no-op, but still allow direct inventory to be synced by pull.
   let pullDue;
   try{pullDue=await collector.pull.staticCall();}
   catch(e){if(retryableRead(e)||e.code==='CALL_EXCEPTION'){
     const data=e.data||e.info?.error?.data;if(typeof data==='string'&&data.startsWith(ethers.id('BalanceDeficit()').slice(0,10)))throw e;
     failures.push({action:'pull',reason:retryableRead(e)?'sourceReadUnavailable':typeof data==='string'&&data.startsWith(ethers.id('SourceDrift()').slice(0,10))?'sourceDrift':'pullRejected'});
    }else throw e;}
   if(pullDue!==undefined&&(pullDue>0n||await quote.balanceOf(job.collector)>await collector.accounted())){
    try{await send('pull',[]);}catch(e){if(e.definiteRejection){await solvency();failures.push({action:'pull',reason:'pullRejected'});}else throw e;}
   }
   for(const recipient of [...new Map(recipients.map(x=>[x.toLowerCase(),x])).values()]){
    await solvency();if(await collector.credit(recipient)===0n)continue;
    try{await send('pay',[recipient]);}catch(e){if(e.definiteRejection){failures.push({action:'pay',recipient,reason:'payRejected'});}else throw e;}
   }
   return result(failures.length?'degraded':'complete');
  }catch(e){
   if(state.pending){
    if(state.pending.transactionHash&&e.code==='LOCAL_RECEIPT_TIMEOUT')return blocked('pendingReceipt');
    return {...blocked('unknownTransaction'),retryableRpcRead:!!state.pending.transactionHash&&((e.stage==='confirm'&&transientRpc(e))||retryableRead(e))};
   }
   if(e.workerWait||e.cause?.workerWait)return result('waiting',e.workerWait||e.cause.workerWait);
   if(e.code==='INSUFFICIENT_FUNDS'||e.cause?.code==='INSUFFICIENT_FUNDS')return result('waiting','nativeFunding');
   if(signal?.aborted||e.code==='LOCAL_EXECUTION_STOPPED')return result('stopped','aborted');
   return result('error',undefined,{retryableRpcRead:retryableRead(e),error:{message:e.message,code:e.code}});
  }
 });
}
module.exports={runInfinityWorker,validateJob,abi};
