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

test('native refill pending uses typed receipt recovery and records expense before draw work',async t=>{
  const f=await fixture(t);await runCoordinator(f.options);
  const file=f.options.statePath,{checksum,...state}=JSON.parse(fs.readFileSync(file,'utf8'));
  const {hash}=require('../scripts/direct-buy.cjs');
  const save=next=>fs.writeFileSync(file,JSON.stringify({...next,checksum:hash(next)}));
  const {executeNativeRefill}=require('../scripts/local-native-refill-executor.cjs');
  const signer=await f.provider.getSigner(8),source=await signer.getAddress(),target=await (await f.provider.getSigner(9)).getAddress();
  await f.provider.send('hardhat_setBalance',[target,'0x0']);
  const ops=opsProfile();ops.settings.receiptTimeoutMs=30;ops.settings.maxGasPrice=ops.network.reserveGasPrice='10000000000';
  const input={ops,source:{kind:'BOOTSTRAP_NATIVE',address:source,minimumBalance:'1000',transferGas:'30000'},
    policy:{targets:[{address:target,lowWatermark:'1000',target:'2000'}],maxPerRefill:'10000000000000000',maxPerPeriod:'20000000000000000',periodSeconds:'3600',cooldownSeconds:'30'},
    protectedAddresses:[f.vault.target],committedObligations:[],candidateObligations:[]};
  await f.provider.send('evm_setAutomine',[false]);
  try{
    assert.equal((await executeNativeRefill({provider:f.provider,signer,state,save,input})).reason,'receiptUnknown');
    const before=fs.readFileSync(file,'utf8');
    assert.equal((await runCoordinator(f.options)).reason,'pendingReceipt');assert.equal(fs.readFileSync(file,'utf8'),before);
    await f.provider.send('evm_mine');
  }finally{await f.provider.send('evm_setAutomine',[true]);}
  const beforeOutage=fs.readFileSync(file,'utf8'),receiptReader=f.provider.getTransactionReceipt;
  const sourceNonce=await f.provider.getTransactionCount(source),executorNonce=await f.provider.getTransactionCount(await f.admin.getAddress());
  f.provider.getTransactionReceipt=async()=>{throw Error('test receipt-read outage');};
  try{await assert.rejects(()=>runCoordinator(f.options),/test receipt-read outage/);}
  finally{f.provider.getTransactionReceipt=receiptReader;}
  assert.equal(fs.readFileSync(file,'utf8'),beforeOutage);assertUnlocked(file);
  assert.equal(await f.provider.getTransactionCount(source),sourceNonce);
  assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()),executorNonce);
  await runCoordinator(f.options);const resolved=JSON.parse(fs.readFileSync(file));
  assert(!resolved.pending);assert(BigInt(resolved.nativeRefillHistory.spent)>2000n);
  const spent=resolved.nativeRefillHistory.spent;await runCoordinator(f.options);
  assert.equal(JSON.parse(fs.readFileSync(file)).nativeRefillHistory.spent,spent);
  const {checksum:ignored,...halted}=JSON.parse(fs.readFileSync(file));
  halted.nativeRefillHalt={reason:'broadcastPolicyMismatch'};save(halted);
  const before=fs.readFileSync(file,'utf8'),nonce=await f.provider.getTransactionCount(await f.admin.getAddress());
  assert.equal((await runCoordinator(f.options)).reason,'broadcastPolicyMismatch');
  assert.equal(fs.readFileSync(file,'utf8'),before);
  assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()),nonce);
});

