// Invoked by permit-buy-fork.cjs --integration. No public sends, no winner selection.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict'),{ethers}=require('ethers');
const {hash,replay}=require('./direct-buy.cjs');
const {initialAdapters,adapterId,extend}=require('./buy-policy-format.cjs');
const {publishBuyPolicy}=require('./publish-buy-policy.cjs');
const {resolveBuyPolicy}=require('./buy-policy-runtime.cjs');
const {scan}=require('./replay-direct-buy.cjs');
const {runScheduler}=require('./local-promo-scheduler.cjs');
const {makeJob}=require('./local-short-executor.cjs');
const {buildFromHistory}=require('./short-dataset.cjs');
async function run({e,cfg,provider,user,quote,rpc,buy,out}){
 assert.equal(await rpc('eth_chainId'),'0x7a69');
 const compiled=require('./compile.cjs').compile(),owner=await user.getAddress();
 const sent=async p=>(await p).wait();
 const code=async c=>ethers.keccak256(await provider.getCode(c.target));
 const deploy=async(name,args=[])=>{const a=compiled[name],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,user).deploy(...args);await c.waitForDeployment();return c;};
 e.integration={mode:'LOCAL_FORK_REAL_BUY_LOCAL_CONTROLLERS',deployments:{},runs:[],publicationJournal:[]};
 const evidence=e.integration;
 e.stage='integration-deploy';
 const anchor=await rpc('eth_getBlockByNumber',['latest',false]);
 const registry=await deploy('ParticipantRegistry'),random=await deploy('LocalRandomFixture');
 const predicted=ethers.getCreateAddress({from:owner,nonce:await provider.getTransactionCount(owner)+2});
 const rules={version:1,pNumerator:2,pDenominator:5,hNumerator:1,hDenominator:1};
 const setup={vault:predicted,registry:registry.target,instance:ethers.id('fork integration short'),governor:owner,
  publisher:owner,provider:random.target,notice:3600,cutoffDelayBlocks:1,maxGasPrice:10n**12n,nativeFloor:10};
 const short=await deploy('LocalShortController',[{...setup,maxBudget:100_000000},rules,[7,5,3]]);
 const monthly=await deploy('LocalMonthlyController',[{...setup,instance:ethers.id('fork integration monthly'),interval:30*86400},rules]);
 const vault=await deploy('DualControllerPromoVault',[cfg.token,cfg.quote,short.target,monthly.target,100_000000]);
 assert.equal(vault.target,predicted);
 const manifest={...cfg,chainId:31337,schema:'direct-buy-v1',routeVersion:'rh-ur-10-060b0e-v1',
  quoteDecimals:6,entryThresholdRaw:'100000000',registry:registry.target,anchor:{number:anchor.number,hash:anchor.hash},
  codeHashes:{...e.codeHashes,registry:await code(registry)}};
 const sg=await short.shortEpochPolicy(1),mg=await monthly.monthlyEpochPolicy(1);
 const lifecycle={schema:'attempt-lifecycle-v4',source:short.target,sourceCodeHash:await code(short),instanceId:await short.datasetInstance(),
  monthlySource:monthly.target,monthlySourceCodeHash:await code(monthly),monthlyInstanceId:await monthly.monthlyInstance(),vault:vault.target,vaultCodeHash:await code(vault),
  shortRules:{rulesHash:sg.hash,noticeSeconds:String(await short.shortRulesNotice()),startedAt:String(await short.shortRulesStartedAt()),firstBlock:String(sg.firstBlock)},
  monthlyPolicy:{rulesHash:mg.hash,interval:String(await monthly.monthlyInterval()),startedAt:String(await monthly.monthlyStartedAt())},
  monthlyRules:{noticeSeconds:String(await monthly.monthlyRulesNotice()),firstBlock:String(mg.firstBlock)}};
 const source=await deploy('BuyPolicySource',[lifecycle.instanceId,hash(manifest),owner,2,initialAdapters(manifest)]);
 const trust={chainId:31337,instanceId:lifecycle.instanceId,source:source.target,publisher:owner,genesisHash:hash(manifest),noticeBlocks:2,sourceCodeHash:await code(source)};
 for(const [name,c] of Object.entries({registry,random,short,monthly,vault,source}))evidence.deployments[name]={address:c.target,codeHash:await code(c)};
 await sent(registry.connect(user).register());
 await sent(quote.approve(vault.target,100_000000));await sent(vault.fundUSDG(100_000000,1));
 for(const c of [short,monthly])await sent(user.sendTransaction({to:c.target,value:1000}));
 const height=Number(BigInt(await rpc('eth_blockNumber'))),activation=height+5;
 const next=extend(manifest,adapterId('rh-ur-0a10-060b0e-v1'),activation,height);
 e.stage='integration-announce';
 const notice=await publishBuyPolicy({trust,genesis:manifest,next,rpc,signer:user,persist:async row=>{
  evidence.publicationJournal.push(row);
  fs.writeFileSync(out+'.publication.json',JSON.stringify(evidence.publicationJournal,null,2)+'\n');
 }});await notice.wait();
 const before=await buy('BUY before activation');assert(Number(BigInt(before.blockNumber))<activation);
 while(Number(BigInt(await rpc('eth_blockNumber')))<activation-1)await rpc('evm_mine');
 const after=await buy('BUY at activation');assert.equal(Number(BigInt(after.blockNumber)),activation);
 evidence.activation=activation;evidence.buyHashes={before:before.hash,after:after.hash};
 const config={schema:'local-promo-scheduler-v1',manifest,lifecycle,buyPolicy:trust,cutoffMode:'LOCAL_HEAD',campaignId:'1',shortBudget:'100000000',chunkSize:1};
 evidence.config=config;
 // Loopback transport exposes this in-process Hardhat only; upstream remains read-only.
 const server=http.createServer(async(req,res)=>{let body='';for await(const p of req)body+=p;
  try{const data=JSON.parse(body);const handle=async q=>{try{return {jsonrpc:'2.0',id:q.id,result:await rpc(q.method,q.params)};}catch(error){return {jsonrpc:'2.0',id:q.id,error:{code:-32000,message:error.message}};}};
   res.setHeader('content-type','application/json');res.end(JSON.stringify(Array.isArray(data)?await Promise.all(data.map(handle)):await handle(data)));
  }catch{res.statusCode=400;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port;
 fs.mkdirSync('.local/logs',{recursive:true});const dir=fs.mkdtempSync(path.resolve('.local/logs/permit-integration-'));
 const statePath=path.join(dir,'state.json');evidence.localState=statePath;
 try{
  e.stage='integration-admission-replay';
  const resolved=await resolveBuyPolicy(config,rpc,activation);assert.equal(resolved.policyStatus.mode,'admitted');
  const raw=await scan(resolved.manifest,url,activation,lifecycle),ledger=replay(resolved.manifest,raw.blocks);
  assert.equal(ledger.decisions.find(d=>d.transactionHash===before.hash).reason,'COMMAND_SEQUENCE');
  assert.equal(ledger.decisions.find(d=>d.transactionHash===after.hash).status,'ELIGIBLE');
  assert.equal(ledger.wallets.length,1);assert.equal(ledger.wallets[0].entriesMinted,'1');assert.equal(ledger.wallets[0].carryRaw,'0');
  assert.equal(hash(replay(resolved.manifest,raw.blocks)),hash(ledger));
  evidence.policyStatus=resolved.policyStatus;evidence.buyLedger=ledger;
  await rpc('evm_increaseTime',[6*3600+1]);await rpc('evm_mine');
  const options={provider,short,monthly,config,rpcUrl:url,statePath,publisher:user,executor:user};
  const tick=async()=>{const r=await runScheduler(options,{maxTicks:1});evidence.runs.push(r);return r;};
  e.stage='integration-save-job';
  const nonce=await provider.getTransactionCount(owner),saved=await tick();assert.equal(saved.results.SHORT.action,'saveJob');
  assert.equal(await provider.getTransactionCount(owner),nonce);
  const original=fs.readFileSync(statePath,'utf8'),state=JSON.parse(original),job=state.jobs.SHORT[0].job;
  assert.equal(job.artifact.request.expectedAttempts,'1');assert.equal(job.artifact.snapshot.participants.length,1);
  assert.equal(job.artifact.snapshot.participants[0].wallet,owner.toLowerCase());
  const cutoff=Number(job.artifact.request.cutoffBlockNumber),historical=await resolveBuyPolicy(config,rpc,cutoff);
  const scanned=await scan(historical.manifest,url,cutoff,lifecycle);
  const input={manifest:historical.manifest,lifecycle,blocks:scanned.blocks,request:job.artifact.request,rules:job.artifact.rules,weights:job.artifact.weights,minimumUnit:job.artifact.minimumUnit};
  assert.equal(hash(buildFromHistory(input)),hash(job.artifact));
  assert.equal(hash(buildFromHistory(structuredClone(input))),hash(job.artifact));
  evidence.replayInput=input;evidence.artifact=job.artifact;evidence.artifactHash=hash(job.artifact);
  // Coherent artifact+job+state checksums still must not bypass the independent gate.
  e.stage='integration-tamper-rejection';
  const forged=structuredClone(job.artifact);forged.request.budget=String(BigInt(forged.request.budget)+15n);
  state.jobs.SHORT[0].job=makeJob(forged,job.proposalId,config.chunkSize);delete state.checksum;
  const forgedBytes=JSON.stringify({...state,checksum:hash(state)},null,2)+'\n';fs.writeFileSync(statePath,forgedBytes);
  const rejected=await tick();assert.match(rejected.results.SHORT.message,/Stored job differs from independent replay/);
  assert.equal(await provider.getTransactionCount(owner),nonce);assert.equal(fs.readFileSync(statePath,'utf8'),forgedBytes);
  fs.writeFileSync(statePath,original);
  e.stage='integration-begin';
  await rpc('evm_mine');const begun=await tick();assert.equal(begun.results.SHORT.status,'progress');
  const resumed=await tick();assert.notEqual(resumed.status,'error');
  const finalState=JSON.parse(fs.readFileSync(statePath,'utf8'));assert.equal(finalState.jobs.SHORT.length,1);
  assert.equal(finalState.jobs.SHORT[0].job.commitment,job.commitment);
  const again=await resolveBuyPolicy(config,rpc,cutoff),againBlocks=await scan(again.manifest,url,cutoff,lifecycle);
  assert.equal(hash(buildFromHistory({...input,manifest:again.manifest,blocks:againBlocks.blocks})),evidence.artifactHash);
  evidence.finalState=finalState;evidence.result={entries:'1',carry:'0',tamperRejectedBeforeSend:true,stableArtifact:true,jobs:1};
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
module.exports={run};
