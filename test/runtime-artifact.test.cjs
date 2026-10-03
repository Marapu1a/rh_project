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
