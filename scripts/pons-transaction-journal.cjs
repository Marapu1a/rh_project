// Shared by the Pons coordinator and process-crash integration tests.
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const check=(v,m)=>{if(!v)throw Error(m);};
async function reconcilePending(state,save,provider,sender){
 const p=state.pending;if(!p)return null;
 if(!p.transactionHash)return {status:'blocked',reason:'unknownHash'};
 const r=await provider.getTransactionReceipt(p.transactionHash);if(!r)return {status:'blocked',reason:'pendingReceipt'};
 const tx=await provider.getTransaction(p.transactionHash),b=await provider.getBlock(r.blockNumber);
 if(!tx||!b||!same(b.hash,r.blockHash)||!same(r.hash,p.transactionHash)||!same(tx.hash,p.transactionHash)||tx.nonce!==p.nonce||!same(tx.from,sender)||!same(tx.to,p.target)||!same(tx.data,p.data)||BigInt(tx.value||0)!==BigInt(p.value||0)||![0,1].includes(r.status))return {status:'blocked',reason:'unconfirmedReceipt'};
 state.lastResolved={...p,status:r.status,blockNumber:r.blockNumber,blockHash:r.blockHash};delete state.pending;save(state);return null;
}
function createBoundary({state,save,provider,sender,guard,onConfirmed}){
 return {preflight:guard,before:async(request,action)=>{await guard(request,action);check(!state.pending,'Unresolved intent');state.pending={action,target:request.to,data:request.data,value:String(request.value||0),from:sender};save(state);},sent:async tx=>{state.pending={...state.pending,transactionHash:tx.hash,nonce:tx.nonce};save(state);},confirmed:async r=>{
  check(state.pending&&same(r.hash,state.pending.transactionHash)&&same((await provider.getBlock(r.blockNumber))?.hash,r.blockHash),'Noncanonical receipt');
  const resolved={...state.pending,status:r.status,blockNumber:r.blockNumber,blockHash:r.blockHash};state.lastResolved=resolved;delete state.pending;save(state);await onConfirmed(resolved);
 }};
}
module.exports={reconcilePending,createBoundary};