async function enableRefill(f){
  f.options.ops=opsProfile();const signer=await f.provider.getSigner(8),source=await signer.getAddress();
  f.options.nativeRefill={signer,source:{kind:'BOOTSTRAP_NATIVE',address:source,minimumBalance:'1000000000000000000',transferGas:'30000'},
    policy:{targets:[await f.admin.getAddress(),f.short.target,f.monthly.target].map(address=>({address,lowWatermark:'0',target:'0'})),
      maxPerRefill:'1000000000000000000',maxPerPeriod:'10000000000000000000',periodSeconds:'86400',cooldownSeconds:'0'}};
  return source;
}
test('automatic refill CLI funds candidate and bounded passes resume freezing',async t=>{
  const f=await fixture(t),source=await enableRefill(f),admin=await f.admin.getAddress();
  await f.provider.send('hardhat_setBalance',[admin,'0x0']);
  const nonce=await f.provider.getTransactionCount(source);
  const sourceBalance=await f.provider.getBalance(source);
  await f.provider.send('hardhat_setBalance',[source,ethers.toQuantity(BigInt(f.options.nativeRefill.source.minimumBalance))]);
  const waiting=await runCoordinator(f.options);assert.equal(waiting.status,'waiting',JSON.stringify(waiting));assert.equal(waiting.reason,'sourceFunding');
  assert.equal(await f.provider.getTransactionCount(source),nonce);
  await f.provider.send('hardhat_setBalance',[source,ethers.toQuantity(sourceBalance)]);
  const files={job:f.options.prize.job,config:f.config,ops:f.options.ops,refill:{source:f.options.nativeRefill.source,policy:f.options.nativeRefill.policy}};
  for(const [name,value] of Object.entries(files))fs.writeFileSync(path.join(f.directory,name+'.json'),JSON.stringify(value));
  const execFile=require('node:util').promisify(require('node:child_process').execFile);
  const cli=await execFile(process.execPath,['scripts/run-local-coordinator.cjs','--job',path.join(f.directory,'job.json'),
    '--config',path.join(f.directory,'config.json'),'--ops',path.join(f.directory,'ops.json'),'--native-refill',path.join(f.directory,'refill.json'),
    '--refill-signer','8','--state',f.options.statePath,'--scheduler-state',f.statePath,'--rpc',f.options.scheduler.rpcUrl,'--executor','0','--publisher','0'],{timeout:60000});
  const result=JSON.parse(cli.stdout.trim());assert.equal(result.status,'progress',JSON.stringify(result));
  assert.equal(result.results.nativeRefill.status,'confirmed');assert.equal(await f.provider.getTransactionCount(source),nonce+1);
  const state=JSON.parse(fs.readFileSync(f.options.statePath));assert(!state.pending);assert.equal(state.lastResolved.worker,'nativeRefill');
  assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);
  const next=await runCoordinator(f.options);assert.notEqual(next.status,'error',JSON.stringify(next));
  assert.notEqual(await f.short.activeProposal(),ethers.ZeroHash,JSON.stringify(next));
  // Short begins; Monthly may then require its own funding pass before either is frozen.
  assert(await f.provider.getTransactionCount(source)<=nonce+2);
  for(let i=0;i<3&&await f.short.pendingDatasetDraw()===ethers.ZeroHash;i++){
    const before=await f.provider.getTransactionCount(source),progress=await runCoordinator(f.options);
    assert.notEqual(progress.status,'error',JSON.stringify(progress));
    assert(await f.provider.getTransactionCount(source)<=before+1);
  }
  assert.notEqual(await f.short.pendingDatasetDraw(),ethers.ZeroHash);
  const changed={...f.options,nativeRefill:{...f.options.nativeRefill,policy:{...f.options.nativeRefill.policy,cooldownSeconds:'1'}}};
  await assert.rejects(()=>runCoordinator(changed),/checksum\/config mismatch/);
});
test('automatic committed refill precedes new work and optional buffer cannot delay funded frozen work',async t=>{
  const f=await fixture(t);await runCoordinator(f.options);const source=await enableRefill(f),admin=await f.admin.getAddress();
  f.options.nativeRefill.policy.targets[0].lowWatermark=f.options.nativeRefill.policy.targets[0].target='1000000000000000000';
  const draw=await f.short.pendingDatasetDraw();assert.notEqual(draw,ethers.ZeroHash);
  await f.provider.send('hardhat_setBalance',[admin,'0x0']);
  const result=await runCoordinator(f.options);assert.equal(result.status,'progress',JSON.stringify(result));
  assert.equal(result.results.nativeRefill.status,'confirmed');
  const state=JSON.parse(fs.readFileSync(f.options.statePath));assert(state.lastResolved.value!=='0');
  assert.equal(await f.short.pendingDatasetDraw(),draw);
  const nonce=await f.provider.getTransactionCount(source);await runCoordinator(f.options);
  assert.equal(await f.provider.getTransactionCount(source),nonce);
});

