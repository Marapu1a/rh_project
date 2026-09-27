const {test}=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {validateOps,ACTIONS}=require('../scripts/short-automation.cjs');
test('Short automation CLI rejects public RPC, duplicate and invalid account before accessing keys',()=>{
 for(const args of [['--config','absent','--state','absent','--rpc','https://example.com'],['--config','absent','--state','absent','--rpc','http://127.0.0.1:8545','--executor','-1'],['--watch','--watch']]){
  const r=spawnSync(process.execPath,['scripts/run-short-automation.cjs',...args],{encoding:'utf8',windowsHide:true});assert.equal(r.status,1);assert.match(r.stderr,/Loopback|Invalid executor|Duplicate/);
 }
});
test('Short automation profile requires bounded actions, coherent gas ceiling and positive work limits',()=>{
 const o={schema:'local-short-automation-v1',maxGasPrice:'1',reserveGasPrice:'2',nativeFloor:'0',extraFeePerTx:'0',safetyBps:12000,maxTransactions:16,maxClaims:8,scanBlocks:100,pollSeconds:3,gasUnits:Object.fromEntries(ACTIONS.map(a=>[a,'3000000']))};assert.equal(validateOps(o),o);
 for(const patch of [{maxGasPrice:'3'},{maxClaims:0},{scanBlocks:2001},{safetyBps:9999},{gasUnits:{}}])assert.throws(()=>validateOps({...o,...patch}));
});

test('Dual automation requires Monthly gas bounds and keeps both CLI entrypoints local',()=>{
 const {MONTHLY_ACTIONS}=require('../scripts/promo-automation.cjs');
 const o={schema:'local-promo-automation-v1',maxGasPrice:'1',reserveGasPrice:'2',nativeFloor:'0',extraFeePerTx:'0',safetyBps:12000,maxTransactions:16,maxClaims:8,scanBlocks:100,pollSeconds:3,gasUnits:Object.fromEntries(ACTIONS.map(a=>[a,'3000000']))};
 assert.throws(()=>validateOps(o),/Missing gas bound/);for(const a of MONTHLY_ACTIONS)o.gasUnits[a]='3000000';assert.equal(validateOps(o),o);
 const r=spawnSync(process.execPath,['scripts/run-promo-automation.cjs','--config','absent','--state','absent','--rpc','https://example.com'],{encoding:'utf8',windowsHide:true});assert.equal(r.status,1);assert.match(r.stderr,/Loopback/);
});
