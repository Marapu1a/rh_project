const {test}=require('node:test'),assert=require('node:assert/strict'),{id}=require('ethers');
const {ABI,domainFor,snapshotFor,replayAttempts}=require('../scripts/attempt-lifecycle.cjs');
const {hash}=require('../scripts/direct-buy.cjs');
const {history,addr}=require('./fixtures/attempt-history.cjs');
const {drawIdFor,validateDrawId}=require('../scripts/draw-id.cjs');
function fixture(){
  const h=history();Object.assign(h.config,{schema:'attempt-lifecycle-v3',monthlySource:addr(901),monthlySourceCodeHash:id('month code'),
    monthlyInstanceId:id('month instance'),vault:addr(902),vaultCodeHash:id('vault code'),
    shortRules:{rulesHash:id('short rules'),noticeSeconds:'10',startedAt:'0',firstBlock:'0'},
    monthlyPolicy:{rulesHash:id('month rules'),interval:'30',startedAt:'0'}});
  h.run=()=>replayAttempts(h.manifest,h.config,h.blocks);
  h.freezeDual=(name,kind,cutoff=h.head(),ps=[h.participant(1)],source)=>{
    const drawId=drawIdFor(kind,id(name)),rulesHash=kind==='SHORT'?h.config.shortRules.rulesHash:h.config.monthlyPolicy.rulesHash;
    const snapshot=snapshotFor(domainFor(h.manifest,h.config),drawId,kind,cutoff,rulesHash,ps,1),snapshotHash=hash(snapshot);
    const emitter=source||(kind==='SHORT'?h.config.source:h.config.monthlySource);
    h.append(name,emitter,'0x',[h.log(ABI,'AttemptsFrozen',[drawId,kind==='SHORT'?0:1,cutoff.blockNumber,cutoff.blockHash,rulesHash,snapshotHash],emitter)]);
    return {drawId,kind,snapshotHash};
  };
  h.consume=d=>{const emitter=d.kind==='SHORT'?h.config.source:h.config.monthlySource;
    h.append('consume '+d.drawId,emitter,'0x',[h.log(ABI,'AttemptsConsumed',[d.drawId,d.kind==='SHORT'?0:1,d.snapshotHash,0,id('result')],emitter)]);};
  return h;
}
test('dual replay independently freezes and consumes both sources; new BUY remains open',()=>{
  const h=fixture(),cutoff=h.head(),s=h.freezeDual('short','SHORT',cutoff),m=h.freezeDual('month','MONTHLY',cutoff);
  assert.equal(h.run().pending.MONTHLY,m.drawId);h.buy(100_000000n);h.consume(s);
  let ledger=h.run(),w=ledger.wallets.find(w=>w.wallet===h.wallet);
  assert.equal(ledger.pending.SHORT,null);assert.equal(ledger.pending.MONTHLY,m.drawId);
  assert.equal(w.SHORT.consumedTotal,'1');assert.equal(w.MONTHLY.consumedTotal,'0');
  const before=structuredClone(h.blocks);h.consume(m);ledger=h.run();w=ledger.wallets.find(w=>w.wallet===h.wallet);
  assert.equal(w.MONTHLY.consumedTotal,'1');assert.equal(w.SHORT.open,'1');assert.equal(w.MONTHLY.open,'1');
  assert.equal(ledger.schema,'attempt-ledger-v3');h.blocks.splice(0,h.blocks.length,...before);
  assert.equal(h.run().pending.MONTHLY,m.drawId);
});
test('dual replay rejects wrong capability, global identity reuse and monthly early restart',()=>{
  let h=fixture();h.freezeDual('wrong','MONTHLY',h.head(),[h.participant(1)],h.config.source);
  assert.throws(()=>h.run(),/Wrong source/);
  h=fixture();const cutoff=h.head();h.freezeDual('same','SHORT',cutoff);h.freezeDual('same','SHORT',cutoff);
  assert.throws(()=>h.run(),/used|Duplicate|duplicate/);
  h=fixture();const m=h.freezeDual('month','MONTHLY');h.consume(m);h.buy(100_000000n);
  h.freezeDual('too soon','MONTHLY',h.head(),[h.participant(1,2)]);assert.throws(()=>h.run(),/Monthly|monthly/);
});

test('same payload across kinds survives both freeze orders and terminal replay; wrong prefix rejected',()=>{
  for(const order of [['SHORT','MONTHLY'],['MONTHLY','SHORT']]){
    const h=fixture(),cutoff=h.head(),a=h.freezeDual('same payload',order[0],cutoff),b=h.freezeDual('same payload',order[1],cutoff);
    assert.notEqual(a.drawId,b.drawId);assert.equal(BigInt(a.drawId)^BigInt(b.drawId),1n<<255n);
    h.consume(b);h.consume(a);assert.equal(h.run().draws.length,2);
    for(const kind of order)assert.equal(h.run().wallets.find(w=>w.wallet===h.wallet)[kind].consumedTotal,'1');
  }
  const h=fixture(),m=h.freezeDual('wrong prefix','MONTHLY'),log=h.blocks.at(-1).transactions[0].receipt.logs[0];
  const args=ABI.parseLog(log).args.toArray();args[0]=drawIdFor('SHORT',m.drawId);
  Object.assign(log,ABI.encodeEventLog(ABI.getEvent('AttemptsFrozen'),args));assert.throws(()=>h.run(),/namespace/);
  const t=fixture(),draw=t.freezeDual('terminal prefix','MONTHLY');t.consume(draw);
  const terminal=t.blocks.at(-1).transactions[0].receipt.logs[0],terminalArgs=ABI.parseLog(terminal).args.toArray();
  terminalArgs[0]=drawIdFor('SHORT',draw.drawId);
  Object.assign(terminal,ABI.encodeEventLog(ABI.getEvent('AttemptsConsumed'),terminalArgs));assert.throws(()=>t.run(),/namespace/);
  assert.throws(()=>validateDrawId('0x'+'00'.repeat(32),'SHORT'),/payload/);
});
test('dual domain binds both deployments, immutable policy and vault; no silent v2 downgrade',()=>{
  const h=fixture();h.freezeDual('short','SHORT');h.config.monthlySourceCodeHash=id('replacement');
  assert.throws(()=>h.run(),/snapshot|Snapshot/);
  h.config.schema='attempt-lifecycle-v2';assert.throws(()=>h.run(),/require lifecycle v3/);
});
