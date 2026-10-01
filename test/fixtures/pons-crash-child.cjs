// Test subprocess only: pause around a real broadcast; the parent forcibly kills us.
const fs=require('node:fs'),{ethers}=require('ethers');
const {withState}=require('../../scripts/local-scheduler-state.cjs');
const {createBoundary,reconcilePending}=require('../../scripts/pons-transaction-journal.cjs');
const {withTransactionBoundary,sendLocalTransaction}=require('../../scripts/local-receipt.cjs');
const {runDrandDelivery}=require('../../scripts/drand-delivery-worker.cjs');
const vector=require('../../research/drand-feasibility/vector.json').beacon;
const [file,stage]=process.argv.slice(2),c=JSON.parse(fs.readFileSync(file));
const provider=new ethers.JsonRpcProvider(c.rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=20;
const signer=new ethers.JsonRpcSigner(provider,c.sender);
const pause=async tx=>{setInterval(()=>{},1000);process.send({event:'window',hash:tx.hash,nonce:tx.nonce});await new Promise(()=>{});};
function instrument(real){
 const method=async(...args)=>{const tx=await real(...args);if(stage==='unknown')await pause(tx);if(stage==='known')return {hash:tx.hash,nonce:tx.nonce,wait:()=>pause(tx)};return tx;};
 method.populateTransaction=real.populateTransaction;method.fragment=real.fragment;
 method.estimateGas=c.forceRevert?async()=>30000n:real.estimateGas;return method;
}
async function main(){
 const meta=await provider.send('hardhat_metadata',[]);if(meta.instanceId!==c.instanceId||(await provider.getNetwork()).chainId!==31337n)throw Error('Wrong isolated test instance');
 let result;
 if(c.kind==='main')result=await withState(c.state,{test:'pons-crash',instanceId:c.instanceId,sender:c.sender},async(state,save)=>{
  const blocked=await reconcilePending(state,save,provider,c.sender);if(blocked)return blocked;
  if(stage==='reconcile'||stage==='resume')return {status:'resolved',receiptStatus:state.lastResolved?.status};
  const contract=new ethers.Contract(c.collector,['function pay(address)'],signer);
  const boundary=createBoundary({state,save,provider,sender:c.sender,guard:async()=>{},onConfirmed:async()=>{}});
  await withTransactionBoundary(boundary,()=>sendLocalTransaction(instrument(contract.pay),[c.recipient],{},{receiptTimeoutMs:10000}));return {status:'complete'};
 });
 else{
  const reader=new ethers.Contract(c.job.adapter,c.adapterAbi,provider),real=reader.connect(signer);
  const adapter=new Proxy(reader,{get(t,k){if(k==='connect')return ()=>({prove:instrument(real.prove),deliver:instrument(real.deliver)});return Reflect.get(t,k);}});
  result=await runDrandDelivery({provider,adapter,executor:signer,job:c.job,statePath:c.state,reconcileOnly:stage==='reconcile'},{getBeacon:async()=>vector});
 }
 process.send({event:'result',result});
}
main().catch(e=>{process.send({event:'error',message:e.message,detail:e.info?.error?.message||e.cause?.message});process.exitCode=1;}).finally(()=>{provider.destroy();process.disconnect();});
