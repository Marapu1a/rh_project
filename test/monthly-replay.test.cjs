const {test}=require('node:test'),assert=require('node:assert/strict'),{id}=require('ethers');
const {history,addr}=require('./fixtures/attempt-history.cjs'),{normalRules}=require('./fixtures/short-outcome.cjs');
const {ABI,replayAttempts,domainFor,emptyMonthlyEpochHash}=require('../scripts/attempt-lifecycle.cjs');
const dataset=require('../scripts/monthly-dataset.cjs'),short=require('../scripts/short-dataset.cjs'),outcome=require('../scripts/short-outcome.cjs');
const {drawIdFor}=require('../scripts/draw-id.cjs');
const nextRules={...normalRules,pNumerator:1,pDenominator:2};
function fixture(){
  const h=history();Object.assign(h.config,{schema:'attempt-lifecycle-v4',monthlySource:addr(901),monthlySourceCodeHash:id('month code'),monthlyInstanceId:id('month instance'),
    vault:addr(902),vaultCodeHash:id('vault code'),shortRules:{rulesHash:short.rulesHash(normalRules,[7,5,3],1),noticeSeconds:'10',startedAt:'0',firstBlock:'0'},
    monthlyPolicy:{rulesHash:outcome.rulesHash(normalRules),interval:'30',startedAt:'0'},monthlyRules:{noticeSeconds:'10',firstBlock:'0'}});
  const run=()=>replayAttempts(h.manifest,h.config,h.blocks),time=()=>Number(BigInt(h.blocks.at(-1).timestamp));
  const emit=(name,args,source=h.config.monthlySource)=>h.append(name,source,'0x',[h.log(ABI,name,args,source)]);
  const wait=(s=31)=>{h.empty('time');h.blocks.at(-1).timestamp='0x'+(BigInt(time())+BigInt(s)).toString(16);};
  const announce=(epoch=2,rules=nextRules)=>emit('MonthlyRulesAnnounced',[epoch,outcome.rulesHash(rules),time()+11]);
  const activate=(old=1,next=2)=>emit('MonthlyRulesActivated',[old,next,h.head().blockNumber+2]);
  const input=(epoch=1,rules=normalRules)=>({manifest:h.manifest,lifecycle:h.config,blocks:h.blocks,rules,
    request:{drawId:drawIdFor('MONTHLY',id('month '+h.head().blockNumber)),campaign:1,rulesEpoch:epoch,cutoff:h.head().blockNumber,cutoffHash:h.head().blockHash}});
  const artifact=(epoch=1,rules=normalRules)=>dataset.buildFromHistory(input(epoch,rules));
  const freeze=a=>{const r=a.request;emit('AttemptsFrozen',[r.drawId,1,r.cutoff,r.cutoffHash,a.snapshot.rulesHash,r.snapshotHash]);return a;};
  const consume=a=>emit('AttemptsConsumed',[a.request.drawId,1,a.request.snapshotHash,0,id('result')]);
  const empty=(epoch=1,rules=normalRules)=>{const cutoff=h.head(),snapshot=emptyMonthlyEpochHash(domainFor(h.manifest,h.config),epoch,cutoff,outcome.rulesHash(rules));
    emit('MonthlyEpochEmpty',[epoch,cutoff.blockNumber,cutoff.blockHash,snapshot]);};
  return {h,run,time,emit,wait,announce,activate,artifact,freeze,consume,empty,input};
}
test('Monthly v4 old/new ranges, carry and fresh cutoff; old terminal consumes neither new Monthly nor Short',()=>{
  const x=fixture();x.h.buy(99_000000n);x.announce();x.wait();x.activate();
  x.h.buy(1_000000n);for(let i=0;i<260;i++)x.h.empty('later '+i);
  const w=x.run().wallets.find(w=>w.wallet===x.h.wallet);
  assert.deepEqual(w.MONTHLY.byEpoch.map(e=>e.open),['1','1']);assert.equal(w.SHORT.byEpoch[0].open,'2');
  assert.throws(()=>x.artifact(2,nextRules),/target epoch/);
  const old=x.artifact();assert.equal(old.request.attempts,'1');assert.equal(old.snapshot.participants[0].lastAttempt,'1');
  x.freeze(old);x.h.buy(100_000000n);x.consume(old);const done=x.run(),wallet=done.wallets.find(w=>w.wallet===x.h.wallet);
  assert.equal(done.monthlyRules.drainingEpoch,0);assert.equal(done.shortRules.currentEpoch,1);
  assert.deepEqual(wallet.MONTHLY.byEpoch.map(e=>[e.open,e.consumed]),[['0','1'],['2','0']]);assert.equal(wallet.SHORT.open,'3');
  const branch=structuredClone(x.h.blocks),next=x.artifact(2,nextRules);assert.equal(next.snapshot.participants[0].firstAttempt,'2');
  x.freeze(next);assert.throws(x.run,/schedule/);x.h.blocks.splice(0,x.h.blocks.length,...branch);x.wait();x.freeze(x.artifact(2,nextRules));
  assert.equal(x.run().schema,'attempt-ledger-v4');
});
test('Monthly activation block mints remain old, B+1 new; reorg restores epochs and attempts',()=>{
  const x=fixture();x.announce();x.wait();const checkpoint=structuredClone(x.h.blocks);
  const block=x.h.buy(100_000000n),receipt=block.transactions[0].receipt;
  const event=x.h.log(ABI,'MonthlyRulesActivated',[1,2,x.h.head().blockNumber+1],x.h.config.monthlySource);
  receipt.logs.push({...receipt.logs[0],...event,logIndex:'0x'+receipt.logs.length.toString(16)});
  x.h.buy(100_000000n);let w=x.run().wallets.find(w=>w.wallet===x.h.wallet);assert.deepEqual(w.MONTHLY.byEpoch.map(e=>e.open),['2','1']);
  x.h.blocks.splice(0,x.h.blocks.length,...checkpoint);x.h.buy(100_000000n);const back=x.run();
  assert.equal(back.monthlyRules.currentEpoch,1);assert.equal(back.monthlyRules.announced.epoch,2);
  assert.equal(back.wallets.find(w=>w.wallet===x.h.wallet).MONTHLY.byEpoch.length,1);
});
test('false Monthly EMPTY is rejected; verified empty preserves clock and allows immediate new freeze',()=>{
  const bad=fixture();bad.announce();bad.wait();bad.activate();bad.h.empty('boundary complete');bad.empty();assert.throws(bad.run,/not empty/);
  const x=fixture(),old=x.freeze(x.artifact());x.consume(old);const terminal=x.run().monthlyRules.lastTerminalAt;
  x.announce();x.wait();x.activate();x.h.buy(100_000000n);
  const artifact=x.artifact();assert.equal(artifact.schema,'monthly-empty-epoch-artifact-v1');assert.equal(artifact.epoch,'1');
  const before=x.run().wallets.find(w=>w.wallet===x.h.wallet).MONTHLY;
  x.empty();assert.equal(x.run().monthlyRules.lastTerminalAt,terminal);
  assert.equal(x.run().wallets.find(w=>w.wallet===x.h.wallet).MONTHLY.open,before.open);
  x.freeze(x.artifact(2,nextRules));assert(x.run().pending.MONTHLY);
});
test('Monthly replay rejects early/retroactive activation, overwrite, third version, pending activation and wrong emitter',()=>{
  let x=fixture();x.announce();x.activate();assert.throws(x.run,/notice/);
  x=fixture();x.announce();x.wait();x.emit('MonthlyRulesActivated',[1,2,x.h.head().blockNumber]);assert.throws(x.run,/Retroactive/);
  x=fixture();x.announce();x.announce();assert.throws(x.run,/announcement/);
  x=fixture();x.announce();x.wait();x.activate();x.emit('MonthlyRulesAnnounced',[3,id('third'),x.time()+11]);assert.throws(x.run,/announcement/);
  x=fixture();x.announce();x.wait();x.freeze(x.artifact());x.activate();assert.throws(x.run,/activation/);
  x=fixture();x.emit('MonthlyRulesAnnounced',[2,outcome.rulesHash(nextRules),x.time()+11],x.h.config.source);assert.throws(x.run,/source/);
  x=fixture();x.announce();x.h.config.schema='attempt-lifecycle-v3';assert.throws(x.run,/require lifecycle v4/);
});
test('Short and Monthly can change versions independently; wrong monthly policy cannot build an artifact',()=>{
  const x=fixture();x.emit('ShortRulesAnnounced',[2,short.rulesHash(nextRules,[7,5,3],1),x.time()+11],x.h.config.source);
  x.wait();x.emit('ShortRulesActivated',[1,2,x.h.head().blockNumber+2],x.h.config.source);x.h.buy(100_000000n);
  x.announce();x.wait();x.activate();x.h.buy(100_000000n);
  const w=x.run().wallets.find(w=>w.wallet===x.h.wallet);
  assert.deepEqual(w.SHORT.byEpoch.map(e=>e.open),['1','2']);assert.deepEqual(w.MONTHLY.byEpoch.map(e=>e.open),['2','1']);
  assert.throws(()=>x.artifact(1,nextRules),/policy/);const a=x.artifact();assert.equal(a.request.attempts,'2');
  x.freeze(a);x.consume(a);assert.equal(x.run().shortRules.drainingEpoch,1);assert.equal(x.run().monthlyRules.drainingEpoch,0);
});

