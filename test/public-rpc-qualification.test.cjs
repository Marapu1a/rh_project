const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {measuredRpc,httpRpc,readBlockEvidence,qualify}=require('../scripts/public-rpc-qualification.cjs');
const I=require('../scripts/infinity-buy.cjs'),{hash}=require('../scripts/direct-buy.cjs');
const saved=require('../research/infinity-source-audit/worker-fork-2026-09-27.json');
function fixture(){
 const pair=structuredClone(saved.transactions.find(x=>x.label.startsWith('BUY 100'))),n=Number(BigInt(pair.tx.blockNumber));pair.tx.chainId='0x1237';
 const m={schema:I.SCHEMA,routeVersion:I.ID,eligibility:'automatic-buy-v1',quoteBasis:'wallet-net-debit-v1',chainId:4663,token:saved.launch.token,quote:saved.launch.quote,registry:saved.collector.promo,settlement:'0x4f922d5b15e6691e0469663e4f5c4177f23c5faf',poolKey:saved.poolKey,poolId:saved.poolId,quoteDecimals:6,entryThresholdRaw:'100000000',anchor:{number:n-1,hash:ethers.id('anchor')},codeHashes:{}};
 for(const [k,[a,h]]of Object.entries(I.PINS)){m[k]=a;m.codeHashes[k]=h;}
 for(const k of ['token','quote','registry','settlement'])m.codeHashes[k]=ethers.keccak256('0x6000');
 const block={number:pair.tx.blockNumber,hash:pair.tx.blockHash,parentHash:m.anchor.hash,timestamp:'0x68000000',transactions:[pair.tx]};
 const abi=new ethers.Interface(['function decimals() view returns(uint8)','function totalSupply() view returns(uint256)']);
 const rpc=async(method,p=[])=>{
  if(method==='eth_chainId')return '0x1237';
  if(method==='eth_getBlockByNumber'){if(p[0]===ethers.toQuantity(n-1))return {number:p[0],hash:m.anchor.hash};return p[1]?structuredClone(block):{...block,transactions:[pair.tx.hash]};}
  if(method==='eth_getTransactionReceipt')return structuredClone(pair.receipt);
  if(method==='eth_getLogs')return structuredClone(pair.receipt.logs);
  if(method==='eth_getCode')return '0x6000';
  if(method==='eth_getStorageAt')return ethers.ZeroHash;
  if(method==='eth_call'){const name=p[0].data===abi.encodeFunctionData('decimals')?'decimals':'totalSupply';return abi.encodeFunctionResult(name,[name==='decimals'?6:100]);}
  throw Error(method);
 };return {rpc,n,m,block,pair};
}
test('bounded transport forbids sends, counts failures and stops exhausted requests',async()=>{
 const t=measuredRpc(async()=>{throw Error('unavailable');},{maxRequests:1});
 await assert.rejects(t.rpc('eth_sendRawTransaction',[]),/Read-only/);assert.equal(t.stats.requests,0);
 await assert.rejects(t.rpc('eth_chainId'),/unavailable/);await assert.rejects(t.rpc('eth_chainId'),/budget/);assert.equal(t.stats.failures,1);
});
test('full block checks all receipts and detects mismatched logs or missing receipt',async()=>{
 const f=fixture(),r=await readBlockEvidence(f.rpc,f.n);assert.equal(r.transactions,1);assert.equal(r.logs,f.pair.receipt.logs.length);
 await assert.rejects(readBlockEvidence((m,p)=>m==='eth_getLogs'?[]:f.rpc(m,p),f.n),/Logs differ/);
 await assert.rejects(readBlockEvidence(async(m,p)=>m==='eth_getTransactionReceipt'?{...f.pair.receipt,blockHash:ethers.ZeroHash}:f.rpc(m,p),f.n),/provenance/);
});
test('qualification repeats exact samples with fresh reader and detects changed data',async()=>{
 const first=await qualify({...fixture(),depths:[0]});assert.equal(first.sampledDataAvailable,true);assert.equal(first.publicLaunchReady,false);
 const second=await qualify({...fixture(),depths:[0],previous:JSON.parse(JSON.stringify(first))});assert.equal(second.repeatable,true);
 const changed=structuredClone(first);changed.samples[0].evidenceHash=ethers.ZeroHash;
 assert.equal((await qualify({...fixture(),depths:[0],previous:changed})).repeatable,false);
});
test('historical failure cannot be concealed by working blocks; missing finalized fails closed',async()=>{
 const f=fixture();const r=await qualify({rpc:(m,p)=>{if(m==='eth_getCode')throw Error('pruned');return f.rpc(m,p);},depths:[0]});assert.equal(r.sampledDataAvailable,false);assert(r.samples[0].ok);
 const no=await qualify({rpc:(m,p)=>{if(p?.[0]==='finalized')throw Error('missing finalized');return f.rpc(m,p);},depths:[0]});assert.match(no.error,/finalized/);assert.equal(no.samples.length,0);
});
test('real scan and replay path preserves supported BUY and duplicate-delivery invariance',async()=>{
 // Saved real runtimes; participants/BUY/clock remain a local fixture.
 const f=fixture(),codes=require('../research/public-deployment/infinity-rpc-test-runtimes.json');
 const rpc=(m,p)=>m==='eth_getCode'?Promise.resolve(codes[p[0].toLowerCase()]||'0x6000'):f.rpc(m,p);
 const first=await qualify({rpc,depths:[0],manifest:f.m,toBlock:f.n});assert.equal(first.replay.status,'sample-complete',JSON.stringify(first.replay));assert.equal(first.replay.eligible,1);
 const second=await qualify({rpc,depths:[0],manifest:f.m,toBlock:f.n,previous:JSON.parse(JSON.stringify(first))});assert.equal(second.replay.repeatable,true);assert.equal(second.replay.ledgerHash,first.replay.ledgerHash);
});
test('HTTP errors redact provider messages',async()=>{
 const http=require('node:http'),server=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:1,error:{code:-32000,message:'secret API key'}}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{await assert.rejects(httpRpc('http://127.0.0.1:'+server.address().port)('eth_chainId',[]),e=>e.message==='RPC error code -32000');}finally{await new Promise(r=>server.close(r));}
});

