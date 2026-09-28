// Composed offline replay + fresh local Robinhood runtime. Never a public-chain E2E claim.
process.env.HARDHAT_CONFIG=require.resolve('../test/fixtures/public-hardhat.config.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {ethers}=require('ethers'),hre=require('hardhat');
const {prepare,beacon,target}=require('../test/fixtures/robinhood-obligations.cjs');
hre.config.networks.hardhat.initialDate=new Date((target-40*86400)*1000).toISOString();
const {setup,rpc,sent}=require('../test/fixtures/robinhood-runtime.cjs');
const {runRobinhoodAutomation:run}=require('./robinhood-automation.cjs');
const {hash,replay}=require('./direct-buy.cjs');
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
async function main(){
 const output=path.resolve(process.argv[2]||'.local/logs/release-rehearsal-'+Date.now()+'.json');
 fs.mkdirSync(path.dirname(output),{recursive:true});const fd=fs.openSync(output,'wx');
 const report={schema:'release-rehearsal-report-v1',status:'running',publicLaunchReady:false,publicSends:false,startedAt:new Date().toISOString(),stages:[],assumptions:[
  'BUY receipts are replayed from saved real Infinity fork evidence, not new live swaps.',
  'Participants are explicitly imported into a fresh local chain; automatic same-chain BUY-to-dataset publication is NOT proven here.',
  'Public controller bytecode is compiled without source overrides; ArbSys/USDG/source and venue state are local fixtures.',
  'Historical drand signature, virtual chain time, manual dataset preparation and freeze; settlement and claims use the common runtime.',
  'Recovery restarts the worker with journals on the same local node, not OS-kill or node restart.',
  'Operations market fork is referenced with a hash, not re-executed or merged into this local chain.'
 ]};
 const cleanups=[];const stage=(name,data)=>{report.stages.push({name,...data});console.log(name);};
 try{
  const profile=read('config/release-rehearsal.json'),launch=read('config/robinhood-launch-plan.json');
  assert.equal(profile.scope,'composed-local-evidence-not-public-e2e');assert.equal(profile.publicExecutionEnabled,false);
  assert.equal(launch.product.creatorFeeBps,300);assert.deepEqual(Object.values(launch.product.creatorAllocationBps),[9000,500,500]);
  assert.equal(launch.product.entryThresholdRaw,'100000000');assert.equal(launch.product.nextStartTargetRaw,'100000000');
  assert.deepEqual([launch.product.shortInterval,launch.product.monthlyInterval],[21600,2592000]);
  report.profile=profile;report.launchPlan=require('./public-launch-plan.cjs').inspectPlan(launch);
  report.inputs=Object.fromEntries(['config/release-rehearsal.json','config/robinhood-launch-plan.json',profile.buyEvidence,profile.opsEvidence,'scripts/release-rehearsal.cjs','scripts/promo-automation.cjs','scripts/ops-market-executor.cjs','test/fixtures/robinhood-obligations.cjs'].map(f=>[f,digest(f)]));
  const saved=read(profile.buyEvidence),input=saved.entries.replayInput;
  assert.equal(saved.success,true);const ledger=replay(input.manifest,input.blocks);
  assert.equal(hash(ledger),hash(replay(input.manifest,[...input.blocks,...input.blocks])));
  const participants=ledger.wallets.filter(w=>BigInt(w.entriesMinted)>0n).map(w=>({wallet:w.wallet,firstAttempt:'1',lastAttempt:w.entriesMinted,count:w.entriesMinted}));
  assert(participants.length>0);assert.equal(participants.reduce((n,p)=>n+BigInt(p.count),0n),2n);
  stage('saved-infinity-buy-replay',{evidence:profile.buyEvidence,sha256:report.inputs[profile.buyEvidence],anchor:input.manifest.anchor,cutoff:input.request.cutoffBlockNumber,ledgerHash:hash(ledger),wallets:ledger.wallets,participants,continuity:'explicit participant import; separate chains'});
  const ops=read(profile.opsEvidence);assert.equal(ops.status,'complete');assert.equal(ops.sender.executorBalance,'1000000000000000');
  stage('saved-operations-market-proof',{evidence:profile.opsEvidence,sha256:report.inputs[profile.opsEvidence],anchor:ops.anchor,executedNow:false});
  const compiled=require('./compile.cjs').compile({writeArtifacts:false});
  report.compiledHash=hash(compiled);
  const f=await setup({after:fn=>cleanups.push(fn)},compiled);
  // Seed fixture revenue, then use actual collector allocation and worker delivery.
  await sent(f.quote.mint(f.source.target,2000_000000n));await sent(f.source.fund(f.quote.target,2000_000000n));
  let r=await run(f.options);assert.equal(r.results.funding.status,'complete',JSON.stringify(r));
  const opsWallet=f.options.fundingJob.recipients[1],projectWallet=f.options.fundingJob.recipients[2];
  const before=await f.quote.balanceOf(f.vault.target),opsCredit=await f.collector.credit(opsWallet),projectCredit=await f.collector.credit(projectWallet);
  const opsPaid=await f.quote.balanceOf(opsWallet),projectPaid=await f.quote.balanceOf(projectWallet);
  assert.equal(before+opsCredit+projectCredit+opsPaid+projectPaid,2006_000000n);
  stage('creator-funding',{run:r,pins:f.options.deploymentProfile.pins,policy:f.options.fundingJob,prizeBalance:String(before),opsCredit:String(opsCredit),projectCredit:String(projectCredit),opsPaid:String(opsPaid),projectPaid:String(projectPaid)});
  const ids=await prepare(f,{participants,fund:false});
  report.draws={short:ids.sId,monthly:ids.mId,shortArtifactHash:hash(ids.sa),monthlyArtifactHash:hash(ids.ma)};
  const balances=async()=>Object.fromEntries(await Promise.all(participants.map(async p=>[p.wallet,String(await f.quote.balanceOf(p.wallet))])));
  const initial=await balances();
  // External revenue failure after freeze must not block RNG, settlement or claims.
  await rpc('hardhat_setCode',[f.source.target,'0x60006000fd']);
  const reader=f.vault.connect(f.provider),real=f.vault.connect(f.admin);let interrupted=false;
  const claim=async(...args)=>{const tx=await real.claim(...args);if(!interrupted){interrupted=true;return {hash:tx.hash,nonce:tx.nonce,wait:async()=>{throw Object.assign(Error('rehearsal lost receipt response'),{code:'TIMEOUT'});}};}return tx;};
  for(const k of ['estimateGas','populateTransaction','fragment','staticCall'])claim[k]=real.claim[k];
  const faulty=new Proxy(reader,{get(o,k){return k==='connect'?()=>new Proxy(real,{get(c,n){return n==='claim'?claim:Reflect.get(c,n);}}):Reflect.get(o,k);}});
  r=await run({...f.options,vault:faulty},{getBeacon:beacon});
  const pending=read(f.options.statePath).pending;assert(interrupted&&pending?.transactionHash,JSON.stringify(r));
  assert.equal(r.results.admission.mode,'obligations-only');
  stage('known-claim-interruption',{run:r,pending,receipt:await f.provider.getTransactionReceipt(pending.transactionHash)});
  // New invocation reloads the real checksummed journals; no clearing/reset.
  r=await run(f.options,{getBeacon:beacon});assert(!read(f.options.statePath).pending,JSON.stringify(r));
  assert.equal(await f.vault.reserved(f.quote.target),0n);assert.equal(await f.vault.claimable(f.quote.target),0n);
  assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash);
  const final=await balances(),paid=participants.reduce((n,p)=>n+BigInt(final[p.wallet])-BigInt(initial[p.wallet]),0n),remaining=await f.quote.balanceOf(f.vault.target);
  assert(paid>0n);assert.equal(remaining+paid,before);assert.equal(await f.collector.credit(opsWallet),opsCredit);assert.equal(await f.collector.credit(projectWallet),projectCredit);
  stage('resume-settle-and-pay',{run:r,balancesBefore:initial,balancesAfter:final,paid:String(paid),vaultRemaining:String(remaining),conservation:true});
  const nonce=await f.provider.getTransactionCount(f.owner),again=await run(f.options,{getBeacon:beacon});
  assert.equal(await f.provider.getTransactionCount(f.owner),nonce);assert.deepEqual(await balances(),final);
  stage('repeat-no-double-payment',{run:again,nonceUnchanged:true});
  report.journals=Object.fromEntries(fs.readdirSync(f.directory).filter(n=>n.endsWith('.json')||n.startsWith('runtime.json.')).map(n=>[n,read(path.join(f.directory,n))]));
  report.finalBlock=await f.provider.getBlock('latest');report.status='complete';
  report.releaseBlockers=['Same-chain admitted live BUY -> automatic datasets -> both draws with production timing','Qualified archive RPC and fallback','Real deployment roles, addresses, verified source/immutable pins and approved limits','Public executor activation after rehearsal; currently closed','Persistent indexer and user website/claims/conditions','Service custody, durable storage, monitoring and recovery runbook','Reproducible CI/source verification and external audit'];
 }catch(e){report.status='failed';report.error=e.stack;process.exitCode=1;console.error(e.message);}
 finally{for(const fn of cleanups.reverse())try{await fn();}catch(e){report.status='failed';report.cleanupError=e.message;process.exitCode=1;}report.finishedAt=new Date().toISOString();fs.writeFileSync(fd,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');fs.closeSync(fd);console.log(output);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
