// Saved executed BUY payloads in a SYNTHETIC contiguous RPC chain.
// Policy source and bindings are mocked; this is not a new deployment admission.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const E=require('ethers'),D=require('../scripts/direct-buy.cjs'),R=require('../scripts/pons-batch-route.cjs');
const policy=require('../scripts/buy-policy-admission.cjs').ABI;
const {indexOnce}=require('../scripts/persistent-buy-indexer.cjs');
const {createServer}=require('../scripts/user-status-api.cjs');
const source=require('../docs/evidence/PONS_STEADY_7702_2026-10-02.json');
const runtimes=require('./fixtures/pons-batch-runtime.json').dependencies;
const addr=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
function setup(t){
 const m={...require('../docs/evidence/PONS_CHANNEL_RECEIPTS_2026-10-02.json').manifest,schema:R.SCHEMA,routeVersion:R.ID,eligibility:'automatic-buy-v1',quoteDecimals:6,entryThresholdRaw:'100000000',anchor:{number:10,hash:E.id('batch synthetic anchor')},batchExecutor:R.EXECUTOR,weth:source.capture.out.eth.calls[0].to,fundingRouter:source.capture.out.eth.funding.route.router,fundingPool:'0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca',codeHashes:{}};
 for(const k of R.FIELDS)m.codeHashes[k]=k==='batchExecutor'?R.EXECUTOR_HASH:E.keccak256('0x01');
 for(const d of runtimes)m.codeHashes[d.field]=d.codeHash;
 const rows=[source.fork.steps[0].steps[0],source.fork.steadyState[1]],wallet=rows[0].tx.from.toLowerCase();
 const blocks=rows.map((row,i)=>{
  const n=11+i,hash=E.id('synthetic batch block'+n),tx=structuredClone(row.tx),receipt=structuredClone(row.receipt);
  Object.assign(tx,{blockNumber:E.toQuantity(n),blockHash:hash,transactionIndex:'0x0'});
  Object.assign(receipt,{blockNumber:tx.blockNumber,blockHash:hash,transactionIndex:'0x0'});
  receipt.logs.forEach(l=>Object.assign(l,{blockNumber:tx.blockNumber,blockHash:hash,transactionIndex:'0x0'}));
  return {number:n,hash,parentHash:i?E.id('synthetic batch block11'):m.anchor.hash,timestamp:n,transactions:[{tx,receipt}]};
 });
 const statePath=require('path').resolve('.local/logs/batch-integration-'+crypto.randomUUID()+'.json');
 t.after(()=>{if(fs.existsSync(statePath))fs.unlinkSync(statePath);});
 const lifecycle={schema:'attempt-lifecycle-v1',instanceId:E.id('batch synthetic lifecycle'),source:addr(902),sourceCodeHash:E.keccak256('0x01'),vault:addr(901)};
 const config={manifest:m,lifecycle,indexer:{statePath,maxAgeSeconds:120},buyPolicy:{source:addr(900),publisher:wallet,instanceId:lifecycle.instanceId,genesisHash:D.hash(m),sourceCodeHash:E.keccak256('0x01'),chainId:4663,noticeBlocks:20}};
 const factory=new E.Interface(require('../scripts/integrations/pons-v2.cjs').FAB);
 const getters=new E.Interface(['function token() view returns(address)','function pairToken() view returns(address)','function factory() view returns(address)','function feePolicy() view returns(address)','function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function getPool(address,address,uint24) view returns(address)']);
 const calls=[],flags={badDelegation:false,outage:false};
 const rpc=async(method,p=[])=>{
  calls.push([method,p]);if(flags.outage)throw Error('offline');
  if(method==='eth_chainId')return '0x1237';
  if(method==='eth_getLogs')return [];
  if(method==='eth_getBlockByNumber'){
   const n=p[0]==='finalized'?12:Number(BigInt(p[0]));if(n===10)return {...m.anchor,transactions:[]};
   const b=blocks.find(x=>x.number===n);return {...b,transactions:p[1]?b.transactions.map(x=>x.tx):[]};
  }
  if(method==='eth_getCode'){
   if(p[0].toLowerCase()===wallet)return flags.badDelegation?'0x':'0xef0100'+R.EXECUTOR.slice(2);
   const d=runtimes.find(d=>d.address===p[0].toLowerCase());if(d)return d.code;
   return '0x01';
  }
  if(method==='eth_getTransactionReceipt')return blocks.flatMap(b=>b.transactions).find(x=>x.tx.hash===p[0]).receipt;
  if(method==='eth_call'){
   const q=p[0],to=q.to.toLowerCase();
   if(to===config.buyPolicy.source){const f=policy.parseTransaction(q),values={instanceId:lifecycle.instanceId,genesisHash:D.hash(m),publisher:wallet,noticeBlocks:20,SCHEMA_VERSION:1,genesisAdaptersHash:require('../scripts/buy-policy-format.cjs').genesisAdaptersHash(m),publishedCount:0,currentHash:D.hash(m),lastFromBlock:0};return policy.encodeFunctionResult(f.name,[values[f.name]]);}
   if(to===m.factory.toLowerCase()){const f=factory.parseTransaction(q);if(f.name==='getLaunchedToken')return factory.encodeFunctionResult(f.name,[[m.token,m.curve,wallet,wallet,m.quote,8090000000n,0,200,300,false,0,0,0,0,true]]);if(f.name==='memeHook')return factory.encodeFunctionResult(f.name,[m.hook]);}
   const g=getters.parseTransaction(q);let value;
   if(to===m.fundingPool.toLowerCase())value={token0:m.weth,token1:m.quote,fee:100,factory:addr(903)}[g.name];
   else if(to===m.fundingRouter.toLowerCase())value=addr(903);
   else if(to===addr(903))value=m.fundingPool;
   else value={token:m.token,pairToken:m.quote,factory:m.factory,feePolicy:m.hook}[g.name];
   return getters.encodeFunctionResult(g.name,[value]);
  }throw Error('Unexpected RPC '+method);
 };
 const run=()=>indexOnce({config,rpc,statePath});
 return {m,config,wallet,blocks,calls,flags,run,rpc,statePath};
}
test('batch BUY → durable index → Short/Monthly → HTTP; restart and reorg',async t=>{
 const f=setup(t);await f.run();
 const server=createServer(f.config);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r));});
 const url=`http://127.0.0.1:${server.address().port}/v1/wallets/${f.wallet}`;
 const view=async()=>{const r=await fetch(url);assert.equal(r.status,200);return r.json();};
 let v=await view();assert.equal(v.status,'observed');assert.equal(v.balances.SHORT.open,'1');assert.equal(v.balances.MONTHLY.open,'1');assert.equal(v.balances.carryRaw,String(1000000n+BigInt(source.capture.out.eth.funding.minOut)));assert.equal(v.purchases.total,2);
 f.calls.length=0;await f.run();assert(!f.calls.some(([m])=>m==='eth_getTransactionReceipt'));assert.deepEqual((await view()).balances,v.balances);
 const saved=JSON.parse(fs.readFileSync(f.statePath));assert(saved.index.blocks[1].batchAccounts[f.wallet]);
 for(const row of Object.values(saved.index.cache))if(row.value?.transactionHash&&row.value?.logs)assert.equal(row.height,Number(BigInt(row.value.blockNumber)));
 // Same signed tx re-included in a replacement block must fetch its new receipt.
 const replacement=E.id('same tx on replacement branch');f.blocks[1].hash=replacement;
 const moved=f.blocks[1].transactions[0];moved.tx.blockHash=replacement;moved.receipt.blockHash=replacement;moved.receipt.logs.forEach(l=>l.blockHash=replacement);
 f.calls.length=0;await f.run();assert(f.calls.some(([method,p])=>method==='eth_getTransactionReceipt'&&p[0]===moved.tx.hash));assert.deepEqual((await view()).balances,v.balances);
 f.blocks[1]={...f.blocks[1],hash:E.id('batch replacement'),transactions:[]};await f.run();v=await view();assert.equal(v.purchases.total,1);assert.equal(v.balances.carryRaw,'1000000');assert.equal(v.balances.SHORT.open,'1');
 f.flags.outage=true;await assert.rejects(f.run(),/offline/);assert.equal((await view()).status,'stale');
 f.flags.outage=false;await f.run();assert.equal((await view()).status,'observed');
});

