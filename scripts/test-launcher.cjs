const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {performance}=require('node:perf_hooks'),os=require('node:os');
const {profiles,parseArgs}=require('./test-profiles.cjs'),artifact=require('./test-artifact.cjs');
async function runTests({profile='full',pattern=null,selection=profiles[profile],cwd=process.cwd()}={}){
 if(!selection||!Array.isArray(selection.files)||!selection.files.length)throw Error('Empty/unknown test selection');
 if(pattern)new RegExp(pattern);
 cwd=path.resolve(cwd);const started=performance.now();
 const logs=path.join(cwd,'.local','logs');fs.mkdirSync(logs,{recursive:true});
 const dir=fs.mkdtempSync(path.join(logs,'test-run-')),timings=path.join(dir,'timings.json'),audit=path.join(dir,'compilations.jsonl');
 const env={...artifact.clearContract(process.env),[artifact.AUDIT]:audit};
 delete env.NODE_TEST_CONTEXT;
 const report={schema:'test-invocation-v1',profile,pattern,fullSuite:profile==='full'&&!pattern,files:selection.files,dir,compileMs:0,testMs:0,exitCode:1};
 try{
  if(selection.compile){
   // Ignore inherited artifacts even for nested launchers: every invocation starts fresh.
   const saved=Object.fromEntries([artifact.PATH,artifact.HASH,artifact.AUDIT].map(k=>[k,process.env[k]]));
   const previousCwd=process.cwd();const before=performance.now();
   try{
    for(const k of Object.keys(saved))delete process.env[k];process.env[artifact.AUDIT]=audit;process.chdir(cwd);
    require('./compile.cjs').compile();
   }finally{
    process.chdir(previousCwd);for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
   }
   report.compileMs=performance.now()-before;
   const bytes=fs.readFileSync(path.join(cwd,'artifacts','compiled.json')),snapshot=path.join(dir,'compiled.json');
   fs.writeFileSync(snapshot,bytes,{flag:'wx'});env[artifact.PATH]=snapshot;env[artifact.HASH]=artifact.digest(bytes);
   report.artifactSha256=env[artifact.HASH];
  }
  const args=['--test','--test-concurrency=1','--test-reporter=spec','--test-reporter-destination=stdout',
   '--test-reporter='+pathToFileURL(path.join(__dirname,'test-timing-reporter.cjs')).href,'--test-reporter-destination='+timings,
   ...(pattern?['--test-name-pattern='+pattern]:[]),...selection.files];
  report.command=[process.execPath,...args];console.log('TEST_SELECTION '+JSON.stringify({profile,pattern,fullSuite:report.fullSuite,files:selection.files,compileMs:report.compileMs,dir}));
  const before=performance.now();let interrupted=null;
  const result=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,args,{cwd,env,stdio:'inherit'});
   const forward=signal=>{interrupted=signal;child.kill(signal);};
   const int=()=>forward('SIGINT'),term=()=>forward('SIGTERM');process.on('SIGINT',int);process.on('SIGTERM',term);
   const remove=()=>{process.removeListener('SIGINT',int);process.removeListener('SIGTERM',term);};
   child.once('error',e=>{remove();reject(e);});child.once('close',(code,signal)=>{remove();resolve({code,signal});});
  });
  report.testMs=performance.now()-before;report.signal=interrupted||result.signal;
  report.exitCode=report.signal?128+(os.constants.signals[report.signal]||1):(result.code??1);
  report.timings=JSON.parse(fs.readFileSync(timings,'utf8'));
  if(!report.timings.total||report.timings.executedCases===0){
   report.error='No tests executed';if(report.exitCode===0)report.exitCode=1;
  }
  if(report.timings.files.length!==selection.files.length||report.timings.files.some(f=>typeof f.wallMs!=='number')){
   report.error='Incomplete per-file timing evidence';if(report.exitCode===0)report.exitCode=1;
  }
 }catch(e){report.error=e.message;if(report.exitCode===0)report.exitCode=1;}
 finally{
  const events=fs.existsSync(audit)?fs.readFileSync(audit,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];
  report.compilations={ordinary:events.filter(e=>e.kind==='ordinary').length,overrides:events.filter(e=>e.kind==='override').length,reuses:events.filter(e=>e.kind==='reuse').length};
  if(report.compilations.ordinary!==(selection.compile?1:0)&&report.exitCode===0){report.exitCode=1;report.error='Unexpected ordinary Solidity compilation count';}
  report.totalMs=performance.now()-started;fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2)+'\n');
  console.log('TEST_RESULT '+JSON.stringify({profile,pattern,fullSuite:report.fullSuite,executedCases:report.timings?.executedCases,exitCode:report.exitCode,signal:report.signal,compileMs:report.compileMs,testMs:report.testMs,totalMs:report.totalMs,compilations:report.compilations,error:report.error,report:path.join(dir,'result.json')}));
 }
 return report;
}
if(require.main===module){
 try{const options=parseArgs(process.argv.slice(2));runTests(options).then(r=>{if(r.signal)process.kill(process.pid,r.signal);else process.exitCode=r.exitCode;}).catch(e=>{console.error(e);process.exitCode=1;});}
 catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={runTests};
