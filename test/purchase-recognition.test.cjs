const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('ethers');
const D=require('../scripts/direct-buy.cjs'),R=require('../scripts/purchase-recognition.cjs'),{fixture}=require('./fixtures/purchase-recognition.cjs');
test('late USDG purchase credits only future draws; original source and frozen hashes survive restart',()=>{
 const f=fixture();f.buy();const short=f.freeze('SHORT',1),monthly=f.freeze('MONTHLY',1),before=f.run();
 assert.equal(before.buyLedger.decisions[0].status,'WAITING_RECOGNITION');f.consume(short);f.confirm();
 const after=f.run(),w=after.wallets[0];assert.equal(w.SHORT.open,'2');assert.equal(w.MONTHLY.open,'2');
 assert.equal(after.buyLedger.wallets[0].carryRaw,'1000000');assert.equal(after.buyLedger.decisions[0].blockNumber,Number(BigInt(f.blocks[0].number)));
 assert.equal(after.buyLedger.decisions[0].creditedAt.blockNumber,f.head().blockNumber);
 assert.deepEqual(after.draws.map(d=>d.snapshot),before.draws.map(d=>d.snapshot));
 assert.equal(D.hash(require('../scripts/attempt-lifecycle.cjs').replayAttempts(f.manifest,f.config,JSON.parse(JSON.stringify(f.marked())))),D.hash(after));
 f.freeze('SHORT',2,2);assert.equal(f.run().wallets[0].SHORT.open,'0');assert.equal(f.run().draws.find(d=>d.drawId===monthly.drawId).snapshotHash,monthly.snapshotHash);
});
test('ETH quote plus later direct amount crosses threshold at confirmation, not purchase',()=>{
 const f=fixture('eth');f.buy(10000000n);const cutoff=f.head();f.confirm();const r=f.run();
 assert.equal(r.buyLedger.wallets[0].entriesMinted,'1');assert.equal(r.buyLedger.wallets[0].carryRaw,'3087934');
 f.freeze('SHORT',0,1,cutoff);assert.equal(f.run().wallets[0].SHORT.open,'1');
});
test('duplicate delivery and repeated purchase in a different batch never credit twice',()=>{
 const f=fixture();f.confirm();const before=f.run();const b=f.bundle();b.note='second reviewed package';f.confirm(b);
 assert.deepEqual(f.run().buyLedger.wallets,before.buyLedger.wallets);assert.deepEqual(f.run().buyLedger.decisions[0].creditedAt,before.buyLedger.decisions[0].creditedAt);
 assert.equal(D.hash(D.replay(f.manifest,[...f.marked(),...f.marked()])),D.hash(f.run().buyLedger));
 assert.throws(()=>D.replayWithCheckpoint(f.manifest,[],D.replayWithCheckpoint(f.manifest,f.marked())),/full project replay/);
});
test('corrupt/missing bundles, forged amount/recipient/trace/runtime, noncanonical source and duplicate proof fail closed',()=>{
 const mutations=[f=>delete f.blocks.at(-1).recognitionBundles,f=>f.blocks.at(-1).recognitionSourceCode='0x02',f=>f.blocks.at(-1).transactions[0].tx.from=E.ZeroAddress];
 for(const mutate of mutations){const f=fixture();f.confirm();mutate(f);assert.throws(f.run);}
 const changes=[p=>p.trace.from=E.ZeroAddress,p=>p.trace.calls[0].to=E.ZeroAddress,p=>p.codeHashes[Object.keys(p.codeHashes)[0]]=E.ZeroHash,p=>p.parentCodeHashes={},p=>p.transactionHash=E.ZeroHash,p=>p.blockHash=E.ZeroHash,p=>p.trace.logs=[{index:'999',address:E.ZeroAddress}]];
 for(const change of changes){const f=fixture();change(f.proof);f.confirm();assert.throws(f.run);}
 const f=fixture();f.confirm(f.bundle([f.proof,f.proof]));assert.throws(f.run,/duplicate purchase/);
});
test('reorg drops a confirmation; orphan original proof cannot be reused on a new branch',()=>{
 const f=fixture();f.confirm();assert.equal(f.run().buyLedger.wallets[0].entriesMinted,'2');f.blocks.pop();assert.equal(f.run().buyLedger.wallets.length,0);
 f.confirm();f.blocks[0].transactions=[];assert.throws(f.run,/missing\/ambiguous/);
});
test('compaction preserves confirmation proof and private consumer recomputes late carry',()=>{
 const f=fixture();f.confirm();for(let i=0;i<140;i++)f.append(f.wallet,'0x');
 const H=require('../scripts/project-history.cjs'),blocks=H.compact(f.marked(),f.manifest,f.config);
 assert.equal(D.hash(D.replay(f.manifest,blocks)),D.hash(f.run().buyLedger));
 const reader=require('../scripts/verified-buy-replay.cjs').createVerifiedBuyReplay();assert.deepEqual(reader.replay(f.manifest,blocks).wallets,f.run().buyLedger.wallets);assert.equal(reader.metrics().mode,'full');
});
test('bundle hydration, restart and wallet API independently reproduce pending/confirmed balances; forged trust fails',async t=>{
 const fs=require('node:fs'),path=require('node:path'),dir=fs.mkdtempSync(path.resolve('.local/logs/recognition-test-'));
 t.after(()=>{for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));fs.rmdirSync(dir);});
 const f=fixture(),statePath=path.join(dir,'index.json'),config={manifest:f.m,recognition:{...f.recognition,bundleDirectory:dir},lifecycle:f.config,indexer:{statePath,maxAgeSeconds:60}};
 function save(){const ledger=f.run().buyLedger,state={configHash:D.hash({kind:'persistent-buy-indexer-v1',config}),status:{state:'caughtUp'},index:{manifest:f.manifest,head:ledger.head.number,observedAt:new Date().toISOString(),blocks:f.marked(),ledgerHash:D.hash(ledger),policyStatus:{mode:'admitted'}}};fs.writeFileSync(statePath,JSON.stringify({...state,checksum:require('../scripts/indexer-checksum.cjs').indexerChecksum(state)}));}
 save();const API=require('../scripts/user-status-api.cjs'),read=()=>API.walletStatus({config,wallet:f.wallet});
 assert.equal(read().purchases.items[0].status,'WAITING_RECOGNITION');
 const block=f.confirm(),bundle=f.bundle(),key=D.hash(bundle);delete block.recognitionBundles;
 const rpc=async(method)=>{assert.equal(method,'eth_getCode');return '0x01';};
 await assert.rejects(R.hydrate(f.manifest,[block],config.recognition,rpc));
 assert.equal(read().purchases.items[0].status,'WAITING_RECOGNITION');
 fs.writeFileSync(path.join(dir,key+'.json'),JSON.stringify(bundle));await R.hydrate(f.manifest,[block],config.recognition,rpc);save();
 const view=read();assert.equal(view.status,'observed');assert.equal(view.balances.SHORT.open,'2');assert.equal(view.balances.MONTHLY.open,'2');assert.equal(view.purchases.items[0].creditedAt.blockNumber,f.head().blockNumber);
 assert.equal(JSON.stringify(view).includes('parentCodeHashes'),false);assert.equal(JSON.stringify(view).includes(dir),false);
 assert.equal(API.walletStatus({config:{...config,recognition:{...config.recognition,publisher:E.ZeroAddress}},wallet:f.wallet}).status,'unavailable');
 fs.unlinkSync(path.join(dir,key+'.json'));assert.equal(read().balances.SHORT.open,'2'); // durable index contains the committed proof
});
test('read-only preparation validates canonical receipts and runtimes, writes content-addressed evidence, never sends',async t=>{
 const fs=require('node:fs'),path=require('node:path'),dir=fs.mkdtempSync(path.resolve('.local/logs/recognition-plan-'));
 t.after(()=>{for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));fs.rmdirSync(dir);});
 const f=fixture(),row=f.blocks[0].transactions[0],calls=[];
 const rpc=async(method,params)=>{calls.push(method);if(method==='eth_chainId')return '0x1237';if(method==='eth_getBlockByNumber')return f.blocks[0];if(method==='eth_getTransactionReceipt')return row.receipt;if(method==='debug_traceTransaction')return f.proof.trace;if(method==='eth_getCode')return require('./fixtures/pons-router-research/runtime-codes.json')[params[0]];throw Error('Unexpected RPC');};
 const args={config:{manifest:f.m,recognition:f.recognition},blocks:f.blocks,transactionHashes:[row.tx.hash],rpc,directory:dir};
 const plan=await require('../scripts/prepare-purchase-recognition.cjs').prepare(args);assert.equal(plan.sent,false);assert.equal(plan.bundleHash,D.hash(JSON.parse(fs.readFileSync(plan.file))));assert(!calls.some(x=>x.includes('send')));
 assert.equal((await require('../scripts/prepare-purchase-recognition.cjs').prepare(args)).bundleHash,plan.bundleHash);
 await assert.rejects(require('../scripts/prepare-purchase-recognition.cjs').prepare({...args,rpc:async(method,params)=>method==='eth_getCode'&&params[1]!==row.tx.blockNumber?'0x02':rpc(method,params)}));
});
test('persistent index stops at unavailable/corrupt commitment without replacing last good purchases',async t=>{
 const fs=require('node:fs'),path=require('node:path'),dir=fs.mkdtempSync(path.resolve('.local/logs/recognition-fault-'));
 t.after(()=>{for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));fs.rmdirSync(dir);});
 const f=require('./fixtures/pons-indexer.cjs').fixture(t),sample=fixture(),recognition={...sample.recognition,bundleDirectory:dir},config={...f.config,recognition};
 const run=()=>require('../scripts/persistent-buy-indexer.cjs').indexOnce({config,rpc:f.rpc,statePath:f.statePath});
 await run();const before=f.read().index,bundle=sample.bundle(),key=D.hash(bundle),block=sample.confirm(bundle),row=block.transactions[0];
 block.number=13;block.parentHash=f.blocks.at(-1).hash;row.tx.blockNumber=13;row.receipt.blockNumber=13;for(const log of row.receipt.logs)log.blockNumber=13;
 delete block.recognitionBundles;delete block.recognitionSourceCode;f.blocks.push(block);
 await assert.rejects(run);assert.deepEqual(f.read().index,before);assert.equal(f.read().status.state,'waiting');
 fs.writeFileSync(path.join(dir,key+'.json'),'{}');await assert.rejects(run,/bundle hash/);assert.deepEqual(f.read().index,before);
});
test('v4 delayed entries belong to the confirmation epochs of both Short and Monthly',()=>{
 const f=fixture(),L=require('../scripts/attempt-lifecycle.cjs'),address='0x'+'7'.repeat(40);
 Object.assign(f.config,{schema:'attempt-lifecycle-v4',monthlySource:address,monthlySourceCodeHash:E.id('monthly code'),monthlyInstanceId:E.id('monthly instance'),vault:'0x'+'8'.repeat(40),vaultCodeHash:E.id('vault code'),shortRules:{rulesHash:E.id('short rules'),noticeSeconds:'10',startedAt:'0',firstBlock:'0'},monthlyPolicy:{rulesHash:E.id('monthly rules'),interval:'30',startedAt:'0'},monthlyRules:{noticeSeconds:'10',firstBlock:'0'}});
 const emit=(event,args,source)=>f.append(source,'0x',[{address:source,...L.ABI.encodeEventLog(L.ABI.getEvent(event),args)}]);
 emit('ShortRulesAnnounced',[2,E.id('new short rules'),Number(f.blocks.at(-1).timestamp)+11],f.config.source);
 emit('MonthlyRulesAnnounced',[2,E.id('new monthly rules'),Number(f.blocks.at(-1).timestamp)+11],address);
 f.append(f.wallet,'0x');f.blocks.at(-1).timestamp+=20;
 emit('ShortRulesActivated',[1,2,f.head().blockNumber+2],f.config.source);
 emit('MonthlyRulesActivated',[1,2,f.head().blockNumber+2],address);
 f.confirm();const r=f.run();
 for(const kind of ['SHORT','MONTHLY'])assert.deepEqual(r.wallets[0][kind].byEpoch.map(e=>e.minted),['0','2']);
});
