const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs'),{runScheduler}=require('../scripts/local-promo-scheduler.cjs');
const {setup}=require('./fixtures/local-scheduler.cjs'),{sent,advance,rpc}=require('./fixtures/local-controllers.cjs');
const {normalRules}=require('./fixtures/short-outcome.cjs');
const compiled=compile();
test('previously frozen job cannot silently begin again after reorg with surviving cutoff',async t=>{
  const f=await setup(t,compiled);await registeredBuy(f);await advance(30*86400+1);await run(f,1);
  const point=await rpc('evm_snapshot');
  await run(f);const saved=f.readState();
  for(const kind of ['SHORT','MONTHLY']){
    const source=kind==='SHORT'?f.short:f.monthly;
    await sent(f.random.deliver(await source.drawRequest(saved.jobs[kind][0].job.artifact.request.drawId),ethers.id('revealed before reorg')));
  }
  await rpc('evm_revert',[point]);
  const before=await f.provider.getTransactionCount(await f.admin.getAddress());
  const result=await runScheduler(f.options);
  assert.equal(result.status,'error');
  for(const kind of ['SHORT','MONTHLY'])assert.match(result.results[kind].message,/reorg recovery required/);
  assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()),before);
  assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash);
});
async function run(f,limit=32){const r=await runScheduler(f.options,{maxTicks:limit});assert.notEqual(r.status,'error',JSON.stringify(r));return r;}
async function registeredBuy(f){await sent(f.registry.register());await f.buy(f.admin,100);}
test('scheduler persists before sending, resumes both kinds, handles terminal reorg and makes two cycles from BUY',async t=>{
  const f=await setup(t,compiled);await registeredBuy(f);
  let r=await run(f);assert.equal(r.results.SHORT.reason,'schedule');assert.equal(r.results.MONTHLY.reason,'schedule');
  assert.equal(fs.existsSync(f.statePath),false);
  await advance(30*86400+1);
  const nonce=await f.provider.getTransactionCount(await f.admin.getAddress());
  r=await run(f,1);assert.equal(r.results.SHORT.action,'saveJob');assert.equal(r.results.MONTHLY.action,'saveJob');
  assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()),nonce);
  const saved=f.readState(),s=saved.jobs.SHORT[0].job,m=saved.jobs.MONTHLY[0].job;
  // New invocation reloads the only authoritative persisted artifacts.
  r=await run(f);assert.equal(r.results.SHORT.reason,'seed');assert.equal(r.results.MONTHLY.reason,'seed');
  assert.equal(f.readState().jobs.SHORT[0].job.commitment,s.commitment);
  const persisted=fs.readFileSync(f.statePath,'utf8');fs.unlinkSync(f.statePath);
  r=await run(f);assert.equal(r.results.SHORT.reason,'missingJob');assert.equal(r.results.MONTHLY.reason,'missingJob');
  fs.writeFileSync(f.statePath,persisted);
  const mk=await f.monthly.drawRequest(m.artifact.request.drawId);
  await f.buy(f.admin,100); // These attempts must belong to the next draws.
  await sent(f.random.deliver(await f.short.drawRequest(s.artifact.request.drawId),ethers.ZeroHash));
  const point=await rpc('evm_snapshot');
  r=await run(f);assert.equal(r.results.MONTHLY.reason,'seed');assert.equal((await f.short.settlements(s.artifact.request.drawId)).phase,3n);
  await rpc('evm_revert',[point]);
  await run(f);assert.equal(f.readState().jobs.SHORT.length,1);assert.equal((await f.short.settlements(s.artifact.request.drawId)).phase,3n);
  assert.equal(await f.monthly.drawRequest(m.artifact.request.drawId),mk);
  await sent(f.random.deliver(mk,ethers.ZeroHash));await run(f);
  await advance(30*86400+1);await sent(f.vault.fundUSDG(100,3));
  r=await run(f);assert.equal(r.results.SHORT.reason,'seed');assert.equal(r.results.MONTHLY.reason,'seed');
  const second=f.readState();assert.equal(second.jobs.SHORT.length,2);assert.equal(second.jobs.MONTHLY.length,2);
  for(const kind of ['SHORT','MONTHLY']){
    const j=second.jobs[kind][1].job;assert.equal(j.artifact.snapshot.participants[0].firstAttempt,'2');
    assert.equal(j.artifact.snapshot.participants[0].lastAttempt,'2');
    const c=kind==='SHORT'?f.short:f.monthly;await sent(f.random.deliver(await c.drawRequest(j.artifact.request.drawId),ethers.id('second '+kind)));
  }
  await run(f);assert.equal((await f.ledger()).draws.length,4);
  await advance(30*86400+1);r=await run(f);assert.equal(r.results.SHORT.reason,'empty');assert.equal(r.results.MONTHLY.reason,'empty');
  assert.equal(f.readState().jobs.SHORT.length,2);
  // CLI starts a fresh process, reads the saved jobs, sees empty and sends nothing.
  const configFile=path.join(f.directory,'config.json');fs.writeFileSync(configFile,JSON.stringify(f.config));
  const execFile=require('node:util').promisify(require('node:child_process').execFile),before=await f.provider.getTransactionCount(await f.admin.getAddress());
  const cli=await execFile(process.execPath,['scripts/run-local-scheduler.cjs','--config',configFile,'--state',f.statePath,'--rpc',f.options.rpcUrl,'--publisher','0','--executor','1'],{timeout:30000});
  const last=JSON.parse(cli.stdout.trim().split('\n').at(-1));assert.equal(last.SHORT.reason,'empty');
  assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()),before);
});
test('empty draining epochs close automatically, current empty sets never create draws',async t=>{
  const f=await setup(t,compiled);await sent(f.short.announce(normalRules,[7,5,3],1));await sent(f.monthly.announce(normalRules));
  await advance(30*86400+1);await sent(f.short.activate());await sent(f.monthly.activate());await rpc('evm_mine');
  await run(f);assert.equal(await f.short.drainingShortEpoch(),0n);assert.equal(await f.monthly.drainingMonthlyEpoch(),0n);
  const ledger=await f.ledger();assert.equal(ledger.draws.length,0);assert.equal(ledger.shortRules.drainingEpoch,0);
  assert.equal(ledger.monthlyRules.drainingEpoch,0);assert.equal(await f.vault.reserved(f.quote.target),0n);
});
test('unsubmitted expiry refreshes safely; funding wait stays on the same begun job',async t=>{
  const f=await setup(t,compiled);f.config.shortBudget='1001';await registeredBuy(f);await advance(30*86400+1);
  await run(f,1);const original=f.readState().jobs.SHORT[0].job;
  for(let i=0;i<256;i++)await rpc('evm_mine');await run(f,1);
  assert(f.readState().jobs.SHORT[0].retired);await run(f);
  const state=f.readState(),current=state.jobs.SHORT[1].job;assert.notEqual(current.proposalId,original.proposalId);
  let r=await run(f);assert.equal(r.results.SHORT.reason,'prizeFunding');assert.equal(r.results.MONTHLY.reason,'seed');
  for(let i=0;i<256;i++)await rpc('evm_mine');await sent(f.quote.transfer(f.vault.target,6));r=await run(f);
  assert.equal(r.results.SHORT.reason,'seed');assert.equal(f.readState().jobs.SHORT.length,2);
});
test('corrupt/config-mismatched state and concurrent lock cannot broadcast',async t=>{
  const f=await setup(t,compiled);await registeredBuy(f);await advance(30*86400+1);
  const beforeSave=await f.provider.getTransactionCount(await f.admin.getAddress());
  fs.mkdirSync(f.statePath+'.tmp');
  await assert.rejects(()=>runScheduler(f.options),e=>e.code==='SCHEDULER_STORAGE_ERROR');
  assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()),beforeSave);
  fs.rmdirSync(f.statePath+'.tmp');await run(f,1);
  const original=fs.readFileSync(f.statePath,'utf8'),nonce=await f.provider.getTransactionCount(await f.admin.getAddress());
  const corrupt=JSON.parse(original);corrupt.jobs.SHORT[0].job.artifact.request.budget='999';fs.writeFileSync(f.statePath,JSON.stringify(corrupt));
  await assert.rejects(()=>runScheduler(f.options),/checksum/);fs.writeFileSync(f.statePath,original);
  await assert.rejects(()=>runScheduler({...f.options,config:{...f.config,shortBudget:'102'}}),/config mismatch/);
  fs.writeFileSync(f.statePath+'.lock','test');await assert.rejects(()=>runScheduler(f.options),/locked/);fs.unlinkSync(f.statePath+'.lock');
  assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()),nonce);
});
test('one invalid Short configuration does not prevent Monthly reaching its pending RNG',async t=>{
  const f=await setup(t,compiled);f.config.shortBudget='10001';await registeredBuy(f);await advance(30*86400+1);
  const result=await runScheduler(f.options);
  assert.equal(result.status,'error');assert.match(result.results.SHORT.message,/budget exceeds/);
  assert.equal(result.results.MONTHLY.reason,'seed');assert.notEqual(await f.monthly.pendingMonth(),ethers.ZeroHash);
  assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);
});

