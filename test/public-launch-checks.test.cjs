const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {inspectHistoricalRpc}=require('../scripts/public-rpc-check.cjs'),{inspectPlan}=require('../scripts/public-launch-plan.cjs');
function reader(fault){const calls=[],abi=new ethers.Interface(['function decimals() view returns(uint8)','function totalSupply() view returns(uint256)']);
 return {calls,rpc:async(m,p)=>{calls.push([m,p]);if(fault?.(m,p))throw Error('historical unavailable');
  if(m==='eth_chainId')return '0x1237';if(m==='eth_getBlockByNumber'){const n=p[0]==='latest'?1000:p[0]==='finalized'?900:Number(BigInt(p[0]));return {number:ethers.toQuantity(n),hash:ethers.toBeHex(n,32),timestamp:'0x68000000'};}
  if(m==='eth_getCode')return '0x6000';if(m==='eth_getStorageAt')return ethers.ZeroHash;
  if(m==='eth_call'){const method=p[0].data===abi.encodeFunctionData('decimals')?'decimals':'totalSupply';return abi.encodeFunctionResult(method,[method==='decimals'?6:100]);}
  throw Error('Unexpected RPC');}};
}
test('archive probe uses explicit historical heights and never permits execution',async()=>{
 const r=reader(),out=await inspectHistoricalRpc({...r,depths:[0,100]});assert.equal(out.historicalReadsAvailable,true);assert.equal(out.publicLaunchReady,false);
 assert(r.calls.filter(([m])=>['eth_call','eth_getStorageAt','eth_getCode'].includes(m)).every(([,p])=>['0x384','0x320'].includes(p.at(-1))));
 assert(r.calls.every(([m])=>!m.includes('send')));
});
test('missing historical state or finalized never falls back to latest',async()=>{
 const r=reader(m=>m==='eth_call'),out=await inspectHistoricalRpc({...r,depths:[0]});assert.equal(out.historicalReadsAvailable,false);assert.match(out.observations[0].error,/unavailable/);
 const no=reader((m,p)=>m==='eth_getBlockByNumber'&&p[0]==='finalized');assert.equal((await inspectHistoricalRpc({...no,depths:[0]})).historicalReadsAvailable,false);
 assert.equal(no.calls.filter(([m])=>m==='eth_call').length,0);
});
test('launch plan names unresolved settings and cannot authorize deployment',()=>{
 const p=require('../config/robinhood-launch-plan.json'),r=inspectPlan(p);assert(r.missing.includes('contracts.token'));assert(r.missing.includes('unresolved.timingApproval'));assert.equal(r.executable,false);assert.equal(r.publicLaunchReady,false);
 assert.throws(()=>inspectPlan({...p,publicExecutionEnabled:true}));
});
test('launch report retains deleted requirements and flags changes to accepted economics',()=>{
 const p=structuredClone(require('../config/robinhood-launch-plan.json'));
 delete p.contracts.token; delete p.roles; delete p.unresolved.archiveRpc;
 p.product.creatorAllocationBps={promo:8000,operations:1000,project:1000};
 const r=inspectPlan(p);
 for(const name of ['contracts.token','roles.operations','unresolved.archiveRpc']) assert(r.missing.includes(name));
 assert.deepEqual(r.conflicts,['product.creatorAllocationBps.promo','product.creatorAllocationBps.operations','product.creatorAllocationBps.project']);
 assert.equal(r.settings.find(x=>x.path==='contracts.token').category,'deployment-derived');
 assert.equal(r.settings.find(x=>x.path==='unresolved.archiveRpc').category,'operational-qualification');
});
test('filled planning fields and timing approval never qualify release',()=>{
 const p=structuredClone(require('../config/robinhood-launch-plan.json'));
 for(const section of ['contracts','roles','unresolved']) for(const key of Object.keys(p[section])) if(p[section][key]===null) p[section][key]='unverified';
 const r=inspectPlan(p);
 assert.deepEqual(r.missing,[]); assert.deepEqual(r.conflicts,[]);
 assert(r.settings.every(x=>x.status==='provided-not-verified'));
 assert.equal(r.timing.approvalPresent,true); assert.equal(r.timing.status,'candidate-not-qualified');
 assert.equal(r.publicLaunchReady,false); assert.equal(r.executable,false);
});
test('public wrappers refuse the local chain while local controllers remain available',async()=>{
 const compiled=require('../scripts/compile.cjs').compile({writeArtifacts:false});const f=await require('./fixtures/local-controllers.cjs').fixture(compiled);
 const base={vault:f.vault.target,registry:f.registry.target,instance:ethers.id('wrong chain'),governor:await f.admin.getAddress(),publisher:await f.admin.getAddress(),provider:f.random.target,notice:3600,cutoffDelayBlocks:1,maxGasPrice:1000000000,nativeFloor:0};
 const rules=require('./fixtures/short-outcome.cjs').normalRules;
 await assert.rejects(f.deploy('RobinhoodShortController',[{...base,maxBudget:100},rules,[7,5,3],1]),/robinhood chain/);
 await assert.rejects(f.deploy('RobinhoodMonthlyController',[{...base,interval:2592000},require('../scripts/monthly-outcome.cjs').RULES]),/robinhood chain/);
});

test('accepted Monthly V2 payload and diminishing weight cannot silently drift in launch plan',()=>{
 const p=structuredClone(require('../config/robinhood-launch-plan.json'));assert.equal(inspectPlan(p).conflicts.length,0);
 p.unresolved.monthlyRules.pNumerator=1;p.unresolved.monthlyWinnerWeight='LINEAR';
 const r=inspectPlan(p);assert(r.conflicts.includes('unresolved.monthlyRules.pNumerator'));assert(r.conflicts.includes('unresolved.monthlyWinnerWeight'));
});
