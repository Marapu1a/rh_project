const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture}=require('./fixtures/status-snapshot.cjs');
const {createReader,walletStatus,createServer}=require('../scripts/user-status-api.cjs');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'status-cache-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return fixture(dir);}
test('prepared snapshot matches replay, isolates responses and ages without reload',t=>{
 const f=setup(t),reader=createReader(f.config),q={wallet:f.wallet,now:Date.parse(f.state.index.observedAt)};
 assert.deepEqual(reader.read(q),walletStatus({config:f.config,...q}));
 const result=reader.read(q);result.balances.SHORT.open='999';
 assert.notEqual(reader.read(q).balances.SHORT.open,'999');
 assert.equal(reader.read({...q,now:q.now+61000}).status,'stale');
 assert.equal(reader.metrics().loads,1);assert.equal(reader.metrics().hits,3);
 assert.throws(()=>reader.read({...q,limit:101}),/Invalid query/);
});
test('replacement, waiting, corruption, missing file and restart never serve a cached success',t=>{
 const f=setup(t),r=createReader(f.config),q={wallet:f.wallet};assert.equal(r.read(q).status,'observed');
 f.state.status.state='waiting';f.write();assert.equal(r.read(q).status,'stale');
 f.state.status.state='caughtUp';f.write();assert.equal(r.read(q).status,'observed');
 // Same-length atomic replacement with an invalid checksum.
 const text=fs.readFileSync(f.config.indexer.statePath,'utf8').replace('caughtUp','caughtUx');
 fs.writeFileSync(f.config.indexer.statePath+'.tmp',text);fs.renameSync(f.config.indexer.statePath+'.tmp',f.config.indexer.statePath);
 assert.equal(r.read(q).balances,null);fs.unlinkSync(f.config.indexer.statePath);assert.equal(r.read(q).status,'unavailable');
 f.write();assert.equal(r.read(q).status,'observed');assert.deepEqual(createReader(f.config).read(q).balances,r.read(q).balances);
 const changed=structuredClone(f.config);changed.indexer.maxAgeSeconds++;assert.equal(createReader(changed).read(q).status,'unavailable');
});
test('HTTP burst observes outage and replacement; pagination stays bounded',async t=>{
 const f=setup(t),s=createServer(f.config);await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const url=`http://127.0.0.1:${s.address().port}/v1/wallets/${f.wallet}?limit=1`;
 let responses=await Promise.all(Array.from({length:20},()=>fetch(url)));assert.ok(responses.every(r=>r.status===200));
 assert.ok((await responses[0].json()).purchases.items.length<=1);
 fs.unlinkSync(f.config.indexer.statePath);responses=await Promise.all(Array.from({length:20},()=>fetch(url)));assert.ok(responses.every(r=>r.status===503));
 f.write();assert.equal((await fetch(url)).status,200);
});
test('checksummed but inconsistent ledger, policy and reward state cannot enter cache',t=>{
 const f=setup(t),r=createReader(f.config),q={wallet:f.wallet},original=structuredClone(f.state);
 assert.equal(r.read(q).status,'observed');
 for(const mutate of [s=>s.index.ledgerHash='0xdead',s=>s.index.policyStatus.mode='unadmitted',s=>s.index.rewards={blockTag:'0x0',draws:[],rewards:[]}]){
  Object.assign(f.state,structuredClone(original));mutate(f.state);f.write();assert.equal(r.read(q).status,'unavailable');
  Object.assign(f.state,structuredClone(original));f.write();assert.equal(r.read(q).status,'observed');
 }
});
test('async reader keeps main thread responsive and bounds pending requests',async t=>{
 const {createAsyncReader}=require('../scripts/user-status-api.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'status-load-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const f=fixture(dir,5000),r=createAsyncReader(f.config,{maxPending:1});t.after(()=>r.close());
 let finished=false;const p=r.read({wallet:f.wallet}).then(x=>{finished=true;return x;});
 assert.equal((await r.read({wallet:f.wallet})).status,'unavailable');
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(finished,false,'main-thread timer runs while history is being prepared');
 assert.equal((await p).status,'observed');
 assert.equal((await r.read({wallet:f.wallet})).status,'observed');
});
test('async reader preserves freshness, replacement failure and automatic recovery',async t=>{
 const {createAsyncReader}=require('../scripts/user-status-api.cjs');
 const f=setup(t),r=createAsyncReader(f.config);t.after(()=>r.close());const q={wallet:f.wallet};
 assert.deepEqual((await r.read(q)).balances,walletStatus({config:f.config,...q}).balances);
 f.state.index.observedAt=new Date(Date.now()-61000).toISOString();f.write();assert.equal((await r.read(q)).status,'stale');
 fs.writeFileSync(f.config.indexer.statePath,'broken');assert.equal((await r.read(q)).balances,null);
 f.state.index.observedAt=new Date().toISOString();f.write();assert.equal((await r.read(q)).status,'observed');
 const p=r.read(q);r.close();assert.equal((await p).status,'unavailable');assert.equal((await r.read(q)).status,'unavailable');
});
test('worker timeout resolves queued requests without leaving a hung reader',async t=>{
 const {createAsyncReader}=require('../scripts/user-status-api.cjs');
 const f=setup(t),r=createAsyncReader(f.config,{timeoutMs:1});t.after(()=>r.close());
 const rows=await Promise.all([r.read({wallet:f.wallet}),r.read({wallet:f.wallet})]);
 assert.ok(rows.every(x=>x.status==='unavailable'));
 assert.equal((await r.read({wallet:f.wallet})).status,'unavailable');
});
test('replacement while worker response is in transit is rejected',async t=>{
 const {createAsyncReader}=require('../scripts/user-status-api.cjs');
 const f=setup(t),r=createAsyncReader(f.config);t.after(()=>r.close());
 const original=fs.promises.stat;let entered,release;
 const arrived=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 fs.promises.stat=async(...args)=>{if(args[0]===f.config.indexer.statePath){entered();await gate;}return original(...args);};
 t.after(()=>{fs.promises.stat=original;release();});
 const result=r.read({wallet:f.wallet});await arrived;
 f.state.status.state='waiting';f.write();release();
 assert.equal((await result).status,'unavailable');
 fs.promises.stat=original;
 assert.equal((await r.read({wallet:f.wallet})).status,'stale');
});