test('100 unrelated self-calls need no parent code; target failure still closes indexing',async t=>{
 const f=setup(t),block=f.blocks[1],template=block.transactions[0];
 for(let i=0;i<100;i++){
  const tx={...structuredClone(template.tx),from:addr(10000+i),to:addr(10000+i),hash:E.id('foreign'+i),transactionIndex:E.toQuantity(i+1),input:'0x',authorizationList:[]};
  const receipt={...structuredClone(template.receipt),from:tx.from,to:tx.to,transactionHash:tx.hash,transactionIndex:tx.transactionIndex,logs:[]};block.transactions.push({tx,receipt});
 }
 let accountReads=0,foreignReads=0;const rpc=async(m,p)=>{if(m==='eth_getCode'&&BigInt(p[0])>=10000n&&BigInt(p[0])<10100n){foreignReads++;throw Error('foreign unavailable');}if(m==='eth_getCode'&&p[0].toLowerCase()===f.wallet)accountReads++;return f.rpc(m,p);};
 await indexOnce({config:f.config,statePath:f.statePath,rpc});assert.equal(foreignReads,0);assert.equal(accountReads,2);
 assert.equal(JSON.parse(fs.readFileSync(f.statePath)).index.ledger.decisions.filter(d=>d.status==='ELIGIBLE').length,2);
 const other=f.statePath+'.unavailable';t.after(()=>{if(fs.existsSync(other))fs.unlinkSync(other);});
 await assert.rejects(indexOnce({config:f.config,statePath:other,rpc:async(m,p)=>{if(m==='eth_getCode'&&p[0].toLowerCase()===f.wallet)throw Error('target parent unavailable');return f.rpc(m,p);}}),/target parent unavailable/);
});
test('wrong runtime/binding retains snapshot; same-block delegation activity is not guessed',async t=>{
 const f=setup(t);await f.run();const original=JSON.parse(fs.readFileSync(f.statePath)).index;
 // A fresh state avoids a previously verified cache when injecting bad RPC code.
 const path=f.statePath+'.bad';t.after(()=>{if(fs.existsSync(path))fs.unlinkSync(path);});
 await assert.rejects(indexOnce({config:f.config,statePath:path,rpc:async(method,p)=>method==='eth_getCode'&&p[0].toLowerCase()===R.EXECUTOR?'0x01':f.rpc(method,p)}),/runtime/);
 assert.deepEqual(JSON.parse(fs.readFileSync(f.statePath)).index,original);
 const row=f.blocks[1].transactions[0],block={...f.blocks[1],batchAccounts:{[f.wallet]:{parentHash:f.blocks[1].parentHash,code:'0xef0100'+R.EXECUTOR.slice(2)}},transactions:[f.blocks[0].transactions[0],row]};
 assert.equal(R.decode(f.m,row.tx,row.receipt,block)[0].status,'UNSUPPORTED_ROUTE');
});
test('unproven parent delegation cannot mint; authorization mutation cannot mint',async t=>{
 const f=setup(t);f.flags.badDelegation=true;await f.run();let saved=JSON.parse(fs.readFileSync(f.statePath));assert.equal(saved.index.ledger.decisions.filter(d=>d.status==='ELIGIBLE').length,1);
 const row=structuredClone(f.blocks[0].transactions[0]);row.tx.authorizationList[0].nonce='0x99';const b={...f.blocks[0],transactions:[row]};assert.equal(R.decode(f.m,row.tx,row.receipt,b)[0].status,'UNSUPPORTED_ROUTE');
 const good=f.blocks[0].transactions[0];const old={...f.m,schema:require('../scripts/pons-curve-buy.cjs').SCHEMA,routeVersion:require('../scripts/pons-curve-buy.cjs').ID};assert.equal(D.decodeTransaction(old,good.tx,good.receipt)[0].status,'UNSUPPORTED_ROUTE');
});


test('combined genesis preserves curve batch decisions and never upgrades older profiles',t=>{
 const f=setup(t),L=require('../scripts/pons-launch-buy.cjs'),V=require('../scripts/pons-v4-buy.cjs');
 const m={...f.m,schema:L.SCHEMA,routeVersion:L.ID,hookFeeBps:100,creatorTaxBps:300,codeHashes:{...f.m.codeHashes}};
 for(const [k,[a,h]]of Object.entries(V.PINS)){m[k]=a;m.codeHashes[k]=h;}
 m.poolKey=[...[m.token,m.quote].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1),0,200,m.hook];m.poolId=V.poolId(m.poolKey);
 f.blocks[1].batchAccounts={[f.wallet]:{parentHash:f.blocks[1].parentHash,code:'0xef0100'+R.EXECUTOR.slice(2)}};
 const result=D.replay(m,f.blocks);assert.equal(result.decisions.filter(d=>d.status==='ELIGIBLE').length,2);assert.equal(result.wallets[0].entriesMinted,'1');
 const old={...m,schema:V.SCHEMA,routeVersion:V.ID};assert.equal(D.replay(old,f.blocks).wallets.length,0);
 assert.notEqual(D.hash(m),D.hash(old));
});
