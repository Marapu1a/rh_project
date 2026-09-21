const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {ethers}=require('ethers');
const {executeNativeRefill,reconcileNativeRefill}=require('../scripts/local-native-refill-executor.cjs');
const {withState}=require('../scripts/local-scheduler-state.cjs');
const {opsProfile}=require('./fixtures/execution-budget.cjs');
async function fixture(t){
 const rpc=require('hardhat').network.provider;await rpc.send('hardhat_reset');
 const provider=new ethers.BrowserProvider(rpc,undefined,{cacheTimeout:-1}),signer=await provider.getSigner(0),source=await signer.getAddress(),target=await (await provider.getSigner(1)).getAddress();
 await rpc.send('hardhat_setBalance',[target,'0x0']);
 const ops=opsProfile();ops.network.reserveGasPrice=ops.settings.maxGasPrice='10000000000';ops.settings.receiptTimeoutMs=50;
 const input={ops,source:{kind:'BOOTSTRAP_NATIVE',address:source,minimumBalance:'1000000000000000000',transferGas:'30000'},
  policy:{targets:[{address:target,lowWatermark:'1000000000000000',target:'2000000000000000'}],maxPerRefill:'10000000000000000',maxPerPeriod:'20000000000000000',periodSeconds:'3600',cooldownSeconds:'30'},
  protectedAddresses:['0x'+'44'.repeat(20)],committedObligations:[],candidateObligations:[]};
 const dir=fs.mkdtempSync(path.resolve('.local/refill-exec-')),file=path.join(dir,'coordinator.json'),config={fixture:'native'};
 t.after(async()=>{await rpc.send('evm_setAutomine',[true]);for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);});
 const run=(extra={})=>withState(file,config,(state,save)=>executeNativeRefill({provider,signer,state,save,input,...extra}));
 const read=()=>JSON.parse(fs.readFileSync(file));
 return {rpc,provider,signer,source,target,input,dir,file,config,run,read};
}
test('real native transfer persists intent, actual fee, and does not refill twice',async t=>{
 const f=await fixture(t),before=await f.provider.getBalance(f.source);
 const result=await f.run();assert.equal(result.status,'confirmed');
 const state=f.read();assert(!state.pending);assert.equal(await f.provider.getBalance(f.target),2000000000000000n);
 assert.equal(before-await f.provider.getBalance(f.source),BigInt(state.nativeRefillHistory.spent));
 const nonce=await f.provider.getTransactionCount(f.source);assert.equal((await f.run()).status,'ready');assert.equal(await f.provider.getTransactionCount(f.source),nonce);
});
test('mining timeout survives restart; original receipt reconciles exactly once',async t=>{
 const f=await fixture(t);await f.rpc.send('evm_setAutomine',[false]);
 assert.equal((await f.run()).reason,'receiptUnknown');assert(f.read().pending.transactionHash);
 assert.equal((await f.run()).reason,'pendingReceipt');
 await f.rpc.send('evm_mine');await f.rpc.send('evm_setAutomine',[true]);
 assert.equal((await f.run()).status,'confirmed');const spent=f.read().nativeRefillHistory.spent;
 assert.equal((await f.run()).status,'ready');assert.equal(f.read().nativeRefillHistory.spent,spent);
});
test('hashless send failure stops retries, while failure to save intent sends nothing',async t=>{
 const f=await fixture(t);let sends=0;
 const signer={provider:f.provider,getAddress:()=>f.signer.getAddress(),estimateGas:r=>f.signer.estimateGas(r),sendTransaction:async()=>{sends++;throw Error('lost transport');}};
 assert.equal((await f.run({signer})).reason,'sendOrPersistenceUnknown');assert.equal((await f.run({signer})).reason,'unknownHash');assert.equal(sends,1);
 const state={},save=()=>{throw Error('disk full');};
 await assert.rejects(()=>executeNativeRefill({provider:f.provider,signer,input:f.input,state,save}),/disk full/);assert.equal(sends,1);assert(!state.pending);
});
test('wrong signer, expensive gas, insufficient floor and stale snapshot never send',async t=>{
 const f=await fixture(t),nonce=await f.provider.getTransactionCount(f.source);
 await assert.rejects(()=>f.run({signer:{provider:{},sendTransaction:()=>{throw Error('unexpected');}}}),/signer\/provider/);
 const wrong=await f.provider.getSigner(2);await assert.rejects(()=>f.run({signer:wrong}),/source signer/);
 const low=structuredClone(f.input);low.ops.settings.maxGasPrice='1';assert.equal((await f.run({input:low})).status,'waitExpensiveGas');
 const floor=structuredClone(f.input);floor.source.minimumBalance=String(await f.provider.getBalance(f.source));assert.equal((await f.run({input:floor})).reason,'sourceFunding');
 const signer={provider:f.provider,getAddress:()=>f.signer.getAddress(),sendTransaction:r=>f.signer.sendTransaction(r),estimateGas:async r=>{const gas=await f.signer.estimateGas(r);await f.rpc.send('evm_mine');return gas;}};
 assert.equal((await f.run({signer})).reason,'staleSnapshot');assert.equal(await f.provider.getTransactionCount(f.source),nonce);
});