test('Monthly CLI builds offline dataset or empty action with explicit provenance, and requires RPC for publication',()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rh-monthly-')),input=path.join(dir,'input.json'),output=path.join(dir,'output.json');
  const run=(extra=[])=>spawnSync(process.execPath,['scripts/verify-monthly-dataset.cjs','--input',input,'--output',output,...extra],{encoding:'utf8'});
  try{
    const x=fixture();fs.writeFileSync(input,JSON.stringify(x.input()));let result=run();assert.equal(result.status,0,result.stderr);
    let report=JSON.parse(fs.readFileSync(output));assert.deepEqual(report.artifact,x.artifact());assert.match(report.provenance,/Offline/);assert.equal(report.publication,null);
    result=run(['--publication','yes']);assert.notEqual(result.status,0);assert.match(result.stderr,/requires RPC/);
    x.consume(x.freeze(x.artifact()));x.announce();x.wait();x.activate();x.h.buy(100_000000n);
    fs.writeFileSync(input,JSON.stringify(x.input()));result=run();assert.equal(result.status,0,result.stderr);
    report=JSON.parse(fs.readFileSync(output));assert.equal(report.artifact.schema,'monthly-empty-epoch-artifact-v1');assert.equal(report.nextAction.method,'closeEmpty');
  }finally{for(const file of [input,output])if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir);}
});

