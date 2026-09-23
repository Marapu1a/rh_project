const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {id,AbiCoder,keccak256}=require('ethers');
const {replay,canonical,hash,decodeTransaction,EXECUTE_ABI,SWAP_TYPE,TRANSFER_ABI}=require('../scripts/direct-buy.cjs');
const evidence=JSON.parse(fs.readFileSync('research/direct-buy/evidence.json','utf8'));
const m=evidence.manifest,blocks=evidence.blocks;
const copy=x=>structuredClone(x);
const coder=AbiCoder.defaultAbiCoder();
function transaction(label,branch=blocks){const h=evidence.observations.find(o=>o.label===label).hash;return branch.flatMap(b=>b.transactions).find(t=>t.tx.hash===h);}
function decision(label){const t=transaction(label);return decodeTransaction(m,t.tx,t.receipt);}

test('real fork router BUY 99 + 1 creates one entry; pre-registration BUY, SELL, gift and batch do not',()=>{
  const ledger=replay(m,blocks),statuses=ledger.decisions.map(d=>[d.status,d.reason]);
  assert.equal(ledger.wallets.length,1);
  assert.equal(ledger.wallets[0].entriesMinted,'1');
  assert.equal(ledger.wallets[0].carryRaw,'0');
  assert.equal(ledger.wallets[0].shortAttemptsMinted,'1');
  assert.equal(ledger.wallets[0].monthlyAttemptsMinted,'1');
  assert.equal(statuses.filter(([s])=>s==='ELIGIBLE').length,2);
  for(const reason of ['NOT_REGISTERED_AT_SWAP','SELL','PAYER_RECIPIENT_DIFFER','MULTIPLE_POOL_SWAPS'])assert.ok(statuses.some(([,r])=>r===reason),reason);
  const eligible=ledger.decisions.filter(d=>d.status==='ELIGIBLE');
  assert.deepEqual(eligible.map(d=>d.grossQuoteRaw),['99000000','1000000']);
  assert.equal(decision('BUY 99 USDG')[0].payer,evidence.sandboxFunding.wallet.toLowerCase());
});

test('replay is deterministic; duplicate block/log delivery cannot mint extra entries',()=>{
  const expected=replay(m,blocks);
  assert.equal(canonical(replay(m,[...copy(blocks).reverse(),copy(blocks[1])])),canonical(expected));
  const duplicate=copy(blocks),t=transaction('BUY 99 USDG',duplicate);
  t.receipt.logs.push(copy(t.receipt.logs[0]));
  assert.equal(hash(replay(m,duplicate)),hash(expected));
  const changed=copy(blocks[1]);changed.hash=id('different branch');
  assert.throws(()=>replay(m,[...blocks,changed]),/Conflicting block/);
});

test('bad provenance, chain, missing block and unanchored partial history fail closed',()=>{
  assert.throws(()=>replay({...m,chainId:4663},blocks),/chain mismatch/);
  assert.throws(()=>replay(m,blocks.slice(1)),/Non-contiguous/);
  let b=copy(blocks);transaction('BUY 99 USDG',b).receipt.blockHash=id('wrong receipt');
  assert.throws(()=>replay(m,b),/Receipt mismatch/);
  b=copy(blocks);transaction('BUY 99 USDG',b).receipt.logs[0].removed=true;
  assert.throws(()=>replay(m,b),/Log provenance/);
  b=copy(blocks);b[2].parentHash=id('wrong parent');
  assert.throws(()=>replay(m,b),/Non-contiguous/);
  assert.throws(()=>replay({...m,entryThresholdRaw:'1'},blocks),/100 nominal/);
});

