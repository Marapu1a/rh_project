// Local-only fallback proof: existing QIANQI contracts, existing v4 decoder.
process.env.HARDHAT_CONFIG=require.resolve('../test/fixtures/pons-wallet-cycle-hardhat.config.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),E=require('ethers'),hre=require('hardhat');
async function run(out){
 assert(out&&!fs.existsSync(out)&&process.env.RH_FORK_RPC_URL);
 const proxy=await require('./read-only-fork-rpc.cjs').startReadProxy(process.env.RH_FORK_RPC_URL),rpc=(m,p=[])=>hre.network.provider.send(m,p);
 const result={schema:'pons-live-direct-accounting-rehearsal-v1',publicSends:0,localOnly:true,steps:[]};
 try{
  const remote=require('./public-rpc-qualification.cjs').httpRpc(process.env.RH_FORK_RPC_URL),head=await remote('eth_getBlockByNumber',['finalized',false]);
  await rpc('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url,blockNumber:Number(BigInt(head.number))}}]);await rpc('evm_mine');
  const m=structuredClone(require('../docs/evidence/PONS_PUBLIC_LAUNCH_2026-10-03.json').manifest),account='0x0000000000000000000000000000000000004321';
  result.fork={number:Number(BigInt(head.number)),hash:head.hash};result.token=m.token;
  await rpc('hardhat_impersonateAccount',[account]);await rpc('hardhat_setBalance',[account,E.toQuantity(E.parseEther('2'))]);
  const erc=require('./pons-direct-purchase.cjs').ERC;
  const balance=async()=>erc.decodeFunctionResult('balanceOf',await rpc('eth_call',[{to:m.quote,data:erc.encodeFunctionData('balanceOf',[account])},'latest']))[0];
  const trace=await rpc('debug_traceCall',[{to:m.quote,data:erc.encodeFunctionData('balanceOf',[account])},'latest',{disableMemory:true,disableStorage:true}]);
  let funded=false;for(const slot of [...new Set(trace.structLogs.filter(l=>l.op==='SLOAD').map(l=>'0x'+l.stack.at(-1)))]){
   const snap=await rpc('evm_snapshot');await rpc('hardhat_setStorageAt',[m.quote,slot,E.toBeHex(101000000n,32)]);
   try{if(await balance()===101000000n){funded=true;break;}}catch{}await rpc('evm_revert',[snap]);
  }assert(funded);
  const start=await rpc('eth_getBlockByNumber',['latest',false]);m.anchor={number:Number(BigInt(start.number)),hash:start.hash};
  result.localAnchor=m.anchor;result.productionAnchorChanged=false;
  const meta=await rpc('hardhat_metadata');
  await require('./pons-direct-purchase-rehearsal.cjs').purchase({rpc,instanceId:meta.instanceId,manifest:m,account,amountRaw:'101000000',onStep:async({plan,hash})=>result.steps.push({kind:plan.kind,venue:plan.venue,hash})});
  const last=Number(BigInt(await rpc('eth_blockNumber'))),blocks=[];
  for(let n=m.anchor.number+1;n<=last;n++){
   const b=await rpc('eth_getBlockByNumber',[E.toQuantity(n),true]);blocks.push({number:n,hash:b.hash,parentHash:b.parentHash,timestamp:b.timestamp,transactions:await Promise.all(b.transactions.map(async tx=>({tx,receipt:await rpc('eth_getTransactionReceipt',[tx.hash])})))});
  }
  const D=require('./direct-buy.cjs'),ledger=D.replay(m,blocks),wallet=ledger.wallets.find(w=>w.wallet===account);
  assert(wallet);assert.equal(wallet.entriesMinted,'1');assert.equal(wallet.shortAttemptsMinted,'1');assert.equal(wallet.monthlyAttemptsMinted,'1');assert.equal(wallet.carryRaw,'1000000');
  assert.equal(D.hash(D.replay(m,JSON.parse(JSON.stringify(blocks)))),D.hash(ledger));
  const first=D.replayWithCheckpoint(m,blocks.slice(0,1));const continued=D.replayWithCheckpoint(m,blocks.slice(1),first);
  assert.deepEqual(continued.ledger,ledger);
  assert.deepEqual(D.replay(m,[...blocks,blocks.at(-1)]),ledger);
  const conflict=structuredClone(blocks.at(-1));conflict.hash=E.id('conflicting delivery');
  let rejected=false;try{D.replay(m,[...blocks,conflict]);}catch{rejected=true;}assert(rejected);
  result.status='PASSED';result.wallet=wallet;result.decisions=ledger.decisions;result.restartSameLedger=true;result.checkpointContinuationSameLedger=true;result.duplicateDeliveryIdempotent=true;result.conflictingBlockRejected=true;
  result.limits=['Synthetic USDG/ETH and local impersonation only','Anchor changed only in local manifest for isolated rehearsal; no production policy changes','Existing direct planner and v4 accounting; not public browser activation'];
  fs.writeFileSync(out+'.replay.json',JSON.stringify({manifest:m,blocks,ledger},null,2)+'\n',{flag:'wx'});
  if(process.argv[3]){
   const config=JSON.parse(fs.readFileSync(process.argv[3]));config.manifest=m;config.publicStatus=false;
   config.indexer={statePath:require('node:path').resolve(out+'.state.json'),maxAgeSeconds:120};
   // Explicit harness assumption: isolated local manifest, not public policy admission.
   const state={configHash:D.hash({kind:'persistent-buy-indexer-v1',config}),status:{state:'caughtUp'},index:{head:last,manifest:m,blocks,ledger,ledgerHash:D.hash(ledger),observedAt:new Date().toISOString(),policyStatus:{mode:'admitted'}}};
   state.checksum=require('./indexer-checksum.cjs').indexerChecksum(state);
   fs.writeFileSync(config.indexer.statePath,JSON.stringify(state),{flag:'wx'});
   const server=require('./user-status-api.cjs').createServer(config);
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
   try{
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/v1/wallets/'+account),view=await response.json();
    assert.equal(response.status,200);assert.equal(view.status,'observed');assert.equal(view.balances.SHORT.open,'1');assert.equal(view.balances.MONTHLY.open,'1');assert.equal(view.balances.carryRaw,'1000000');
    result.walletApi={http:response.status,status:view.status,balances:view.balances,localAdmissionAssumption:true};
   }finally{await new Promise(resolve=>server.close(resolve));}
  }
 }catch(e){result.status='FAILED';result.error=String(e.message).replace(/https?:\/\/\S+/g,'[RPC]');throw e;}
 finally{result.proxyStats=proxy.stats;fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});await proxy.close();}
 return result;
}
if(require.main===module)run(process.argv[2]).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(String(e.message).replace(/https?:\/\/\S+/g,'[RPC]'));process.exitCode=1;});
