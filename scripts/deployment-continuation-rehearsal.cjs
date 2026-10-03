// Exercises the same dynamic wallet queue locally, including unknown-send recovery.
process.env.HARDHAT_CONFIG=require.resolve('../test/fixtures/pons-wallet-cycle-hardhat.config.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers:E}=require('ethers'),hre=require('hardhat');
async function main(){
 const [planFile,journal,output]=process.argv.slice(2);assert(output&&!fs.existsSync(output)&&!fs.existsSync(journal));
 const plan=JSON.parse(fs.readFileSync(planFile)),compiled=require('./compile.cjs').compile(),settings=require('../config/pons-deployment-candidate.json');
 const remote=new E.JsonRpcProvider(process.env.RH_FORK_RPC_URL);let proxy;
 const report={publicSends:0,status:'RUNNING',transactions:[],assumptions:['Local fork, impersonated governor, synthetic ETH, ArbSys shim','Preflight callback mocked; live preflight is a separate check','No real wallet signatures; launch anchor/runtime/receipts verified by production queue']};
 const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');save();
 try{
  const anchor=await remote.getBlock('latest');assert.equal((await remote.getNetwork()).chainId,4663n);assert.equal(await remote.getTransactionCount(plan.governor,'pending'),plan.startNonce);report.forkBlock=anchor.number;
  proxy=await require('./read-only-fork-rpc.cjs').startReadProxy(process.env.RH_FORK_RPC_URL);
  await proxy.pinEmptyStorage(E.getCreateAddress({from:plan.governor,nonce:plan.startNonce+1}),anchor.number);
  const rpc=(m,p=[])=>hre.network.provider.send(m,p);
  await rpc('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url,blockNumber:anchor.number}}]);await rpc('evm_mine');
  await rpc('hardhat_setCode',['0x0000000000000000000000000000000000000064','0x'+compiled.PublicArbSysFixture.evm.deployedBytecode.object]);
  await rpc('hardhat_impersonateAccount',[plan.governor]);await rpc('hardhat_setBalance',[plan.governor,E.toQuantity(E.parseEther('1'))]);
  const provider=new E.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1}),signer=new E.JsonRpcSigner(provider,plan.governor);
  const create=()=>{const strategy=require('./deployment-continuation.cjs').createStrategy({plan,provider,compiled,settings,preflight:async()=>({status:'snapshotMatched',launch:{economics:plan.prefix.economics,feeWei:plan.prefix.launchFeeWei}})});return require('./deployment-signing-queue.cjs').create({plan,file:journal,provider,allowSend:true,strategy,check:strategy.check});};
  let queue=create();
  for(let i=0;i<4;i++){
   const prepared=await queue.prepare(),request=await queue.arm(prepared.id);queue=create();await assert.rejects(queue.prepare(),/Unresolved/);
   const {gas,...tx}=request,submitted=await signer.sendTransaction({...tx,gasLimit:BigInt(gas)});await submitted.wait();
   const result=await queue.submitted(submitted.hash);assert.equal(result.completed,i+1);queue=create();assert.equal((await queue.refresh()).completed,i+1);
   report.transactions.push({label:prepared.label,nonce:Number(BigInt(request.nonce)),summary:prepared.summary,hash:submitted.hash});save();
  }
  await assert.rejects(queue.prepare(),/Prefix complete/);report.status='PASSED';report.restartAfterIntent=4;report.restartAfterReceipt=4;save();console.log(JSON.stringify({status:report.status,transactions:4,restarts:8,publicSends:0}));
 }catch(e){report.status='FAILED';report.error={message:String(e.shortMessage||e.message).replace(/https?:\/\/\S+/g,'[RPC]'),method:e.payload?.method,detail:String(e.error?.message||'').replace(/https?:\/\/\S+/g,'[RPC]')};save();throw Error('Queue rehearsal failed; inspect local report');}finally{remote.destroy();proxy?.close();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