test('fork of the branch removes orphaned BUY: replay restores 99 USDG carry',()=>{
  const buy=transaction('BUY 1 USDG'),height=Number(BigInt(buy.tx.blockNumber));
  const prefix=copy(blocks.filter(b=>Number(BigInt(b.number))<height));
  const replacement={number:'0x'+height.toString(16),hash:id('replacement empty block'),parentHash:prefix.at(-1).hash,timestamp:'0x1',transactions:[]};
  const ledger=replay(m,[...prefix,replacement]);
  assert.equal(ledger.wallets[0].entriesMinted,'0');
  assert.equal(ledger.wallets[0].carryRaw,'99000000');
  assert.equal(replay(m,blocks).wallets[0].entriesMinted,'1');
});

test('an omitted operator decision or changed carry is detectable by full replay comparison',()=>{
  const good=replay(m,blocks),omitted=copy(good),forged=copy(good);
  omitted.decisions.splice(0,1);forged.wallets[0].carryRaw='1';
  assert.notEqual(hash(omitted),hash(good));assert.notEqual(hash(forged),hash(good));
});

test('calldata max/amount and pool sender alone never authorize a BUY',()=>{
  const original=transaction('BUY 99 USDG');
  let t=copy(original);t.tx.to='0x0000000000000000000000000000000000001234';
  assert.equal(decodeTransaction(m,t.tx,t.receipt)[0].reason,'NOT_DIRECT_ROUTER_CALL');
  t=copy(original);t.tx.input='0x12345678';
  assert.equal(decodeTransaction(m,t.tx,t.receipt)[0].status,'UNSUPPORTED_ROUTE');
  t=copy(original);t.tx.input=original.tx.input.slice(0,10);
  assert.equal(decodeTransaction(m,t.tx,t.receipt)[0].status,'AMBIGUOUS');
  t=copy(original);const call=EXECUTE_ABI.parseTransaction({data:t.tx.input});
  t.tx.input=EXECUTE_ABI.encodeFunctionData('execute',['0x90',call.args.inputs,call.args.deadline]);
  assert.equal(decodeTransaction(m,t.tx,t.receipt)[0].reason,'COMMAND_SEQUENCE');
});

test('missing payment, unrelated quote transfers and wrong transfer values cannot fabricate volume',()=>{
  const original=transaction('BUY 99 USDG');
  for(const change of ['missing','extra','amount']){
    const t=copy(original);
    const log=t.receipt.logs.find(l=>l.address.toLowerCase()===m.quote.toLowerCase()&&l.topics[0]===TRANSFER_ABI.getEvent('Transfer').topicHash);
    assert.ok(log);
    if(change==='missing')t.receipt.logs=t.receipt.logs.filter(l=>l!==log);
    if(change==='extra')t.receipt.logs.push({...copy(log),logIndex:'0xff'});
    if(change==='amount')log.data=coder.encode(['uint256'],[123n]);
    assert.equal(decodeTransaction(m,t.tx,t.receipt)[0].reason,'SETTLEMENT_TRANSFER_MISMATCH');
  }
});

test('wrong pool, nonempty hookData and unsupported exact-out never silently count',()=>{
  const original=transaction('BUY 99 USDG');
  for(const change of ['pool','hook','exactOut']){
    const t=copy(original),call=EXECUTE_ABI.parseTransaction({data:t.tx.input});
    const [actions,raw]=coder.decode(['bytes','bytes[]'],call.args.inputs[0]);
    const params=Array.from(raw),spec=coder.decode([SWAP_TYPE],params[0])[0].toArray(true);
    if(change==='pool')spec[0][2]+=1n;
    if(change==='hook')spec[5]='0x01';
    params[0]=coder.encode([SWAP_TYPE],[spec]);
    t.tx.input=EXECUTE_ABI.encodeFunctionData('execute',['0x10',[coder.encode(['bytes','bytes[]'],[change==='exactOut'?'0x080b0e':actions,params])],call.args.deadline]);
    assert.notEqual(decodeTransaction(m,t.tx,t.receipt)[0].status,'ELIGIBLE');
  }
});