for(const fault of ['broadcast','timeout','estimate'])test('scheduler isolates known rejection but globally stops '+fault,async t=>{
  const f=await setup(t,compiled);await registeredBuy(f);await advance(30*86400+1);await run(f,1);
  let sends=0,tx;
  const publisher={provider:f.provider,getAddress:()=>f.admin.getAddress(),
    estimateGas:async request=>{
      if(fault==='estimate'&&request.to.toLowerCase()===f.short.target.toLowerCase())throw Object.assign(new Error('definite estimate rejection'),{code:'CALL_EXCEPTION'});
      return f.admin.estimateGas(request);
    },sendTransaction:async request=>{
      sends++;if(fault==='broadcast')throw Object.assign(new Error('unknown send outcome'),{code:'CALL_EXCEPTION'});
      if(fault==='timeout'){await rpc('evm_setAutomine',[false]);tx=await f.admin.sendTransaction(request);return tx;}
      return f.admin.sendTransaction(request);
    }};
  let result;
  try{
    result=await runScheduler({...f.options,publisher,receiptTimeoutMs:100},{maxTicks:1});
    if(fault==='estimate'){
      assert.equal(result.results.SHORT.stage,'estimate');assert.equal(result.results.MONTHLY.action,'beginMonth');
      assert.equal(sends,1);assert.equal(result.haltedKind,undefined);
    }else{
      assert.equal(result.status,'error');assert.equal(result.haltedKind,'SHORT');assert.equal(result.requiresReconciliation,true);
      assert.equal(result.results.MONTHLY,undefined);assert.equal(sends,1);
      assert.equal(result.results.SHORT.stage,fault==='timeout'?'confirm':'broadcast');
      if(tx)assert.equal(result.results.SHORT.transactionHash,tx.hash);
      assert.equal(await f.monthly.activeMonth(),ethers.ZeroHash);
    }
  }finally{if(tx){await rpc('evm_mine');await rpc('evm_setAutomine',[true]);await tx.wait();}}
  if(fault==='timeout'){
    await run(f);assert.equal(f.readState().jobs.SHORT.length,1);assert.equal(f.readState().jobs.MONTHLY.length,1);
  }
});

test('unknown Monthly send prevents another Short tick after a confirmed Short begin',async t=>{
  const f=await setup(t,compiled);await registeredBuy(f);await advance(30*86400+1);await run(f,1);let sends=0;
  const publisher={provider:f.provider,getAddress:()=>f.admin.getAddress(),sendTransaction:async request=>{
    sends++;if(request.to.toLowerCase()===f.monthly.target.toLowerCase())throw Object.assign(new Error('Monthly response lost'),{code:'NETWORK_ERROR'});
    return f.admin.sendTransaction(request);
  }};
  const result=await runScheduler({...f.options,publisher});
  assert.equal(result.status,'error');assert.equal(result.haltedKind,'MONTHLY');assert.equal(result.requiresReconciliation,true);
  assert.equal(result.results.SHORT.action,'begin');assert.equal(sends,2);
  const saved=f.readState();assert.equal((await f.short.datasetProposal(saved.jobs.SHORT[0].job.proposalId)).count,0n);
});
