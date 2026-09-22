// Test-only crash checkpoints. Never imported by production/runtime scripts.
const fs=require('node:fs'),{ethers}=require('ethers');
const {withState}=require('../../scripts/local-scheduler-state.cjs');
const {executeNativeRefill}=require('../../scripts/local-native-refill-executor.cjs');
async function main(){
 const [configFile,mode]=process.argv.slice(2),{rpcUrl,file,marker,input}=JSON.parse(fs.readFileSync(configFile));
 const provider=new ethers.JsonRpcProvider(rpcUrl,undefined,{cacheTimeout:-1});provider.pollingInterval=50;
 const stop=stage=>{if(mode===stage){fs.writeFileSync(marker,JSON.stringify({pid:process.pid,stage}));Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}};
 try{
  const actual=await provider.getSigner(0),signer={provider,getAddress:()=>actual.getAddress(),estimateGas:r=>actual.estimateGas(r),
   sendTransaction:async r=>{const tx=await actual.sendTransaction(r);stop('sent');return tx;}};
  const result=await withState(file,{fixture:'refill-process-v1'},(state,save)=>executeNativeRefill({provider,signer,state,input,
   save:next=>{
    const completed=!next.pending&&next.nativeRefillHistory?.lastNonce!=null;
    if(completed)stop('receipt');
    save(next);
    if(next.pending?.stage==='prepared')stop('prepared');
    if(next.pending?.stage==='broadcast')stop('hashed');
    if(completed)stop('finalized');
   }}));
  console.log(JSON.stringify(result));
 }finally{provider.destroy();}
}
main().catch(e=>{console.log(JSON.stringify({status:'error',message:e.message}));process.exitCode=1;}).finally(()=>{if(process.connected)process.disconnect();});
