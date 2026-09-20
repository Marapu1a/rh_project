const {inspectLock}=require('../scripts/local-scheduler-state.cjs');
function assertUnlocked(file){const info=inspectLock(file+'.lock');assert.equal(info.exists,false,JSON.stringify({parentPid:process.pid,...info}));}
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs'),{setup}=require('./fixtures/local-scheduler.cjs');
const {sent,advance,rpc}=require('./fixtures/local-controllers.cjs');
const {runCoordinator}=require('../scripts/local-promo-coordinator.cjs');
const {runScheduler}=require('../scripts/local-promo-scheduler.cjs');
const {opsProfile}=require('./fixtures/execution-budget.cjs');
const {transactionCost}=require('../scripts/local-execution-budget.cjs');
const compiled=compile();
async function fixture(t){
  const f=await setup(t,compiled),project=await (await f.provider.getSigner(4)).getAddress();
  const adapter=await f.deploy('PrizeSwapFixture',[f.token.target,f.quote.target,3,1]);
  const converter=await f.deploy('LocalPrizeConverter',[f.token.target,f.quote.target,f.vault.target,adapter.target,2,1,1000,300]);
  const recipients=[converter.target,ethers.ZeroAddress,project],bps=[8000,0,2000];
  const router=await f.deploy('FeeRouter',[await f.admin.getAddress(),f.token.target,f.quote.target,[(await f.provider.getBlock('latest')).timestamp+10000000,recipients,bps]]);
  const source=await f.deploy('MockPairVault',[f.token.target,router.target]);await sent(router.bindSource(source.target,123));
  await sent(f.quote.mint(adapter.target,100000));
  const job={schema:'local-prize-flow-v1',chainId:'31337',router:router.target,token:f.token.target,quote:f.quote.target,campaignId:'1',recipients,bps,
    active:{kind:'converter',address:converter.target,vault:f.vault.target,adapter:adapter.target,floorNumerator:'2',floorDenominator:'1',maxInput:'1000',maxHorizon:'300',swapLimit:'1000',deadlineSeconds:'120'},
    legacy:[],source:{vault:source.target,positionId:'123',epoch:'1'},distribution:'GENERAL',pollSeconds:300,maxGasPrice:'1000000000000'};
  const options={statePath:path.join(f.directory,'coordinator.json'),prize:{provider:f.provider,router,job,executor:f.admin},scheduler:{...f.options,executor:f.admin}};
  await sent(f.registry.register());await f.buy(f.admin,100);await advance(30*86400+1);
  await runScheduler(options.scheduler,{maxTicks:1});assertUnlocked(f.statePath);
  await sent(source.queueFees(f.token.target,600));await sent(source.queueFees(f.quote.target,100));
  return {...f,router,source,converter,options};
}
test('coordinator serializes real prize and draw transactions with one signer; repeat does not repay or refreeze',async t=>{
  const f=await fixture(t),before=await f.quote.balanceOf(f.vault.target),events=[];
  const result=await runCoordinator(f.options,{onEvent:e=>events.push(e.worker)});
  assert.equal(result.status,'complete',JSON.stringify(result));assert.deepEqual(events,['prize','draw']);
  assert.equal(await f.quote.balanceOf(f.vault.target)-before,1520n);assert.equal(await f.converter.tokenSold(),480n);
  const requests=await Promise.all([f.short,f.monthly].map(async(c,i)=>c.drawRequest(f.readState().jobs[i?'MONTHLY':'SHORT'][0].job.artifact.request.drawId)));
  assert(requests.every(r=>r!==ethers.ZeroHash));
  assert.equal((await runCoordinator(f.options)).status,'complete');
  assert.equal(await f.converter.tokenSold(),480n);assert.equal(await f.quote.balanceOf(f.vault.target)-before,1520n);
  assert.deepEqual(await Promise.all([f.short,f.monthly].map(async(c,i)=>c.drawRequest(f.readState().jobs[i?'MONTHLY':'SHORT'][0].job.artifact.request.drawId))),requests);
});
for(const scenario of ['prize','draw','abort'])test(scenario+' pending receipt blocks both across restart, then resumes after original mining',async t=>{
  const worker=scenario==='abort'?'prize':scenario,stop=new AbortController();
  const f=await fixture(t);let pending,sends=0,triggered=false;
  const target=worker==='prize'?f.converter.target:f.short.target;
  const selector=worker==='prize'?f.converter.interface.getFunction('convert').selector:f.short.interface.getFunction('begin').selector;
  const signer={provider:f.provider,getAddress:()=>f.admin.getAddress(),estimateGas:r=>f.admin.estimateGas(r),
    sendTransaction:async r=>{sends++;if(!triggered&&r.to.toLowerCase()===target.toLowerCase()&&r.data.startsWith(selector)){
      triggered=true;await rpc('evm_setAutomine',[false]);pending=await f.admin.sendTransaction(r);if(scenario==='abort')stop.abort();return pending;
    }return f.admin.sendTransaction(r);}};
  f.options.prize.executor=signer;f.options.scheduler.executor=signer;f.options.scheduler.publisher=signer;f.options.receiptTimeoutMs=100;
  f.options.signal=stop.signal;
  try{
    const first=await runCoordinator(f.options);assert.equal(first.status,'blocked',JSON.stringify(first));
    assert.equal(first.pending.worker,worker);assert.equal(first.pending.transactionHash,pending.hash);
    f.options.signal=undefined;
    const count=sends;assert.equal((await runCoordinator(f.options)).reason,'pendingReceipt');assert.equal(sends,count);
    if(worker==='prize')assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);
    else assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash);
    await rpc('evm_mine');await rpc('evm_setAutomine',[true]);f.options.receiptTimeoutMs=30000;
    assert.equal((await runCoordinator(f.options)).status,'complete');
    assert.equal(await f.converter.tokenSold(),480n);assert.equal(f.readState().jobs.SHORT.length,1);assert.equal(f.readState().jobs.MONTHLY.length,1);
  }finally{await rpc('evm_mine');await rpc('evm_setAutomine',[true]);}
});
test('hashless broadcast failure persists a stop across restart, even when signer has no pending nonce',async t=>{
  const f=await fixture(t);let sends=0;
  f.options.prize.executor={provider:f.provider,getAddress:()=>f.admin.getAddress(),estimateGas:r=>f.admin.estimateGas(r),
    sendTransaction:async()=>{sends++;throw Object.assign(Error('RPC lost response'),{code:'NETWORK_ERROR'});}};
  assert.equal((await runCoordinator(f.options)).status,'blocked');
  f.options.prize.executor=f.admin;
  assert.equal((await runCoordinator(f.options)).reason,'unknownHash');assert.equal(sends,1);
  assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);
});
test('known recipient refusal allows draws, abort stops writes, concurrent coordinator cannot enter',async t=>{
  const f=await fixture(t);await sent(f.quote.blockRecipient(f.options.prize.job.recipients[2]));
  const result=await runCoordinator(f.options,{onEvent:async e=>{if(e.worker==='prize'){
    assert.equal(e.status,'degraded');await assert.rejects(()=>runCoordinator(f.options),/locked/);
  }}});
  assert.equal(result.status,'complete');assert.notEqual(await f.short.pendingDatasetDraw(),ethers.ZeroHash);
  const stop=new AbortController();stop.abort();const before=await f.provider.getTransactionCount(await f.admin.getAddress());
  assert.equal((await runCoordinator({...f.options,signal:stop.signal})).status,'stopped');
  assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()),before);
});
test('CLI runs both workers; persisted config/corrupt state fail closed',async t=>{
  const f=await fixture(t),execFile=require('node:util').promisify(require('node:child_process').execFile);
  const jobFile=path.join(f.directory,'job.json'),configFile=path.join(f.directory,'config.json');
  fs.writeFileSync(jobFile,JSON.stringify(f.options.prize.job));fs.writeFileSync(configFile,JSON.stringify(f.config));
  assertUnlocked(f.statePath);assertUnlocked(f.options.statePath);
  const result=await execFile(process.execPath,['scripts/run-local-coordinator.cjs','--job',jobFile,'--config',configFile,
    '--state',f.options.statePath,'--scheduler-state',f.statePath,'--rpc',f.options.scheduler.rpcUrl,'--executor','0','--publisher','0'],{timeout:60000});
  if(process.env.LOCAL_STATE_LOCK_TRACE==='1')process.stderr.write(result.stderr);
  assert.equal(JSON.parse(result.stdout.trim()).status,'complete');
  assertUnlocked(f.statePath);assertUnlocked(f.options.statePath);
  const before=await f.provider.getTransactionCount(await f.admin.getAddress());
  f.options.prize.job.pollSeconds=301;await assert.rejects(()=>runCoordinator(f.options),/checksum\/config mismatch/);
  f.options.prize.job.pollSeconds=300;fs.writeFileSync(f.options.statePath,'{broken');
  await assert.rejects(()=>runCoordinator(f.options));assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()),before);
});

