const {test}=require('node:test'),assert=require('node:assert/strict');
const {validate,build}=require('../scripts/deployment-signing-plan.cjs'),{hash}=require('../scripts/direct-buy.cjs');
test('signing prefix refuses stale settings/artifacts or unsuccessful rehearsal',async()=>{
 await assert.rejects(build({status:'FAILED'}, {},{},{}));
 await assert.rejects(build({status:'EXACT_DEPLOYMENT_FORK_PASSED',publicSends:false,settingsHash:hash({wrong:true})},{},{},{}));
});
test('signing plan checksum detects mutations and cannot encode an authorized whole launch',()=>{
 const E=require('ethers').ethers,governor=E.getAddress('0x'+'11'.repeat(20));
 const body={schema:'qianqi-construction-prefix-v1',authorizationToSend:false,chainId:4663,governor,startNonce:0,maxGasPrice:'10',transactions:Array.from({length:6},(_,i)=>({predictedAddress:E.getCreateAddress({from:governor,nonce:i}),expectedRuntimeHash:E.id('code'),request:{chainId:'0x1237',from:governor,nonce:E.toQuantity(i),value:'0x0',data:'0x1234'}}))};
 const plan={...body,planHash:hash(body)};validate(plan);
 plan.transactions[0].request.value='0x1';assert.throws(()=>validate(plan));
 assert.throws(()=>validate({...body,planHash:hash(body)}));
 const whole={...body,transactions:Array(10).fill({})};assert.throws(()=>validate({...whole,planHash:hash(whole)}));
});
