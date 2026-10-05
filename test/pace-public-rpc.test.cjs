const {test}=require('node:test'),assert=require('node:assert/strict');
const {paceProvider}=require('../scripts/pace-public-rpc.cjs');
test('public RPC queue serializes requests and never retries an ambiguous send',async()=>{
 const calls=[],waits=[];let release;const first=new Promise(r=>release=r);const p=paceProvider({send:async(method)=>{calls.push(method);if(method==='eth_call')await first;if(method==='eth_sendRawTransaction')throw Error('unknown outcome');return method;}},{wait:async ms=>waits.push(ms)});
 const a=p.send('eth_call'),b=p.send('eth_sendRawTransaction'),c=p.send('eth_blockNumber');const rejection=assert.rejects(b,/unknown outcome/);await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['eth_call']);release();assert.equal(await a,'eth_call');await rejection;assert.equal(await c,'eth_blockNumber');assert.deepEqual(calls,['eth_call','eth_sendRawTransaction','eth_blockNumber']);assert.deepEqual(waits,[120,120,120]);
});
test('public journal persists signed hash before broadcast and preserves it on a lost response',async()=>{
 const {Wallet,keccak256}=require('ethers'),{createBoundary}=require('../scripts/pons-transaction-journal.cjs');const wallet=Wallet.createRandom();const tx={to:'0x'+'1'.repeat(40),data:'0x',value:0n,chainId:4663,nonce:0,gasLimit:21000n,type:2,maxFeePerGas:30000000n,maxPriorityFeePerGas:0n};
 const state={pending:{action:'pull',target:tx.to,data:tx.data,value:'0',from:wallet.address}},saved=[];
 const boundary=createBoundary({state,save:s=>saved.push(structuredClone(s)),provider:{broadcastTransaction:async raw=>{assert.equal(saved.at(-1).pending.transactionHash,keccak256(raw));assert.equal(saved.at(-1).pending.nonce,0);throw Error('lost response');}},sender:wallet.address,guard:async()=>{},onConfirmed:async()=>{},signer:{populateTransaction:async()=>tx,signTransaction:t=>wallet.signTransaction(t)}});
 await assert.rejects(boundary.broadcast(tx),/lost response/);assert.equal(state.pending.transactionHash,keccak256(state.pending.signedTransaction));assert.equal(saved.length,1);
});

test('signed journal persistence failure prevents any broadcast',async()=>{
 const {Wallet}=require('ethers'),{createBoundary}=require('../scripts/pons-transaction-journal.cjs');const wallet=Wallet.createRandom();
 const tx={to:'0x'+'1'.repeat(40),data:'0x',value:0n,chainId:4663,nonce:0,gasLimit:21000n,type:2,maxFeePerGas:30000000n,maxPriorityFeePerGas:0n};let broadcasts=0;
 const boundary=createBoundary({state:{pending:{target:tx.to,data:tx.data,value:'0'}},save:()=>{throw Error('disk full');},provider:{broadcastTransaction:async()=>broadcasts++},sender:wallet.address,signer:{populateTransaction:async()=>tx,signTransaction:t=>wallet.signTransaction(t)}});
 await assert.rejects(boundary.broadcast(tx),/disk full/);assert.equal(broadcasts,0);
});

test('signed journal checks intent and removes raw payload from confirmed output',async()=>{
 const {Wallet,Transaction}=require('ethers'),{createBoundary,reconcilePending}=require('../scripts/pons-transaction-journal.cjs');const wallet=Wallet.createRandom();
 const tx={to:'0x'+'1'.repeat(40),data:'0x',value:0n,chainId:4663,nonce:0,gasLimit:21000n,type:2,maxFeePerGas:30000000n,maxPriorityFeePerGas:0n};
 for(const reconcile of [false,true]){
  const state={pending:{target:tx.to,data:tx.data,value:'0',from:wallet.address}},saved=[];let output,receipt,signed;
  const provider={broadcastTransaction:async raw=>{signed=Transaction.from(raw);receipt={hash:signed.hash,status:1,blockNumber:20,blockHash:'0xbb'};return {hash:signed.hash,nonce:0};},getBlock:async()=>({hash:'0xbb'}),getTransactionReceipt:async()=>receipt,getTransaction:async()=>signed};
  const boundary=createBoundary({state,save:s=>saved.push(structuredClone(s)),provider,sender:wallet.address,onConfirmed:async s=>output=s,signer:{populateTransaction:async()=>tx,signTransaction:t=>wallet.signTransaction(t)}});
  await boundary.broadcast(tx);
  if(reconcile)await reconcilePending(state,s=>saved.push(structuredClone(s)),provider,wallet.address);else await boundary.confirmed(receipt);
  assert.equal(state.pending,undefined);assert.equal(state.lastResolved.signedTransaction,undefined);assert.equal(output?.signedTransaction,undefined);assert.equal(state.lastResolved.transactionHash,signed.hash);
 }
 const boundary=createBoundary({state:{pending:{target:tx.to,data:'0x1234',value:'0'}},save:()=>assert.fail('no save'),provider:{broadcastTransaction:()=>assert.fail('no send')},sender:wallet.address,signer:{populateTransaction:async()=>tx,signTransaction:t=>wallet.signTransaction(t)}});
 await assert.rejects(boundary.broadcast(tx),/differs from intent/);
});
