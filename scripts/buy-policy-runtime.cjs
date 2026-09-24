// Shared admission path for CLI, builders and scheduler. A fresh load precedes each use.
const {loadBuyPolicy}=require('./buy-policy-admission.cjs');
const {buyPolicyHistory,validateManifest}=require('./direct-buy.cjs');
function prefix(history,cutoff){
 return {...history,versions:history.versions.filter((v,i)=>i===0||v.announcedAtBlock<=cutoff)};
}
async function resolveBuyPolicy(config,rpc,cutoff){
 validateManifest(config.manifest);
 if(config.buyPolicy&&config.lifecycle&&config.buyPolicy.instanceId!==config.lifecycle.instanceId)throw Error('BUY policy instance mismatch');
 if(!config.buyPolicy)return {manifest:config.manifest};
 const admitted=await loadBuyPolicy({trust:config.buyPolicy,genesis:config.manifest,rpc});
 const height=cutoff??admitted.checkpoint.number;
 if(!Number.isSafeInteger(height)||height>admitted.checkpoint.number)throw Error('BUY policy cutoff is not finalized');
 const manifest=prefix(admitted.history,height);
 buyPolicyHistory(manifest).at(height);
 return {manifest,admission:admitted,cutoff:height};
}
module.exports={resolveBuyPolicy,prefix};
