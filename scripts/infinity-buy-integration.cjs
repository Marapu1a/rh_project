const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const I=require('./infinity-buy.cjs'),{hash,replay}=require('./direct-buy.cjs');
const {initialAdapters}=require('./buy-policy-format.cjs'),{resolveBuyPolicy}=require('./buy-policy-runtime.cjs');
const {scan}=require('./replay-direct-buy.cjs'),{runScheduler}=require('./local-promo-scheduler.cjs');
const {buildFromHistory}=require('./short-dataset.cjs');
async function run({e,provider,user,quote,rpc,buy,payout=null}){
 assert.equal(await rpc('eth_chainId'),'0x7a69');
 const compiled=payout?.compiled??require('./compile.cjs').compile(),owner=await user.getAddress(),sent=async p=>(await p).wait();
 const deploy=async(name,args=[])=>{const a=compiled[name],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,user).deploy(...args);await c.waitForDeployment();return c;};
 const code=async c=>ethers.keccak256(await provider.getCode(c.target));
 e.entries={mode:'LOCAL_FORK_AUTOMATIC_INFINITY',runs:[]};const evidence=e.entries;
 const registry=payout?.registry??await deploy('ParticipantRegistry'),random=payout?.random??await deploy('LocalRandomFixture');
 const predicted=ethers.getCreateAddress({from:owner,nonce:await provider.getTransactionCount(owner)+2});
 const rules={version:1,pNumerator:2,pDenominator:5,hNumerator:1,hDenominator:1};
 const setup={vault:predicted,registry:registry.target,instance:ethers.id('Infinity automatic short'),governor:owner,publisher:owner,provider:random.target,notice:3600,cutoffDelayBlocks:1,maxGasPrice:10n**12n,nativeFloor:10};
 const short=payout?.short??await deploy('LocalShortController',[{...setup,maxBudget:100_000000},rules,[7,5,3]]);
 const monthly=payout?.monthly??await deploy('LocalMonthlyController',[{...setup,instance:ethers.id('Infinity automatic monthly'),interval:30*86400},rules]);
 const vault=payout?.vault??await deploy('DualControllerPromoVault',[e.launch.token,e.launch.quote,short.target,monthly.target,100_000000]);if(!payout)assert.equal(vault.target,predicted);
 const anchor=await provider.getBlock('latest');
 const manifest={schema:I.SCHEMA,routeVersion:I.ID,eligibility:'automatic-buy-v1',quoteBasis:'wallet-net-debit-v1',chainId:31337,token:e.launch.token,quote:e.launch.quote,registry:registry.target,settlement:'0x4f922d5b15e6691e0469663e4f5c4177f23c5faf',poolKey:e.poolKey,poolId:e.poolId,quoteDecimals:6,entryThresholdRaw:'100000000',anchor:{number:anchor.number,hash:anchor.hash},codeHashes:{}};
 for(const [k,[a]]of Object.entries(I.PINS))manifest[k]=a;
 for(const k of ['router','manager','hook','token','quote','registry','settlement'])manifest.codeHashes[k]=ethers.keccak256(await provider.getCode(manifest[k]));I.validate(manifest);
 const sg=await short.shortEpochPolicy(1),mg=await monthly.monthlyEpochPolicy(1);
 const lifecycle={schema:'attempt-lifecycle-v4',source:short.target,sourceCodeHash:await code(short),instanceId:await short.datasetInstance(),monthlySource:monthly.target,monthlySourceCodeHash:await code(monthly),monthlyInstanceId:await monthly.monthlyInstance(),vault:vault.target,vaultCodeHash:await code(vault),shortRules:{rulesHash:sg.hash,noticeSeconds:String(await short.shortRulesNotice()),startedAt:String(await short.shortRulesStartedAt()),firstBlock:String(sg.firstBlock)},monthlyPolicy:{rulesHash:mg.hash,interval:String(await monthly.monthlyInterval()),startedAt:String(await monthly.monthlyStartedAt())},monthlyRules:{noticeSeconds:String(await monthly.monthlyRulesNotice()),firstBlock:String(mg.firstBlock)}};
 const source=await deploy('BuyPolicySource',[lifecycle.instanceId,hash(manifest),owner,2,initialAdapters(manifest)]);
 const trust={chainId:31337,instanceId:lifecycle.instanceId,source:source.target,publisher:owner,genesisHash:hash(manifest),noticeBlocks:2,sourceCodeHash:await code(source)};
 // Registry remains a deployment-domain binding, never register(): automatic genesis is explicit.
 if(!payout){await sent(quote.approve(vault.target,100_000000));await sent(vault.fundUSDG(100_000000,1));}
 for(const c of [short,monthly])await sent(user.sendTransaction({to:c.target,value:1000}));
 const first=await buy('automatic BUY with refund'),second=await buy('second automatic BUY with refund');
 const config={schema:'local-promo-scheduler-v1',manifest,lifecycle,buyPolicy:trust,cutoffMode:'LOCAL_HEAD',campaignId:'1',shortBudget:payout?'5000000':'100000000',chunkSize:1};evidence.config=config;
 const server=http.createServer(async(req,res)=>{let body='';for await(const p of req)body+=p;try{const data=JSON.parse(body);const handle=async q=>{try{return {jsonrpc:'2.0',id:q.id,result:await rpc(q.method,q.params)};}catch(error){return {jsonrpc:'2.0',id:q.id,error:{code:-32000,message:error.message}};}};res.setHeader('content-type','application/json');res.end(JSON.stringify(Array.isArray(data)?await Promise.all(data.map(handle)):await handle(data)));}catch{res.statusCode=400;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 fs.mkdirSync('.local/logs',{recursive:true});const statePath=fs.mkdtempSync('.local/logs/infinity-entries-')+'/state.json';
 try{
  const cutoff=Number(BigInt(second.blockNumber)),resolved=await resolveBuyPolicy(config,rpc,cutoff);assert.equal(resolved.policyStatus.mode,'admitted');
  const raw=await scan(resolved.manifest,url,cutoff,lifecycle),ledger=replay(resolved.manifest,raw.blocks);
  assert.equal(ledger.wallets.length,1);assert.equal(ledger.wallets[0].entriesMinted,'2');assert.equal(ledger.wallets[0].carryRaw,'6600000');assert.deepEqual(ledger.registrations,[]);
  assert.equal(hash(replay(resolved.manifest,[...raw.blocks,...raw.blocks])),hash(ledger));
  for(const tx of [first,second]){const d=ledger.decisions.find(d=>d.transactionHash===tx.hash);assert.equal(d.netQuoteDebitRaw,'103300000');assert.equal(d.refundQuoteRaw,'6700000');}
  evidence.policyStatus=resolved.policyStatus;evidence.buyLedger=ledger;
  if(payout){await require('./infinity-payout-integration.cjs').fund({e,provider,user,quote,payout,rpc});}else await rpc('evm_increaseTime',[6*3600+1]);await rpc('evm_mine');
  const options={provider,short,monthly,config,rpcUrl:url,statePath,publisher:user,executor:user};
  const tick=async()=>{const r=await runScheduler(options,{maxTicks:1});evidence.runs.push(r);return r;};
  const saved=await tick();assert.equal(saved.results.SHORT.action,'saveJob');
  const state=JSON.parse(fs.readFileSync(statePath)),job=state.jobs.SHORT[0].job;
  assert.equal(job.artifact.request.expectedAttempts,'2');assert.equal(job.artifact.snapshot.participants.length,1);
  const historical=await resolveBuyPolicy(config,rpc,Number(job.artifact.request.cutoffBlockNumber)),scanned=await scan(historical.manifest,url,job.artifact.request.cutoffBlockNumber,lifecycle);
  const input={manifest:historical.manifest,lifecycle,blocks:scanned.blocks,request:job.artifact.request,rules:job.artifact.rules,weights:job.artifact.weights,minimumUnit:job.artifact.minimumUnit};
  assert.equal(hash(buildFromHistory(input)),hash(job.artifact));evidence.replayInput=input;evidence.artifact=job.artifact;
  await rpc('evm_mine');const begun=await tick();assert.equal(begun.results.SHORT.status,'progress');
  const resumed=await tick();assert.equal(resumed.results.SHORT.action,'publish');
  if(payout)await require('./infinity-payout-integration.cjs').finish({e,provider,user,quote,payout,rpc,tick,job,config,rpcUrl:url,lifecycle});
  evidence.result={entries:'2',carry:'6600000',refundEach:'6700000',noRegistration:true,stableArtifact:true,beginPublished:true};
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
module.exports={run};