test('misbound or malformed signers/contracts fail before reads through runners, state or broadcast',async t=>{
  const f=await fixture(t),other=new ethers.BrowserProvider(require('hardhat').network.provider,undefined,{cacheTimeout:-1});
  t.after(()=>other.destroy());assert.equal((await other.getNetwork()).chainId,31337n);
  const nonce=await f.provider.getTransactionCount(await f.admin.getAddress()),saved=fs.readFileSync(f.statePath,'utf8');
  let calls=0;
  const unexpected=async()=>{calls++;throw Error('runner should not be called');};
  for(const [group,key] of [['prize','executor'],['scheduler','executor'],['scheduler','publisher']]){
    for(const provider of [other,null,undefined]){
      const options={...f.options,prize:{...f.options.prize},scheduler:{...f.options.scheduler}};
      options[group][key]={provider,getAddress:unexpected,estimateGas:unexpected,sendTransaction:unexpected};
      await assert.rejects(()=>runCoordinator(options),/Signer must use coordinator provider/);
    }
  }
  const malformed={...f.options,prize:{...f.options.prize,executor:{provider:f.provider,getAddress:unexpected}}};
  await assert.rejects(()=>runCoordinator(malformed),/support transaction execution/);
  for(const [group,key] of [['prize','router'],['scheduler','short'],['scheduler','monthly']]){
    for(const provider of [other,null]){
      const options={...f.options,prize:{...f.options.prize},scheduler:{...f.options.scheduler}};
      options[group][key]=options[group][key].connect(provider);
      await assert.rejects(()=>runCoordinator(options),/Contract must use coordinator provider/);
    }
  }
  assert.equal(calls,0);assert.equal(fs.existsSync(f.options.statePath),false);assert.equal(fs.existsSync(f.options.statePath+'.lock'),false);
  assert.equal(fs.readFileSync(f.statePath,'utf8'),saved);
  assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()),nonce);
});

