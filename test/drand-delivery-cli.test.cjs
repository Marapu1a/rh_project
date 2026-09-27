const {test}=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {fetchBeacon}=require('../scripts/drand-delivery-worker.cjs');
test('drand fetch uses exact immutable round URL and propagates HTTP failure/abort',async()=>{
 const original=global.fetch;try{
  let seen;global.fetch=async(url,opts)=>{seen={url,opts};return {ok:true,json:async()=>({round:123})};};
  assert.deepEqual(await fetchBeacon('123'),{round:123});assert.match(seen.url,/\/public\/123$/);assert(!seen.url.includes('latest'));assert(seen.opts.signal);
  global.fetch=async()=>({ok:false,status:404});await assert.rejects(fetchBeacon('123'),/HTTP 404/);
  const stop=new AbortController();stop.abort();global.fetch=async(url,opts)=>{opts.signal.throwIfAborted();};await assert.rejects(fetchBeacon('123',{signal:stop.signal}));
 }finally{global.fetch=original;}
});
test('drand CLI rejects public RPC, duplicate args and invalid executor before signing',()=>{
 for(const args of [['--job','unused','--state','unused','--rpc','https://example.com'],['--job','a','--job','b'],['--job','unused','--state','unused','--rpc','http://127.0.0.1:8545','--executor','-1']]){
  const r=spawnSync(process.execPath,['scripts/run-drand-delivery.cjs',...args],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(JSON.parse(r.stderr.trim()).status,'error');
 }
});
