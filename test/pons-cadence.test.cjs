const {test}=require('node:test'),assert=require('node:assert/strict');
const {transactionLimit,continuation,delayMs,pause}=require('../scripts/pons-cadence.cjs');
test('Pons continuation only accelerates confirmed bounded work, not waits or uncertain sends',()=>{
 const base={status:'waiting',pending:null,confirmed:2,waits:['transactionLimit'],results:{}};
 assert(continuation(base));
 assert(continuation({...base,waits:[],results:{settlement:{status:'yielded'}}}));
 for(const change of [{status:'blocked'},{status:'error'},{status:'stopped'},{pending:{action:'unknown'}},{confirmed:0},{waits:[]},{results:{fundingError:'RPC'}},{results:{claimFailures:[{}]}},{results:{rng:{failures:[{}]}}},{results:{nativeFunding:[{}]}},...['gasPrice','nativeFunding','pendingNonce','stopped','gasBound'].map(reason=>({waits:[reason,'transactionLimit']})),{results:{settlement:{results:{MONTHLY:{budget:{reason:'gasBound'}}}}}}])assert.equal(continuation({...base,...change}),false,JSON.stringify(change));
 assert.equal(delayMs({status:'blocked',continueImmediately:true},10),10000);
 assert.equal(delayMs({status:'waiting',continueImmediately:true},10),0);
 assert.equal(delayMs({status:'waiting'},10),10000);
});
test('Pons operational limit leaves frozen config unchanged and rejects invalid values',()=>{
 const config=Object.freeze({maxTransactions:2});
 for(const limit of [2,8,2])assert.equal(transactionLimit(config,limit),limit);
 assert.equal(config.maxTransactions,2);assert.equal(transactionLimit(config),2);
 for(const value of [0,129,-1,2.5,NaN,'8',null])assert.throws(()=>transactionLimit(config,value));
});
test('Pons watch wait is interruptible including an already stopped signal',async()=>{
 const stop=new AbortController(),waiting=pause(60000,stop.signal);stop.abort();await waiting;await pause(60000,stop.signal);
});
test('Pons alternates first lane from durable last receipt, including mixed address case',()=>{
 const {laneOrder}=require('../scripts/pons-cadence.cjs');
 assert.deepEqual(laneOrder('0xAB','0xab'),['MONTHLY','SHORT']);
 assert.deepEqual(laneOrder('0xcd','0xab'),['SHORT','MONTHLY']);
 assert.deepEqual(laneOrder(undefined,'0xab'),['SHORT','MONTHLY']);
});
test('Pons limit changes preserve journal identity and cannot clear unknown or pending sends',async()=>{
 const fs=require('node:fs'),path=require('node:path');
 const {withState}=require('../scripts/local-scheduler-state.cjs'),{reconcilePending}=require('../scripts/pons-transaction-journal.cjs');
 fs.mkdirSync('.local/logs',{recursive:true});
 const dir=fs.mkdtempSync(path.resolve('.local/logs/pons-limit-')),file=path.join(dir,'state.json');
 const config=Object.freeze({maxTransactions:2,policy:'unchanged'}),identity={config,sender:'test'};
 await withState(file,identity,async(state,save)=>{state.pending={action:'claim',nonce:7};save(state);});
 const before=fs.readFileSync(file);
 for(const limit of [2,8,2])await withState(file,identity,async(state,save)=>{
  assert.equal(transactionLimit(config,limit),limit);
  const result=await reconcilePending(state,save,{getTransactionReceipt:()=>assert.fail('Unknown hash must not query a guessed receipt')},'test');
  assert.equal(result.reason,'unknownHash');
 });
 assert.deepEqual(fs.readFileSync(file),before);
 await withState(file,identity,async(state,save)=>{state.pending.transactionHash='0xaa';save(state);});
 const known=fs.readFileSync(file);
 for(const limit of [8,2])await withState(file,identity,async(state,save)=>{
  transactionLimit(config,limit);
  assert.equal((await reconcilePending(state,save,{getTransactionReceipt:async()=>null},'test')).reason,'pendingReceipt');
 });
 assert.deepEqual(fs.readFileSync(file),known);
 await assert.rejects(withState(file,{...identity,config:{...config,policy:'changed'}},()=>assert.fail('Changed identity admitted')),/config mismatch/);
});
