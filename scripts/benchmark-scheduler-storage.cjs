// Isolated storage/CPU probe; synthetic jobs are never submitted to a chain.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {hash}=require('./direct-buy.cjs'),{withState}=require('./local-scheduler-state.cjs');
const sw=require('./local-short-executor.cjs'),mw=require('./local-monthly-executor.cjs'),cache=require('./verified-draw-cache.cjs');
async function main(){
 const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const {checksum,...payload}=source;assert.equal(checksum,hash(payload));
 const dir=fs.mkdtempSync(path.resolve('.local/logs/scheduler-storage-')),report={schema:'scheduler-storage-probe-v1',source:process.argv[2],status:'RUNNING',cases:[],scope:'Synthetic two-job files, real withState and cached validation; no chain, BUY admission or coordinator throughput claim.'};
 const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));save();console.log(dir);
 for(const n of [1000,10000]){
  const participants=Array.from({length:n},(_,i)=>({wallet:ethers.getAddress(ethers.toBeHex(i+1,20)).toLowerCase(),firstAttempt:'1',lastAttempt:'1',count:'1'}));
  const jobs={};
  for(const kind of ['SHORT','MONTHLY']){
   const original=source.jobs[kind].find(e=>e.job).job,a=structuredClone(original.artifact),s=kind==='SHORT';a.snapshot.participants=participants;
   a.request.snapshotHash=hash(a.snapshot);
   if(s)Object.assign(a.request,{expectedCount:n,expectedAttempts:String(n),expectedRoot:require('./short-dataset.cjs').rootFor(participants)});
   else Object.assign(a.request,{count:n,attempts:String(n),root:require('./monthly-dataset.cjs').rootFor(participants)});
   jobs[kind]=[{started:true,job:s?sw.makeJob(a,original.proposalId):mw.makeMonthlyJob(a)}];
  }
  const file=path.join(dir,n+'.json'),config={syntheticStorageProbe:n},provider={};
  for(const kind of ['SHORT','MONTHLY'])cache.get(provider,kind,jobs[kind][0].job,kind==='SHORT'?sw.validateJob:mw.validateMonthlyJob);
  await withState(file,config,async(state,write)=>{state.jobs=jobs;write(state);});
  const row={participantsPerKind:n,bytes:fs.statSync(file).size,samples:[]};report.cases.push(row);
  for(let i=0;i<5;i++){
   let t=performance.now(),loadMs,saveMs,validationMs;
   await withState(file,config,async(state,write)=>{
    loadMs=performance.now()-t;t=performance.now();sw.validateCachedJob(provider,state.jobs.SHORT[0].job);mw.validateCachedJob(provider,state.jobs.MONTHLY[0].job);validationMs=performance.now()-t;
    t=performance.now();write(state);saveMs=performance.now()-t;
   });
   row.samples.push({loadMs,validationMs,saveMs});
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(file)).jobs,jobs);save();console.log(n+' '+row.bytes+' bytes '+JSON.stringify(row.samples));
 }
 report.status='PASSED';save();
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
