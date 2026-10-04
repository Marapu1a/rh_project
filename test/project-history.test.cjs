const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const {fixture}=require('./fixtures/pons-indexer.cjs'),D=require('../scripts/direct-buy.cjs'),P=require('../scripts/project-history.cjs'),{scanWithRpc}=require('../scripts/replay-direct-buy.cjs'),{indexOnce}=require('../scripts/persistent-buy-indexer.cjs'),{ethers:E}=require('ethers');
function setup(t){const f=fixture(t);for(let n=13;n<=1012;n++)f.blocks.push({number:n,hash:E.id('empty'+n),parentHash:f.blocks.at(-1).hash,timestamp:n,transactions:[]});
const rpc=async(m,p=[])=>{if(m==='eth_getLogs'){const filter=p[0],addresses=[filter.address].flat().map(x=>x.toLowerCase());return f.blocks.filter(b=>b.number>=Number(BigInt(filter.fromBlock))&&b.number<=Number(BigInt(filter.toBlock))).flatMap(b=>b.transactions.flatMap(t=>t.receipt.logs)).filter(l=>addresses.includes(l.address.toLowerCase()));}if(m==='eth_getBlockReceipts')return f.blocks.find(b=>b.number===Number(BigInt(p[0]))).transactions.map(t=>t.receipt);return f.rpc(m,p);};return {...f,rpc};}
test('project scan keeps buys, bounded tail, same ledger and no full reads of empty history',async t=>{const f=setup(t),full=D.replay(f.m,f.blocks);const s=await scanWithRpc(f.m,f.rpc,1012,null,{mode:P.SCHEMA});assert.equal(D.hash(D.replay(f.m,s.blocks)),D.hash(full));assert.equal(s.blocks.length,131);assert.equal(s.blocks.reduce((n,b)=>n+b.transactions.length,0),2);assert(f.calls.filter(([m,p])=>m==='eth_getBlockByNumber'&&p[1]).length<5);const bad=structuredClone(s.blocks);bad[2].projectEvidence.previousHash=E.ZeroHash;assert.throws(()=>D.replay(f.m,bad),/disconnected/);});
test('project mode retains unsupported token receipt and original nonzero indices',async t=>{const f=setup(t);const tx=f.blocks[0].transactions[0];tx.tx.transactionIndex=7;tx.receipt.transactionIndex=7;for(const l of tx.receipt.logs){l.transactionIndex=7;l.logIndex+=30;}tx.tx.to=f.wallet;tx.receipt.to=f.wallet;const sparse=P.compact(f.blocks,f.m,null);const d=D.replay(f.m,sparse).decisions;assert.equal(d.length,2);assert.equal(d[0].status,'UNSUPPORTED_ROUTE');assert.equal(d[0].transactionIndex,7);});
test('project persisted index restarts, is bounded and rolls back recent replacement',async t=>{const f=setup(t);const config={...f.config,indexer:{...f.config.indexer,scanMode:P.SCHEMA}};await indexOnce({config,rpc:f.rpc,statePath:f.statePath,batchSize:1000});await indexOnce({config,rpc:f.rpc,statePath:f.statePath,batchSize:1000});let s=f.read();assert.equal(s.index.blocks.length,131);assert.equal(s.index.ledger.wallets[0].entriesMinted,'1');const before=s.index.ledgerHash;await indexOnce({config,rpc:f.rpc,statePath:f.statePath,batchSize:1000});assert.equal(f.read().index.ledgerHash,before);f.blocks.at(-1).hash=E.id('replacement');const r=await indexOnce({config,rpc:f.rpc,statePath:f.statePath,batchSize:1000});assert.equal(r.removedBlocks,1);assert.equal(f.read().index.head,1012);});

