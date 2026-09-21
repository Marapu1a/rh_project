const {test}=require('node:test'),assert=require('node:assert/strict');
const {planNativeRefill:plan,refillDomainHash}=require('../scripts/local-native-refill.cjs');
const {opsProfile}=require('./fixtures/execution-budget.cjs');
const a='0x'+'11'.repeat(20),b='0x'+'22'.repeat(20),source='0x'+'33'.repeat(20),vault='0x'+'44'.repeat(20);
function input(){const ops=opsProfile();ops.network.reserveGasPrice='1';ops.settings.maxGasPrice='1';ops.network.safetyBps=10000;ops.network.signerBuffer='0';
 for(const name of Object.keys(ops.network.gasUnits))ops.network.gasUnits[name]='1';
 const anchor={number:'10',hash:'0x'+'aa'.repeat(32),timestamp:'1000'};
 const x={ops,source:{kind:'BOOTSTRAP_NATIVE',address:source,minimumBalance:'100',transferGas:'21000'},protectedAddresses:[vault],anchor,head:{...anchor},gasPrice:'1',
  policy:{maxPerRefill:'100000',maxPerPeriod:'200000',periodSeconds:'100',cooldownSeconds:'0',targets:[{address:a,lowWatermark:'20',target:'1000'},{address:b,lowWatermark:'20',target:'1000'}]},
  balances:{[a]:'0',[b]:'0',[source]:'1000000'},candidateObligations:[],committedObligations:[{id:'short',publisher:a,executor:a,counts:{finishShort:10}},{id:'monthly',publisher:b,executor:b,counts:{finishMonth:12}}]};
 x.history={domainHash:refillDomainHash(x),pending:false,windowStart:'1000',spent:'0',lastAttemptAt:null};return x;}
