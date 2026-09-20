const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs'),{setup}=require('./fixtures/local-scheduler.cjs');
const {sent,advance,rpc}=require('./fixtures/local-controllers.cjs');
const {runCoordinator}=require('../scripts/local-promo-coordinator.cjs');
const {runScheduler}=require('../scripts/local-promo-scheduler.cjs');
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
  await runScheduler(options.scheduler,{maxTicks:1});
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
  const result=await execFile(process.execPath,['scripts/run-local-coordinator.cjs','--job',jobFile,'--config',configFile,
    '--state',f.options.statePath,'--scheduler-state',f.statePath,'--rpc',f.options.scheduler.rpcUrl,'--executor','0','--publisher','0'],{timeout:60000});
  assert.equal(JSON.parse(result.stdout.trim()).status,'complete');
  const before=await f.provider.getTransactionCount(await f.admin.getAddress());
  f.options.prize.job.pollSeconds=301;await assert.rejects(()=>runCoordinator(f.options),/checksum\/config mismatch/);
  f.options.prize.job.pollSeconds=300;fs.writeFileSync(f.options.statePath,'{broken');
  await assert.rejects(()=>runCoordinator(f.options));assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()),before);
});
