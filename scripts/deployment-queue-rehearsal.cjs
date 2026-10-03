// Exercise the real signing queue against a fork, never against the public RPC.
process.env.HARDHAT_CONFIG=require.resolve('../test/fixtures/pons-wallet-cycle-hardhat.config.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers:E}=require('ethers'),hre=require('hardhat');
async function main(){
 const [reportFile,planFile,journal]=process.argv.slice(2);assert(reportFile&&planFile&&journal&&!fs.existsSync(journal));
 const report=JSON.parse(fs.readFileSync(reportFile)),plan=JSON.parse(fs.readFileSync(planFile));
 const remote=new E.JsonRpcProvider(process.env.RH_FORK_RPC_URL);
 let anchor;try{assert.equal((await remote.getNetwork()).chainId,4663n);anchor=await remote.getBlock('latest');assert.equal(await remote.getTransactionCount(plan.governor,anchor.number),plan.startNonce);}finally{remote.destroy();}
 const proxy=await require('./read-only-fork-rpc.cjs').startReadProxy(process.env.RH_FORK_RPC_URL);
 const rpc=(method,params=[])=>hre.network.provider.send(method,params);
 try{
  for(const step of plan.transactions)await proxy.pinEmptyStorage(step.predictedAddress,anchor.number);
  await rpc('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url,blockNumber:anchor.number}}]);await rpc('evm_mine');
  const compiled=require('./compile.cjs').compile();await rpc('hardhat_setCode',['0x0000000000000000000000000000000000000064','0x'+compiled.PublicArbSysFixture.evm.deployedBytecode.object]);
  await rpc('hardhat_impersonateAccount',[plan.governor]);await rpc('hardhat_setBalance',[plan.governor,E.toQuantity(E.parseEther('1'))]);
  const provider=new E.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1}),signer=new E.JsonRpcSigner(provider,plan.governor);
  const create=()=>require('./deployment-signing-queue.cjs').create({plan,file:journal,provider,allowSend:true,check:async()=>{assert.equal((await provider.getNetwork()).chainId,4663n);}});
  let queue=create();
  for(let i=0;i<6;i++){
   const prepared=await queue.prepare(),request=await queue.arm(prepared.id),{gas,...tx}=request;
   queue=create();await assert.rejects(queue.prepare(),/Unresolved/);
   const submitted=await signer.sendTransaction({...tx,gasLimit:BigInt(gas)});await submitted.wait();
   const result=await queue.submitted(submitted.hash);assert.equal(result.completed,i+1);
   queue=create();assert.equal((await queue.refresh()).completed,i+1);
  }
  await assert.rejects(queue.prepare(),/Prefix complete/);
  console.log(JSON.stringify({status:'PASS',forkBlock:anchor.number,localCreateTransactions:6,restartAfterIntent:6,restartAfterReceipt:6,publicSends:0,assumptions:['Local Hardhat fork, impersonated governor, synthetic ETH, ArbSys shim','Preflight callback mocked; public read-only preflight separately checked','No real MetaMask signature']}));
 }finally{proxy.close();}
}
if(require.main===module)main().catch(e=>{console.error('Local signing queue rehearsal failed: '+String(e.shortMessage||e.message).replace(/https?:\/\/\S+/g,'[RPC]'));process.exitCode=1;});
