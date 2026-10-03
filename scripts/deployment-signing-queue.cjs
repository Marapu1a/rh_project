const fs=require('node:fs'),{ethers:E}=require('ethers'),{randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const {hash}=require('./direct-buy.cjs');
function runtimeMatches(code,step,timestamp){
 if(!step.timestampLayout)return E.keccak256(code)===step.expectedRuntimeHash;
 const layout=step.timestampLayout,bytes=Buffer.from(code.slice(2),'hex');assert.equal(bytes.length,layout.byteLength);
 const actual=E.toBeHex(timestamp,32).slice(2),baseline=Buffer.from(E.toBeHex(BigInt(layout.rehearsalTimestamp),32).slice(2),'hex');
 for(const r of layout.references){assert.equal(r.length,32);assert(Number.isInteger(r.start)&&r.start>=0&&r.start+32<=bytes.length);assert.equal(bytes.subarray(r.start,r.start+32).toString('hex'),actual,'Deployment timestamp mismatch');baseline.copy(bytes,r.start);}
 return E.keccak256(bytes)===step.expectedRuntimeHash;
}
function create({plan,file,provider,check,allowSend=false}){
 require('./deployment-signing-plan.cjs').validate(plan);
 let state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{planHash:plan.planHash,completed:[],pending:null};
 assert.equal(state.planHash,plan.planHash);let busy=false,prepared=null;
 const save=()=>{fs.writeFileSync(file+'.tmp',JSON.stringify(state),{mode:0o600});fs.renameSync(file+'.tmp',file);};
 async function exclusive(fn){assert(!busy,'Busy');busy=true;try{return await fn();}finally{busy=false;}}
 async function verifyTransaction(tx,expected){
  assert(tx);assert.equal(tx.from.toLowerCase(),expected.from.toLowerCase());assert.equal(tx.to,null);
  assert.equal(Number(tx.chainId),4663);assert.equal(tx.nonce,Number(BigInt(expected.nonce)));
  assert.equal(tx.data.toLowerCase(),expected.data.toLowerCase());assert.equal(tx.value,0n);
 }
 async function receipt(row){
  const r=await provider.getTransactionReceipt(row.hash);if(!r)return null;
  assert.equal(r.status,1,'Transaction reverted: manual review required');
  const step=plan.transactions[row.index],block=await provider.getBlock(r.blockNumber);
  assert.equal(block.hash,r.blockHash,'Receipt reorg');
  assert.equal(r.contractAddress?.toLowerCase(),step.predictedAddress.toLowerCase());
  await verifyTransaction(await provider.getTransaction(row.hash),step.request);
  assert(runtimeMatches(await provider.getCode(step.predictedAddress,r.blockNumber),step,block.timestamp),'Deployment runtime mismatch');
  return r;
 }
 async function refresh(){
  assert.equal((await provider.getNetwork()).chainId,4663n);
  for(const row of state.completed)assert(await receipt(row),'Previously confirmed deployment unavailable');
  if(state.pending?.hash){const r=await receipt(state.pending);if(r){state.completed.push(state.pending);state.pending=null;save();}}
 }
 async function ready(){
  await refresh();assert(!state.pending,'Unresolved wallet request: reconcile before retry');
  const step=plan.transactions[state.completed.length];assert(step,'Prefix complete; prepare next phase from actual receipts');
  await check();const nonce=Number(BigInt(step.request.nonce));
  assert.equal(await provider.getTransactionCount(plan.governor,'latest'),nonce,'Nonce drift');
  assert.equal(await provider.getTransactionCount(plan.governor,'pending'),nonce,'Pending transaction');
  assert.equal(await provider.getCode(step.predictedAddress),'0x','Predicted address occupied');
  const gas=await provider.estimateGas(step.request),fees=await provider.getFeeData();
  const gasPrice=fees.gasPrice;assert(gasPrice>0n&&gasPrice<=BigInt(plan.maxGasPrice),'Gas price above ceiling');const gasLimit=gas*120n/100n+30000n;
  assert(await provider.getBalance(plan.governor)>=gasLimit*gasPrice,'Insufficient ETH for this transaction');
  return {index:state.completed.length,label:step.label,predictedAddress:step.predictedAddress,request:{...step.request,gas:E.toQuantity(gasLimit),gasPrice:E.toQuantity(gasPrice)},estimatedGas:String(gas),estimatedAtGasPriceWei:String(gasPrice),gasLimitCostWei:String(gasLimit*gasPrice)};
 }
 return {
  view:()=>({planHash:plan.planHash,allowSend,governor:plan.governor,transactions:plan.transactions.map(({request,...s})=>({...s,nonce:Number(BigInt(request.nonce))})),completed:state.completed.length,pending:state.pending,next:plan.next}),
  prepare:()=>exclusive(async()=>{const p=await ready();prepared={...p,id:randomUUID(),expiresAt:Date.now()+60000};return prepared;}),
  arm:id=>exclusive(async()=>{
   assert(allowSend,'Signing disabled');assert(prepared&&prepared.id===id&&prepared.expiresAt>Date.now(),'Review expired');
   const fresh=await ready();assert.equal(hash(fresh.request),hash(prepared.request),'Gas/request changed; review again');
   const p=prepared;state.pending={index:p.index,id:p.id,request:p.request,hash:null};save();prepared=null;return p.request;
  }),
  submitted:txHash=>exclusive(async()=>{
   assert(state.pending,'No pending request');assert.match(txHash,/^0x[0-9a-f]{64}$/i);
   if(state.pending.hash)assert.equal(state.pending.hash,txHash);
   // An unavailable hash remains unresolved; never invent success or resubmit.
   await verifyTransaction(await provider.getTransaction(txHash),plan.transactions[state.pending.index].request);
   state.pending.hash=txHash;save();await refresh();return {pending:state.pending,completed:state.completed.length};
  }),
  refresh:()=>exclusive(async()=>{await refresh();return {pending:state.pending,completed:state.completed.length};})
 };
}
module.exports={create,runtimeMatches};
