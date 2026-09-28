const {test}=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const network=require('../scripts/runtime-network.cjs');
test('public CLI has no execute switch and rehearsal rejects remote RPC before reading config',()=>{
 for(const args of [['--mode','execute','--config','missing','--state','missing','--rpc','https://example.invalid'],['--mode','rehearsal','--config','missing','--state','missing','--rpc','https://example.invalid'],['--mode','inspect','--config','missing','--state','missing','--rpc','http://example.invalid']]){
  const r=spawnSync(process.execPath,['scripts/run-robinhood-automation.cjs',...args],{encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/configuration or transport failure/);assert(!r.stderr.includes('ENOENT'));
 }
});
test('rehearsal rejects wrong chain and remote transport without contacting that endpoint',async()=>{
 const provider={getNetwork:async()=>({chainId:31337n})};
 await assert.rejects(network.withRobinhoodNetwork({provider,rpcUrl:'http://127.0.0.1:1',mode:'robinhood-rehearsal'},()=>{}),/4663/);
 await assert.rejects(network.withRobinhoodNetwork({provider,rpcUrl:'https://example.invalid',mode:'robinhood-rehearsal'},()=>{}),/Loopback/);
 assert.equal(network.current().chainId,31337n);
});
