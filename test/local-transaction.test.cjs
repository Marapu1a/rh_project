const {test}=require('node:test'),assert=require('node:assert/strict');
const {sendLocalTransaction}=require('../scripts/local-receipt.cjs');
const hash='0x'+'11'.repeat(32),other='0x'+'22'.repeat(32);
const err=(code,extra={})=>Object.assign(new Error(code),{code,...extra});
for(const scenario of [
  {name:'estimate revert',estimate:err('CALL_EXCEPTION'),stage:'estimate',definite:true,sends:0},
  {name:'estimate RPC outage',estimate:err('NETWORK_ERROR'),stage:'estimate',definite:false,sends:0},
  {name:'broadcast CALL_EXCEPTION',send:err('CALL_EXCEPTION'),stage:'broadcast',definite:false,sends:1},
  {name:'nonce conflict',send:err('NONCE_EXPIRED'),stage:'broadcast',definite:false,sends:1},
  {name:'original mined revert',wait:err('CALL_EXCEPTION',{receipt:{hash,status:0}}),stage:'confirm',definite:true,sends:1},
  {name:'different receipt',wait:err('CALL_EXCEPTION',{receipt:{hash:other,status:0}}),stage:'confirm',definite:false,sends:1},
  {name:'replacement revert',wait:err('TRANSACTION_REPLACED',{receipt:{hash,status:0}}),stage:'confirm',definite:false,sends:1},
  {name:'receipt timeout',wait:err('TIMEOUT'),stage:'confirm',definite:false,sends:1},
  {name:'receipt RPC outage',wait:err('NETWORK_ERROR'),stage:'confirm',definite:false,sends:1},
])test('transaction boundary: '+scenario.name,async()=>{
  let sends=0;
  const method=async(...args)=>{sends++;assert.equal(args.at(-1).gasLimit,50000n);
    if(scenario.send)throw scenario.send;
    return {hash,wait:async()=>{throw scenario.wait;}};
  };
  method.estimateGas=async()=>{if(scenario.estimate)throw scenario.estimate;return 50000n;};
  await assert.rejects(()=>sendLocalTransaction(method,[],{}),e=>{
    assert.equal(e.stage,scenario.stage);assert.equal(e.definiteRejection,scenario.definite);
    if(scenario.stage==='confirm')assert.equal(e.transactionHash,hash);return true;
  });assert.equal(sends,scenario.sends);
});
test('abort during estimate sends nothing',async()=>{
  const controller=new AbortController();let sends=0;
  const method=async()=>{sends++;};method.estimateGas=async()=>{controller.abort();return 50000n;};
  await assert.rejects(()=>sendLocalTransaction(method,[],{},{signal:controller.signal}),e=>e.code==='LOCAL_EXECUTION_STOPPED'&&!e.definiteRejection);
  assert.equal(sends,0);
});
