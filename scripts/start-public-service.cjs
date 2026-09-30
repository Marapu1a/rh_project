// No deployment config means explicit standby, never synthetic public data.
const fs=require('node:fs');
async function main(){
 const port=Number(process.env.PORT??8787);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
 if(process.env.RH_INDEXER_CONFIG){
  const config=JSON.parse(fs.readFileSync(process.env.RH_INDEXER_CONFIG,'utf8'));
  if(config.publicStatus!==true)throw Error('Public observation must be enabled');
  const {startService}=require('./run-indexer-service.cjs');
  const service=await startService({config,rpcUrl:process.env.RH_RPC_URL,port,onStatus:s=>console.log(JSON.stringify(s))});
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void service.close());
 }else{
  const server=require('./user-status-api.cjs').createServer(null,{health:()=>({schema:'promo-service-health-v1',status:'awaitingDeployment',ready:false})});
  server.on('error',()=>{console.error('Public API listen failed');process.exitCode=1;});
  await new Promise(r=>server.listen(port,'127.0.0.1',r));console.log('Public API: standby; deployment not configured');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
 }
}
if(require.main===module)main().catch(()=>{console.error('Public API configuration failed');process.exitCode=1;});
