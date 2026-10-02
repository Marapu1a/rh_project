// Verify an existing indexed Pons cycle through the real HTTP/worker API.
// Reads the original snapshot unchanged; never refreshes its observedAt.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {createServer,walletStatus}=require('./user-status-api.cjs');
async function verify({config,wallet,expected}){
 const before=fs.readFileSync(config.indexer.statePath);
 const state=JSON.parse(before);
 const historical=walletStatus({config,wallet,now:Date.parse(state.index.observedAt)});
 assert.equal(historical.status,'observed','snapshot invalid at its observation time');
 for(const kind of ['SHORT','MONTHLY']){
  for(const field of ['mintedTotal','open','consumedTotal'])assert.equal(historical.balances[kind][field],expected[kind][field],`${kind}.${field}`);
 }
 assert(historical.purchases.total>0,'missing purchases');
 assert(historical.rewards,'missing rewards projection');
 const results=[];
 // New HTTP server/worker on each iteration exercises process-local cache restart.
 for(let i=0;i<2;i++){
  const server=createServer(config);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
   const url=`http://127.0.0.1:${server.address().port}/v1/wallets/${wallet}`;
   const response=await fetch(url);assert.equal(response.status,200);
   const body=await response.json();
   assert.deepEqual(body.balances,historical.balances);
   assert.deepEqual(body.rewards,historical.rewards);
   assert.equal(body.provenance.ledgerHash,historical.provenance.ledgerHash);
   const page=await(await fetch(url+'?limit=1')).json();
   assert.equal(page.purchases.items.length,1);
   assert.equal(page.purchases.total,body.purchases.total);
   assert.equal((await fetch(url+'?limit=101')).status,400);
   assert.equal((await fetch(url,{method:'POST'})).status,405);
   results.push({status:body.status,head:body.provenance.head,balances:body.balances,purchases:body.purchases.total,rewards:body.rewards.total});
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
 }
 assert.deepEqual(results[0],results[1]);
 assert.deepEqual(fs.readFileSync(config.indexer.statePath),before,'verification mutated snapshot');
 return {status:'PONS_SAVED_CYCLE_HTTP_PASSED',publicSends:false,results,limits:['Reads the provided immutable snapshot; no independent chain refresh','HTTP/worker verification only; execution qualification belongs to the calling rehearsal','No browser interaction or mainnet finality proof']};
}
if(require.main===module)(async()=>{
 const [input,output]=process.argv.slice(2);assert(input&&output&&!fs.existsSync(output),'Supply cycle report and new output');
 const report=JSON.parse(fs.readFileSync(input)),cycle=report.cycle;
 const scheduler=require('./pons-automation.cjs').schedulerConfigFor(cycle.automation.config);
 const config=require('./shared-index-config.cjs').buildIndexConfigs(scheduler).indexConfig;
 const wallet=cycle.automation.config.executor;
 const expected=cycle.finalLedger.wallets.find(w=>w.wallet.toLowerCase()===wallet.toLowerCase());
 const result=await verify({config,wallet,expected});fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(result.status);
})().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={verify};