const L=require('../scripts/attempt-lifecycle.cjs'),R=require('../scripts/reward-observation.cjs');
const addr=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
function withDraws(t){
 const f=setup(t),wallet=f.blocks[0].transactions[0].tx.from;
 const lifecycle={schema:'attempt-lifecycle-v4',source:addr(900),sourceCodeHash:E.keccak256('0x01'),instanceId:E.id('short'),
  monthlySource:addr(901),monthlySourceCodeHash:E.keccak256('0x01'),monthlyInstanceId:E.id('monthly'),vault:addr(902),vaultCodeHash:E.keccak256('0x01'),
  shortRules:{rulesHash:E.id('rules'),noticeSeconds:'10',startedAt:'0',firstBlock:'11'},monthlyPolicy:{rulesHash:E.id('monthly rules'),interval:'30',startedAt:'0'},monthlyRules:{noticeSeconds:'10',firstBlock:'11'}};
 const emit=(abi,event,args,address)=>({address,...abi.encodeEventLog(abi.getEvent(event),args)});
 function append(logs=[],timestamp){
  const prev=f.blocks.at(-1),number=prev.number+1,hash=E.id('event block '+number),th=E.id('event tx '+number);
  const tx={hash:th,blockHash:hash,blockNumber:number,transactionIndex:0,from:wallet,to:lifecycle.source,chainId:4663,value:'0x0',input:'0x'};
  const receipt={transactionHash:th,blockHash:hash,blockNumber:number,transactionIndex:0,from:wallet,to:lifecycle.source,status:1,logs:logs.map((l,i)=>({...l,blockHash:hash,blockNumber:number,transactionHash:th,transactionIndex:0,logIndex:i,removed:false}))};
  const b={number,hash,parentHash:prev.hash,timestamp:timestamp??prev.timestamp+1,transactions:logs.length?[{tx,receipt}]:[]};f.blocks.push(b);return b;
 }
 const cutoff={blockNumber:500,blockHash:f.blocks.find(b=>b.number===500).hash},draws=[];
 for(const kind of ['SHORT','MONTHLY']){
  const source=kind==='SHORT'?lifecycle.source:lifecycle.monthlySource,drawId=require('../scripts/draw-id.cjs').drawIdFor(kind,E.id(kind));
  const rulesHash=kind==='SHORT'?lifecycle.shortRules.rulesHash:lifecycle.monthlyPolicy.rulesHash;
  const snapshot=L.snapshotFor(L.domainFor(f.m,lifecycle),drawId,kind,cutoff,rulesHash,[{wallet,count:'1',firstAttempt:'1',lastAttempt:'1'}],1),snapshotHash=D.hash(snapshot);
  append([emit(L.ABI,'AttemptsFrozen',[drawId,kind==='SHORT'?0:1,500,cutoff.blockHash,rulesHash,snapshotHash],source),emit(R.abi,'DrawReserved',[drawId,kind==='SHORT'?1:2,f.m.quote,100],lifecycle.vault)],22000+draws.length);
  draws.push({drawId,kind,source,snapshotHash});
 }
 for(const d of draws)append([emit(L.ABI,'AttemptsConsumed',[d.drawId,d.kind==='SHORT'?0:1,d.snapshotHash,1,E.id('result')],d.source),emit(R.abi,'RewardAssigned',[d.drawId,wallet,70],lifecycle.vault),emit(R.abi,'DrawFinalized',[d.drawId,70,30],lifecycle.vault),emit(R.abi,'RewardPaid',[d.drawId,f.m.quote,wallet,70],lifecycle.vault)]);
 return {...f,lifecycle,append,emit,wallet,draws};
}
test('both draws, paid rewards and old empty epoch cutoffs survive compaction',async t=>{
 const f=withDraws(t),before=L.replayAttempts(f.m,f.lifecycle,f.blocks),rewards=R.projectRewards(f.blocks,f.lifecycle.vault);
 const scanned=await scanWithRpc(f.m,f.rpc,f.blocks.at(-1).number,f.lifecycle,{mode:P.SCHEMA});
 assert.equal(D.hash(L.replayAttempts(f.m,f.lifecycle,scanned.blocks)),D.hash(before));
 await P.references(f.blocks,f.m,f.lifecycle,null,f.blocks);
 let blocks=P.compact(f.blocks,f.m,f.lifecycle);
 assert(!blocks.some(b=>b.number===500));assert.equal(D.hash(L.replayAttempts(f.m,f.lifecycle,blocks)),D.hash(before));assert.deepEqual(R.projectRewards(blocks,f.lifecycle.vault),rewards);
 assert.equal(rewards.rewards.filter(r=>r.status==='paid').length,2);
 const bad=structuredClone(blocks);for(const b of bad)delete b.projectReferences;assert.throws(()=>L.replayAttempts(f.m,f.lifecycle,bad),/canonical ancestor/);
 // Activate an empty old Short epoch, then use a cutoff that will leave the tail.
 const rules=E.id('next rules');f.append([f.emit(L.ABI,'ShortRulesAnnounced',[2,rules,50010],f.lifecycle.source)],50000);
 f.append([f.emit(L.ABI,'ShortRulesActivated',[1,2,f.blocks.at(-1).number+2],f.lifecycle.source)],50010);
 const c=f.append(),cutoff={blockNumber:c.number,blockHash:c.hash};
 f.append([f.emit(L.ABI,'ShortEpochEmpty',[1,c.number,c.hash,L.emptyEpochHash(L.domainFor(f.m,f.lifecycle),1,cutoff,f.lifecycle.shortRules.rulesHash)],f.lifecycle.source)]);
 for(let i=0;i<300;i++)f.append();
 for(const b of f.blocks)delete b.projectReferences;
 const expected=L.replayAttempts(f.m,f.lifecycle,f.blocks);
 await P.references(f.blocks,f.m,f.lifecycle,null,f.blocks);blocks=P.compact(f.blocks,f.m,f.lifecycle);
 assert(!blocks.some(b=>b.number===c.number));assert.equal(D.hash(L.replayAttempts(f.m,f.lifecycle,blocks)),D.hash(expected));
});

