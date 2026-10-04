// Offline copy to a new index identity, after full-range RPC audit including new source.
const fs=require('fs'),D=require('./direct-buy.cjs'),P=require('./project-history.cjs'),R=require('./purchase-recognition.cjs'),L=require('./attempt-lifecycle.cjs'),C=require('./indexer-checksum.cjs');
const check=(v,m)=>{if(!v)throw Error('Recognition migration: '+m);};
function migrate({config,state,nextConfig,audit}){
 const {checksum,...stored}=state;check(C.validIndexerChecksum(stored,checksum)&&stored.configHash===D.hash({kind:'persistent-buy-indexer-v1',config}),'source identity');
 check(!config.recognition&&nextConfig.recognition,'first attachment only');R.trust(nextConfig.recognition);
 const {recognition,...next}=nextConfig,base=structuredClone(config);next.indexer={...next.indexer,statePath:config.indexer.statePath};check(D.hash(next)===D.hash(base),'unrelated config change');
 check(audit.matched&&audit.stateChecksum===checksum&&audit.configHash===stored.configHash&&audit.head===state.index.head&&audit.headHash===state.index.blocks.at(-1).hash&&audit.fromBlock===Number(config.manifest.anchor.number)+1&&audit.addresses.includes(recognition.source.toLowerCase()),'whole history audit required');
 check(!stored.pending,'pending state');
 const before=L.replayAttempts(state.index.manifest,config.lifecycle,state.index.blocks);check(D.hash(before.buyLedger)===state.index.ledgerHash,'old ledger mismatch');
 const manifest=R.attach(state.index.manifest,recognition),blocks=P.mark(state.index.blocks,manifest,config.lifecycle,undefined,[config.buyPolicy.source,recognition.source]);
 check(!blocks.some(b=>b.transactions.some(r=>r.receipt.logs.some(l=>l.address.toLowerCase()===recognition.source.toLowerCase()))),'existing source events need separate migration');
 const after=L.replayAttempts(manifest,config.lifecycle,blocks);for(const k of ['draws','wallets','pending','transitions'])check(D.hash(before[k])===D.hash(after[k]),'changed '+k);
 const rebuilt=D.replayWithCheckpoint(manifest,blocks),result=structuredClone(stored);result.configHash=D.hash({kind:'persistent-buy-indexer-v1',config:nextConfig});
 result.index={...result.index,manifest,blocks,ledger:rebuilt.ledger,ledgerHash:D.hash(rebuilt.ledger),replayCheckpoint:rebuilt.checkpoint,replayRevision:'buy-replay-checkpoint-v3-recognition',cache:{}};
 result.index.publicObservation=null;result.index.publicProjection={state:'waiting'};result.status={state:'waiting',processedBlock:state.index.head,reason:'Recognition attached; fresh admission required'};
 result.checksum=C.indexerChecksum(result);return {state:result,report:{head:state.index.head,drawsPreserved:before.draws.length,walletsPreserved:true,waiting:after.buyLedger.decisions.filter(d=>d.status==='WAITING_RECOGNITION').length,activated:false}};
}
module.exports={migrate};
