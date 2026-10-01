const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {indexOnce,readSnapshot}=require('./persistent-buy-indexer.cjs'),{hash,replay}=require('./direct-buy.cjs');
async function run({rpc,manifest,prefix,buy,buyPolicy}){
 const statePath=path.resolve(prefix+'.indexer.json'),configFile=path.resolve(prefix+'.indexer-config.json');
 assert(!fs.existsSync(statePath),'Use a new indexer state');const config={manifest,...(buyPolicy?{buyPolicy}:{buyPolicyMode:'unadmitted'}),indexer:{statePath,maxAgeSeconds:120}};fs.writeFileSync(configFile,JSON.stringify(config));
 const requests=[];
 const readRpc=async(method,params=[])=>{requests.push([method,params]);assert(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call','eth_getTransactionReceipt','eth_getLogs','eth_getTransactionByHash'].includes(method),'Read-only indexer RPC');return rpc(method,method==='eth_getBlockByNumber'&&params[0]==='finalized'?['latest',params[1]]:params);};
 const read=()=>JSON.parse(fs.readFileSync(statePath));
 const first=await indexOnce({config,rpc:readRpc,statePath,batchSize:2});assert.equal(first.state,'catchingUp');
 const server=http.createServer(async(req,res)=>{try{let body='';for await(const part of req)body+=part;const q=JSON.parse(body),result=await readRpc(q.method,q.params);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));}catch{res.end(JSON.stringify({jsonrpc:'2.0',id:1,error:{code:-32000,message:'Read-only fixture RPC failure'}}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const child=()=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,['scripts/persistent-buy-indexer.cjs',configFile,statePath,'once'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,RH_RPC_URL:`http://127.0.0.1:${server.address().port}`},windowsHide:true,stdio:['ignore','pipe','pipe']});let text='';p.stdout.on('data',x=>text+=x);p.stderr.on('data',x=>text+=x);p.on('error',reject);p.on('close',code=>code===0?resolve(text):reject(Error('Indexer child failed: '+text)));});
 try{
  await child();assert.equal(read().status.state,'caughtUp');const initial=read().index;
  requests.length=0;await child();assert.equal(read().index.ledgerHash,initial.ledgerHash);
  assert(!requests.some(([m,p])=>m==='eth_getTransactionReceipt'||m==='eth_getCode'&&p[0]!==buyPolicy?.source||m==='eth_call'&&p[0].to!==buyPolicy?.source||m==='eth_getBlockByNumber'&&p[1]===true),'Restart must use evidence cache; policy source still read fresh');
  const snapshot=await rpc('evm_snapshot',[]);await buy(40_000000n);await indexOnce({config,rpc:readRpc,statePath});const old=read().index;
  assert.notEqual(old.ledgerHash,initial.ledgerHash);
  await rpc('evm_revert',[snapshot]);
  while(Number(BigInt(await rpc('eth_blockNumber',[])))<old.head)await rpc('evm_mine',[]);
  const reorg=await indexOnce({config,rpc:readRpc,statePath});assert(reorg.removedBlocks>0);
  const replaced=read().index;assert.equal(hash(replaced.ledger.wallets),hash(initial.ledger.wallets));assert.equal(replaced.ledgerHash,hash(replay(replaced.manifest,replaced.blocks)));
  // Outage updates status, but never publishes a partial or zero ledger.
  await assert.rejects(indexOnce({config,rpc:async()=>{throw Error('offline');},statePath}),/offline/);assert.deepEqual(read().index,replaced);
  await child();assert.equal(read().status.state,'caughtUp');assert.equal(read().index.ledgerHash,replaced.ledgerHash);
  if(buyPolicy){const resolved=await require('./buy-policy-runtime.cjs').resolveBuyPolicy(config,readRpc,replaced.head);const consumed=await readSnapshot({config,statePath,manifest:resolved.manifest,cutoff:replaced.head,rpc:readRpc});assert.equal(hash(replay(consumed.manifest,consumed.blocks)),replaced.ledgerHash);}
  else await assert.rejects(readSnapshot({config,statePath,manifest,cutoff:replaced.head,rpc:readRpc}),e=>e.reason==='indexerUnadmitted');
  return {status:buyPolicy?'PONS_ADMITTED_INDEXER_PASSED':'PONS_PERSISTENT_INDEXER_PASSED',firstBatch:first.processedBlock,head:replaced.head,removedBlocks:reorg.removedBlocks,childRestarts:3,noHistoricalReadsOnRestart:true,ledgerHash:replaced.ledgerHash,policyMode:replaced.policyStatus.mode,snapshotConsumed:!!buyPolicy,publicConsumerBlocked:!buyPolicy,publicSends:false,assumptions:['Local latest is mapped to finalized only in read-only rehearsal RPC; not mainnet finality proof','Additional 40 USDG BUY is reverted on the local fork; frozen datasets/claims are not changed']};
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
module.exports={run};
