const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const plan=require('../config/robinhood-launch-plan.json'),model=require('../scripts/short-outcome.cjs');
const {analyze}=require('../scripts/short-launch-analysis.cjs');
test('accepted Short model separates admission from winning and preserves probability mass',()=>{
 assert.deepEqual(require('../research/short-launch-analysis-2026-09-29.json'),require('../scripts/short-launch-analysis.cjs').report());
 assert.equal(analyze(1,1).walletWinPercent,40);assert.equal(analyze(3,1).atLeastOneWinnerPercent,78.4);
 assert.equal(analyze(3,1,2).atLeastOneWinnerPercent,48.8);
 const busy=analyze(100,1);assert(busy.walletWinPercent<=10&&busy.walletWinPercent<busy.admissionPercent);
 for(const e of [1,5,10])for(const n of [1,3,10,25,100]){const r=analyze(n,e);assert(r.expectedWinners<=10&&r.expectedWinners<=n);assert(r.expectedBasketPaidPercent<=100);}
});
test('accepted launch basket and rules match Solidity at budget threshold, larger banks and dust',async()=>{
 const compiled=require('../scripts/compile.cjs').compile(),f=await require('./fixtures/short-outcome.cjs').fixture(compiled);
 const a=compiled.ShortPrizeBasketFixture,basket=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,f.admin).deploy();await basket.waitForDeployment();
 const {shortRules:rules,shortWeights:weights,minimumUnitRaw:minimum}=plan.unresolved;
 await assert.rejects(basket.build(99_999999,weights,minimum));
 for(const budget of [100_000000n,200_000000n,1000_000000n,10000_000000n,100_000019n]){
  const r=await basket.build(budget,weights,minimum);assert.deepEqual(Array.from(r.prizes),weights.map(w=>budget/20n*BigInt(w)));
  assert.equal(r.total+r.remainder,budget);assert(r.prizes.every(v=>v>=5000000n));
 }
 for(const e of [1,5,10,100])assert.equal(await f.source.probabilityThreshold(e,rules),model.threshold(e,rules));
 const ps=require('./fixtures/short-outcome.cjs').participants(25,1),prizes=weights.map(w=>BigInt(w)*5000000n);
 for(let i=0;i<4;i++){const context=ethers.id('launch'),seed=ethers.id('sample '+i),expected=model.compute(context,seed,ps,rules,prizes);
  const actual=await f.source.calculate(context,seed,ps,rules,prizes);assert.equal(actual.resultHash,expected.resultHash);assert.equal(actual.winners.length,Math.min(10,Number(actual.admittedCount)));
 }
});
