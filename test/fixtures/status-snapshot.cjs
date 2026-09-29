const fs=require('node:fs'),path=require('node:path');
const {history}=require('./attempt-history.cjs');
const {hash}=require('../../scripts/direct-buy.cjs');
const {replayAttempts}=require('../../scripts/attempt-lifecycle.cjs');
function fixture(dir,extra=0){
 const h=history();for(let i=0;i<extra;i++)h.empty('load '+i);
 const config={manifest:h.manifest,lifecycle:h.config,indexer:{statePath:path.join(dir,'state.json'),maxAgeSeconds:60}};
 const ledger=replayAttempts(h.manifest,h.config,h.blocks);
 const state={configHash:hash({kind:'persistent-buy-indexer-v1',config}),index:{head:ledger.head.number,observedAt:new Date().toISOString(),blocks:h.blocks,manifest:h.manifest,ledgerHash:hash(ledger.buyLedger),rewards:null,policyStatus:{mode:'admitted'}},status:{state:'caughtUp',targetBlock:ledger.head.number}};
 function write(){fs.writeFileSync(config.indexer.statePath+'.tmp',JSON.stringify({...state,checksum:hash(state)}));fs.renameSync(config.indexer.statePath+'.tmp',config.indexer.statePath);}
 write();return {config,state,write,wallet:h.wallet};
}
module.exports={fixture};
