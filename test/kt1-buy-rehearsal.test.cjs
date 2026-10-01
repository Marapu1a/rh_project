const {test}=require('node:test'),assert=require('node:assert/strict');
const {baseForDebit}=require('../scripts/kt1-buy-rehearsal.cjs');
test('KT1 wallet budgets include both creator and protocol fees in raw units',()=>{
 for(const amount of [101000000n,60000000n,40000000n]){
  const base=baseForDebit(amount);assert.equal(base+base*300n/10000n+base*30n/10000n,amount);
 }
 assert.throws(()=>baseForDebit(0));
});
