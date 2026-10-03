// Bounded measurement of real executor steps, not a full coordinator/load test.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {compile}=require('./compile.cjs'),{fixture,sent,advance}=require('../test/fixtures/local-controllers.cjs');
const {participants,normalRules}=require('../test/fixtures/short-outcome.cjs');
const {hash}=require('./direct-buy.cjs'),{drawIdFor}=require('./draw-id.cjs');
const sd=require('./short-dataset.cjs'),md=require('./monthly-dataset.cjs'),mo=require('./monthly-outcome.cjs');
const sw=require('./local-short-executor.cjs'),mw=require('./local-monthly-executor.cjs');
const json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n';
async function main(){
 const n=Number(process.argv[2]||1000);assert([1000,10000].includes(n));
 const dir=path.resolve('.local/logs/draw-worker');fs.mkdirSync(dir,{recursive:true});
 const out=fs.mkdtempSync(path.join(dir,n+'-')),report={schema:'draw-worker-probe-v1',n,status:'RUNNING',steps:[],startedAt:new Date().toISOString()};
 const save=()=>fs.writeFileSync(path.join(out,'report.json'),json(report));save();console.log('REPORT '+out);
 let f;
 try{
  f=await fixture(compile({writeArtifacts:false}),{monthlyRules:mo.RULES,weights:[7,5,4,3,2,2,1,1,1,1]});await f.fundExecution();await advance(30*86400+1);
  const sg=await f.short.shortEpochPolicy(1),mg=await f.monthly.monthlyEpochPolicy(1);
  const mp={rulesHash:mg.hash.toLowerCase(),interval:String(await f.monthly.monthlyInterval()),startedAt:String(await f.monthly.monthlyStartedAt())};
  const domain={schema:'attempt-lifecycle-v4',drawIdScheme:'kind-bit-v1',chainId:'31337',source:f.short.target,monthlySource:f.monthly.target,vault:f.vault.target,
   registry:f.registry.target,instanceId:await f.short.datasetInstance(),monthlyInstanceId:await f.monthly.monthlyInstance(),vaultQuote:f.quote.target,vaultProjectToken:f.token.target,
   monthlyPolicyHash:hash(mp),monthlyRulesGenesisHash:hash({...mp,noticeSeconds:String(await f.monthly.monthlyRulesNotice()),firstBlock:String(mg.firstBlock)}),
   shortRulesGenesisHash:hash({rulesHash:sg.hash,noticeSeconds:String(await f.short.shortRulesNotice()),startedAt:String(await f.short.shortRulesStartedAt()),firstBlock:String(sg.firstBlock)})};
  for(const [key,c] of [['source',f.short],['monthlySource',f.monthly],['vault',f.vault]])domain[key+'CodeHash']=ethers.keccak256(await f.provider.getCode(c.target));
  const ps=participants(n).map(p=>({wallet:p.wallet.toLowerCase(),firstAttempt:String(p.firstAttempt),lastAttempt:String(p.lastAttempt),count:String(p.lastAttempt-p.firstAttempt+1n)}));
  const attempts=String(ps.reduce((a,p)=>a+BigInt(p.count),0n)),jobs=[];report.chunks=Math.ceil(n/64);
  for(const kind of ['SHORT','MONTHLY']){
   const s=kind==='SHORT',c=s?f.short:f.monthly,b=await f.provider.getBlock('latest'),id=drawIdFor(kind,ethers.id('worker '+n+kind)),pid=ethers.id('worker proposal '+kind);
   const snapshot={schema:'attempt-snapshot-v4',domain,kind,drawId:id,rulesEpoch:'1',cutoff:{blockNumber:b.number,blockHash:b.hash},rulesHash:s?sg.hash:mg.hash,participants:ps};
   const request=s?{drawId:id,campaignId:1,rulesEpoch:1,cutoffBlockNumber:b.number,cutoffBlockHash:b.hash,snapshotHash:hash(snapshot),expectedRoot:sd.rootFor(ps),expectedCount:n,expectedAttempts:attempts,budget:1000}:
    {drawId:id,campaign:1,rulesEpoch:1,cutoff:b.number,cutoffHash:b.hash,snapshotHash:hash(snapshot),root:md.rootFor(ps),count:n,attempts};
   const artifact={schema:s?'short-dataset-artifact-v1':'monthly-dataset-artifact-v1',snapshot,request,rules:s?normalRules:mo.RULES,...(s?{weights:[7,5,4,3,2,2,1,1,1,1],minimumUnit:1}:{})};
   const job=s?sw.makeJob(artifact,pid):mw.makeMonthlyJob(artifact);
   await sent(s?c.begin(pid,request):c.beginMonth(request));
   for(let i=0;i<n;i+=64)await sent(s?c.publish(pid,ps.slice(i,i+64)):c.publishMonth(id,ps.slice(i,i+64)));
   await sent(s?c.seal(pid):c.sealMonth(id));await sent(f.random.deliver(await c.drawRequest(id),ethers.id('fixed worker seed')));
   jobs.push({kind,s,c,id,job});console.log('PREPARED '+kind);
  }
  // Observe API method calls (not network request billing). Restore all wrappers after each step.
  for(let pass=0;pass<2;pass++)for(const j of jobs){
   const counts={},originals={},methods=['getTransaction','getBlock','getLogs','call','getCode'];
   for(const k of methods){originals[k]=f.provider[k];counts[k]=0;f.provider[k]=function(...args){counts[k]++;return originals[k].apply(this,args);};}
   const before=await j.c[j.s?'settlements':'month'](j.id),started=performance.now();let result;
   try{result=await (j.s?sw.stepShort:mw.stepMonthly)({provider:f.provider,source:j.c,job:j.job,publisher:f.admin,executor:f.executor});}
   finally{for(const k of methods)f.provider[k]=originals[k];}
   const ms=performance.now()-started,after=await j.c[j.s?'settlements':'month'](j.id);
   assert.equal(result.status,'progress');assert.equal(after.nextChunk,before.nextChunk+1n);
   report.steps.push({kind:j.kind,pass,ms,counts,nextChunk:after.nextChunk});save();console.log(j.kind+' step '+pass+' '+Math.round(ms)+'ms '+counts.getTransaction+' transaction reads');
  }
  report.status='PASSED';report.scope='Two actual executor steps per kind; synthetic admitted dataset, no BUY proof, mock RNG, no Pons coordinator or restart/crash throughput claim. Draws intentionally unfinished on disposable in-process chain.';
 }catch(e){report.status='FAILED';report.error=e.stack;throw e;}
 finally{report.finishedAt=new Date().toISOString();save();f?.provider.destroy();}
 console.log('PASSED '+out);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
