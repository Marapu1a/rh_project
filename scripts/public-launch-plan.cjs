// Intentionally not a deployment script. No signer, RPC, transaction or approval.
const fs=require('node:fs');
function inspectPlan(p){
 if(p?.schema!=='robinhood-launch-plan-v1'||p.status!=='incomplete-not-executable'||p.network?.chainId!==4663||p.controllers?.cutoffMode!=='FINALIZED_CHECKPOINT'||p.publicExecutionEnabled!==false)throw Error('Explicit incomplete Robinhood plan required');
 const missing=[];for(const section of ['contracts','roles','unresolved'])for(const [name,value] of Object.entries(p[section]||{}))if(value===null)missing.push(section+'.'+name);
 return {schema:p.schema,missing,publicLaunchReady:false,executable:false,reason:'Resolve settings, export complete pinned deployment profile and qualify public executor before release'};
}
if(require.main===module){try{console.log(JSON.stringify(inspectPlan(JSON.parse(fs.readFileSync(process.argv[2]||'config/robinhood-launch-plan.json','utf8'))),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={inspectPlan};
