// Local EVM measurements only: synthetic distinct wallets, no BUY/RPC throughput claim.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {compile}=require('./compile.cjs');
const {fixture,sent,advance}=require('../test/fixtures/local-controllers.cjs');
const {participants,normalRules}=require('../test/fixtures/short-outcome.cjs');
const {monthlyRoot}=require('../test/fixtures/dual-controller.cjs');
const {rootFor}=require('./short-dataset.cjs'),{drawIdFor}=require('./draw-id.cjs');
const shortModel=require('./short-settlement.cjs'),monthModel=require('./monthly-outcome.cjs');
const json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n';
async function main(){
 const n=Number(process.argv[2]||10000);assert([100,10000,50000,100000].includes(n));
 const out=path.resolve('.local/logs/draw-capacity');fs.mkdirSync(out,{recursive:true});
 const dir=fs.mkdtempSync(path.join(out,`${n}-`));
 const report={schema:'draw-capacity-v1',status:'RUNNING',n,startedAt:new Date().toISOString(),
  scope:'LocalShortController/LocalMonthlyController, Cancun local EVM, synthetic attempts, mock RNG and USDG; no public-network timing, fee or admission qualification',
  shortRules:normalRules,monthlyRules:monthModel.RULES,weights:[7,5,4,3,2,2,1,1,1,1],rows:[],results:[]};
 const save=()=>fs.writeFileSync(path.join(dir,'report.json'),json(report));save();
 console.log('REPORT '+dir);
 let f;
 try{
  const compiled=compile({writeArtifacts:false});
  f=await fixture(compiled,{rules:normalRules,monthlyRules:monthModel.RULES,weights:report.weights});
  await f.fundExecution();await advance(30*86400+1);
  const ps=participants(n),attempts=ps.reduce((a,p)=>a+p.lastAttempt-p.firstAttempt+1n,0n);
  report.attempts=attempts;report.chunks=Math.ceil(n/64);
  report.runtimeHashes=Object.fromEntries(await Promise.all(['short','monthly','vault'].map(async k=>[k,ethers.keccak256(await f.provider.getCode(f[k].target))])));
  async function measure(kind,c,action,args){
   const started=performance.now(),tx=await c[action](...args,{gasLimit:16000000}),r=await tx.wait();
   assert.equal(r.status,1);report.rows.push({kind,action,gas:r.gasUsed,calldataBytes:(tx.data.length-2)/2,block:r.blockNumber,ms:performance.now()-started});
  }
  const jobs=[];
  for(const kind of ['SHORT','MONTHLY']){
   const isShort=kind==='SHORT',c=isShort?f.short:f.monthly,b=await f.provider.getBlock('latest');
   const id=drawIdFor(kind,ethers.id('capacity '+n+kind)),pid=ethers.id('proposal '+n+kind);
   const input=isShort?{drawId:id,campaignId:1,rulesEpoch:1,cutoffBlockNumber:b.number,cutoffBlockHash:b.hash,snapshotHash:ethers.id('synthetic'),expectedRoot:rootFor(ps),expectedCount:n,expectedAttempts:attempts,budget:1000}:
    {drawId:id,campaign:1,rulesEpoch:1,cutoff:b.number,cutoffHash:b.hash,snapshotHash:ethers.id('synthetic'),root:monthlyRoot(ps),count:n,attempts};
   await measure(kind,c,isShort?'begin':'beginMonth',isShort?[pid,input]:[input]);
   for(let i=0;i<n;i+=64){await measure(kind,c,isShort?'publish':'publishMonth',[isShort?pid:id,ps.slice(i,i+64)]);if(i%6400===0){save();console.log(kind+' published '+Math.min(i+64,n)+'/'+n);}}
   jobs.push({kind,c,id,pid,isShort});
  }
  for(const j of jobs)await measure(j.kind,j.c.connect(f.executor),j.isShort?'seal':'sealMonth',[j.isShort?j.pid:j.id]);
  assert.equal(await f.vault.reserved(f.quote.target),2000n);
  const seed=ethers.id('fixed capacity seed');report.seed=seed;
  for(const j of jobs)await measure(j.kind,f.random,'deliver',[await j.c.drawRequest(j.id),seed]);
  // Interleave both obligations; each call reads persisted progress, as after a worker restart.
  for(let i=0;i<n;i+=64){
   for(const j of jobs){const s=await j.c[j.isShort?'settlements':'month'](j.id);assert.equal(s.nextChunk,BigInt(i/64));await measure(j.kind,j.c.connect(f.executor),j.isShort?'processShort':'processMonth',[j.id,i/64,ps.slice(i,i+64)]);}
   if(i%6400===0){save();console.log('BOTH processed '+Math.min(i+64,n)+'/'+n);}
  }
  for(const j of jobs){
   let expected,winners,amounts;
   if(j.isShort){const p=await j.c.datasetProposal(j.pid),basket=Array.from(await j.c.datasetBasket(j.pid));expected=shortModel.compute(p.context,seed,ps,normalRules,basket);assert.equal((await j.c.shortResult(j.id)).resultHash,expected.resultHash);winners=expected.winners;amounts=expected.amounts;}
   else {const m=await j.c.month(j.id);expected=monthModel.expectedResult(m,{rules:monthModel.RULES,snapshot:{participants:ps}});winners=expected.winner===ethers.ZeroAddress?[]:[expected.winner];amounts=winners.map(()=>m.budget);}
   await measure(j.kind,j.c.connect(f.executor),j.isShort?'finishShort':'finishMonth',[j.id]);
   const terminal=await j.c[j.isShort?'settlements':'month'](j.id);assert.equal(terminal.phase,j.isShort?3n:5n);
   if(!j.isShort)assert.equal(terminal.resultHash,expected.resultHash);
   for(let i=0;i<winners.length;i++){assert.equal(await f.vault.reward(j.id,winners[i]),amounts[i]);await measure(j.kind,f.vault,'claim',[j.id,winners[i]]);assert.equal(await f.vault.reward(j.id,winners[i]),0n);}
   report.results.push({kind:j.kind,resultHash:expected.resultHash,winners:winners.length,awarded:amounts.reduce((a,b)=>a+b,0n),terminal:true});
  }
  assert.equal(await f.vault.reserved(f.quote.target),0n);assert.equal(await f.vault.claimable(f.quote.target),0n);
  assert.equal(await f.quote.balanceOf(f.vault.target),await f.vault.freeShort()+await f.vault.freeCurrent()+await f.vault.freeNext()+await f.vault.unrecognizedUSDG());
  report.actions={};for(const r of report.rows){const a=report.actions[r.kind+'.'+r.action]??={count:0,totalGas:0n,maxGas:0n,maxCalldataBytes:0};a.count++;a.totalGas+=r.gas;if(r.gas>a.maxGas)a.maxGas=r.gas;a.maxCalldataBytes=Math.max(a.maxCalldataBytes,r.calldataBytes);}
  report.status='PASSED';
 }catch(e){report.status='FAILED';report.error=e.stack;throw e;}
 finally{report.finishedAt=new Date().toISOString();save();f?.provider.destroy();}
 console.log('PASSED '+dir);
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
