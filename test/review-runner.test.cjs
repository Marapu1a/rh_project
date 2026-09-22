const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const {runReview,assertOwned}=require('../scripts/review-runner.cjs');
function fixture(t){
 const parent=fs.realpathSync(os.tmpdir()),dir=fs.mkdtempSync(path.join(parent,'rh-review-fixture-'));
 const git=(...args)=>execFileSync('git',['-C',dir,...args],{encoding:'utf8',stdio:'pipe'}).trim();
 git('init');fs.writeFileSync(path.join(dir,'.gitignore'),'.local/\n');git('add','.gitignore');
 git('-c','user.name=Review fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture');
 fs.mkdirSync(path.join(dir,'.local'));fs.writeFileSync(path.join(dir,'.local','state.lock'),'do not touch');
 t.after(()=>{assert.equal(path.dirname(fs.realpathSync(dir)),parent);assert(path.basename(dir).startsWith('rh-review-fixture-'));fs.rmSync(dir,{recursive:true,force:true});});
 return {dir,git};
}
test('review self-test isolates runtime and preserves git provenance and source files',async t=>{
 const f=fixture(t),before=f.git('status','--porcelain');
 const r=await runReview({sourceRoot:f.dir,profile:'self-test'});
 assert.equal(r.exitCode,0);assert.equal(r.head,f.git('rev-parse','HEAD'));assert.equal(r.selfTest.freshRuntime,true);
 assert.equal(fs.existsSync(r.checkout),false);assert.equal(fs.readFileSync(path.join(f.dir,'.local','state.lock'),'utf8'),'do not touch');
 assert.equal(f.git('status','--porcelain'),before);assert(!f.git('worktree','list','--porcelain').includes(r.checkout));
});
for(const testCode of [0,7])test('cleanup refusal preserves test exit '+testCode+' and leaves evidence',async t=>{
 const f=fixture(t),npmCli=path.join(f.dir,'fake-npm.cjs');
 // A deliberately tiny npm stand-in exercises process exit and worktree cleanup, not dependencies.
 fs.writeFileSync(npmCli,`const fs=require('node:fs'),path=require('node:path');
 const arg=process.argv[2];if(arg==='--version')console.log('fixture');
 else if(arg==='ci'){for(const name of ['hardhat','ethers','solc']){fs.mkdirSync(path.join('node_modules',name),{recursive:true});fs.writeFileSync(path.join('node_modules',name,'package.json'),JSON.stringify({version:'fixture'}));}}
 else {require('node:child_process').execFileSync('git',['worktree','lock',process.cwd()]);process.exit(${testCode});}`);
 const r=await runReview({sourceRoot:f.dir,npmCli});
 assert.equal(r.testExitCode,testCode);assert.equal(r.exitCode,testCode||1);assert(r.cleanupError);assert(fs.existsSync(r.logPath));
 assert.equal(fs.readFileSync(path.join(f.dir,'.local','state.lock'),'utf8'),'do not touch');
 const root=path.dirname(r.checkout);assertOwned(root,r.checkout,fs.readFileSync(path.join(root,'owner'),'utf8'));
 f.git('worktree','unlock',r.checkout);f.git('worktree','remove','--force',r.checkout);
});
test('cleanup ownership check refuses main checkout and redirected paths',()=>{
 assert.throws(()=>assertOwned(path.resolve('.'),path.resolve('.'),''),/Refusing cleanup/);
});
