const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {reconcile}=require('../scripts/promo-native-refill.cjs');
function fixture(){
 const tx={chainId:31337n,from:'0x'+'11'.repeat(20),to:'0x'+'22'.repeat(20),value:100n,nonce:0,data:'0x',type:2,gasLimit:30000n,maxFeePerGas:3n,maxPriorityFeePerGas:0n,hash:ethers.id('tx')};
 const anchor={number:1,hash:ethers.id('anchor'),timestamp:120},block={number:2,hash:ethers.id('block'),timestamp:121};
 const receipt={hash:tx.hash,status:1,blockHash:block.hash,blockNumber:2,gasUsed:21000n,gasPrice:2n};
 const state={refillHistory:{windowStart:'120',spent:'10',lastAttemptAt:null,lastNonce:null},pending:{worker:'promoNativeRefill',transactionHash:tx.hash,chainId:'31337',from:tx.from,to:tx.to,value:'100',nonce:0,gasLimit:'30000',maxFeePerGas:'3',maxDebit:'100000',maxPerPeriod:'200000',periodSeconds:'60',anchor}};
 const provider={getNetwork:async()=>({chainId:31337n}),getTransaction:async()=>tx,getTransactionReceipt:async()=>receipt,getBlock:async n=>n===1?anchor:block};
 return {provider,state,save:()=>{},tx,receipt,block};
}
test('refill receipt save failure retains pending and original accounting until successful retry',async()=>{
 const f=fixture(),before=structuredClone(f.state);await assert.rejects(reconcile({...f,save:()=>{throw Error('disk failure');}}),/disk failure/);
 assert.deepEqual(f.state,before);await reconcile(f);assert(!f.state.pending);assert.equal(f.state.refillHistory.spent,'42110');
});
test('reverted refill charges only fee; receipt window rollover preserves cooldown and nonce',async()=>{
 const f=fixture();f.receipt.status=0;f.block.timestamp=181;
 const r=await reconcile(f);assert.equal(r.status,'reverted');assert.equal(f.state.refillHistory.spent,'42000');assert.equal(f.state.refillHistory.windowStart,'180');assert.equal(f.state.refillHistory.lastAttemptAt,'181');assert.equal(f.state.refillHistory.lastNonce,0);
});
test('wrong nonce or noncanonical refill receipt never clears intent',async()=>{
 const f=fixture();f.tx.nonce=1;await assert.rejects(reconcile(f),/differs/);assert(f.state.pending);
 f.tx.nonce=0;f.receipt.blockHash=ethers.id('wrong');assert.equal((await reconcile(f)).reason,'unconfirmedReceipt');assert(f.state.pending);
});
test('actual refill cost above envelope remains accounted and stops further refills',async()=>{
 const f=fixture();f.state.pending.maxDebit='42000';await reconcile(f);assert.equal(f.state.refillHistory.spent,'42110');assert(f.state.refillHalt);assert(!f.state.pending);
});
