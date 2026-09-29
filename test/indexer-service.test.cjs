const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {keccak256}=require('ethers');
const {startService}=require('../scripts/run-indexer-service.cjs');
async function until(check){const end=Date.now()+10000;while(Date.now()<end){if(check())return;await new Promise(r=>setTimeout(r,20));}throw Error('Condition timed out');}
async function fixture(t){
 const e=structuredClone(require('../research/direct-buy/evidence.json'));
 for(const k of Object.keys(e.manifest.codeHashes))e.manifest.codeHashes[k]=keccak256('0x01');
 fs.mkdirSync('.local/logs',{recursive:true});const dir=fs.mkdtempSync(path.resolve('.local/logs/service-test-'));
 const config={manifest:e.manifest,buyPolicyMode:'unadmitted',indexer:{statePath:path.join(dir,'state.json'),maxAgeSeconds:60}};
 let failing=false,hanging=false;
 const rpc=http.createServer(async(req,res)=>{let raw='';for await(const data of req)raw+=data;const {id,method,params}=JSON.parse(raw);if(hanging)return;
  if(failing){res.writeHead(503);res.end('fixture secret MUST NOT appear in health');return;}
  let result;
  if(method==='eth_chainId')result='0x'+BigInt(e.manifest.chainId).toString(16);
  else if(method==='eth_getCode')result='0x01';
  else if(method==='eth_getTransactionReceipt')result=e.blocks.flatMap(b=>b.transactions).find(x=>x.tx.hash===params[0]).receipt;
  else if(method==='eth_getBlockByNumber'){
   const n=params[0]==='finalized'?Number(BigInt(e.blocks.at(-1).number)):Number(BigInt(params[0]));
   if(n===Number(e.manifest.anchor.number))result=e.manifest.anchor;
   else{const b=e.blocks.find(b=>Number(BigInt(b.number))===n);result={...b,transactions:params[1]?b.transactions.map(x=>x.tx):[]};}
  }else throw Error(method);
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id,result}));
 });await new Promise(r=>rpc.listen(0,'127.0.0.1',r));
 const services=[];t.after(async()=>{await Promise.all(services.map(s=>s.close()));rpc.closeAllConnections();await new Promise(r=>rpc.close(r));for(const f of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,f));fs.rmdirSync(dir);});
 const options={config,rpcUrl:`http://127.0.0.1:${rpc.address().port}`,port:0,pollMs:50,passTimeoutMs:5000};
 async function start(extra={}){const s=await startService({...options,...extra});services.push(s);return s;}
 return {config,start,options,fail:v=>{failing=v;},hang:v=>{hanging=v;},state:()=>JSON.parse(fs.readFileSync(config.indexer.statePath))};
}
test('service catches up, reports honest health, resumes RPC and restarts without losing state',async t=>{
 const f=await fixture(t),s=await f.start();await until(()=>s.health().successes>0);
 assert.equal(s.health().status,'unadmitted');assert.equal(s.health().lagBlocks,0);
 const url=`http://127.0.0.1:${s.server.address().port}/healthz`;assert.equal((await fetch(url)).status,503);
 await assert.rejects(f.start(),e=>e.code==='EEXIST');
 const ledger=f.state().index.ledgerHash;f.fail(true);await until(()=>s.health().status==='waiting');assert.equal(f.state().index.ledgerHash,ledger);
 assert.ok(!JSON.stringify(s.health()).includes('secret'));f.fail(false);await until(()=>s.health().successes>=2&&s.health().status==='unadmitted');
 await s.close();assert.ok(!fs.existsSync(f.config.indexer.statePath+'.service.lock'));
 const restarted=await f.start();await until(()=>restarted.health().successes>0);assert.equal(f.state().index.ledgerHash,ledger);
});
test('own crashed child lock is recovered only after exit; API survives',async t=>{
 const f=await fixture(t);f.hang(true);const s=await f.start();const lock=f.config.indexer.statePath+'.lock';
 await until(()=>s.health().indexerPid&&fs.existsSync(lock));const pid=s.health().indexerPid;assert.equal(fs.readFileSync(lock,'utf8'),String(pid));
 process.kill(pid,'SIGKILL');f.hang(false);await until(()=>s.health().successes>0);
 assert.equal(s.health().reason,null);assert.ok(s.health().failures>=1);
 const res=await fetch(`http://127.0.0.1:${s.server.address().port}/healthz`);assert.equal((await res.json()).status,'unadmitted');
});
test('unknown lock and corrupted state require attention without resetting anything',async t=>{
 const f=await fixture(t),lock=f.config.indexer.statePath+'.lock';fs.writeFileSync(lock,'unknown-owner');
 const s=await f.start();await until(()=>s.health().status==='needsAttention');assert.equal(s.health().attempts,0);assert.equal(fs.readFileSync(lock,'utf8'),'unknown-owner');await s.close();
 fs.unlinkSync(lock);fs.writeFileSync(f.config.indexer.statePath,'broken');const next=await f.start();await until(()=>next.health().status==='needsAttention');
 assert.equal(fs.readFileSync(f.config.indexer.statePath,'utf8'),'broken');const attempts=next.health().attempts;await new Promise(r=>setTimeout(r,150));assert.equal(next.health().attempts,attempts);
});
test('stalled RPC pass times out and the next pass recovers',async t=>{
 const f=await fixture(t);f.hang(true);const s=await f.start({passTimeoutMs:1500,pollMs:200});
 await until(()=>s.health().reason==='passTimeout');f.hang(false);await until(()=>s.health().successes>0);
 assert.equal(s.health().reason,null);
});
