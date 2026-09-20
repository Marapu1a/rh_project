// Measurement-only child client. No recovery for an unknown send; not a production worker.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {withState}=require('./local-scheduler-state.cjs'),{checkExecutionBudget}=require('./local-execution-budget.cjs');
async function step(file,kind){
 const job=JSON.parse(fs.readFileSync(file,'utf8')),url=new URL(job.rpcUrl);
 assert.equal(url.protocol,'http:');assert(['127.0.0.1','localhost','[::1]'].includes(url.hostname));assert(['SHORT','MONTHLY'].includes(kind));
 const provider=new ethers.JsonRpcProvider(job.rpcUrl,undefined,{cacheTimeout:-1});
 try{
  assert.equal((await provider.getNetwork()).chainId,31337n);
  const compiled=JSON.parse(fs.readFileSync('artifacts/compiled.json')),executor=await provider.getSigner(1),publisher=await provider.getSigner(0);
  const short=new ethers.Contract(job.short,compiled.LocalShortController.abi,executor),monthly=new ethers.Contract(job.monthly,compiled.LocalMonthlyController.abi,executor);
  return await withState(job.statePath,{schema:'calibration-boundary-v1',short:job.short,monthly:job.monthly},async(state,save)=>{
   state.gasUnits??=job.ops.network.gasUnits;save(state);
   const s=kind==='SHORT',c=s?short:monthly,j=job.jobs.find(j=>j.kind===kind);
   assert.equal(await c[s?'pendingDatasetDraw':'pendingMonth'](),j.id);
   const progress=await c[s?'settlements':'month'](j.id),index=Number(progress.nextChunk);
   const action=index<job.chunks.length?(s?'processShort':'processMonth'):(s?'finishShort':'finishMonth');
   const args=index<job.chunks.length?[j.id,index,job.chunks[index]]:[j.id];
   const overrides={type:2,maxFeePerGas:2000000000n,maxPriorityFeePerGas:0n};
   const estimate=await c[action].estimateGas(...args,overrides);
   if(estimate>BigInt(state.gasUnits[action]))state.gasUnits[action]=String(estimate);save(state);
   const request=await c[action].populateTransaction(...args,{...overrides,gasLimit:estimate});
   const report=await checkExecutionBudget({ops:{...job.ops,network:{...job.ops.network,gasUnits:state.gasUnits}},provider,short,monthly,publisher,executor,prizeExecutor:publisher,chunkSize:64,request,action,worker:'draw'});
   assert.equal(report.ready,true,JSON.stringify(report));
   const receipt=await (await c[action](...args,{...overrides,gasLimit:estimate})).wait(1,30000);
   assert.equal(receipt.status,1);assert.equal(receipt.gasPrice,2000000000n);
   return {pid:process.pid,kind,action,index,gasUsed:String(receipt.gasUsed),gasPrice:String(receipt.gasPrice),transactionHash:receipt.hash};
  });
 }finally{provider.destroy();}
}
if(require.main===module)step(process.argv[2],process.argv[3]).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={step};
