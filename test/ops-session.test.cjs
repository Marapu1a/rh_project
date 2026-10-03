const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {withOpsSession,readStatus}=require('../scripts/ops-session.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qianqi-ops-'));t.after(()=>{for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);});return path.join(dir,'operator.json');}
test('operator ownership covers idle intervals, preserves blocked status and does not touch transaction state',async t=>{
 const file=fixture(t);fs.writeFileSync(file,'durable intent');
 await withOpsSession(file,async ops=>{ops.beforePass();await assert.rejects(withOpsSession(file,async()=>assert.fail('second owner')),/EEXIST/);
  ops.publish({status:'blocked',reason:'unknownHash',error:'secret RPC'});ops.publish({status:'blocked',reason:'unknownHash'});
 });
 assert.equal(fs.readFileSync(file,'utf8'),'durable intent');assert.equal(readStatus(file+'.status.json',10000).state,'attention');
 assert.equal(fs.readFileSync(file+'.events.jsonl','utf8').trim().split('\n').length,2);assert(!fs.readFileSync(file+'.status.json','utf8').includes('secret'));
 await withOpsSession(file,async ops=>ops.publish({status:'waiting',reason:'nativeFunding'}));assert.equal(readStatus(file+'.status.json',10000).state,'stopped');
 assert.equal(readStatus(file+'.status.json',1,Date.now()+10000).state,'unavailable');
});
test('stale ownership is not removed automatically; thrown errors remain attention',async t=>{
 const file=fixture(t);fs.writeFileSync(file+'.service.lock','old owner');await assert.rejects(withOpsSession(file,()=>{}));assert.equal(fs.readFileSync(file+'.service.lock','utf8'),'old owner');fs.unlinkSync(file+'.service.lock');
 await assert.rejects(withOpsSession(file,async()=>{throw Error('secret');}));assert.equal(readStatus(file+'.status.json',10000).state,'attention');assert(!fs.existsSync(file+'.service.lock'));
});
test('process crash preserves journal and leaves ownership for explicit recovery',async t=>{
 const file=fixture(t);fs.writeFileSync(file,'unresolved intent');
 const {spawn}=require('node:child_process'),{once}=require('node:events');
 const child=spawn(process.execPath,['-e',`require(${JSON.stringify(require.resolve('../scripts/ops-session.cjs'))}).withOpsSession(${JSON.stringify(file)},async()=>{process.send('ready');await new Promise(()=>setInterval(()=>{},1000));});`],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
 t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill();});
 await Promise.race([once(child,'message'),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Child startup timeout')),5000);timer.unref();})]);
 const exited=once(child,'exit');child.kill('SIGKILL');await exited;
 assert.equal(fs.readFileSync(file,'utf8'),'unresolved intent');assert(fs.existsSync(file+'.service.lock'));
 await assert.rejects(withOpsSession(file,()=>assert.fail('must not restart past an unresolved owner')));
 // The test has positively observed child exit. Production uses the documented operator check.
 fs.unlinkSync(file+'.service.lock');await withOpsSession(file,async()=>{});
 assert.equal(fs.readFileSync(file,'utf8'),'unresolved intent');
});