test('unrelated transactions in a project block are dropped without renumbering receipts',async t=>{
 const f=setup(t),entry=f.blocks[0].transactions[0],other=structuredClone(entry),th=E.id('unrelated');
 Object.assign(other.tx,{hash:th,to:addr(999),input:'0x'});Object.assign(other.receipt,{transactionHash:th,to:addr(999),logs:[]});
 entry.tx.transactionIndex=1;entry.receipt.transactionIndex=1;for(const log of entry.receipt.logs)log.transactionIndex=1;
 f.blocks[0].transactions.unshift(other);
 const before=D.replay(f.m,f.blocks),scanned=await scanWithRpc(f.m,f.rpc,1012,null,{mode:P.SCHEMA});
 assert.equal(scanned.blocks[0].transactions.length,1);assert.equal(scanned.blocks[0].transactions[0].tx.transactionIndex,1);
 assert.equal(D.hash(D.replay(f.m,scanned.blocks)),D.hash(before));
});

test('offline migration verifies monetary ledgers, preserves source bytes and refuses overwrite',async t=>{
 const f=withDraws(t),path=require('path'),{indexerChecksum}=require('../scripts/indexer-checksum.cjs'),{migrate}=require('../scripts/migrate-project-history.cjs');
 const config={...f.config,lifecycle:f.lifecycle,indexer:{statePath:f.statePath,maxAgeSeconds:300}},ledger=D.replay(f.m,f.blocks);
 const state={configHash:D.hash({kind:'persistent-buy-indexer-v1',config}),index:{head:f.blocks.at(-1).number,manifest:f.m,blocks:f.blocks,ledger,ledgerHash:D.hash(ledger),policyStatus:{mode:'admitted'},observedAt:new Date().toISOString()},status:{state:'caughtUp',updatedAt:new Date().toISOString()}};
 state.checksum=indexerChecksum(state);const source=JSON.stringify(state),destinationState=f.statePath+'.new',destinationConfig=f.statePath+'.config';
 t.after(()=>{for(const p of [destinationState,destinationConfig])if(fs.existsSync(p))fs.unlinkSync(p);});
 fs.writeFileSync(f.statePath,source);
 const result=await migrate({config,state:JSON.parse(source),destinationState,destinationConfig});
 assert.equal(fs.readFileSync(f.statePath,'utf8'),source);assert.equal(result.ledgerHash,D.hash(ledger));assert.equal(result.activated,false);
 const next=JSON.parse(fs.readFileSync(destinationConfig));assert.equal(next.indexer.statePath,path.resolve(destinationState));
 const api=require('../scripts/user-status-api.cjs').walletStatus({config:next,wallet:f.wallet});
 assert.equal(api.status,'observed');assert.equal(api.balances.SHORT.consumedTotal,'1');assert.equal(api.provenance.evidenceMode,P.SCHEMA);
 const snapshot=await require('../scripts/persistent-buy-indexer.cjs').readSnapshot({config:next,statePath:destinationState,manifest:f.m,cutoff:500,rpc:f.rpc});
 assert.equal(snapshot.blocks.at(-1).number,500);assert.equal(L.replayAttempts(f.m,f.lifecycle,snapshot.blocks).wallets[0].SHORT.open,'1');
 await assert.rejects(require('../scripts/persistent-buy-indexer.cjs').readSnapshot({config:next,statePath:destinationState,manifest:f.m,cutoff:500,rpc:async(m,p)=>{const b=await f.rpc(m,p);return p[0]==='0x1f4'?null:b;}}),/indexerBranch/);
 await assert.rejects(migrate({config,state:JSON.parse(source),destinationState,destinationConfig}),/must be new/);
});

