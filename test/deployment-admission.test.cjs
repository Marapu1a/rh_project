const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {fixture,frozen,beacon}=require('./fixtures/promo-automation.cjs');
const {createDeploymentProfile,inspectDeployment,validateDeploymentProfile}=require('../scripts/deployment-admission.cjs');
const {runPromoAutomation}=require('../scripts/promo-automation.cjs');
async function profile(f){return createDeploymentProfile(f.options,{scope:'local-rehearsal',executor:await f.admin.getAddress(),sourceCodeHash:ethers.keccak256(await f.provider.getCode(f.source.target)),timing:{leadSeconds:'3600',maxClockLag:'30',maxClockAhead:'5',maxFinalizedLag:'1800',maxBeaconLag:'15',shortInterval:'21600',monthlyInterval:'2592000',cutoffDelayBlocks:'1'}});}
test('deployment profile matches actual pins, bindings and immutable timing without release authorization',async t=>{
 const f=await fixture(t),p=await profile(f),r=await inspectDeployment(f.provider,p,f.options);assert.equal(r.status,'matched',JSON.stringify(r));assert.equal(r.publicLaunchReady,false);assert.equal(r.authorizationToFreeze,false);
 const publicResult=await inspectDeployment(f.provider,{...p,scope:'public-launch'},f.options);assert(publicResult.reasons.includes('publicExecutionNotImplemented'));
 for(const patch of [{executor:await f.executor.getAddress()},{timing:{...p.timing,leadSeconds:'4000'}},{pins:{...p.pins,source:[f.source.target,ethers.ZeroHash]}}]){
  const bad=await inspectDeployment(f.provider,{...p,...patch},f.options);assert.equal(bad.status,'blocked',JSON.stringify(bad));
 }
 assert.throws(()=>validateDeploymentProfile({...p,timing:{...p.timing,leadSeconds:'60'}},f.options),/Incoherent/);
 assert.throws(()=>validateDeploymentProfile(p,{...f.options,schedulerConfig:{...f.config,shortBudget:'102'}}),/config mismatch/);
});
test('deployment mismatch blocks new freeze but preserves settlement and old USDG claims',async t=>{
 const f=await fixture(t),job=await frozen(f);f.options.deploymentProfile={...await profile(f),timing:{...(await profile(f)).timing,leadSeconds:'4000'}};
 const r=await runPromoAutomation(f.options,{getBeacon:beacon});assert(r.steps.some(s=>s.action==='claim'),JSON.stringify(r));assert.equal(await f.vault.reward(job.artifact.request.drawId,await f.admin.getAddress()),0n);
});
test('deployment read failure is blocked and never interpreted as a matching profile',async t=>{
 const f=await fixture(t),p=await profile(f);const provider=new Proxy(f.provider,{get(o,k){return k==='getCode'?async()=>{throw Error('RPC down');}:(typeof o[k]==='function'?o[k].bind(o):o[k]);}});
 const r=await inspectDeployment(provider,p,f.options);assert.equal(r.status,'blocked');assert(r.reasons.includes('deploymentObservationUnavailable'));
});
const {rpc,target,sent}=require('./fixtures/promo-automation.cjs');
const preflight=require('../scripts/drand-preflight.cjs');
test('mismatched profile does not create a fresh scheduler job or freeze',async t=>{
 const f=await fixture(t);f.options.deploymentProfile=await profile(f);f.options.deploymentProfile.timing.leadSeconds='4000';
 await rpc('evm_increaseTime',[21601]);await rpc('evm_mine');
 const r=await runPromoAutomation(f.options);assert.equal(r.reason,'deploymentAdmission',JSON.stringify(r));assert.equal(await f.short.activeProposal(),ethers.ZeroHash);assert(!r.steps.some(s=>['begin','seal'].includes(s.action)));
});
test('profiled freeze rechecks timing after gas estimation and can resume the same proposal',async t=>{
 const f=await fixture(t);f.options.deploymentProfile=await profile(f);
 await rpc('evm_setNextBlockTimestamp',[target-4000]);await rpc('evm_mine');
 await require('../scripts/local-promo-scheduler.cjs').runScheduler({...f.options,config:f.config,statePath:f.options.statePath+'.scheduler',publisher:f.admin,kinds:['SHORT']},{maxTicks:3});
 const original=preflight.drandPreflight;let calls=0;preflight.drandPreflight=async()=>++calls%2?{status:'observedHealthy'}:{status:'wait',reasons:['staleChainClock']};
 try{const r=await runPromoAutomation(f.options);assert(!r.steps.some(s=>s.action==='seal'));assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);assert.equal(f.read().lastTimingAdmission.status,'wait');assert(!f.read().pending);}
 finally{preflight.drandPreflight=original;}
 preflight.drandPreflight=async()=>({status:'observedHealthy'});
 try{const r=await runPromoAutomation(f.options);assert(r.steps.some(s=>s.action==='seal'),JSON.stringify(r));assert.notEqual(await f.short.pendingDatasetDraw(),ethers.ZeroHash);}finally{preflight.drandPreflight=original;}
});
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('profile is retained through handoff; offline CLI exports without overwriting files',async t=>{
 const f=await fixture(t),p=await profile(f);f.options.deploymentProfile=p;await runPromoAutomation(f.options);
 const next={...f.options,statePath:f.directory+'/next.json'},handoff=require('../scripts/promo-runtime-handoff.cjs').handoffRuntime;
 await assert.rejects(handoff(f.options,{...next,deploymentProfile:undefined}),/cannot remove deployment profile/);
 assert.equal((await handoff(f.options,next)).status,'complete');assert.equal((await runPromoAutomation(f.options)).reason,'runtimeRetired');
 const configPath=path.join(f.directory,'config.json'),settingsPath=path.join(f.directory,'settings.json'),out=path.join(f.directory,'profile.json');
 fs.writeFileSync(configPath,JSON.stringify({fundingJob:f.options.fundingJob,deliveryJob:f.options.deliveryJob,schedulerConfig:f.config}));fs.writeFileSync(settingsPath,JSON.stringify({scope:p.scope,executor:p.executor,timing:p.timing,sourceCodeHash:p.pins.source[1]}));
 const args=['scripts/inspect-deployment.cjs','export','--config',configPath,'--settings',settingsPath,'--out',out];
 let result=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(fs.readFileSync(out)),p);
 result=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true});assert.equal(result.status,1);assert.match(result.stderr,/EEXIST/);
});
test('deployment observations reject missing code and a changed head',async t=>{
 const f=await fixture(t),p=await profile(f),head=await f.provider.getBlock('latest');
 const missing=new Proxy(f.provider,{get(o,k){return k==='getCode'?async()=> '0x':(typeof o[k]==='function'?o[k].bind(o):o[k]);}});assert((await inspectDeployment(missing,p,f.options)).reasons.includes('runtime:adapter'));
 const changed=new Proxy(f.provider,{get(o,k){return k==='getBlock'?async tag=>{const b=await o.getBlock(tag);return tag===head.number?{...b,hash:ethers.ZeroHash}:b;}:(typeof o[k]==='function'?o[k].bind(o):o[k]);}});
 assert((await inspectDeployment(changed,p,f.options)).reasons.includes('stableObservation'));
});

test('the same deployment profile admits a Monthly freeze through the shared guard',async t=>{
 const f=await fixture(t),{MONTHLY_ACTIONS}=require('../scripts/promo-automation.cjs');f.options.ops.schema='local-promo-automation-v1';for(const a of MONTHLY_ACTIONS)f.options.ops.gasUnits[a]='3000000';f.options.deploymentProfile=await profile(f);
 await rpc('evm_setNextBlockTimestamp',[target-4000]);await rpc('evm_mine');
 await require('../scripts/local-promo-scheduler.cjs').runScheduler({...f.options,config:f.config,statePath:f.options.statePath+'.scheduler',publisher:f.admin,kinds:['MONTHLY']},{maxTicks:3});
 const original=preflight.drandPreflight;preflight.drandPreflight=async()=>({status:'observedHealthy'});
 try{const r=await runPromoAutomation({...f.options,drain:true});assert(r.steps.some(s=>s.action==='sealMonth'),JSON.stringify(r));assert.notEqual(await f.monthly.pendingMonth(),ethers.ZeroHash);assert.equal(f.read().lastDeploymentAdmission.status,'matched');}finally{preflight.drandPreflight=original;}
});
