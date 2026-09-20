const {test}=require('node:test'),assert=require('node:assert/strict');
const {evaluateBudget,transactionCost,validateOps}=require('../scripts/local-execution-budget.cjs');
const {opsProfile}=require('./fixtures/execution-budget.cjs');
const a='0x'+'11'.repeat(20),b='0x'+'22'.repeat(20),c='0x'+'33'.repeat(20);
const obligation=(id,counts={seal:1,processShort:2,finishShort:1})=>({id,publisher:a,executor:a,counts});
for(const extra of [false,true])test('two draws share one native balance and one payer buffer: '+extra,()=>{
  const ops=opsProfile(extra),cost=transactionCost(ops.network,'3000000'),buffer=BigInt(ops.network.signerBuffer);
  const one=4n*cost+buffer,balances={[a]:String(one)};
  assert(evaluateBudget(ops,{balances,obligations:[obligation('s')]}).ready);
  const both=evaluateBudget(ops,{balances,obligations:[obligation('s'),obligation('m')]});
  assert.equal(both.ready,false);assert.equal(both.accounts.length,1);assert.equal(both.accounts[0].required,String(8n*cost+buffer));
  assert.equal(both.accounts[0].shortfall,String(4n*cost));
});
test('publisher/executor/RNG balances are not interchangeable, even with a rich executor',()=>{
  const ops=opsProfile(),o={id:'s',publisher:b,executor:a,counts:{publish:1,seal:1},rng:{controller:c,fee:'10',floor:'20'}};
  let r=evaluateBudget(ops,{balances:{[a]:'1000000000000000000',[b]:'0',[c]:'29'},obligations:[o]});
  assert(!r.ready);assert.equal(r.accounts.find(x=>x.address===c).shortfall,'1');
  assert(BigInt(r.accounts.find(x=>x.address===b).shortfall)>0n);
  r=evaluateBudget(ops,{balances:{[a]:'1000000000000000000',[b]:'1000000000000000000',[c]:'30'},obligations:[o]});assert(r.ready);
});
test('remaining chunks release forecast; an optional collect cannot consume completion coverage',()=>{
  const ops=opsProfile(),unit=transactionCost(ops.network,'3000000'),buffer=BigInt(ops.network.signerBuffer);
  const balances={[a]:String(3n*unit+buffer)},pending=obligation('s',{processShort:2,finishShort:1});
  assert(evaluateBudget(ops,{balances,obligations:[pending]}).ready);
  assert(!evaluateBudget(ops,{balances,obligations:[pending],extra:{payer:a,gasLimit:'1'}}).ready);
  const after=evaluateBudget(ops,{balances,obligations:[obligation('s',{processShort:1,finishShort:1})]});
  assert.equal(after.accounts[0].required,String(2n*unit+buffer));
  assert.deepEqual(evaluateBudget(ops,{balances,obligations:[]}).accounts,[]);
});
test('native integer rounding is upward and includes extra fee once per transaction',()=>{
  const ops=opsProfile(true);ops.network.reserveGasPrice='1';ops.settings.maxGasPrice='1';ops.network.extraFeePerTx='1';
  assert.equal(transactionCost(ops.network,'1'),3n);assert.equal(transactionCost(ops.network,'2'),4n);
});
test('unsupported profiles, thresholds beyond ceiling and duplicate liabilities fail closed',()=>{
  for(const edit of [o=>o.network.chainId='1',o=>o.network.feeModel='AUTO',o=>o.settings.maxGasPrice='2000000001',o=>o.network.gasUnits.seal='0']){
    const ops=opsProfile();edit(ops);assert.throws(()=>validateOps(ops));
  }
  assert.throws(()=>evaluateBudget(opsProfile(),{balances:{[a]:'0'},obligations:[obligation('same'),obligation('same')]}),/Duplicate/);
  assert.throws(()=>evaluateBudget(opsProfile(),{balances:{[a]:'0'},obligations:[],extra:{payer:a,gasLimit:'-1'}}),/Invalid gas units/);
});