test('RPC log mismatch stops scan and unsupported deep reorg preserves last good index',async t=>{
 const f=setup(t),badRpc=async(m,p)=>{const r=await f.rpc(m,p);return m==='eth_getLogs'?r.map(l=>({...l,transactionIndex:99})):r;};
 await assert.rejects(scanWithRpc(f.m,badRpc,1012,null,{mode:P.SCHEMA}),/log\/receipt mismatch/);
 const config={...f.config,indexer:{scanMode:P.SCHEMA}};
 await indexOnce({config,rpc:f.rpc,statePath:f.statePath,batchSize:1000});await indexOnce({config,rpc:f.rpc,statePath:f.statePath,batchSize:1000});
 const previous=D.hash(f.read().index);
 for(const b of f.blocks)if(b.number>=880)b.hash=E.id('deep replacement'+b.number);
 await assert.rejects(indexOnce({config,rpc:f.rpc,statePath:f.statePath,batchSize:1000}),/Reorg exceeds/);
 assert.equal(D.hash(f.read().index),previous);assert.equal(f.read().status.state,'waiting');
});

test('authorization audit restores omitted neighboring context without changing ledger or input',async t=>{
 const f=setup(t),{audit}=require('../scripts/audit-project-authorizations.cjs'),{indexerChecksum}=require('../scripts/indexer-checksum.cjs');
 const blocks=P.compact(f.blocks,f.m,null),ledger=D.replay(f.m,blocks),config=f.config;
 const state={configHash:D.hash({kind:'persistent-buy-indexer-v1',config}),index:{evidenceMode:P.SCHEMA,manifest:f.m,blocks,head:1012,ledger,ledgerHash:D.hash(ledger)}};
 state.checksum=indexerChecksum(state);const before=JSON.stringify(state);
 const row=structuredClone(f.blocks[0].transactions[0]);row.tx.hash=E.id('context');row.tx.input='0x';row.tx.transactionIndex=1;row.tx.authorizationList=[{chainId:'0x1237',nonce:'0x0',address:addr(999),r:E.ZeroHash,s:E.ZeroHash,yParity:'0x0'}];
 row.receipt.transactionHash=row.tx.hash;row.receipt.transactionIndex=1;row.receipt.logs=[];f.blocks[0].transactions.push(row);
 const result=await audit({config,state,rpc:f.rpc});assert.equal(result.report.addedTransactions,1);assert.equal(result.report.ledgerUnchanged,true);assert.equal(result.state.index.blocks[0].transactions.length,2);assert.equal(JSON.stringify(state),before);
 const wrong=structuredClone(state);wrong.checksum='bad';await assert.rejects(audit({config,state:wrong,rpc:f.rpc}),/identity/);
});