test('M1 to M2 to M3 preserves cumulative ranges and late M2 OPEN; empty M2 preserves clock',()=>{
  const thirdRules={...normalRules,pNumerator:1,pDenominator:3};
  for(const residual of [true,false]){
    const x=fixture();x.announce();x.wait();x.activate();x.h.buy(100_000000n);
    x.consume(x.freeze(x.artifact()));x.wait();
    const ordinary=x.artifact(2,nextRules);assert.equal(ordinary.snapshot.participants[0].firstAttempt,'2');
    // A purchase after the chosen cutoff belongs to M2 but is not in this draw.
    if(residual)x.h.buy(100_000000n);
    x.freeze(ordinary);x.announce(3,thirdRules);x.consume(ordinary);const clock=x.run().monthlyRules.lastTerminalAt;
    x.wait();x.activate(2,3);x.h.buy(100_000000n);
    const branch=structuredClone(x.h.blocks);x.announce(4,normalRules);assert.throws(x.run,/announcement/);
    x.h.blocks.splice(0,x.h.blocks.length,...branch);
    const old=x.artifact(2,nextRules);
    if(residual){
      assert.equal(old.snapshot.participants[0].firstAttempt,'3');assert.equal(old.snapshot.participants[0].lastAttempt,'3');
      x.freeze(old);x.consume(old);assert(x.run().monthlyRules.lastTerminalAt>clock);x.wait();
    }else{
      assert.equal(old.schema,'monthly-empty-epoch-artifact-v1');x.empty(2,nextRules);
      assert.equal(x.run().monthlyRules.lastTerminalAt,clock);
    }
    const drained=x.run(),w=drained.wallets.find(w=>w.wallet===x.h.wallet);
    assert.equal(drained.monthlyRules.currentEpoch,3);assert.equal(drained.monthlyRules.drainingEpoch,0);
    assert.deepEqual(w.MONTHLY.byEpoch.map(e=>e.consumed),['1',residual?'2':'1','0']);
    assert.deepEqual(w.MONTHLY.byEpoch.map(e=>e.open),['0','0','1']);
    x.announce(4,normalRules);const final=x.artifact(3,thirdRules);
    assert.equal(final.snapshot.participants[0].firstAttempt,residual?'4':'3');
    x.consume(x.freeze(final));const done=x.run().wallets.find(w=>w.wallet===x.h.wallet);
    assert.equal(done.MONTHLY.open,'0');assert.equal(done.MONTHLY.consumedTotal,residual?'4':'3');
    assert.equal(done.SHORT.open,done.MONTHLY.mintedTotal);assert.equal(done.SHORT.consumedTotal,'0');
    assert.equal(done.MONTHLY.byEpoch.reduce((s,e)=>s+BigInt(e.consumed)+BigInt(e.open)+BigInt(e.frozen),0n),BigInt(done.MONTHLY.mintedTotal));
  }
});