test('refill admission rejects incomplete targets and incompatible history without pinning config',async t=>{
 const f=await fixture(t);f.options.ops=opsProfile();await runCoordinator(f.options);await enableRefill(f);
 const file=f.options.statePath,{checksum,...state}=JSON.parse(fs.readFileSync(file,'utf8'));
 const {hash}=require('../scripts/direct-buy.cjs'),{refillDomainHash}=require('../scripts/local-native-refill.cjs');
 const now=BigInt((await f.provider.getBlock('latest')).timestamp),period=BigInt(f.options.nativeRefill.policy.periodSeconds);
 const history={domainHash:refillDomainHash({...f.options.nativeRefill,ops:f.options.ops,
   protectedAddresses:[f.vault.target,f.router.target,f.options.prize.job.active.address]}),pending:false,
   windowStart:String(now/period*period),spent:'7',lastAttemptAt:String(now),lastSuccessAt:String(now),lastNonce:'0'};
 state.nativeRefillHistory=history;fs.writeFileSync(file,JSON.stringify({...state,checksum:hash(state)}));
 const before=fs.readFileSync(file,'utf8'),source=await f.options.nativeRefill.signer.getAddress(),nonce=await f.provider.getTransactionCount(source);
 for(const missing of f.options.nativeRefill.policy.targets){
   const bad={...f.options,nativeRefill:{...f.options.nativeRefill,policy:{...f.options.nativeRefill.policy,
     targets:f.options.nativeRefill.policy.targets.filter(t=>t!==missing)}}};
   await assert.rejects(()=>runCoordinator(bad),/cover all execution/);assert.equal(fs.readFileSync(file,'utf8'),before);
   const fresh=path.join(f.directory,'fresh-refill.json');await assert.rejects(()=>runCoordinator({...bad,statePath:fresh}),/cover all execution/);assert(!fs.existsSync(fresh));
 }
 const incompatible={...f.options,nativeRefill:{...f.options.nativeRefill,policy:{...f.options.nativeRefill.policy,cooldownSeconds:'1'}}};
 await assert.rejects(()=>runCoordinator(incompatible),/history domain incompatible/);
 assert.equal(fs.readFileSync(file,'utf8'),before);assert.equal(await f.provider.getTransactionCount(source),nonce);
 const result=await runCoordinator(f.options);assert.equal(result.status,'complete',JSON.stringify(result));
 const accepted=JSON.parse(fs.readFileSync(file,'utf8'));assert.notEqual(accepted.configHash,state.configHash);
 assert.deepEqual(accepted.nativeRefillHistory,history);assert.equal(await f.provider.getTransactionCount(source),nonce);
});
test('inspection manifest matches runtime identity and rejects independently changed deployment',async t=>{
 const f=await fixture(t);await enableRefill(f);
 const {createInspectionManifest,verifyInspectionManifest}=require('../scripts/inspection-manifest.cjs');
 const {hash}=require('../scripts/direct-buy.cjs');
 const {signer,...nativeRefill}=f.options.nativeRefill;
 const d={schema:'local-coordinator-deployment-v1',prizeJob:f.options.prize.job,schedulerConfig:f.options.scheduler.config,
  schedulerState:path.resolve(f.options.scheduler.statePath),roles:{prizeExecutor:await f.admin.getAddress(),executor:await f.admin.getAddress(),publisher:await f.options.scheduler.publisher.getAddress()},ops:f.options.ops,nativeRefill};
 const {buildCoordinatorIdentity}=require('../scripts/local-coordinator-identity.cjs');
 const addresses=[...new Set(Object.values(d.roles).filter(Boolean).map(a=>a.toLowerCase()))].sort();
 const legacy={schema:'local-coordinator-v1',prize:d.prizeJob,scheduler:d.schedulerConfig,schedulerState:d.schedulerState,addresses};
 assert.equal(hash(buildCoordinatorIdentity({...d,ops:undefined,nativeRefill:undefined}).config),hash(legacy));
 const {pollSeconds,maxGasPrice,...prizeIdentity}=d.prizeJob;
 const budget={...legacy,schema:'local-coordinator-budget-v1',prize:prizeIdentity,network:d.ops.network,roles:d.roles};
 assert.equal(hash(buildCoordinatorIdentity({...d,nativeRefill:undefined}).config),hash(budget));
 const provenance={commit:'a'.repeat(40),dirty:false,generatedAt:'2026-09-22T00:00:00Z'};
 const lower=structuredClone(d);for(const key of Object.keys(lower.roles))if(lower.roles[key])lower.roles[key]=lower.roles[key].toLowerCase();
 assert.equal(createInspectionManifest(lower,provenance).configHash,createInspectionManifest(d,provenance).configHash);
 d.roles=lower.roles;
 const m=createInspectionManifest(d,provenance);assert.deepEqual(m,createInspectionManifest(d,provenance));
 assert.equal(verifyInspectionManifest(m,d).configHash,m.configHash);
 await runCoordinator(f.options);assert.equal(JSON.parse(fs.readFileSync(f.options.statePath)).configHash,m.configHash);
 for(const mutate of [x=>x.refill.protectedAddresses.pop(),x=>x.configHash=hash('bad'),x=>x.refill.source.address=ethers.ZeroAddress,x=>x.coordinatorConfig.network.chainId='1']){
  const bad=structuredClone(m);mutate(bad);delete bad.checksum;bad.checksum=hash(bad);assert.throws(()=>verifyInspectionManifest(bad,d));
 }
 const changed=structuredClone(d);changed.nativeRefill.policy.maxPerPeriod='1';assert.throws(()=>verifyInspectionManifest(m,changed));
 assert.throws(()=>createInspectionManifest({...d,schedulerState:'relative.json'},provenance));
 assert.throws(()=>createInspectionManifest({...d,pending:{}},provenance));
 const {spawnSync}=require('node:child_process'),deployment=path.join(f.directory,'deployment.json'),out=path.join(f.directory,'manifest.json');
 fs.writeFileSync(deployment,JSON.stringify(d));
 const cli=(...args)=>spawnSync(process.execPath,['scripts/inspection-manifest.cjs',...args],{encoding:'utf8'});
 let r=cli('export','--deployment',deployment,'--out',out);assert.equal(r.status,0,r.stderr);
 r=cli('verify','--deployment',deployment,'--manifest',out);assert.equal(r.status,0,r.stderr);
 const inspectArgs=['scripts/inspect-local-native-refill.cjs','--state',f.options.statePath,'--expected',out,'--rpc','http://127.0.0.1:1'];
 r=spawnSync(process.execPath,[...inspectArgs,'--deployment',deployment],{encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(JSON.parse(r.stdout).status,'noPending');
 r=spawnSync(process.execPath,inspectArgs,{encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stdout,/independent/);
 const before=fs.readFileSync(out);assert.notEqual(cli('export','--deployment',deployment,'--out',out).status,0);assert.deepEqual(fs.readFileSync(out),before);
});

for(const refill of [false,true])test('role casing migration preserves resolved data and refuses pending/domain/address drift: '+refill,async t=>{
 const f=await fixture(t);if(refill)await enableRefill(f);else f.options.ops=opsProfile();
 const {hash}=require('../scripts/direct-buy.cjs'),{buildCoordinatorIdentity}=require('../scripts/local-coordinator-identity.cjs');
 const role=await f.admin.getAddress();
 const input={prizeJob:f.options.prize.job,schedulerConfig:f.options.scheduler.config,schedulerState:f.options.scheduler.statePath,
  roles:{prizeExecutor:role,executor:role,publisher:role},ops:f.options.ops,nativeRefill:f.options.nativeRefill};
 const identity=buildCoordinatorIdentity(input),canonical=identity.config;
 const controller=new AbortController();controller.abort();f.options.signal=controller.signal;
 const payload={schema:'local-scheduler-state-v1',jobs:{SHORT:[{sentinel:'preserve'}],MONTHLY:[]},gasObservations:{begin:'123'},lastResolved:{nonce:'4'},
  ...(refill?{nativeRefillHistory:{domainHash:canonical.nativeRefill.domainHash,pending:false,windowStart:'0',spent:'7',lastAttemptAt:'9',lastNonce:'4',lastSuccessAt:'9'}}:{})};
 const file=f.options.statePath;
 const write=state=>fs.writeFileSync(file,JSON.stringify({...state,checksum:hash(state)}));
 const read=()=>{const {checksum,configHash,...rest}=JSON.parse(fs.readFileSync(file));return rest;};
 // Independent old formula: change only role strings, retain the full old budget/refill object.
 for(const variant of ['lower','upper','mixed']){
  const old={...canonical,roles:{prizeExecutor:variant==='upper'?'0x'+role.slice(2).toUpperCase():role.toLowerCase(),executor:variant==='lower'?role.toLowerCase():variant==='upper'?'0x'+role.slice(2).toUpperCase():role,publisher:variant==='upper'?'0x'+role.slice(2).toUpperCase():role.toLowerCase()}};
  write({...payload,configHash:hash(old)});await runCoordinator(f.options);
  assert.deepEqual(read(),payload);assert.equal(JSON.parse(fs.readFileSync(file)).configHash,hash(canonical));
  const bytes=fs.readFileSync(file);await runCoordinator(f.options);assert.deepEqual(fs.readFileSync(file),bytes);
  for(const worker of ['draw','prize','nativeRefill']){
   write({...payload,configHash:hash(old),pending:{worker,stage:'prepared'}});const before=fs.readFileSync(file);
   await assert.rejects(()=>runCoordinator(f.options),/Resolve pending/);assert.deepEqual(fs.readFileSync(file),before);
  }
  if(refill)for(const history of [{...payload.nativeRefillHistory,domainHash:hash('other')},{...payload.nativeRefillHistory,pending:true}]){
   write({...payload,configHash:hash(old),nativeRefillHistory:history});const before=fs.readFileSync(file);
   await assert.rejects(()=>runCoordinator(f.options),/history domain incompatible|pending refill history/);assert.deepEqual(fs.readFileSync(file),before);
  }
 }
 const wrong={...canonical,roles:{...canonical.roles,executor:await (await f.provider.getSigner(5)).getAddress()}};
 write({...payload,configHash:hash(wrong)});const before=fs.readFileSync(file);
 await assert.rejects(()=>runCoordinator(f.options),/config mismatch/);assert.deepEqual(fs.readFileSync(file),before);
 const noPublisher=buildCoordinatorIdentity({...input,roles:{...input.roles,publisher:null}});
 assert.equal(noPublisher.config.roles.publisher,null);assert(noPublisher.legacyConfigs.length<=21);
});
