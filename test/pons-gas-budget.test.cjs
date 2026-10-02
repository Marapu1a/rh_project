const {test}=require('node:test'),assert=require('node:assert/strict');
const {createGasBudget,REMINDER_MS}=require('../scripts/pons-gas-budget.cjs');
const {createBoundary}=require('../scripts/pons-transaction-journal.cjs');
const {sendLocalTransaction,withTransactionBoundary}=require('../scripts/local-receipt.cjs');
const target='0x'+'2'.repeat(40),sender='0x'+'1'.repeat(40);
function fixture(){let balance=0n,time=10000000,saves=0;const state={},notifications=[];
 const provider={getBalance:async()=>balance,getBlock:async()=>({hash:'block'})};
 const build=()=>createGasBudget({provider,sender,maxGasLimit:'3000000',state,save:()=>saves++,notifications,now:()=>time});
 return {state,notifications,provider,build,setBalance:v=>balance=v,advance:n=>time+=n,saves:()=>saves};}
test('current estimate plus margin only: waiting, restart dedup, reminder and top-up',async()=>{
 const f=fixture(),g=f.build(),request={to:target,gasLimit:g.gasLimit(100000n),maxFeePerGas:1000000000n,value:7n};
 assert.equal(request.gasLimit,120000n);const required=120000000000007n;f.setBalance(required-1n);
 await assert.rejects(g.check(request,'pull',0n),e=>e.code==='LOCAL_BUDGET_WAIT'&&e.budget.shortfallWei==='1');
 assert.equal(f.notifications.length,1);await assert.rejects(f.build().check(request,'pull',0n));assert.equal(f.notifications.length,1);
 f.advance(REMINDER_MS);await assert.rejects(f.build().check(request,'pull',0n));assert.equal(f.notifications.length,2);
 f.setBalance(required);await g.check(request,'pull',0n);assert.equal(g.waiting().length,0);assert.equal(f.notifications.at(-1).type,'nativeFundingAvailable');
 assert(required<600000000000000000n);assert.equal(f.state.pending,undefined);
});
test('no guessed amount before estimate; bounded limit and honest unavailable estimate',async()=>{
 const f=fixture(),g=f.build();await g.check({to:target},'prove',1n);assert.equal(f.notifications.length,0);
 assert.throws(()=>g.gasLimit(3000000n),e=>e.budget.reason==='gasBound');
 await assert.rejects(g.estimateFailed({code:'INSUFFICIENT_FUNDS'},{to:target},'prove'),e=>e.budget.requiredWei===null&&e.budget.shortfallWei===null);
 assert.equal(f.state.pending,undefined);
});

test('a cheaper claim cannot clear another claim shortage or its restart reminder',async()=>{
 const f=fixture(),g=f.build(),expensive={to:target,data:'0x01',gasLimit:100n},cheap={to:target,data:'0x02',gasLimit:10n};
 f.setBalance(20n);await assert.rejects(g.check(expensive,'claim',1n));await g.check(cheap,'claim',1n);
 assert.equal(g.waiting().length,1);assert.equal(f.notifications.length,1);
 const restarted=f.build();await restarted.check(cheap,'claim',1n);await assert.rejects(restarted.check(expensive,'claim',1n));
 assert.equal(f.notifications.length,1);assert.equal(restarted.waiting().length,1);
 f.setBalance(100n);await restarted.check(expensive,'claim',1n);assert.equal(restarted.waiting().length,0);
 assert.equal(f.notifications.at(-1).type,'nativeFundingAvailable');assert.deepEqual(f.state.gasAlerts,{});
});
test('real sender boundary waits before intent, resumes once with padded limit; unknown send stays pending',async()=>{
 const f=fixture(),g=f.build();let sends=0,seen;
 const method=async opts=>{sends++;seen=opts;return {hash:'tx',nonce:0,wait:async()=>({hash:'tx',status:1,blockNumber:1,blockHash:'block'})};};
 method.fragment={name:'pay'};method.populateTransaction=async o=>({to:target,data:'0x12',...o});method.estimateGas=async()=>100000n;
 const boundary={...createBoundary({state:f.state,save:()=>{},provider:f.provider,sender,guard:(r,a)=>g.check(r,a,1n),onConfirmed:async()=>{}}),gasLimit:g.gasLimit,estimateFailed:g.estimateFailed};
 const send=()=>withTransactionBoundary(boundary,()=>sendLocalTransaction(method,[],{maxFeePerGas:1n},{}));
 await assert.rejects(send(),e=>e.code==='LOCAL_BUDGET_WAIT'&&e.stage==='estimate');assert.equal(sends,0);assert.equal(f.state.pending,undefined);
 f.setBalance(120000n);await send();assert.equal(sends,1);assert.equal(seen.gasLimit,120000n);assert.equal(f.state.pending,undefined);assert.equal(f.state.lastResolved.transactionHash,'tx');
 const unknown=Object.assign(async()=>{throw Object.assign(Error('lost hash'),{code:'ECONNRESET'});},{fragment:method.fragment,populateTransaction:method.populateTransaction,estimateGas:method.estimateGas});
 await assert.rejects(withTransactionBoundary(boundary,()=>sendLocalTransaction(unknown,[],{maxFeePerGas:1n})),e=>e.stage==='broadcast');assert(f.state.pending);assert.equal(f.state.pending.transactionHash,undefined);
});