test('registration strictly precedes Swap even within one receipt (synthetic ordered-log fixture)',()=>{
  for(const before of [true,false]){
    const branch=copy(blocks),registration=transaction('register participant',branch),buy=transaction('BUY 99 USDG',branch);
    const regLog=registration.receipt.logs.pop();
    regLog.blockHash=buy.tx.blockHash;regLog.blockNumber=buy.tx.blockNumber;
    regLog.transactionHash=buy.tx.hash;regLog.transactionIndex=buy.tx.transactionIndex;
    const swapIndex=buy.receipt.logs.findIndex(l=>l.address.toLowerCase()===m.manager.toLowerCase());
    buy.receipt.logs.splice(swapIndex+(before?0:1),0,regLog);
    buy.receipt.logs.forEach((l,i)=>{l.logIndex='0x'+i.toString(16);});
    const ledger=replay(m,branch);
    assert.equal(ledger.wallets[0].entriesMinted,before?'1':'0');
    assert.equal(ledger.wallets[0].carryRaw,before?'0':'1000000');
  }
});

test('independent RPC scan fetches all receipts and detects changed head or code',async()=>{
  const http=require('node:http');
  const {scan}=require('../scripts/replay-direct-buy.cjs');
  const fakeCode='0x6001600055',manifest=copy(m);
  for(const field of Object.keys(manifest.codeHashes))manifest.codeHashes[field]=keccak256(fakeCode);
  const receipts=new Map(blocks.flatMap(b=>b.transactions.map(t=>[t.tx.hash,t.receipt])));
  let mode='ok',headReads=0,receiptReads=0;
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    const {id:rid,method,params}=JSON.parse(body);let result;
    if(method==='eth_chainId')result='0x7a69';
    if(method==='eth_getCode')result=mode==='code'?'0x6002':fakeCode;
    if(method==='eth_getTransactionReceipt'){receiptReads++;result=receipts.get(params[0]);}
    if(method==='eth_getBlockByNumber'){
      if(BigInt(params[0])===BigInt(m.anchor.number))result={number:m.anchor.number,hash:m.anchor.hash};
      else{
        const b=blocks.find(b=>BigInt(b.number)===BigInt(params[0]));
        result={...b,transactions:params[1]?b.transactions.map(t=>t.tx):b.transactions.map(t=>t.tx.hash)};
        if(b===blocks.at(-1)&&!params[1]&&++headReads===2&&mode==='reorg')result.hash=id('new head');
      }
    }
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:rid,result}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const url='http://127.0.0.1:'+server.address().port,to=blocks.at(-1).number;
    const scanned=await scan(manifest,url,to);
    assert.equal(receiptReads,receipts.size);
    assert.equal(canonical(replay(scanned.manifest,scanned.blocks)),canonical(replay(manifest,blocks)));
    await assert.rejects(scan(manifest,url,to,{source:manifest.registry,sourceCodeHash:keccak256('0x6002')}),/lifecycle source runtime/);
    const withLifecycle=await scan(manifest,url,to,{source:manifest.registry,sourceCodeHash:keccak256(fakeCode)});
    assert.equal(withLifecycle.blocks.length,blocks.length);
    mode='code';await assert.rejects(scan(manifest,url,to),/runtime/);
    mode='reorg';headReads=0;await assert.rejects(scan(manifest,url,to),/Chain changed/);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
const publicEvidence=require('../research/pair-usdg-active-reference-2026-09-23.json');
const scheduled={...m,...publicEvidence.decoderConfig,schema:'direct-buy-v2',routeVersion:'scheduled-routes-v1',codeHashes:publicEvidence.codeHashes,
 routes:[{id:'rh-ur-10-060b0e-v1',fromBlock:0},{id:'rh-ur-10-060c0f-v1',fromBlock:60495395}]};
const publicBuys=publicEvidence.samples.filter(s=>s.decoded.some(d=>d.reason==='ACTION_SEQUENCE')).map(s=>({
 tx:publicEvidence.reads.find(r=>r.method==='eth_getTransactionByHash'&&r.params[0]===s.hash).response.result,
 receipt:publicEvidence.reads.find(r=>r.method==='eth_getTransactionReceipt'&&r.params[0]===s.hash).response.result}));
test('scheduled routes decode three public BUY receipts, gated at exact activation block',()=>{
 for(const {tx,receipt} of publicBuys){const d=decodeTransaction(scheduled,tx,receipt)[0];assert.equal(d.status,'ELIGIBLE');assert.equal(d.payer,tx.from.toLowerCase());assert(BigInt(d.grossQuoteRaw)>0n);
 const future=copy(scheduled);future.routes[1].fromBlock=Number(BigInt(receipt.blockNumber))+1;assert.equal(decodeTransaction(future,tx,receipt)[0].reason,'ROUTE_NOT_ACTIVE');
 assert.equal(decodeTransaction({...scheduled,schema:'direct-buy-v1',routeVersion:m.routeVersion,routes:undefined},tx,receipt)[0].status,'UNSUPPORTED_ROUTE');}
});
test('route policy rejects unknown, duplicate, invalid blocks and unpinned runtime; legacy replay unchanged',()=>{
 const {validateManifest}=require('../scripts/direct-buy.cjs');validateManifest(scheduled);
 for(const mutate of [x=>x.routes.push(x.routes[0]),x=>x.routes[0].id='unknown',x=>x.routes[0].fromBlock=-1,x=>x.routes[0].fromBlock='1',x=>x.codeHashes.router=id('other')]){const x=copy(scheduled);mutate(x);assert.throws(()=>validateManifest(x));}
 const upgraded={...m,schema:'direct-buy-v2',routeVersion:'scheduled-routes-v1',routes:[{id:m.routeVersion,fromBlock:0}]};
 const old=replay(m,blocks),next=replay(upgraded,blocks);assert.deepEqual(next.wallets,old.wallets);assert.deepEqual(next.decisions,old.decisions);assert.notEqual(next.manifestHash,old.manifestHash);
});
test('public route rejects malformed settlement, limits, extra commands and inconsistent transfers',()=>{
 function params(tx,change){const parsed=EXECUTE_ABI.parseTransaction({data:tx.input});const [actions,ps]=coder.decode(['bytes','bytes[]'],parsed.args.inputs[0]);const a=Array.from(ps);change(a);tx.input=EXECUTE_ABI.encodeFunctionData('execute',['0x10',[coder.encode(['bytes','bytes[]'],[actions,a])],parsed.args.deadline]);}
 const mutations=[
 ({tx})=>params(tx,p=>p[1]=coder.encode(['address','uint256'],[scheduled.quote,0n])),
 ({tx})=>params(tx,p=>p[2]=coder.encode(['address','uint256'],[scheduled.token,(1n<<256n)-1n])),
 ({tx})=>params(tx,p=>p[1]=coder.encode(['address','uint256'],[scheduled.token,1000000000000n])),
 ({tx})=>params(tx,p=>p[1]+='00'),
 ({tx})=>{tx.from=scheduled.router;},
 ({receipt})=>{receipt.status='0x0';},
 ({receipt})=>{receipt.logs.push(copy(receipt.logs.find(l=>l.address.toLowerCase()===scheduled.quote.toLowerCase())));},
 ({tx})=>{const p=EXECUTE_ABI.parseTransaction({data:tx.input});tx.input=EXECUTE_ABI.encodeFunctionData('execute',['0x1010',[p.args.inputs[0],p.args.inputs[0]],p.args.deadline]);}
 ];for(const mutate of mutations){const x=copy(publicBuys[0]);mutate(x);assert.notEqual(decodeTransaction(scheduled,x.tx,x.receipt)[0].status,'ELIGIBLE');}
});
test('route extension candidates are append-only; this is not lifecycle upgrade admission',()=>{
 const {validateRouteExtensionCandidate}=require('../scripts/direct-buy.cjs');const next={...m,schema:'direct-buy-v2',routeVersion:'scheduled-routes-v1',routes:[{id:m.routeVersion,fromBlock:0},{id:'rh-ur-10-060c0f-v1',fromBlock:70000001}]};
 validateRouteExtensionCandidate(m,next,70000000);
 assert.throws(()=>validateRouteExtensionCandidate(m,next,70000001),/announcement/);
 const changed=copy(next);changed.routes[0].fromBlock=1;assert.throws(()=>validateRouteExtensionCandidate(m,changed,70000000),/Historical/);
 assert.throws(()=>validateRouteExtensionCandidate(m,{...next,registry:next.router},70000000),/Unrelated/);
});

test('future route extension is NOT a lifecycle upgrade: old frozen and settled snapshots retain original manifest',()=>{
 const {history}=require('./fixtures/attempt-history.cjs');
 const {replayAttempts}=require('../scripts/attempt-lifecycle.cjs');
 const {validateRouteExtensionCandidate}=require('../scripts/direct-buy.cjs');
 const h=history();const draw=h.freeze('route upgrade regression','SHORT',h.head(),[h.participant(1)]);
 const next={...h.manifest,schema:'direct-buy-v2',routeVersion:'scheduled-routes-v1',routes:[{id:h.manifest.routeVersion,fromBlock:0},{id:'rh-ur-10-060c0f-v1',fromBlock:70000001}]};
 validateRouteExtensionCandidate(h.manifest,next,70000000);
 assert.deepEqual(replay(h.manifest,h.blocks).wallets,replay(next,h.blocks).wallets);
 const originalSnapshot=canonical(draw.snapshot);
 assert.doesNotThrow(()=>replayAttempts(h.manifest,h.config,h.blocks));
 assert.throws(()=>replayAttempts(next,h.config,h.blocks),/Frozen snapshot does not match replay/);
 h.terminal(draw);
 assert.doesNotThrow(()=>replayAttempts(h.manifest,h.config,h.blocks));
 assert.throws(()=>replayAttempts(next,h.config,h.blocks),/Frozen snapshot does not match replay/);
 assert.equal(canonical(draw.snapshot),originalSnapshot);
 assert.equal(require('../scripts/direct-buy.cjs').validateRouteUpgrade,undefined);
});

test('versioned BUY history preserves pending and settled snapshots, carry and inclusive route activation',()=>{
 const {history}=require('./fixtures/attempt-history.cjs');
 const {replayAttempts,domainFor,snapshotFor}=require('../scripts/attempt-lifecycle.cjs');
 const h=history();h.buy(99000000n);
 const old=h.freeze('policy old Short','SHORT',h.head(),[h.participant(1)]);
 const month=h.freeze('policy old Monthly','MONTHLY',h.head(),[h.participant(1)]);
 const announcement=h.head(),activation=announcement.blockNumber+2;
 const next={...copy(h.manifest),schema:'direct-buy-v2',routeVersion:'scheduled-routes-v1',routes:[{id:h.manifest.routeVersion,fromBlock:0},{id:'rh-ur-10-060c0f-v1',fromBlock:activation}]};
 const policy={schema:'buy-policy-history-v1',versions:[{fromBlock:Number(BigInt(h.manifest.anchor.number)),manifest:copy(h.manifest)},{fromBlock:activation,announcedAtBlock:announcement.blockNumber,announcedBlockHash:announcement.blockHash,manifest:next}]};
 function newBuy(){h.buy(1000000n);const tx=h.blocks.at(-1).transactions[0].tx;const p=EXECUTE_ABI.parseTransaction({data:tx.input});const [,params]=coder.decode(['bytes','bytes[]'],p.args.inputs[0]);tx.input=EXECUTE_ABI.encodeFunctionData('execute',['0x10',[coder.encode(['bytes','bytes[]'],['0x060c0f',[params[0],coder.encode(['address','uint256'],[h.manifest.quote,1000000n]),coder.encode(['address','uint256'],[h.manifest.token,1n])]])],p.args.deadline]);}
 const baseline=replayAttempts(h.manifest,h.config,h.blocks);
 newBuy();assert.equal(h.head().blockNumber,activation-1);
 newBuy();assert.equal(h.head().blockNumber,activation);
 let ledger=replayAttempts(policy,h.config,h.blocks);
 assert.deepEqual(ledger.draws,baseline.draws);
 assert.equal(ledger.buyLedger.wallets[0].entriesMinted,'2');assert.equal(ledger.buyLedger.wallets[0].carryRaw,'0');
 assert.equal(ledger.buyLedger.decisions.at(-2).status,'UNSUPPORTED_ROUTE');assert.equal(ledger.buyLedger.decisions.at(-1).status,'ELIGIBLE');
 h.terminal(old);h.terminal(month);
 const cutoff=h.head(),drawId=id('policy new Short'),rulesHash=id('test SHORT rules');
 const snapshot=snapshotFor(domainFor(policy,h.config,cutoff.blockNumber),drawId,'SHORT',cutoff,rulesHash,[h.participant(1,2)]);
 h.freeze('policy new Short','SHORT',cutoff,[h.participant(1,2)],{snapshotHash:hash(snapshot)});
 ledger=replayAttempts(policy,h.config,h.blocks);
 assert.equal(ledger.draws[0].snapshotHash,old.snapshotHash);assert.equal(ledger.draws[1].snapshotHash,month.snapshotHash);
 assert.equal(ledger.draws[0].status,'CONSUMED');assert.deepEqual(ledger.draws[2].snapshot,snapshot);
 assert.equal(ledger.draws[2].snapshot.domain.buyManifestHash,hash(next));
 const again=replayAttempts(policy,h.config,h.blocks);assert.deepEqual(again,ledger);
 const bad=copy(policy);bad.versions[1].announcedBlockHash=id('orphan');assert.throws(()=>replayAttempts(bad,h.config,h.blocks),/Policy notice/);
 const retro=copy(policy);retro.versions[1].fromBlock=announcement.blockNumber;assert.throws(()=>replayAttempts(retro,h.config,h.blocks));
 const changed=copy(policy);changed.versions[1].manifest.routes[0].fromBlock=1;assert.throws(()=>replayAttempts(changed,h.config,h.blocks),/Historical/);
 assert.throws(()=>domainFor(policy,h.config),/Policy block required/);
});

test('FREEZE after activation keeps policy of its earlier cutoff; future versions do not rewrite it',()=>{
 const {history}=require('./fixtures/attempt-history.cjs');const {replayAttempts}=require('../scripts/attempt-lifecycle.cjs');
 const h=history(),cutoff=h.head(),activation=cutoff.blockNumber+1;
 const next={...copy(h.manifest),schema:'direct-buy-v2',routeVersion:'scheduled-routes-v1',routes:[{id:h.manifest.routeVersion,fromBlock:0},{id:'rh-ur-10-060c0f-v1',fromBlock:activation}]};
 const policy={schema:'buy-policy-history-v1',versions:[{fromBlock:Number(BigInt(h.manifest.anchor.number)),manifest:h.manifest},{fromBlock:activation,announcedAtBlock:cutoff.blockNumber,announcedBlockHash:cutoff.blockHash,manifest:next}]};
 h.empty('activation');const draw=h.freeze('delayed freeze','SHORT',cutoff,[h.participant(1)]);
 assert.equal(replayAttempts(policy,h.config,h.blocks).draws[0].snapshotHash,draw.snapshotHash);
 const bad=copy(policy);bad.versions.reverse();assert.throws(()=>replayAttempts(bad,h.config,h.blocks));
 const mismatch=copy(policy);mismatch.versions[1].manifest.routes[1].fromBlock++;assert.throws(()=>replayAttempts(mismatch,h.config,h.blocks),/activation mismatch/);
});
