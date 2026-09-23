// Review a committed HEAD in a disposable worktree; never copy checkout runtime data.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn,execFileSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {randomUUID}=require('node:crypto');
const {profiles,parseArgs}=require('./test-profiles.cjs');
const {clearContract}=require('./test-artifact.cjs');
function cleanEnv(){
 const env={...process.env};
 for(const key of Object.keys(env))if(/^(GIT_|NODE_OPTIONS$|NODE_PATH$|HARDHAT_CONFIG$|INIT_CWD$)/i.test(key))delete env[key];
 return clearContract(env);
}
const inside=(parent,child)=>{const rel=path.relative(parent,child);return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);};
function assertOwned(runRoot,checkout,token){
 const realRoot=fs.realpathSync(runRoot),temp=fs.realpathSync(os.tmpdir());
 if(!inside(temp,realRoot)||!path.basename(realRoot).startsWith('rh-review-')||path.resolve(checkout)!==path.join(realRoot,'checkout')||
  fs.readFileSync(path.join(realRoot,'owner'),'utf8')!==token)throw Error('Refusing cleanup outside owned review directory');
 if(fs.existsSync(checkout)&&(fs.lstatSync(checkout).isSymbolicLink()||fs.realpathSync(checkout)!==path.resolve(checkout)))throw Error('Refusing redirected worktree cleanup');
}
async function runReview({sourceRoot=path.join(__dirname,'..'),profile='full',pattern=null,npmCli=process.env.npm_execpath}={}){
 const started=performance.now();
 if(profile!=='self-test'&&!Object.hasOwn(profiles,profile))throw Error('Unknown review profile');
 if(pattern){new RegExp(pattern);if(profile==='self-test')throw Error('Self-test cannot filter tests');}
 const env=cleanEnv(),git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 sourceRoot=fs.realpathSync(sourceRoot);
 const head=git(sourceRoot,'rev-parse','HEAD'),dirty=!!git(sourceRoot,'status','--porcelain');
 const temp=fs.realpathSync(os.tmpdir());
 if(temp===sourceRoot||inside(sourceRoot,temp))throw Error('System temp must be outside the checkout');
 const runRoot=fs.mkdtempSync(path.join(temp,'rh-review-')),checkout=path.join(runRoot,'checkout'),token=randomUUID();
 fs.writeFileSync(path.join(runRoot,'owner'),token,{flag:'wx'});
 const logDir=path.join(runRoot,'.local','logs');fs.mkdirSync(logDir,{recursive:true});
 const logPath=path.join(logDir,'review.log'),fd=fs.openSync(logPath,'wx');
 const report={schema:'local-review-v1',profile,pattern,fullSuite:profile==='full'&&!pattern,head,sourceDirty:dirty,node:process.version,checkout,logPath,dependencyMode:'npm ci --ignore-scripts',commands:[],testExitCode:null,cleanupError:null};
 const log=line=>{fs.writeSync(fd,line+'\n');process.stdout.write(line+'\n');};
 const command=(bin,args)=>new Promise((resolve,reject)=>{
  report.commands.push([bin,...args]);log('COMMAND '+JSON.stringify([bin,...args]));
  const child=spawn(bin,args,{cwd:checkout,env:{...env,INIT_CWD:checkout},stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{fs.writeSync(fd,b);process.stdout.write(b);});
  child.once('error',reject);child.once('close',(code,signal)=>resolve({code:code??1,signal}));
 });
 let added=false,exitCode=1;
 try{
  log(JSON.stringify({head,sourceDirty:dirty,node:process.version,profile,checkout,logPath}));
  if(dirty)log('NOTICE: testing committed HEAD only; uncommitted/untracked files are excluded.');
  git(sourceRoot,'worktree','add','--detach',checkout,head);added=true;
  if(git(checkout,'rev-parse','HEAD')!==head)throw Error('Worktree HEAD mismatch');
  if(fs.existsSync(path.join(checkout,'.local')))throw Error('Fresh worktree unexpectedly contains runtime data');
  fs.mkdirSync(path.join(checkout,'.local','logs'),{recursive:true});
  report.selfTest={gitHead:head,freshRuntime:true};log('SELF_TEST '+JSON.stringify(report.selfTest));
  if(profile==='self-test'){exitCode=0;}
  else{
   npmCli=npmCli||path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
   if(!path.isAbsolute(npmCli)||!fs.existsSync(npmCli))throw Error('Run via npm run test:review (npm CLI required)');
   report.npm=execFileSync(process.execPath,[npmCli,'--version'],{cwd:checkout,env,encoding:'utf8'}).trim();
   const installAt=performance.now();
   const install=await command(process.execPath,[npmCli,'ci','--ignore-scripts','--no-audit','--no-fund']);
   report.installExitCode=install.code;report.installMs=performance.now()-installAt;
   if(install.code!==0){exitCode=install.code;report.failurePhase='install';}
   else{
    report.toolchain=Object.fromEntries(['hardhat','ethers','solc'].map(name=>[name,JSON.parse(fs.readFileSync(path.join(checkout,'node_modules',name,'package.json'),'utf8')).version]));
    log('TOOLCHAIN '+JSON.stringify({node:report.node,npm:report.npm,...report.toolchain}));
    const testAt=performance.now();
    const result=await command(process.execPath,[npmCli,'test',...(profile==='full'&&!pattern?[]:['--','--profile',profile,...(pattern?['--match',pattern]:[])])]);report.testMs=performance.now()-testAt;report.testExitCode=result.code;report.testSignal=result.signal;exitCode=result.code;
    // Preserve structured launcher evidence outside the worktree before cleanup.
    const reports=path.join(checkout,'.local','logs');
    for(const name of fs.readdirSync(reports).filter(n=>n.startsWith('test-run-'))){
     const file=path.join(reports,name,'result.json');if(fs.existsSync(file)){const payload=JSON.parse(fs.readFileSync(file,'utf8'));
      const output=path.join(logDir,name+'.json');fs.writeFileSync(output,JSON.stringify(payload,null,2)+'\n');
      (report.testReports??=[]).push(output);}
    }
    if(result.code===0&&(report.testReports?.length!==1))throw Error('Missing or ambiguous test invocation evidence');
   }
  }
 }catch(e){report.error=e.message;if(exitCode===0)exitCode=1;log('ERROR '+e.message);}
 finally{
  try{assertOwned(runRoot,checkout,token);if(added)git(sourceRoot,'worktree','remove','--force',checkout);}
  catch(e){report.cleanupError=e.message;log('CLEANUP_ERROR '+e.message);if(exitCode===0)exitCode=1;}
  report.totalMs=performance.now()-started;report.exitCode=exitCode;fs.writeFileSync(path.join(logDir,'result.json'),JSON.stringify(report,null,2)+'\n');
  log('RESULT '+JSON.stringify(report));fs.closeSync(fd);
 }
 return report;
}
if(require.main===module){
 try{runReview(parseArgs(process.argv.slice(2),{selfTest:true})).then(r=>{process.exitCode=r.exitCode;}).catch(e=>{console.error(e.message);process.exitCode=1;});}
 catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={runReview,assertOwned};
