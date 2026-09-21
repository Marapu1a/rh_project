const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {ethers}=require('ethers');
const {opsProfile}=require('./fixtures/execution-budget.cjs');
const {refillDomainHash,planNativeRefill}=require('../scripts/local-native-refill.cjs');
const {stageNativeRefill:stage,recordNativeRefillHash:record,finalizeNativeRefill:finish}=require('../scripts/local-native-refill-state.cjs');
const {withState}=require('../scripts/local-scheduler-state.cjs');
const a='0x'+'11'.repeat(20),source='0x'+'33'.repeat(20),vault='0x'+'44'.repeat(20);
function fixture(){
 const ops=opsProfile();ops.network.reserveGasPrice=ops.settings.maxGasPrice='1';ops.network.safetyBps=10000;ops.network.signerBuffer='0';
 for(const key of Object.keys(ops.network.gasUnits))ops.network.gasUnits[key]='1';
 const anchor={number:'10',hash:ethers.id('anchor'),timestamp:'1000'};
 const input={ops,source:{kind:'BOOTSTRAP_NATIVE',address:source,minimumBalance:'100',transferGas:'21000'},policy:{maxPerRefill:'30000',maxPerPeriod:'50000',periodSeconds:'100',cooldownSeconds:'30',targets:[{address:a,lowWatermark:'0',target:'0'}]},protectedAddresses:[vault],anchor,head:{...anchor},gasPrice:'1',balances:{[source]:'1000000',[a]:'0'},committedObligations:[{id:'draw',publisher:a,executor:a,counts:{finishShort:10}}],candidateObligations:[]};
 const state={jobs:{SHORT:[],MONTHLY:[]},nativeRefillHistory:{domainHash:refillDomainHash(input),pending:false,windowStart:'1000',spent:'5',lastAttemptAt:null,lastSuccessAt:null,lastNonce:null}};
 const transaction={chainId:'31337',data:'0x',hash:ethers.id('tx'),from:source,to:a,value:'10',nonce:'4'};
 const evidence={transaction,receipt:{hash:transaction.hash,status:1,gasUsed:'21000',gasPrice:'1',blockHash:ethers.id('block'),blockNumber:'11'},block:{number:'11',hash:ethers.id('block'),timestamp:'1001'}};
 return {input,state,transaction,evidence};
}
function broadcast(f){return record(stage(f.state,f.input,'4'),f.transaction);}
for(const status of [0,1])test('mined '+status+' accounts actual fee, value only on success, and advances attempt cooldown',()=>{
 const f=fixture(),pending=broadcast(f),before=JSON.stringify(pending);f.evidence.receipt.status=status;
 const done=finish(pending,f.evidence);assert.equal(JSON.stringify(pending),before);assert.equal(done.pending,undefined);
 assert.equal(done.nativeRefillHistory.spent,String(21005+status*10));assert.equal(done.nativeRefillHistory.lastAttemptAt,'1001');
 assert.equal(done.nativeRefillHistory.lastSuccessAt,status?'1001':null);
 assert.equal(planNativeRefill({...f.input,anchor:{...f.input.anchor,timestamp:'1002'},head:{...f.input.head,timestamp:'1002'},history:done.nativeRefillHistory}).reason,'cooldown');
 assert.throws(()=>finish(done,f.evidence),/No pending/);
});
test('receipt period controls expense window, and overspend is recorded rather than discarded',()=>{
 const f=fixture(),p=broadcast(f);f.evidence.block.timestamp='1100';f.evidence.receipt.gasPrice='3';const done=finish(p,f.evidence);
 assert.equal(done.nativeRefillHistory.windowStart,'1100');assert.equal(done.nativeRefillHistory.spent,'63010');assert(done.lastResolved.budgetExceeded);
});
test('another pending, wrong identity, unknown hash, replacement and stale nonce cannot proceed',()=>{
 const f=fixture();assert.throws(()=>stage({...f.state,pending:{worker:'draw'}},f.input,'4'),/pending/);
 const p=stage(f.state,f.input,'4');assert.throws(()=>finish(p,f.evidence),/Unknown/);
 assert.throws(()=>record(p,{...f.transaction,to:vault}),/match/);
 const b=record(p,f.transaction);assert.deepEqual(record(b,f.transaction),b);
 assert.throws(()=>record(b,{...f.transaction,hash:ethers.id('replacement')}),/replacement/);
 const done=finish(b,f.evidence);assert.throws(()=>stage(done,f.input,'4'),/nonce/);
});
test('invalid or changed evidence/history leaves pending unmodified',()=>{
 for(const mutate of [e=>e.receipt.status=undefined,e=>e.receipt.hash=ethers.id('wrong'),e=>e.block.hash=ethers.id('reorg'),e=>e.transaction.value='11',e=>e.block.timestamp='999']){
  const f=fixture(),p=broadcast(f),before=JSON.stringify(p);mutate(f.evidence);assert.throws(()=>finish(p,f.evidence));assert.equal(JSON.stringify(p),before);
 }
 const f=fixture(),p=broadcast(f);p.nativeRefillHistory.spent='0';assert.throws(()=>finish(p,f.evidence),/History changed/);
 f.input.ops.network.feeModel='LOCAL_EIP1559_EXTRA';assert.throws(()=>stage(f.state,f.input,'4'),/plain/);
});
test('atomic save failure retains pending and old spend; reload accounts receipt once',async t=>{
 const f=fixture(),dir=fs.mkdtempSync(path.resolve('.local','refill-state-')),file=path.join(dir,'state.json');
 t.after(()=>{for(const n of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,n));fs.rmdirSync(dir);});
 await withState(file,{},async(state,save)=>save({...state,...broadcast(f)}));
 const before=fs.readFileSync(file,'utf8'),rename=fs.renameSync;
 fs.renameSync=()=>{throw Object.assign(Error('injected save failure'),{code:'EIO'});};
 try{await assert.rejects(()=>withState(file,{},async(state,save)=>save(finish(state,f.evidence))),e=>e.code==='SCHEDULER_STORAGE_ERROR');}
 finally{fs.renameSync=rename;}
 assert.equal(fs.readFileSync(file,'utf8'),before);
 await withState(file,{},async(state,save)=>save(finish(state,f.evidence)));
 const done=JSON.parse(fs.readFileSync(file));assert.equal(done.pending,undefined);assert.equal(done.nativeRefillHistory.spent,'21015');
 await assert.rejects(()=>withState(file,{},async(state,save)=>save(finish(state,f.evidence))),/No pending/);
});
