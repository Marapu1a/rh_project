// Offline export / read-only inspection. No signer, deployment or transaction sends.
const fs=require('node:fs'),{ethers}=require('ethers');
const {createDeploymentProfile,inspectDeployment}=require('./deployment-admission.cjs');
async function main(){
 const [mode,...args]=process.argv.slice(2),o={};
 for(let i=0;i<args.length;i+=2){if(!['--config','--settings','--out','--rpc'].includes(args[i])||!args[i+1]||o[args[i]])throw Error('Invalid arguments');o[args[i]]=args[i+1];}
 if(!o['--config'])throw Error('Config required');
 const config=JSON.parse(fs.readFileSync(o['--config'],'utf8'));
 if(mode==='export'){
  if(!o['--settings']||!o['--out']||o['--rpc'])throw Error('Export needs --config --settings --out');
  const profile=createDeploymentProfile(config,JSON.parse(fs.readFileSync(o['--settings'],'utf8')));
  fs.writeFileSync(o['--out'],JSON.stringify(profile,null,2)+'\n',{flag:'wx'});return;
 }
 if(mode!=='inspect'||!o['--rpc']||o['--settings']||o['--out'])throw Error('Inspect needs --config --rpc');
 const url=new URL(o['--rpc']);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('HTTP(S) RPC required');
 const request=new ethers.FetchRequest(url.href);request.timeout=15000;
 const provider=new ethers.JsonRpcProvider(request,undefined,{cacheTimeout:-1});
 try{const result=await inspectDeployment(provider,config.deploymentProfile,config);console.log(JSON.stringify(result,null,2));if(result.status!=='matched')process.exitCode=2;}
 finally{provider.destroy();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main};