test('abort at persisted intent commits one send, preserves hash and resumes without duplicate money',async t=>{
  const f=await fixture(t),stop=new AbortController(),rename=fs.renameSync;
  const before=await f.quote.balanceOf(f.vault.target),nonce=await f.provider.getTransactionCount(await f.admin.getAddress());
  let prepared=0;
  fs.renameSync=function(from,to){
    const result=rename.apply(this,arguments);
    if(path.resolve(to)===path.resolve(f.options.statePath)){
      const pending=JSON.parse(fs.readFileSync(to,'utf8')).pending;
      if(pending&&!pending.transactionHash){prepared++;stop.abort();}
    }
    return result;
  };
  let result;
  try{result=await runCoordinator({...f.options,signal:stop.signal});}finally{fs.renameSync=rename;}
  assert.equal(prepared,1);assert.equal(result.status,'blocked');assert.equal(result.pending.action,'collect');
  assert.equal(result.pending.code,'LOCAL_EXECUTION_STOPPED');assert.equal(result.pending.stage,'confirm');
  assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()),nonce+1);
  assert.equal(JSON.parse(fs.readFileSync(f.options.statePath,'utf8')).pending.transactionHash,result.pending.transactionHash);
  assert.equal((await f.provider.getTransactionReceipt(result.pending.transactionHash)).status,1);
  assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash);
  assert.equal((await runCoordinator(f.options)).status,'complete');
  assert.equal(await f.converter.tokenSold(),480n);assert.equal(await f.quote.balanceOf(f.vault.target)-before,1520n);
});

for(const extra of [false,true])test('budgeted profile waits for native funding and resumes without new state: '+extra,async t=>{
  const f=await fixture(t);f.options.ops=opsProfile(extra);
  const who=await f.admin.getAddress(),balance=await f.provider.getBalance(who),nonce=await f.provider.getTransactionCount(who);
  await rpc('hardhat_setBalance',[who,'0x0']);
  let r=await runCoordinator(f.options);assert.equal(r.status,'complete',JSON.stringify(r));
  for(const kind of ['SHORT','MONTHLY'])assert.equal(r.results.draw.results[kind].reason,'executionBudget');
  assert.equal(await f.provider.getTransactionCount(who),nonce);assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);
  assert.equal(JSON.parse(fs.readFileSync(f.options.statePath,'utf8')).pending,undefined);
  await rpc('hardhat_setBalance',[who,ethers.toQuantity(balance)]);
  if(extra){
    const execFile=require('node:util').promisify(require('node:child_process').execFile);
    for(const [name,value] of [['ops',f.options.ops],['job',f.options.prize.job],['config',f.config]])fs.writeFileSync(path.join(f.directory,name+'.json'),JSON.stringify(value));
    const cli=await execFile(process.execPath,['scripts/run-local-coordinator.cjs','--job',path.join(f.directory,'job.json'),'--config',path.join(f.directory,'config.json'),
      '--ops',path.join(f.directory,'ops.json'),'--state',f.options.statePath,'--scheduler-state',f.statePath,'--rpc',f.options.scheduler.rpcUrl,'--publisher','0','--executor','0'],{timeout:120000});
    r=JSON.parse(cli.stdout.trim());
  }else r=await runCoordinator(f.options);
  assert.equal(r.status,'complete',JSON.stringify(r));assert.equal(r.budgetMode,f.options.ops.network.id);
  assert.notEqual(await f.short.pendingDatasetDraw(),ethers.ZeroHash);assert.notEqual(await f.monthly.pendingMonth(),ethers.ZeroHash);
  assert.equal(await f.converter.tokenSold(),480n);
});

