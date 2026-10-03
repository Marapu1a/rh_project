const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {load}=require('../scripts/runtime-artifact.cjs');
test('runtime artifact rejects missing, corrupt and malformed data; each load verifies bytes',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qianqi-artifact-')),file=path.join(dir,'compiled.json');
 t.after(()=>{fs.unlinkSync(file);fs.rmdirSync(dir);});
 const bytes=JSON.stringify({Probe:{abi:[],evm:{bytecode:{object:'00'},deployedBytecode:{object:'00'}}}}),sha=createHash('sha256').update(bytes).digest('hex');
 assert.throws(()=>load(file,sha));fs.writeFileSync(file,bytes);assert.deepEqual(load(file,sha).Probe.abi,[]);
 assert.throws(()=>load(file,'bad'));fs.appendFileSync(file,' ');assert.throws(()=>load(file,sha),/digest/);
 fs.writeFileSync(file,'{}');assert.throws(()=>load(file,createHash('sha256').update('{}').digest('hex')),/Invalid/);
});
test('deployment config refuses incomplete or non-rehearsal sources instead of enabling sends',()=>{
 const {derive}=require('../scripts/pons-deployment-config.cjs');
 for(const c of [{},{schema:'production'},{schema:'pons-rehearsal-automation-v1',manifest:{}}])assert.throws(()=>derive(c));
});
test('release verification refuses missing or modified files and escaping paths',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qianqi-release-')),file=path.join(dir,'entry.cjs'),manifest=path.join(dir,'release.json');
 t.after(()=>{for(const f of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,f));fs.rmdirSync(dir);});
 fs.writeFileSync(file,'checked');const sha=createHash('sha256').update('checked').digest('hex');
 const m={schema:'qianqi-runtime-build-v1',publicExecution:false,files:{'entry.cjs':sha}},save=()=>fs.writeFileSync(manifest,JSON.stringify(m));save();
 const {verify}=require('../scripts/verify-runtime-release.cjs');assert.equal(verify(dir).files,1);
 fs.writeFileSync(file,'changed');assert.throws(()=>verify(dir),/mismatch/);fs.unlinkSync(file);assert.throws(()=>verify(dir));
 m.files={'../outside':sha};save();assert.throws(()=>verify(dir),/path/);
});
