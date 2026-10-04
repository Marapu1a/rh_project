// Offline export only: never overwrites input, contacts RPC, or activates a service.
const fs=require('node:fs'),path=require('node:path');
const D=require('./direct-buy.cjs'),P=require('./project-history.cjs');
const {indexerChecksum,validIndexerChecksum}=require('./indexer-checksum.cjs');
async function migrate({config,state,destinationConfig,destinationState}){
 if(fs.existsSync(destinationConfig)||fs.existsSync(destinationState))throw Error('Migration outputs must be new');
 const {checksum,...stored}=state;
 if(!validIndexerChecksum(stored,checksum)||stored.configHash!==D.hash({kind:'persistent-buy-indexer-v1',config}))throw Error('Source identity/checksum mismatch');
 const original=stored.index,manifest=original.manifest;
 const before=D.replay(manifest,original.blocks);
 if(D.hash(before)!==original.ledgerHash||D.hash(before)!==D.hash(original.ledger))throw Error('Source ledger mismatch');
 const lifecycleBefore=config.lifecycle?D.hash(require('./attempt-lifecycle.cjs').replayAttempts(manifest,config.lifecycle,original.blocks)):null;
 const rewardsBefore=config.lifecycle?D.hash(require('./reward-observation.cjs').projectRewards(original.blocks,config.lifecycle.vault)):null;
 // References must be extracted before dropping empty historical blocks.
 await P.references(original.blocks,manifest,config.lifecycle,null,original.blocks);
 const blocks=P.compact(original.blocks,manifest,config.lifecycle,{extra:[config.buyPolicy?.source]});
 const after=D.replayWithCheckpoint(manifest,blocks);
 if(D.hash(after.ledger)!==D.hash(before))throw Error('Migrated BUY ledger mismatch');
 let lifecycleHash=null;
 if(config.lifecycle){
  const {replayAttempts}=require('./attempt-lifecycle.cjs');
  lifecycleHash=lifecycleBefore;
  if(lifecycleHash!==D.hash(replayAttempts(manifest,config.lifecycle,blocks)))throw Error('Migrated lifecycle mismatch');
  const {projectRewards}=require('./reward-observation.cjs');
  if(rewardsBefore!==D.hash(projectRewards(blocks,config.lifecycle.vault)))throw Error('Migrated rewards mismatch');
 }
 const next=structuredClone(config);next.indexer={...next.indexer,statePath:path.resolve(destinationState),scanMode:P.SCHEMA};
 stored.configHash=D.hash({kind:'persistent-buy-indexer-v1',config:next});
 stored.index={...original,blocks,cache:{},ledger:after.ledger,replayCheckpoint:after.checkpoint,evidenceMode:P.SCHEMA};
 stored.checksum=indexerChecksum(stored);
 fs.mkdirSync(path.dirname(destinationState),{recursive:true});fs.mkdirSync(path.dirname(destinationConfig),{recursive:true});
 const fd=fs.openSync(destinationState,'wx',0o600);
 try{require('./indexer-json.cjs').writeIndexerJson(fd,stored);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.writeFileSync(destinationConfig,JSON.stringify(next,null,2)+'\n',{flag:'wx',mode:0o600});
 return {schema:'project-history-migration-v1',head:original.head,oldRecords:original.blocks.length,newRecords:blocks.length,retainedTransactions:blocks.reduce((n,b)=>n+b.transactions.length,0),ledgerHash:D.hash(before),lifecycleHash,bytes:fs.statSync(destinationState).size,trust:'rpc-selected-project-events; gaps are not independently proven',activated:false};
}
if(require.main===module){const [c,s,dc,ds]=process.argv.slice(2);Promise.resolve().then(()=>{if(!c||!s||!dc||!ds)throw Error('CONFIG STATE NEW_CONFIG NEW_STATE required');return migrate({config:JSON.parse(fs.readFileSync(c)),state:JSON.parse(fs.readFileSync(s)),destinationConfig:dc,destinationState:ds});}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={migrate};
