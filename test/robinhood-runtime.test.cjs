process.env.HARDHAT_CONFIG=require.resolve('./fixtures/public-hardhat.config.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{ethers}=require('ethers');
const hre=require('hardhat'),v=require('../research/drand-feasibility/vector.json').beacon;hre.config.networks.hardhat.initialDate=new Date((1727521075+(v.round-1)*3-40*86400)*1000).toISOString();
const compiled=require('../scripts/compile.cjs').compile({writeArtifacts:false});
const {setup,rpc}=require('./fixtures/robinhood-runtime.cjs'),{runRobinhoodAutomation:run}=require('../scripts/robinhood-automation.cjs');
const network=require('../scripts/runtime-network.cjs');
test('public inspect refuses all sends even with matching pins; local entry remains local',async t=>{
 const f=await setup(t,compiled),nonce=await f.provider.getTransactionCount(f.owner);
 const r=await run({...f.options,mode:'robinhood-inspect'});assert.equal(r.reason,'publicExecutionDisabled');assert.deepEqual(r.admission.reasons,['publicExecutionNotImplemented']);
 assert.equal(await f.provider.getTransactionCount(f.owner),nonce);assert.equal(fs.existsSync(f.options.statePath),false);
 await assert.rejects(require('../scripts/promo-automation.cjs').runPromoAutomation(f.options),/profile/);
 assert.equal(network.current().chainId,31337n);
});
test('Robinhood rehearsal funds reserves once with the shared journals',async t=>{
 const f=await setup(t,compiled),r=await run(f.options);assert.equal(r.results?.funding?.status,'complete',JSON.stringify(r));
 assert.equal(await f.vault.freeShort(),3000000n);assert.equal(await f.vault.freeNext(),1000000n);assert.equal(await f.vault.freeCurrent(),2000000n);
 const nonce=await f.provider.getTransactionCount(f.owner);const again=await run(f.options);assert.equal(await f.provider.getTransactionCount(f.owner),nonce,JSON.stringify(again));
 assert.equal(r.publicLaunchReady,false);assert.equal(network.current().chainId,31337n);
});
test('native deficit waits without intent; top up resumes funding',async t=>{
 const f=await setup(t,compiled);await rpc('hardhat_setBalance',[f.owner,'0x1000']);
 const r=await run(f.options);assert.equal(r.results?.funding?.reason,'nativeFunding',JSON.stringify(r));assert.equal(await f.vault.freeShort(),0n);
 const file=f.options.statePath+'.funding';assert(!fs.existsSync(file)||!JSON.parse(fs.readFileSync(file)).pending);
 await rpc('hardhat_setBalance',[f.owner,ethers.toQuantity(ethers.parseEther('100'))]);const again=await run(f.options);assert.equal(again.results.funding.status,'complete');assert.equal(await f.vault.freeShort(),3000000n);
});
function faulty(f,mode){const real=f.collector.connect(f.admin),reader=f.collector.connect(f.provider);let once=true;
 const pull=async(...args)=>{const tx=await real.pull(...args);if(once){once=false;if(mode==='unknown')throw Object.assign(Error('lost response'),{code:'ECONNRESET'});return {hash:tx.hash,nonce:tx.nonce,wait:async()=>{throw Object.assign(Error('timeout'),{code:'TIMEOUT'});}};}return tx;};
 for(const k of ['estimateGas','populateTransaction','fragment','staticCall'])pull[k]=real.pull[k];
 return new Proxy(reader,{get(t,k){if(k==='connect')return()=>new Proxy(real,{get(c,n){return n==='pull'?pull:Reflect.get(c,n);}});return Reflect.get(t,k);}});
}
test('lost hash blocks every lane on restart, never repeats pull or pays blindly',async t=>{
 const f=await setup(t,compiled),first=await run({...f.options,collector:faulty(f,'unknown')});assert.equal(first.status,'blocked',JSON.stringify(first));
 const nonce=await f.provider.getTransactionCount(f.owner),again=await run(f.options);assert.equal(again.reason,'unknownHash',JSON.stringify(again));assert.equal(await f.provider.getTransactionCount(f.owner),nonce);assert.equal(await f.vault.freeShort(),0n);
});
test('known receipt timeout reconciles and pays once after restart',async t=>{
 const f=await setup(t,compiled),first=await run({...f.options,collector:faulty(f,'timeout')});assert.equal(first.reason,'pendingReceipt',JSON.stringify(first));
 const again=await run(f.options);assert.equal(again.results.funding.steps.filter(x=>x.action==='pull').length,0);assert.equal(await f.vault.freeShort(),3000000n);
});
test('wrong deployment pins and missing Hardhat metadata cannot enable rehearsal',async t=>{
 const f=await setup(t,compiled),nonce=await f.provider.getTransactionCount(f.owner);
 const opts={...f.options,deploymentProfile:structuredClone(f.options.deploymentProfile)};opts.deploymentProfile.pins.source[1]=ethers.ZeroHash;
 const r=await run(opts);assert.equal(r.reason,'deploymentAdmission',JSON.stringify(r));
 const proxy=new Proxy(f.provider,{get(t,k){if(k==='send')return async(m,p)=>{if(m==='hardhat_metadata')throw Error('not Hardhat');return t.send(m,p);};const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v;}});
 await assert.rejects(run({...f.options,provider:proxy}),/not Hardhat/);assert.equal(await f.provider.getTransactionCount(f.owner),nonce);
});

test('RPC outage and expensive gas are resumable waits before any broadcast',async t=>{
 const f=await setup(t,compiled),getNetwork=f.provider.getNetwork.bind(f.provider),getFeeData=f.provider.getFeeData.bind(f.provider);
 f.provider.getNetwork=async()=>{throw Object.assign(Error('offline'),{code:'ECONNRESET'});};
 assert.equal((await run(f.options)).reason,'rpcUnavailable');f.provider.getNetwork=getNetwork;
 const getCode=f.provider.getCode.bind(f.provider);f.provider.getCode=async(a,...args)=>{if(a.toLowerCase()===f.source.target.toLowerCase())throw Object.assign(Error('code read offline'),{code:'ECONNRESET'});return getCode(a,...args);};
 assert.equal((await run(f.options)).reason,'rpcUnavailable');f.provider.getCode=getCode;
 f.provider.getFeeData=async()=>({gasPrice:1000000000001n});const high=await run(f.options);assert.equal(high.results.funding.reason,'gasPrice',JSON.stringify(high));assert.equal(await f.vault.freeShort(),0n);
 f.provider.getFeeData=getFeeData;assert.equal((await run(f.options)).results.funding.status,'complete');
});
test('public context cannot call send helper and cannot leak into local validation',async t=>{
 const f=await setup(t,compiled);let calls=0;
 await network.withRobinhoodNetwork({...f.options,mode:'robinhood-inspect'},async()=>{
  assert.equal(network.current().chainId,4663n);
  const method=async()=>{calls++;};method.estimateGas=async()=>{calls++;return 1n;};
  await assert.rejects(require('../scripts/local-receipt.cjs').sendLocalTransaction(method,[],{}),/Public execution disabled/);
 });assert.equal(calls,0);assert.equal(network.current().chainId,31337n);
 assert.throws(()=>require('../scripts/infinity-worker.cjs').validateJob(f.options.fundingJob),/schema/);
});

test('rehearsal delivers drand for both frozen draws and pays old rewards exactly once',async t=>{
 const {sent}=require('./fixtures/robinhood-runtime.cjs'),f=await setup(t,compiled);
 const vector=require('../research/drand-feasibility/vector.json').beacon,target=1727521075+(vector.round-1)*3;
 const sd=require('../scripts/short-dataset.cjs'),{monthlyRoot}=require('./fixtures/dual-controller.cjs'),{drawIdFor}=require('../scripts/draw-id.cjs');
 const ps=require('./fixtures/short-outcome.cjs').participants(2,1);
 await sent(f.quote.mint(f.owner,1100_000000));await sent(f.quote.approve(f.vault.target,ethers.MaxUint256));
 await sent(f.vault.fundUSDG(500_000000,1));await sent(f.vault.fundUSDG(500_000000,2));await sent(f.vault.fundUSDG(100_000000,3));
 await rpc('evm_setNextBlockTimestamp',[target-2300]);await rpc('evm_mine');const b=await f.head(),proposal=ethers.id('runtime proposal');
 const s={drawId:drawIdFor('SHORT',ethers.id('runtime short')),campaignId:1,rulesEpoch:1,cutoffBlockNumber:b.number,cutoffBlockHash:b.hash,snapshotHash:ethers.id('short snapshot'),expectedRoot:sd.rootFor(ps),expectedCount:2,expectedAttempts:2,budget:100_000000};
 const m={drawId:drawIdFor('MONTHLY',ethers.id('runtime month')),campaign:1,rulesEpoch:1,cutoff:b.number,cutoffHash:b.hash,snapshotHash:ethers.id('monthly snapshot'),root:monthlyRoot(ps),count:2,attempts:2};
 for(const c of [f.short,f.monthly])await sent(c.checkpointCutoff(b.number));
 await sent(f.short.begin(proposal,s));await sent(f.short.publish(proposal,ps));await sent(f.monthly.beginMonth(m));await sent(f.monthly.publishMonth(m.drawId,ps));
 await rpc('evm_setNextBlockTimestamp',[target-1801]);await rpc('evm_setAutomine',[false]);
 try{const a=await f.short.seal(proposal,{gasLimit:3000000}),b=await f.monthly.sealMonth(m.drawId,{gasLimit:3000000});await rpc('evm_mine');await a.wait();await b.wait();}finally{await rpc('evm_setAutomine',[true]);}
 await rpc('evm_setNextBlockTimestamp',[target+10]);await rpc('evm_mine');
 const r=await run(f.options,{getBeacon:async round=>{assert.equal(round,String(vector.round));return vector;}});assert.equal(r.results.rng.steps.length,4,JSON.stringify(r));
 // Synthetic datasets were prepared manually: this case tests delivery and payout,
 // not automatic BUY -> dataset or scheduler process/finish on 4663.
 await sent(f.short.processShort(s.drawId,0,ps));await sent(f.short.finishShort(s.drawId));await sent(f.monthly.processMonth(m.drawId,0,ps));await sent(f.monthly.finishMonth(m.drawId));
 assert((await f.vault.claimable(f.quote.target))>0n);
 const paid=await run({...f.options,drain:true});assert(paid.steps.some(x=>x.action==='claim'),JSON.stringify(paid));assert.equal(await f.vault.claimable(f.quote.target),0n);
 const nonce=await f.provider.getTransactionCount(f.owner);await run({...f.options,drain:true});assert.equal(await f.provider.getTransactionCount(f.owner),nonce);
});
