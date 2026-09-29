process.env.HARDHAT_CONFIG=require.resolve('./fixtures/public-hardhat.config.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers'),hre=require('hardhat');
const {prepare,beacon,target}=require('./fixtures/robinhood-obligations.cjs');hre.config.networks.hardhat.initialDate=new Date((target-40*86400)*1000).toISOString();
const {setup,rpc,sent}=require('./fixtures/robinhood-runtime.cjs'),{createDeploymentProfile,inspectDeployment}=require('../scripts/deployment-admission.cjs');
const op=require('../scripts/operational-profile.cjs'),plan=require('../config/robinhood-launch-plan.json');
const compiled=require('../scripts/compile.cjs').compile();
function settings(f){return {roles:{governor:f.owner,operations:f.options.fundingJob.recipients[1],project:f.options.fundingJob.recipients[2],buyPolicyPublisher:f.owner},
 controllers:{short:{noticeSeconds:'3600',maxGasPrice:'1000000000000',nativeFloor:'0'},monthly:{noticeSeconds:'3600',maxGasPrice:'1000000000000',nativeFloor:'0'}},
 buyPolicy:{source:f.options.schedulerConfig.buyPolicy.source,codeHash:f.options.schedulerConfig.buyPolicy.sourceCodeHash,noticeBlocks:'2'}};}
function install(f,o=op.create(plan,settings(f))){const p=f.options.deploymentProfile;f.options.deploymentProfile=createDeploymentProfile(f.options,{scope:p.scope,executor:p.executor,timing:p.timing,sourceCodeHash:p.pins.source[1],operational:o});return f.options.deploymentProfile;}
test('v2 explicitly checks approved genesis, roles, notice, budget and gas; drift is rejected',async t=>{
 const f=await setup(t,compiled,{launchRules:true}),p=install(f),read=()=>inspectDeployment(f.provider,f.options.deploymentProfile,f.options);
 const r=await read();assert.deepEqual(r.reasons,['publicExecutionNotImplemented'],JSON.stringify(r));assert.equal(r.operationalCoverage,'v2-explicit');
 for(const [label,change] of [
  ['operational:short.shortRulesNotice',x=>x.controllers.short.noticeSeconds='3601'],
  ['operational:monthly.maxGasPrice',x=>x.controllers.monthly.maxGasPrice='2000000000000'],
  ['operational:short.owner',x=>x.roles.governor=f.other.address],
  ['operational:recipientRoles',x=>x.roles.operations=f.other.address],
  ['operational:buyPolicyNotice',x=>x.buyPolicy.noticeBlocks='3']]){
  const altered=structuredClone(p.operational);change(altered);install(f,altered);assert((await read()).reasons.includes(label),label);
 }
 f.options.deploymentProfile=p;const max=f.options.ops.maxGasPrice,reserve=f.options.ops.reserveGasPrice;
 f.options.ops.maxGasPrice='1000000000001';f.options.ops.reserveGasPrice='1000000000001';assert((await read()).reasons.includes('operational:workerGasBounds'));
 f.options.ops.maxGasPrice='1000000000';f.options.ops.reserveGasPrice=max;assert.deepEqual((await read()).reasons,['publicExecutionNotImplemented']);
 f.options.ops.maxGasPrice=max;f.options.ops.reserveGasPrice=reserve;
 await sent(f.short.transferOwnership(f.other.address));assert((await read()).reasons.includes('operational:short.pendingOwner'));
});
test('legacy fixture economics cannot pass v2 and missing choices are never read from chain',async t=>{
 const f=await setup(t,compiled);install(f);const r=await inspectDeployment(f.provider,f.options.deploymentProfile,f.options);
 for(const reason of ['operational:shortGenesis','operational:short.maxBudget','operational:entryAndBudget'])assert(r.reasons.includes(reason),reason);
 assert.throws(()=>op.create(plan,require('../config/operational-settings.template.json')),/role/);
 const wrong=structuredClone(plan);wrong.unresolved.shortRules.pNumerator=2;assert.throws(()=>op.create(wrong,settings(f)),/conflicts/);
 const downgrade={...f.options.deploymentProfile,schema:'promo-deployment-profile-v1'};assert.throws(()=>require('../scripts/deployment-admission.cjs').validateDeploymentProfile(downgrade),/require deployment profile v2/);
 delete downgrade.operational;
 await assert.rejects(require('../scripts/promo-runtime-handoff.cjs').handoffRuntime(f.options,{deploymentProfile:downgrade}),/cannot downgrade/);
 const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
 const input=path.join(f.directory,'settings.json'),out=path.join(f.directory,'operational.json');
 fs.writeFileSync(input,JSON.stringify(settings(f)));
 const cli=()=>spawnSync(process.execPath,['scripts/operational-profile.cjs',input,out],{encoding:'utf8'});
 assert.equal(cli().status,0);assert.deepEqual(JSON.parse(fs.readFileSync(out,'utf8')),op.create(plan,settings(f)));
 const before=fs.readFileSync(out,'utf8');assert.notEqual(cli().status,0);assert.equal(fs.readFileSync(out,'utf8'),before);
 fs.writeFileSync(input,JSON.stringify(require('../config/operational-settings.template.json')));
 const invalid=cli();assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/role/);
});
test('operational role drift blocks ready freeze but cannot strand both frozen obligations',async t=>{
 const f=await setup(t,compiled,{launchRules:true});install(f);const ids=await prepare(f,{freeze:false});
 await sent(f.short.transferOwnership(f.other.address));
 const {runRobinhoodAutomation:run}=require('../scripts/robinhood-automation.cjs');
 const nonce=await f.provider.getTransactionCount(f.owner),blocked=await run(f.options);
 assert.equal(blocked.reason,'obligationsOnly',JSON.stringify(blocked));assert.equal(await f.provider.getTransactionCount(f.owner),nonce);
 assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash);
 // Restore owner state (cancel proposed transfer), freeze with the same historical beacon round.
 await sent(f.short.transferOwnership(ethers.ZeroAddress));
 const matched=await inspectDeployment(f.provider,f.options.deploymentProfile,f.options);assert.deepEqual(matched.reasons,['publicExecutionNotImplemented']);
 await rpc('evm_setNextBlockTimestamp',[target-1801]);await rpc('evm_setAutomine',[false]);
 try{const a=await f.short.seal(ids.proposal,{gasLimit:3000000}),b=await f.monthly.sealMonth(ids.mId,{gasLimit:3000000});await rpc('evm_mine');await a.wait();await b.wait();}finally{await rpc('evm_setAutomine',[true]);}
 await sent(f.short.transferOwnership(f.other.address));await rpc('evm_setNextBlockTimestamp',[target+10]);await rpc('evm_mine');
 const result=await run(f.options,{getBeacon:beacon});assert.equal(result.reason,'obligationsOnly',JSON.stringify(result));
 for(const action of ['processShort','finishShort','processMonth','finishMonth'])assert(result.steps.some(s=>s.action===action),action);
 assert.equal(await f.vault.reserved(f.quote.target),0n);assert.equal(await f.vault.claimable(f.quote.target),0n);
 const before=await f.provider.getTransactionCount(f.owner);await run(f.options,{getBeacon:beacon});assert.equal(await f.provider.getTransactionCount(f.owner),before);
});