function rebind(x){x.history.domainHash=refillDomainHash(x);return x;}
test('critical completion deficits are filled before buffers, one deterministic transfer at a time',()=>{
 const x=input(),copy=JSON.stringify(x),r=plan(x);assert.equal(r.status,'needsRefill');assert.equal(r.transfer.to,a);assert.equal(r.transfer.value,'10');assert.equal(r.fundingReadyAfter,false);assert.equal(JSON.stringify(x),copy);
 x.balances[a]='10';const next=plan(x);assert.equal(next.transfer.to,b);assert.equal(next.transfer.value,'12');assert.equal(next.fundingReadyAfter,true);
 x.balances[b]='12';const buffer=plan(x);assert(buffer.fundingReady);assert.equal(buffer.transfer.to,a);assert.equal(buffer.transfer.value,'990');
});
test('shared executor obligations accumulate once without duplicate target or source self-funding',()=>{
 const x=input();x.committedObligations[1].executor=a;const r=plan(x);assert.equal(r.accounts.find(v=>v.address===a).required,'22');assert.equal(r.transfer.value,'22');
 x.policy.targets.push({...x.policy.targets[0]});assert.throws(()=>plan(x),/Duplicate target/);
 const y=input();y.committedObligations[0].executor=source;assert.throws(()=>plan(y),/separate/);
});
test('RNG native liability uses its own address; missing destination blocks',()=>{
 const x=input();x.committedObligations[0].rng={controller:b,fee:'40',floor:'10'};const r=plan(x);assert.equal(r.accounts.find(v=>v.address===b).required,'62');
 x.policy.targets.pop();rebind(x);assert.equal(plan(x).reason,'missingFundingTarget');
});
test('partial refill preserves source floor and gas and never announces full coverage',()=>{
 const x=input();x.policy.maxPerRefill='21005';rebind(x);let r=plan(x);assert.equal(r.transfer.value,'5');assert.equal(r.transfer.maxSourceDebit,'21005');assert(!r.fundingReadyAfter);
 x.balances[source]='21103';r=plan(x);assert.equal(r.transfer.value,'3');assert.equal(BigInt(x.balances[source])-BigInt(r.transfer.maxSourceDebit),100n);
 x.balances[source]='21100';assert.equal(plan(x).reason,'sourceFunding');
});
test('period cap includes gas, cooldown spans periods, old usage expires on anchored time',()=>{
 const x=input();x.history.spent='179000';assert.equal(plan(x).reason,'spendCap');
 x.anchor.timestamp=x.head.timestamp='1100';assert.equal(plan(x).status,'needsRefill');
 x.policy.cooldownSeconds='30';rebind(x);x.history.lastAttemptAt='1090';assert.equal(plan(x).reason,'cooldown');
 x.anchor.timestamp=x.head.timestamp='1120';assert.equal(plan(x).status,'needsRefill');
});
test('unknown funding, stale anchor, changed policy and expensive gas cannot produce a transfer',()=>{
 for(const [mutate,reason] of [[x=>x.history.pending=true,'pendingFunding'],[x=>x.head.hash='0x'+'bb'.repeat(32),'staleAnchor'],[x=>x.policy.maxPerPeriod='300000','historyDomainMismatch'],[x=>x.gasPrice='2','gasPrice']]){
  const x=input();mutate(x);const r=plan(x);assert.equal(r.reason,reason);assert.equal(r.transfer,undefined);
 }
});
test('balances at watermark do not trigger needless refill; observation below base cannot reduce baseline',()=>{
 const x=input();x.balances[a]=x.balances[b]='20';assert.equal(plan(x).status,'ready');
 x.gasObservations={finishShort:'5'};let r=plan(x);assert.equal(r.accounts.find(v=>v.address===a).required,'50');assert.equal(r.transfer.value,'30');
 x.gasObservations.finishShort='0';assert.equal(plan(x).status,'ready');
});
test('prize source/destination, unsupported assets, malformed history and alias balances are rejected',()=>{
 for(const mutate of [x=>x.source.address=vault,x=>x.policy.targets[0].address=vault,x=>x.source.kind='USDG',x=>x.policy.targets[0].address=source,x=>x.history.windowStart='1001',x=>x.history.lastAttemptAt='1001']){const x=input();mutate(x);assert.throws(()=>plan(x));}
 const x=input();x.balances['0x'+'AA'.repeat(20)]='1';x.balances['0x'+'aa'.repeat(20)]='2';assert.throws(()=>plan(x),/Duplicate balance/);
});
test('decision identity is stable under target order and changes with relevant state',()=>{
 const x=input(),r=plan(x);x.policy.targets.reverse();assert.equal(plan(x).decisionKey,r.decisionKey);
 x.history.spent='1';assert.notEqual(plan(x).decisionKey,r.decisionKey);
});
test('confirmed expense accounting exhausts the period without spending the source floor or refilling twice',()=>{
 const x=input();x.policy.maxPerPeriod='50000';rebind(x);const start=BigInt(x.balances[source]);let total=0n;
 for(let i=0;i<2;i++){
  const r=plan(x);assert.equal(r.status,'needsRefill');const debit=BigInt(r.transfer.maxSourceDebit);total+=debit;
  x.balances[source]=String(BigInt(x.balances[source])-debit);x.balances[r.transfer.to]=String(BigInt(x.balances[r.transfer.to])+BigInt(r.transfer.value));
  x.history.spent=String(total);x.history.lastAttemptAt=x.anchor.timestamp;
 }
 assert(total<=50000n);assert.equal(start-BigInt(x.balances[source]),total);
 const wait=plan(x);assert.equal(wait.reason,'spendCap');assert(wait.fundingReady);assert.equal(wait.transfer,undefined);
 x.head.timestamp=x.anchor.timestamp='1100';assert.equal(plan(x).status,'needsRefill');
});
test('frozen completion wins over smaller unfrozen address with cap for only one transfer',()=>{
 const x=input();x.policy.maxPerRefill=x.policy.maxPerPeriod='21012';rebind(x);
 x.candidateObligations=[x.committedObligations.shift()];const r=plan(x);
 assert.equal(r.transfer.to,b);assert.equal(r.transfer.value,'12');assert.equal(r.tier,'committed');
 assert(r.committedFundingReadyAfter);assert(!r.fundingReadyAfter);
});
test('same payer shares one buffer across tiers and never funds candidate or target ahead of committed',()=>{
 const x=input();x.ops.network.signerBuffer='5';rebind(x);x.candidateObligations=[x.committedObligations.pop()];x.candidateObligations[0].executor=a;
 let r=plan(x);assert.equal(r.accounts[0].committedRequired,'15');assert.equal(r.accounts[0].required,'27');assert.equal(r.transfer.value,'15');
 x.balances[a]='15';r=plan(x);assert.equal(r.tier,'candidate');assert.equal(r.transfer.value,'12');assert(r.committedFundingReady);
 x.balances[a]='27';r=plan(x);assert.equal(r.tier,'buffer');assert(r.fundingReady);
});
test('explicit empty committed tier works; legacy shape, missing tiers and duplicate draw IDs reject',()=>{
 const x=input();x.candidateObligations=x.committedObligations;x.committedObligations=[];assert.equal(plan(x).tier,'candidate');
 assert.throws(()=>plan({...x,obligations:[]}),/explicit/);assert.throws(()=>plan({...x,committedObligations:undefined}),/tiers/);
 x.committedObligations=[x.candidateObligations[0]];assert.throws(()=>plan(x),/Duplicate obligation/);
});
test('funded committed work stays marked ready despite an expensive optional buffer',()=>{
 const x=input();x.balances[a]='10';x.balances[b]='12';x.gasPrice='2';const r=plan(x);
 assert.equal(r.status,'waitExpensiveGas');assert(r.committedFundingReady);assert(r.fundingReady);assert.equal(r.transfer,undefined);
});