test('qualification rejects runtime drift and oversized or unfinalized replay',async()=>{
 const f=fixture();const drift=await qualify({rpc:f.rpc,depths:[0],manifest:f.m,toBlock:f.n});assert.equal(drift.replay.status,'failed');assert.match(drift.replay.error,/runtime/);
 const future=await qualify({rpc:f.rpc,depths:[0],manifest:f.m,toBlock:f.n+1});assert.equal(future.replay.status,'failed');assert.match(future.replay.error,/finalized/);
 const wide=await qualify({rpc:f.rpc,depths:[0],manifest:{...f.m,anchor:{...f.m.anchor,number:f.n-33}},toBlock:f.n});assert.equal(wide.replay.status,'failed');
});
test('HTTP timeout aborts a stalled endpoint without retries',async()=>{
 const http=require('node:http'),server=http.createServer(()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{await assert.rejects(httpRpc('http://127.0.0.1:'+server.address().port,{timeoutMs:25})('eth_chainId',[]),/timeout/);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('only transient HTTP failures carry the optional projection outage code',async()=>{
 const http=require('node:http');let status=503,body='unavailable';
 const server=http.createServer((req,res)=>{res.statusCode=status;res.end(body);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{for(const code of [408,429,502,503,504,403,500,200]){status=code;await assert.rejects(httpRpc('http://127.0.0.1:'+server.address().port)('eth_chainId',[]),e=>[408,429,502,503,504].includes(code)?e.code==='RPC_READ_UNAVAILABLE':e.code!=='RPC_READ_UNAVAILABLE');}}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
