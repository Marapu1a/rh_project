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
const {checkExecutionBudget}=require('../scripts/local-execution-budget.cjs');
const {ethers}=require('ethers');
function budgetFixture({frozen=true,left=1}={}){
  const id=ethers.id('pending'),head={number:1,hash:ethers.id('head'),gasLimit:30000000n};
  const provider={getBlock:async()=>head,getBalance:async()=>10n**24n,
    call:async()=>ethers.AbiCoder.defaultAbiCoder().encode(['uint256'],[1])};
  const short={target:b,pendingDatasetDraw:async()=>frozen?id:ethers.ZeroHash,
    settlements:async()=>({proposalId:id,nextChunk:1}),datasetChunkCount:async()=>1+left,
    activeProposal:async()=>ethers.ZeroHash,interface:{parseTransaction:()=>({args:[id,{drawId:id,expectedCount:2}]})},
    randomProvider:async()=>c,nativeFloor:async()=>0};
  const monthly={target:c,pendingMonth:async()=>ethers.ZeroHash};
  const signer={getAddress:async()=>a};
  return {ops:opsProfile(),provider,short,monthly,publisher:signer,executor:signer,prizeExecutor:signer,chunkSize:1,
    request:{to:b,type:2,maxPriorityFeePerGas:0n,maxFeePerGas:1000000000n,gasLimit:1000000n,data:'0x'},
    action:frozen?'processShort':'begin',worker:'draw'};
}
test('unrelated oversized convert does not block begin or frozen completion',async()=>{
  for(const frozen of [false,true]){
    const f=budgetFixture({frozen});f.ops.network.gasUnits.convert='30000001';
    const r=await checkExecutionBudget(f);assert.equal(r.ready,true);assert.equal(r.obligations.length,1);
  }
});
for(const action of ['processShort','finishShort'])test('required oversized '+action+' blocks frozen draw',async()=>{
  const f=budgetFixture();f.ops.network.gasUnits[action]='30000001';
  assert.equal((await checkExecutionBudget(f)).reason,'blockGasBound');
});
test('completed processing is not a remaining block-limit obligation',async()=>{
  const f=budgetFixture({left:0});f.action='finishShort';f.ops.network.gasUnits.processShort='30000001';
  assert.equal((await checkExecutionBudget(f)).ready,true);
});
test('optional current action is checked alongside frozen liabilities',async()=>{
  const f=budgetFixture();f.worker='prize';f.action='convert';f.request.to=a;
  f.ops.network.gasUnits.convert='30000001';
  assert.equal((await checkExecutionBudget(f)).reason,'blockGasBound');
  f.ops.network.gasUnits.convert='3000000';f.ops.network.gasUnits.finishShort='30000001';
  assert.equal((await checkExecutionBudget(f)).reason,'blockGasBound');
});
