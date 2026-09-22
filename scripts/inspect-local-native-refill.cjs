const fs=require('node:fs'),{ethers}=require('ethers');
const {inspectNativeRefill}=require('./local-native-refill-inspector.cjs');
async function main(){
 const args=process.argv.slice(2),o={};
 for(let i=0;i<args.length;i+=2){if(!['--state','--expected','--rpc','--deployment'].includes(args[i])||args[i+1]==null)throw Error('Use --state FILE --expected FILE --rpc LOOPBACK');o[args[i].slice(2)]=args[i+1];}
 if(!o.state||!o.expected||!o.rpc)throw Error('State, expected config and RPC required');
 const url=new URL(o.rpc);if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password)throw Error('Loopback HTTP RPC only');
 let expected=JSON.parse(fs.readFileSync(o.expected,'utf8'));
 const manifest=require('./inspection-manifest.cjs');
 if(expected.schema===manifest.schema){
  if(!o.deployment)throw Error('Manifest requires independent --deployment FILE');
  expected=manifest.verifyInspectionManifest(expected,JSON.parse(fs.readFileSync(o.deployment,'utf8')));
 }else if(o.deployment||expected.schema)throw Error('Deployment verification requires supported inspection manifest');
 const request=new ethers.FetchRequest(o.rpc);request.timeout=5000;
 const provider=new ethers.JsonRpcProvider(request,undefined,{cacheTimeout:-1});let timer;
 try{const report=await Promise.race([inspectNativeRefill({statePath:o.state,expected,provider}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Inspection deadline exceeded; no execution authorized')),15000);})]);console.log(JSON.stringify(report));process.exitCode=report.exitCode;}
 finally{clearTimeout(timer);provider.destroy();}
}
if(require.main===module)main().catch(e=>{console.log(JSON.stringify({status:'inspectionError',readOnly:true,detail:e.message,exitCode:1}));process.exitCode=1;});
module.exports={main};
