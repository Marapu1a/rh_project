const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {withState,inspectLock}=require('../scripts/local-scheduler-state.cjs');
const execFile=require('node:util').promisify(require('node:child_process').execFile);
function location(t){fs.mkdirSync('.local',{recursive:true});const dir=fs.mkdtempSync(path.resolve('.local','lock-unit-'));
 t.after(()=>{for(const n of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,n));fs.rmdirSync(dir);});return path.join(dir,'state.json');}
test('async state save resolves without lock and permits child process handoff repeatedly',async t=>{
 const file=location(t),child=`const {withState}=require('./scripts/local-scheduler-state.cjs');withState(process.argv[1],{},async(s,save)=>{await new Promise(r=>setTimeout(r,1));save(s)}).catch(e=>{console.error(e);process.exitCode=1});`;
 for(let i=0;i<5;i++){
  await withState(file,{},async(s,save)=>{await new Promise(r=>setTimeout(r,1));save(s);});
  assert.equal(inspectLock(file+'.lock').exists,false);
  const result=await execFile(process.execPath,['-e',child,file]);
  if(process.env.LOCAL_STATE_LOCK_TRACE==='1')process.stderr.write(result.stderr);
  assert.equal(inspectLock(file+'.lock').exists,false);
 }
});
test('occupied lock reports bounded metadata without deleting another owner',async t=>{
 const file=location(t);fs.writeFileSync(file+'.lock','987654');
 await assert.rejects(()=>withState(file,{},async()=>assert.fail('must not enter')),e=>{
  assert.equal(e.lock.owner,'987654');assert.equal(e.lock.exists,true);assert.equal(typeof e.lock.mtimeMs,'number');return /locked/.test(e.message);
 });assert.equal(fs.readFileSync(file+'.lock','utf8'),'987654');
});
test('action rejection releases lock before caller observes failure',async t=>{
 const file=location(t);await assert.rejects(()=>withState(file,{},async()=>{await Promise.resolve();throw Error('action failure');}),/action failure/);
 assert.equal(inspectLock(file+'.lock').exists,false);
});
