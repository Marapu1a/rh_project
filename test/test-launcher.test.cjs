const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {compile}=require('../scripts/compile.cjs'),artifact=require('../scripts/test-artifact.cjs');
const {runTests}=require('../scripts/test-launcher.cjs'),{profiles,parseArgs}=require('../scripts/test-profiles.cjs');
const compilePath=require.resolve('../scripts/compile.cjs');
function fixture(t){
 const cwd=process.cwd(),env=Object.fromEntries([artifact.PATH,artifact.HASH,artifact.AUDIT].map(k=>[k,process.env[k]]));
 const parent=path.join(cwd,'.local','logs');fs.mkdirSync(parent,{recursive:true});const dir=fs.mkdtempSync(path.join(parent,'launcher-fixture-'));
 for(const k of Object.keys(env))delete process.env[k];process.chdir(dir);fs.mkdirSync('contracts');
 fs.writeFileSync('contracts/Probe.sol','pragma solidity ^0.8.0; contract Probe { function value() external pure returns(uint) { return 1; } }');
 t.after(()=>{process.chdir(cwd);for(const [k,v] of Object.entries(env)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  assert.equal(path.dirname(fs.realpathSync(dir)),fs.realpathSync(parent));assert(path.basename(dir).startsWith('launcher-fixture-'));fs.rmSync(dir,{recursive:true,force:true});});
 return dir;
}
test('profile catalog preserves full suite and explicit scoped coverage',()=>{
 const full=profiles.full.files;assert.equal(new Set(full).size,full.length);
 const known=fs.readdirSync('test').filter(f=>f.endsWith('.test.cjs')&&!['drand-binding-model.test.cjs','drand-feasibility.test.cjs'].includes(f)).map(f=>'test/'+f);
 assert.deepEqual([...full].sort(),known.sort());
 const covered=new Set();for(const [key,p] of Object.entries(profiles))if(key!=='full')for(const f of p.files){assert(full.includes(f));covered.add(f);}
 assert.deepEqual([...covered].sort(),[...full].sort());
 assert.throws(()=>parseArgs(['--profile','typo']));assert.throws(()=>parseArgs(['--match','[']));assert.throws(()=>parseArgs(['--profile','full','--profile','math']));
});
test('artifact contract rejects missing, partial, corrupt and mismatched input',t=>{
 const dir=fixture(t),file=path.join(dir,'artifact.json');
 assert.equal(artifact.readArtifact({}),null);
 assert.throws(()=>artifact.readArtifact({[artifact.PATH]:file}));
 assert.throws(()=>artifact.readArtifact({[artifact.PATH]:file,[artifact.HASH]:'a'.repeat(64)}));
 for(const bytes of ['broken','{}','[]','{"Probe":{"abi":[]}}']){
  fs.writeFileSync(file,bytes);assert.throws(()=>artifact.readArtifact({[artifact.PATH]:file,[artifact.HASH]:artifact.digest(Buffer.from(bytes))}));
 }
 fs.writeFileSync(file,'changed');assert.throws(()=>artifact.readArtifact({[artifact.PATH]:file,[artifact.HASH]:'a'.repeat(64)}),/digest mismatch/);
 process.env[artifact.PATH]=file;process.env[artifact.HASH]='a'.repeat(64);
 assert.throws(()=>compile(),/digest mismatch/);assert(!fs.existsSync('artifacts/compiled.json'));
});
test('direct compilation stays fresh and sourceOverrides bypasses shared artifact without overwriting it',t=>{
 const dir=fixture(t),first=compile();const original=fs.readFileSync('artifacts/compiled.json');
 process.env[artifact.PATH]=path.join(dir,'missing.json');process.env[artifact.HASH]='a'.repeat(64);
 const changed=compile({sourceOverrides:{'contracts/Probe.sol':'pragma solidity ^0.8.0; contract Probe { function value() external pure returns(uint) { return 2; } }'},writeArtifacts:false});
 assert.notEqual(first.Probe.evm.bytecode.object,changed.Probe.evm.bytecode.object);assert.deepEqual(fs.readFileSync('artifacts/compiled.json'),original);
 delete process.env[artifact.PATH];delete process.env[artifact.HASH];fs.writeFileSync('contracts/Probe.sol','pragma solidity ^0.8.0; contract Probe { uint public x; }');
 const direct=compile({writeArtifacts:false});assert.notEqual(first.Probe.evm.bytecode.object,direct.Probe.evm.bytecode.object);assert.deepEqual(fs.readFileSync('artifacts/compiled.json'),original);
});
test('two worker processes reuse one fresh compilation and child CLI sees the same artifact',async t=>{
 const dir=fixture(t);
 for(const name of ['a','b'])fs.writeFileSync(name+'.test.cjs',`const {test}=require('node:test'),assert=require('node:assert/strict');test('${name}',()=>{
 const compiled=require(${JSON.stringify(compilePath)}).compile();assert(compiled.Probe);
 const child=require('node:child_process').execFileSync(process.execPath,['-e',"process.stdout.write(require('node:fs').readFileSync('artifacts/compiled.json'))"]);
 const fs=require('node:fs');assert.deepEqual(child,fs.readFileSync(process.env.RH_TEST_ARTIFACT));});`);
 process.env[artifact.PATH]=path.join(dir,'stale');process.env[artifact.HASH]='a'.repeat(64);
 const result=await runTests({cwd:dir,profile:'fixture',selection:{compile:true,files:['a.test.cjs','b.test.cjs']}});
 assert.equal(result.exitCode,0,JSON.stringify(result));assert.equal(result.compilations.ordinary,1);assert.equal(result.compilations.reuses,2);
 assert.equal(result.timings.files.length,2);assert.equal(result.timings.total.counts.passed,2);assert(result.timings.files.every(f=>f.wallMs>=f.caseDurationMs));
 assert.equal(process.env[artifact.PATH],path.join(dir,'stale'));
});
test('launcher propagates test failure and rejects a zero-test filter',async t=>{
 const dir=fixture(t);fs.writeFileSync('failed.test.cjs',"require('node:test')('failure',()=>{throw Error('intentional');});");
 const options={cwd:dir,profile:'fixture',selection:{compile:false,files:['failed.test.cjs']}};
 const failed=await runTests(options);assert.notEqual(failed.exitCode,0);assert.equal(failed.timings.total.counts.failed,1);
 const empty=await runTests({...options,pattern:'does-not-match'});assert.notEqual(empty.exitCode,0);assert.match(empty.error,/No tests executed/);
});
