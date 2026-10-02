// CLI regression with a synthetic saved lifecycle snapshot, not live admission.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{hash}=require('../scripts/direct-buy.cjs');
test('standalone verifier uses writer config in a fresh process and never changes snapshot',t=>{
 const dir=fs.mkdtempSync(path.resolve('.local/logs/verifier-'));t.after(()=>{for(const f of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,f));fs.rmdirSync(dir);});
 const f=require('./fixtures/status-snapshot.cjs').fixture(dir);
 const config={...f.config,lifecycle:{...f.config.lifecycle,vault:'0x'+'9'.repeat(40)},executor:f.wallet,buyPolicy:{genesisHash:hash(f.config.manifest),instanceId:f.config.lifecycle.instanceId,chainId:f.config.manifest.chainId}};
 const scheduler=require('../scripts/pons-automation.cjs').schedulerConfigFor(config),indexConfig=require('../scripts/shared-index-config.cjs').buildIndexConfigs(scheduler).indexConfig;
 f.state.configHash=hash({kind:'persistent-buy-indexer-v1',config:indexConfig});
 f.state.index.rewards={...require('../scripts/reward-observation.cjs').projectRewards(f.state.index.blocks,config.lifecycle.vault),blockTag:'0x'+BigInt(f.state.index.head).toString(16)};f.write();
 const ledger=require('../scripts/attempt-lifecycle.cjs').replayAttempts(config.manifest,config.lifecycle,f.state.index.blocks);
 const report=path.join(dir,'report.json'),output=path.join(dir,'result.json');fs.writeFileSync(report,JSON.stringify({cycle:{automation:{config},finalLedger:ledger}}));
 const before=fs.readFileSync(config.indexer.statePath);
 execFileSync(process.execPath,['scripts/verify-pons-wallet-api.cjs',report,output],{timeout:20000,stdio:'pipe'});
 const result=JSON.parse(fs.readFileSync(output));assert.equal(result.status,'PONS_SAVED_CYCLE_HTTP_PASSED');assert.deepEqual(result.results[0],result.results[1]);assert(fs.readFileSync(config.indexer.statePath).equals(before));
 // Old scheduler-only identity is rejected, never silently relabelled by the verifier.
 f.state.configHash=hash({kind:'persistent-buy-indexer-v1',config:scheduler});f.write();const old=fs.readFileSync(config.indexer.statePath);
 assert.throws(()=>execFileSync(process.execPath,['scripts/verify-pons-wallet-api.cjs',report,path.join(dir,'bad.json')],{timeout:20000,stdio:'pipe'}),e=>String(e.stderr).includes('snapshot invalid'));
 assert(fs.readFileSync(config.indexer.statePath).equals(old));
});
