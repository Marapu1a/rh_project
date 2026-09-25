const {test}=require('node:test'),assert=require('node:assert/strict');
const {planShortConversion:plan,shortAllocation}=require('../scripts/short-conversion-trigger.cjs');
const base={freeShort:0n,target:100n,phase:0,amountIn:10n,maxInput:20n,expectedUSDG:200n,quoteAge:5n,maxQuoteAge:30n};
test('trigger uses GENERAL Short share, not total sale proceeds',()=>{
  assert.equal(plan({...base,expectedUSDG:100n}).reason,'candidate');
  assert.equal(plan({...base,expectedUSDG:100n}).projectedShort,50n);
  assert.equal(plan(base).shouldAttempt,true);
  assert.equal(plan({...base,freeShort:100n}).reason,'candidate');
});
test('bounded fresh quote required; malformed values rejected',()=>{
  assert.equal(plan({...base,quoteAge:31n}).reason,'staleQuote');
  assert.equal(plan({...base,amountIn:21n}).reason,'amountLimit');
  assert.equal(plan({...base,amountIn:0n}).reason,'noInventory');
  assert.throws(()=>plan({...base,expectedUSDG:-1n}));
  assert.throws(()=>plan({...base,phase:6}));
});
test('allocation is invariant under splitting for every funding phase',()=>{
  for(let phase=0;phase<6;phase++)for(let a=0n;a<30n;a++)for(let b=0n;b<30n;b++)
    assert.equal(shortAllocation(a+b,phase),shortAllocation(a,phase)+shortAllocation(b,(phase+Number(a%6n))%6));
});
test('forecast is not actual funding: a smaller receipt may leave reserve below target',()=>{
  assert.equal(plan(base).shouldAttempt,true);
  assert.equal(shortAllocation(198n,base.phase),99n);
  assert.equal(plan({...base,freeShort:99n,expectedUSDG:0n}).reason,'noOutput');
});