test('one shared budget admits only one ready freeze; optional collection cannot eat its completion budget',async t=>{
  const f=await fixture(t);await runScheduler(f.options.scheduler,{maxTicks:2});
  const saved=f.readState(),sid=saved.jobs.SHORT[0].job.proposalId,mid=saved.jobs.MONTHLY[0].job.artifact.request.drawId;
  assert.equal((await f.short.datasetProposal(sid)).status,2n);assert.equal((await f.monthly.month(mid)).phase,2n);
  const ops=f.options.ops=opsProfile(),who=await f.admin.getAddress();
  const one=3n*transactionCost(ops.network,ops.network.gasUnits.seal)+BigInt(ops.network.signerBuffer);
  await rpc('hardhat_setBalance',[who,ethers.toQuantity(one)]);
  let r=await runCoordinator(f.options);assert.equal(r.status,'complete',JSON.stringify(r));
  assert.notEqual(await f.short.pendingDatasetDraw(),ethers.ZeroHash);assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash);
  assert.equal(r.results.prize.reason,'executionBudget');assert.equal(await f.converter.tokenSold(),0n);
  await rpc('hardhat_setBalance',[who,ethers.toQuantity(ethers.parseEther('10'))]);
  r=await runCoordinator(f.options);assert.equal(r.status,'complete');assert.equal(await f.monthly.pendingMonth(),mid);
  const report=JSON.parse(fs.readFileSync(f.options.statePath,'utf8')).lastBudget;
  assert.equal(report.obligations.length,2);assert.equal(report.accounts.filter(a=>a.address===who.toLowerCase()).length,1);
});

test('RNG controller funding is separate; settings can wait/resume without invalidating deployment identity',async t=>{
  const f=await fixture(t);f.options.ops=opsProfile();
  await rpc('hardhat_setBalance',[f.short.target,'0x0']);
  let r=await runCoordinator(f.options);assert.equal(r.status,'complete');assert.equal(await f.short.activeProposal(),ethers.ZeroHash);
  assert.notEqual(await f.monthly.pendingMonth(),ethers.ZeroHash);
  await rpc('hardhat_setBalance',[f.short.target,'0x3e8']);
  const stateBefore=JSON.parse(fs.readFileSync(f.options.statePath,'utf8')).configHash;
  f.options.ops.settings.maxGasPrice='1';f.options.ops.settings.pollSeconds=2;f.options.ops.settings.receiptTimeoutMs=20000;
  r=await runCoordinator(f.options);assert.equal(r.status,'complete');assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);
  f.options.ops.settings.maxGasPrice='2000000000';f.options.prize.job.pollSeconds=301;f.options.prize.job.maxGasPrice='999';
  r=await runCoordinator(f.options);assert.equal(r.status,'complete');assert.notEqual(await f.short.pendingDatasetDraw(),ethers.ZeroHash);
  assert.equal(JSON.parse(fs.readFileSync(f.options.statePath,'utf8')).configHash,stateBefore);
});

test('frozen Monthly gets the first transaction ahead of unfrozen Short preparation',async t=>{
  const f=await fixture(t);await runScheduler(f.options.scheduler,{maxTicks:2});
  const mid=f.readState().jobs.MONTHLY[0].job.artifact.request.drawId;
  await sent(f.monthly.sealMonth(mid));await sent(f.random.deliver(await f.monthly.drawRequest(mid),ethers.ZeroHash));
  let first;
  const signer={provider:f.provider,getAddress:()=>f.admin.getAddress(),estimateGas:r=>f.admin.estimateGas(r),sendTransaction:async r=>{first??=r;return f.admin.sendTransaction(r);}};
  f.options.prize.executor=signer;f.options.scheduler.executor=signer;f.options.scheduler.publisher=signer;f.options.ops=opsProfile();
  const r=await runCoordinator(f.options);assert.equal(r.status,'complete',JSON.stringify(r));
  assert.equal(first.to.toLowerCase(),f.monthly.target.toLowerCase());assert.equal(first.data.slice(0,10),f.monthly.interface.getFunction('processMonth').selector);
});