test('mined revert consumes only gas, starts cooldown and recovers through persisted hash',async t=>{
 const f=await fixture(t),before=await f.provider.getBalance(f.source);await f.rpc.send('evm_setAutomine',[false]);
 assert.equal((await f.run()).reason,'receiptUnknown');
 await f.rpc.send('hardhat_setCode',[f.target,'0x60006000fd']);await f.rpc.send('evm_mine');await f.rpc.send('evm_setAutomine',[true]);
 assert.equal((await f.run()).status,'reverted');const state=f.read();assert(!state.pending);
 assert.equal(await f.provider.getBalance(f.target),0n);assert.equal(before-await f.provider.getBalance(f.source),BigInt(state.nativeRefillHistory.spent));
 assert.equal(state.nativeRefillHistory.lastSuccessAt,null);assert.equal((await f.run()).reason,'cooldown');
});
test('failed hash persistence retains prepared stop; failed receipt persistence recovers without replay',async t=>{
 for(const failAt of [2,3]){
  const f=await fixture(t);let calls=0;
  const result=await withState(f.file,f.config,(state,save)=>executeNativeRefill({provider:f.provider,signer:f.signer,input:f.input,state,
   save:next=>{if(++calls===failAt)throw Error('disk write failed');save(next);}}));
  assert.equal(result.reason,'sendOrPersistenceUnknown');const nonce=await f.provider.getTransactionCount(f.source);
  assert.equal(await f.provider.getBalance(f.target),2000000000000000n);
  assert.equal((await f.run()).status,failAt===2?'blocked':'confirmed');
  if(failAt===2)assert.equal((await f.run()).reason,'unknownHash');
  assert.equal(await f.provider.getTransactionCount(f.source),nonce);
 }
});
test('pending source nonce, gas bound, abort and unrelated pending do not submit',async t=>{
 const f=await fixture(t),nonce=await f.provider.getTransactionCount(f.source);
 const signer={provider:f.provider,getAddress:()=>f.signer.getAddress(),estimateGas:async()=>30001n,sendTransaction:()=>{throw Error('unexpected');}};
 assert.equal((await f.run({signer})).reason,'transferGasBound');
 const stop=new AbortController();stop.abort();assert.equal((await f.run({signal:stop.signal})).status,'stopped');
 await withState(f.file,f.config,(state,save)=>{state.pending={worker:'draw'};save(state);});assert.equal((await f.run()).reason,'otherPending');
 await withState(f.file,f.config,(state,save)=>{delete state.pending;save(state);});
 await f.rpc.send('evm_setAutomine',[false]);await f.signer.sendTransaction({to:f.target,value:1n});
 assert.equal((await f.run()).reason,'pendingSourceNonce');assert.equal(await f.provider.getTransactionCount(f.source,'latest'),nonce);
});


test('mutated signer fees persist hash across timeout, account overspend and stop subsequent sends',async t=>{
 const f=await fixture(t);await f.rpc.send('hardhat_setBalance',[f.source,ethers.toQuantity(1001500000000000000n)]);
 const input=structuredClone(f.input);input.policy.targets[0].target=input.policy.targets[0].lowWatermark='1000000000000000';
 let sends=0;const signer={provider:f.provider,getAddress:()=>f.signer.getAddress(),estimateGas:r=>f.signer.estimateGas(r),
  sendTransaction:r=>{sends++;return f.signer.sendTransaction({...r,maxFeePerGas:100000000000n,maxPriorityFeePerGas:50000000000n});}};
 await f.rpc.send('evm_setAutomine',[false]);assert.equal((await f.run({input,signer})).reason,'receiptUnknown');
 const pending=f.read().pending;assert.equal(pending.stage,'broadcastPolicyMismatch');assert(pending.transactionHash);
 await f.rpc.send('evm_mine');await f.rpc.send('evm_setAutomine',[true]);
 assert.equal((await f.run({input,signer})).reason,'broadcastPolicyMismatch');
 const state=f.read();assert(!state.pending);assert(state.nativeRefillHalt);assert(state.lastResolved.budgetExceeded);
 assert.equal(BigInt(state.nativeRefillHistory.spent),1001500000000000000n-await f.provider.getBalance(f.source));
 const alarm=await f.run({input,signer});assert.equal(alarm.reason,'broadcastPolicyMismatch');
 assert.equal(alarm.requiresReconciliation,false);assert.equal(alarm.requiresOperatorAction,true);assert.equal(sends,1);
});

test('obligations anchor mismatch never sends; deferred buffers do not wait on source nonce',async t=>{
 const f=await fixture(t),input={...f.input,obligationsAnchor:{number:'0',hash:ethers.id('stale')}};
 assert.equal((await f.run({input})).reason,'staleSnapshot');
 await f.rpc.send('evm_setAutomine',[false]);await f.signer.sendTransaction({to:f.target,value:1n});
 assert.equal((await f.run({allowedTiers:['committed']})).reason,'tierDeferred');
});
