const {test}=require('node:test'),assert=require('node:assert/strict');
const {runFundingPass}=require('../scripts/pons-funding-pass.cjs');
test('idle funding pass inspects once, but each poll reads a fresh plan',async()=>{
 let reads=0;const loadPlan=async()=>{reads++;return {actions:{}};};
 const send=async()=>assert.fail('idle send');
 assert.equal((await runFundingPass({loadPlan,send})).length,10);assert.equal(reads,1);
 await runFundingPass({loadPlan,send});assert.equal(reads,2);
});
test('funding pass refreshes after sends and preserves payout priority',async()=>{
 let reads=0,stage=0;const sent=[];
 await runFundingPass({loadPlan:async()=>{reads++;return {actions:stage===0?{pull:{status:'ready',method:'pull'}}:stage===1?{'pay-prizes':{status:'ready',method:'pay'}}:{}};},send:async method=>{sent.push(method);stage++;}});
 assert.deepEqual(sent,['pull','pay']);assert.equal(reads,3);
});
test('definite rejection refreshes funding state; unknown outcome stops immediately',async()=>{
 let reads=0;const results=[];
 await runFundingPass({results,loadPlan:async()=>({actions:++reads===1?{pull:{status:'ready',method:'pull'}}:{}}),send:async()=>{throw Object.assign(Error('revert'),{definiteRejection:true});}});
 assert.equal(reads,2);assert.deepEqual(results[0],{action:'pull',status:'reverted'});
 reads=0;await assert.rejects(runFundingPass({loadPlan:async()=>{reads++;return {actions:{pull:{status:'ready',method:'pull'}}};},send:async()=>{throw Error('unknown outcome');}}),/unknown outcome/);assert.equal(reads,1);
});