test('budget profile upgrades the same resolved state once; model and signer role changes cannot bypass identity',async t=>{
  const f=await fixture(t);f.options.scheduler.executor=f.executor;
  assert.equal((await runCoordinator(f.options)).status,'complete');const before=await f.converter.tokenSold();
  f.options.ops=opsProfile();assert.equal((await runCoordinator(f.options)).status,'complete');assert.equal(await f.converter.tokenSold(),before);
  f.options.scheduler.publisher=f.executor;f.options.scheduler.executor=f.admin;
  await assert.rejects(()=>runCoordinator(f.options),/checksum\/config mismatch/);
  f.options.scheduler.publisher=f.admin;f.options.scheduler.executor=f.executor;
  f.options.ops.network.id='different-model';await assert.rejects(()=>runCoordinator(f.options),/checksum\/config mismatch/);
  delete f.options.ops;await assert.rejects(()=>runCoordinator(f.options),/checksum\/config mismatch/);
});

test('enabling budget cannot migrate away an unresolved legacy marker',async t=>{
  const f=await fixture(t);
  f.options.prize.executor={provider:f.provider,getAddress:()=>f.admin.getAddress(),estimateGas:r=>f.admin.estimateGas(r),sendTransaction:async()=>{throw Object.assign(Error('lost send'),{code:'NETWORK_ERROR'});}};
  assert.equal((await runCoordinator(f.options)).status,'blocked');const before=fs.readFileSync(f.options.statePath,'utf8');
  f.options.prize.executor=f.admin;f.options.ops=opsProfile();
  await assert.rejects(()=>runCoordinator(f.options),/Resolve pending with previous configuration/);
  assert.equal(fs.readFileSync(f.options.statePath,'utf8'),before);
});

test('pending budgeted send keeps its policy snapshot while new settings wait for reconciliation',async t=>{
  const f=await fixture(t);f.options.ops=opsProfile();f.options.ops.settings.receiptTimeoutMs=100;
  let begins=0,tx;
  const signer={provider:f.provider,getAddress:()=>f.admin.getAddress(),estimateGas:r=>f.admin.estimateGas(r),sendTransaction:async r=>{
    if(r.to.toLowerCase()===f.short.target.toLowerCase()&&r.data.startsWith(f.short.interface.getFunction('begin').selector)){
      begins++;await rpc('evm_setAutomine',[false]);tx=await f.admin.sendTransaction(r);return tx;
    }return f.admin.sendTransaction(r);
  }};
  f.options.prize.executor=signer;f.options.scheduler.executor=signer;f.options.scheduler.publisher=signer;
  try{
    const first=await runCoordinator(f.options);assert.equal(first.status,'blocked');assert.equal(first.pending.transactionHash,tx.hash);
    f.options.ops.settings.maxGasPrice='1500000000';f.options.ops.settings.receiptTimeoutMs=30000;
    const waiting=await runCoordinator(f.options);assert.equal(waiting.reason,'pendingReceipt');assert.equal(begins,1);
    assert.equal(waiting.pending.executionPolicy.settings.maxGasPrice,'2000000000');
    await rpc('evm_mine');await rpc('evm_setAutomine',[true]);
    const next=await runCoordinator(f.options);assert.equal(next.status,'complete',JSON.stringify(next));assert.equal(begins,1);
    assert.equal(await f.converter.tokenSold(),480n);
  }finally{await rpc('evm_mine');await rpc('evm_setAutomine',[true]);}
});

test('higher observed gas raises the persisted forecast instead of locking a frozen draw to a low calibration',async t=>{
  const f=await fixture(t);f.options.ops=opsProfile();
  for(const a of Object.keys(f.options.ops.network.gasUnits))f.options.ops.network.gasUnits[a]='1';
  assert.equal((await runCoordinator(f.options)).status,'complete');
  const saved=f.readState();
  for(const [kind,source] of [['SHORT',f.short],['MONTHLY',f.monthly]])await sent(f.random.deliver(await source.drawRequest(saved.jobs[kind][0].job.artifact.request.drawId),ethers.ZeroHash));
  const result=await runCoordinator(f.options);assert.equal(result.status,'complete',JSON.stringify(result));
  assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash);
  const gas=JSON.parse(fs.readFileSync(f.options.statePath,'utf8')).gasObservations;
  for(const action of ['seal','sealMonth','processShort','processMonth','finishShort','finishMonth'])assert(BigInt(gas[action])>21000n);
});
