// Derive existing consumer configs from one validated source. No new chain admission.
const {validate,schedulerConfigFor}=require('./pons-automation.cjs');
const {buildIndexConfigs}=require('./shared-index-config.cjs');
const {hash}=require('./direct-buy.cjs');
function derive(input,{publicProfile}={}){
 const automation=structuredClone(input);validate(automation,{publicMode:!!publicProfile});
 if(publicProfile)require('./pons-public-profile.cjs').validate(publicProfile,automation);
 const {schedulerConfig,indexConfig}=buildIndexConfigs(schedulerConfigFor(automation));
 return {schema:'qianqi-deployment-config-v1',publicExecution:false,sourceHash:hash(automation),automation,schedulerConfig,indexConfig,...(publicProfile?{publicProfile:structuredClone(publicProfile)}:{}),
  site:{mode:'preview',actions:null,chainId:String(automation.manifest.chainId),vault:automation.vault}};
}
if(require.main===module){const fs=require('node:fs');if(process.argv.length!==3)throw Error('Usage: node scripts/pons-deployment-config.cjs CONFIG');process.stdout.write(JSON.stringify(derive(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2)+'\n');}
module.exports={derive};
